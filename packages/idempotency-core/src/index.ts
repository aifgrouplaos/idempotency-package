import { createHash } from "node:crypto";

export type IdempotencyState = "IN_PROGRESS" | "COMPLETED" | "FAILED" | "EXPIRED";
export type InProgressStrategy = "wait" | "reject" | "accepted";

export interface ResponseMeta {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  completedAt: string;
}

export interface ErrorMeta {
  statusCode: number;
  code?: string;
  message: string;
  failedAt: string;
}

export interface IdempotencyRecord {
  scopeKey: string;
  requestHash: string;
  state: IdempotencyState;
  expiresAt: string;
  responseMeta?: ResponseMeta;
  errorMeta?: ErrorMeta;
}

export type BeginResult =
  | { kind: "started"; record: IdempotencyRecord }
  | { kind: "existing"; record: IdempotencyRecord };

export interface IdempotencyStore {
  begin(scopeKey: string, requestHash: string, ttlSeconds: number): Promise<BeginResult>;
  get(scopeKey: string): Promise<IdempotencyRecord | null>;
  complete(scopeKey: string, responseMeta: ResponseMeta): Promise<void>;
  fail(scopeKey: string, errorMeta: ErrorMeta): Promise<void>;
  heartbeat?(scopeKey: string, ttlSeconds: number): Promise<void>;
}

export interface IdempotencyPolicy {
  requireKey: boolean;
  ttlSeconds: number;
  inProgressStrategy: InProgressStrategy;
  scopeBuilder: (input: IdempotencyInput) => string;
  fingerprintBuilder: (input: IdempotencyInput) => string;
}

export interface IdempotencyInput {
  route: string;
  method: string;
  actor?: string;
  idempotencyKey?: string;
  payload: unknown;
}

export interface ObserveEvent {
  name: "begin" | "replay_hit" | "conflict" | "in_progress" | "error";
  key: string;
  scope: string;
  hash: string;
  state?: IdempotencyState;
  route: string;
  actor?: string;
}

export interface IdempotencyObserver {
  metric(name: ObserveEvent["name"], labels?: Record<string, string>): void;
  log(event: ObserveEvent): void;
}

export interface HandleResult {
  action: "execute" | "replay" | "reject" | "accepted";
  statusCode?: number;
  body?: unknown;
  headers?: Record<string, string>;
  scopeKey: string;
  requestHash: string;
}

export class IdempotencyConflictError extends Error {}
export class IdempotencyKeyRequiredError extends Error {}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class IdempotencyService {
  constructor(private readonly store: IdempotencyStore, private readonly observer?: IdempotencyObserver) {}

  async handle(input: IdempotencyInput, policy: IdempotencyPolicy): Promise<HandleResult> {
    if (policy.requireKey && !input.idempotencyKey) {
      throw new IdempotencyKeyRequiredError("Idempotency-Key header is required");
    }
    const scopeKey = policy.scopeBuilder(input);
    const requestHash = policy.fingerprintBuilder(input);
    const begin = await this.store.begin(scopeKey, requestHash, policy.ttlSeconds);

    if (begin.kind === "started") {
      this.emit("begin", input, scopeKey, requestHash, begin.record.state);
      return { action: "execute", scopeKey, requestHash };
    }

    const existing = begin.record;
    if (existing.requestHash !== requestHash) {
      this.emit("conflict", input, scopeKey, requestHash, existing.state);
      throw new IdempotencyConflictError("Same idempotency key used with different payload");
    }
    if (existing.state === "COMPLETED" && existing.responseMeta) {
      this.emit("replay_hit", input, scopeKey, requestHash, existing.state);
      return {
        action: "replay",
        scopeKey,
        requestHash,
        statusCode: existing.responseMeta.statusCode,
        headers: existing.responseMeta.headers,
        body: existing.responseMeta.body
      };
    }
    if (existing.state === "FAILED" && existing.errorMeta) {
      this.emit("error", input, scopeKey, requestHash, existing.state);
      return {
        action: "reject",
        scopeKey,
        requestHash,
        statusCode: existing.errorMeta.statusCode,
        body: { message: existing.errorMeta.message, code: existing.errorMeta.code }
      };
    }
    this.emit("in_progress", input, scopeKey, requestHash, existing.state);
    if (policy.inProgressStrategy === "reject") {
      return { action: "reject", scopeKey, requestHash, statusCode: 409, body: { message: "Request already in progress" } };
    }
    if (policy.inProgressStrategy === "accepted") {
      return { action: "accepted", scopeKey, requestHash, statusCode: 202, body: { message: "Request accepted and processing" } };
    }

    for (let i = 0; i < 40; i++) {
      await sleep(25);
      const rec = await this.store.get(scopeKey);
      if (!rec || rec.state === "EXPIRED") {
        break;
      }
      if (rec.state === "COMPLETED" && rec.responseMeta) {
        return {
          action: "replay",
          scopeKey,
          requestHash,
          statusCode: rec.responseMeta.statusCode,
          headers: rec.responseMeta.headers,
          body: rec.responseMeta.body
        };
      }
    }
    return { action: "reject", scopeKey, requestHash, statusCode: 409, body: { message: "Timed out waiting for in-progress request" } };
  }

  complete(scopeKey: string, responseMeta: ResponseMeta) {
    return this.store.complete(scopeKey, responseMeta);
  }

  fail(scopeKey: string, errorMeta: ErrorMeta) {
    return this.store.fail(scopeKey, errorMeta);
  }

  private emit(name: ObserveEvent["name"], input: IdempotencyInput, scope: string, hash: string, state?: IdempotencyState) {
    this.observer?.metric(name, { route: input.route, method: input.method });
    this.observer?.log({ name, key: input.idempotencyKey ?? "", scope, hash, state, route: input.route, actor: input.actor });
  }
}

export const defaultFingerprintBuilder = (payload: unknown) =>
  createHash("sha256").update(JSON.stringify(payload ?? null)).digest("hex");
