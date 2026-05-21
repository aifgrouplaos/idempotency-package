import type { BeginResult, ErrorMeta, IdempotencyRecord, IdempotencyStore, ResponseMeta } from "@aif/idempotency-core";

export interface RedisLike {
  set(key: string, value: string, opts: { NX?: boolean; EX?: number }): Promise<"OK" | null>;
  get(key: string): Promise<string | null>;
  expire(key: string, seconds: number): Promise<number>;
}

const recordKey = (scopeKey: string) => `idempotency:${scopeKey}`;

export class RedisIdempotencyStore implements IdempotencyStore {
  constructor(private readonly redis: RedisLike) {}

  async begin(scopeKey: string, requestHash: string, ttlSeconds: number): Promise<BeginResult> {
    const key = recordKey(scopeKey);
    const rec: IdempotencyRecord = { scopeKey, requestHash, state: "IN_PROGRESS", expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString() };
    const ok = await this.redis.set(key, JSON.stringify(rec), { NX: true, EX: ttlSeconds });
    if (ok === "OK") {
      return { kind: "started", record: rec };
    }
    const existing = await this.get(scopeKey);
    if (!existing) {
      throw new Error("Redis key exists but value missing");
    }
    return { kind: "existing", record: existing };
  }

  async get(scopeKey: string): Promise<IdempotencyRecord | null> {
    const raw = await this.redis.get(recordKey(scopeKey));
    return raw ? (JSON.parse(raw) as IdempotencyRecord) : null;
  }

  async complete(scopeKey: string, responseMeta: ResponseMeta): Promise<void> {
    const rec = await this.get(scopeKey);
    if (!rec) {
      return;
    }
    await this.redis.set(recordKey(scopeKey), JSON.stringify({ ...rec, state: "COMPLETED", responseMeta }), { EX: Math.max(1, Math.floor((new Date(rec.expiresAt).getTime() - Date.now()) / 1000)) });
  }

  async fail(scopeKey: string, errorMeta: ErrorMeta): Promise<void> {
    const rec = await this.get(scopeKey);
    if (!rec) {
      return;
    }
    await this.redis.set(recordKey(scopeKey), JSON.stringify({ ...rec, state: "FAILED", errorMeta }), { EX: Math.max(1, Math.floor((new Date(rec.expiresAt).getTime() - Date.now()) / 1000)) });
  }

  async heartbeat(scopeKey: string, ttlSeconds: number): Promise<void> {
    await this.redis.expire(recordKey(scopeKey), ttlSeconds);
  }
}
