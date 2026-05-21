# @bounkhong/idempotency-core

Core idempotency primitives and orchestration, independent of framework and storage.

## Install

```bash
pnpm add @bounkhong/idempotency-core
```

## What it provides

- `IdempotencyStore` interface
- `IdempotencyService` orchestration
- state machine: `IN_PROGRESS | COMPLETED | FAILED | EXPIRED`
- policy contract (`requireKey`, `ttlSeconds`, `scopeBuilder`, `fingerprintBuilder`, `inProgressStrategy`)
- helper `defaultFingerprintBuilder`

## Core flow

1. `service.handle(input, policy)`
2. If `action === "execute"`, run business logic once and call `service.complete(...)`
3. On errors, call `service.fail(...)`
4. If duplicate and completed, returns `action === "replay"`

## Minimal usage

```ts
import {
  IdempotencyService,
  defaultFingerprintBuilder,
  type IdempotencyPolicy
} from "@bounkhong/idempotency-core";
import { MemoryIdempotencyStore } from "@bounkhong/idempotency-adapter-memory";

const service = new IdempotencyService(new MemoryIdempotencyStore());

const policy: IdempotencyPolicy = {
  requireKey: true,
  ttlSeconds: 300,
  inProgressStrategy: "wait",
  scopeBuilder: (i) => `${i.method}:${i.route}:${i.idempotencyKey}`,
  fingerprintBuilder: (i) => defaultFingerprintBuilder(i.payload)
};

const result = await service.handle(
  {
    method: "POST",
    route: "/payments",
    idempotencyKey: "pay-001",
    payload: { orderId: "o-1", amount: 100 }
  },
  policy
);

if (result.action === "execute") {
  const responseBody = { id: "pay_123", status: "captured" };
  await service.complete(result.scopeKey, {
    statusCode: 201,
    headers: {},
    body: responseBody,
    completedAt: new Date().toISOString()
  });
}
```

## Error behavior

- same key + different payload => throws `IdempotencyConflictError`
- missing key when `requireKey=true` => throws `IdempotencyKeyRequiredError`
