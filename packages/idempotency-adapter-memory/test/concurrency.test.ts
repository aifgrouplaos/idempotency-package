import { describe, expect, it } from "vitest";
import { IdempotencyService, defaultFingerprintBuilder, type IdempotencyPolicy } from "@bounkhong/idempotency-core";
import { MemoryIdempotencyStore } from "../src/index.js";

const policy: IdempotencyPolicy = {
  requireKey: true,
  ttlSeconds: 60,
  inProgressStrategy: "wait",
  scopeBuilder: (i) => `${i.method}:${i.route}:${i.idempotencyKey}`,
  fingerprintBuilder: (i) => defaultFingerprintBuilder(i.payload)
};

describe("memory adapter concurrency", () => {
  it("allows exactly one execution for same key+payload", async () => {
    const service = new IdempotencyService(new MemoryIdempotencyStore());
    let executed = 0;
    const req = { method: "POST", route: "/callback", idempotencyKey: "cb-1", payload: { event: "paid" } };
    const tasks = Array.from({ length: 20 }).map(async () => {
      const r = await service.handle(req, policy);
      if (r.action === "execute") {
        executed += 1;
        await service.complete(r.scopeKey, { statusCode: 200, headers: {}, body: { ok: true }, completedAt: new Date().toISOString() });
      }
      return r.action;
    });
    const result = await Promise.all(tasks);
    expect(executed).toBe(1);
    expect(result.filter((x) => x === "replay").length).toBeGreaterThan(0);
  });
});
