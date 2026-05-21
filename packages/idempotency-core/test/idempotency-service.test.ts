import { describe, expect, it } from "vitest";
import { IdempotencyService, type IdempotencyPolicy, defaultFingerprintBuilder, type IdempotencyStore } from "../src/index.js";

class TestStore implements IdempotencyStore {
  map = new Map<string, any>();
  async begin(scopeKey: string, requestHash: string, ttlSeconds: number): Promise<any> {
    const rec = this.map.get(scopeKey);
    if (rec) return { kind: "existing", record: rec };
    const v = { scopeKey, requestHash, state: "IN_PROGRESS", expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString() };
    this.map.set(scopeKey, v);
    return { kind: "started", record: v };
  }
  async get(scopeKey: string): Promise<any> {
    return this.map.get(scopeKey) ?? null;
  }
  async complete(scopeKey: string, responseMeta: any): Promise<void> {
    this.map.set(scopeKey, { ...this.map.get(scopeKey), state: "COMPLETED", responseMeta });
  }
  async fail(scopeKey: string, errorMeta: any): Promise<void> {
    this.map.set(scopeKey, { ...this.map.get(scopeKey), state: "FAILED", errorMeta });
  }
}

const policy: IdempotencyPolicy = {
  requireKey: true,
  ttlSeconds: 60,
  inProgressStrategy: "reject",
  scopeBuilder: (i) => `${i.method}:${i.route}:${i.idempotencyKey}`,
  fingerprintBuilder: (i) => defaultFingerprintBuilder(i.payload)
};

const create = (store: IdempotencyStore = new TestStore()) => new IdempotencyService(store);

describe("IdempotencyService", () => {
  it("executes once and replays", async () => {
    const svc = create();
    const input = { method: "POST", route: "/orders", idempotencyKey: "k1", payload: { a: 1 } };
    const first = await svc.handle(input, policy);
    expect(first.action).toBe("execute");
    await svc.complete(first.scopeKey, { statusCode: 201, headers: {}, body: { id: "o1" }, completedAt: new Date().toISOString() });
    const second = await svc.handle(input, policy);
    expect(second.action).toBe("replay");
    expect(second.statusCode).toBe(201);
  });

  it("conflicts for same key different payload", async () => {
    const svc = create();
    const first = await svc.handle({ method: "POST", route: "/orders", idempotencyKey: "k1", payload: { a: 1 } }, policy);
    await svc.complete(first.scopeKey, { statusCode: 201, headers: {}, body: {}, completedAt: new Date().toISOString() });
    await expect(svc.handle({ method: "POST", route: "/orders", idempotencyKey: "k1", payload: { a: 2 } }, policy)).rejects.toThrow(
      "Same idempotency key used with different payload"
    );
  });
});
