import type { BeginResult, ErrorMeta, IdempotencyRecord, IdempotencyStore, ResponseMeta } from "@aif/idempotency-core";

const now = () => new Date();

export class MemoryIdempotencyStore implements IdempotencyStore {
  private readonly map = new Map<string, IdempotencyRecord>();

  async begin(scopeKey: string, requestHash: string, ttlSeconds: number): Promise<BeginResult> {
    const current = this.map.get(scopeKey);
    if (current && new Date(current.expiresAt) > now()) {
      return { kind: "existing", record: current };
    }
    const expiresAt = new Date(now().getTime() + ttlSeconds * 1000).toISOString();
    const record: IdempotencyRecord = { scopeKey, requestHash, state: "IN_PROGRESS", expiresAt };
    this.map.set(scopeKey, record);
    return { kind: "started", record };
  }

  async get(scopeKey: string): Promise<IdempotencyRecord | null> {
    const rec = this.map.get(scopeKey) ?? null;
    if (!rec) {
      return null;
    }
    if (new Date(rec.expiresAt) <= now()) {
      return { ...rec, state: "EXPIRED" };
    }
    return rec;
  }

  async complete(scopeKey: string, responseMeta: ResponseMeta): Promise<void> {
    const rec = this.map.get(scopeKey);
    if (!rec) {
      return;
    }
    this.map.set(scopeKey, { ...rec, state: "COMPLETED", responseMeta });
  }

  async fail(scopeKey: string, errorMeta: ErrorMeta): Promise<void> {
    const rec = this.map.get(scopeKey);
    if (!rec) {
      return;
    }
    this.map.set(scopeKey, { ...rec, state: "FAILED", errorMeta });
  }

  async heartbeat(scopeKey: string, ttlSeconds: number): Promise<void> {
    const rec = this.map.get(scopeKey);
    if (!rec) {
      return;
    }
    this.map.set(scopeKey, { ...rec, expiresAt: new Date(now().getTime() + ttlSeconds * 1000).toISOString() });
  }
}
