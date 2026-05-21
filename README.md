# AIF Idempotency Package Family

Production-focused, storage-agnostic idempotency for backend Node.js services (orders, payments, callbacks).

## Why this exists

This package family protects write endpoints from duplicate side effects caused by:
- client retries
- double submits
- network timeout retries
- concurrent requests hitting multiple instances

Behavior guarantees:
- same key + same payload => replay previous response
- same key + different payload => conflict (`409`)
- in-progress duplicate => policy-driven (`wait` | `reject` | `accepted`)

## Packages

- `@aif/idempotency-core`: store contract, state machine, idempotency orchestration
- `@aif/idempotency-nestjs`: NestJS module, decorator, interceptor
- `@aif/idempotency-adapter-memory`: in-memory store for dev/tests
- `@aif/idempotency-adapter-sql`: ORM-agnostic SQL adapter
- `@aif/idempotency-adapter-redis`: Redis adapter using `SET NX + TTL`
- `examples/nest-orders-payments-demo`: runnable Nest demo

## Quick start

Install and verify:

```bash
pnpm install
pnpm build
pnpm test
```

Run demo app:

```bash
PORT=3001 pnpm --filter nest-orders-payments-demo dev
```

Then run the curl scenarios in `examples/nest-orders-payments-demo/README.md`.

## Express and Fastify quickstart patterns

Dedicated framework packages are planned, but you can integrate now with a small wrapper around `@aif/idempotency-core`.

### Express pattern

```ts
import express from "express";
import {
  IdempotencyService,
  defaultFingerprintBuilder,
  IdempotencyConflictError,
  IdempotencyKeyRequiredError,
  type IdempotencyPolicy
} from "@aif/idempotency-core";
import { RedisIdempotencyStore } from "@aif/idempotency-adapter-redis";

const app = express();
app.use(express.json());

const service = new IdempotencyService(new RedisIdempotencyStore(redisClient));
const policy: IdempotencyPolicy = {
  requireKey: true,
  ttlSeconds: 900,
  inProgressStrategy: "wait",
  scopeBuilder: (i) => `${i.method}:${i.route}:${i.idempotencyKey}`,
  fingerprintBuilder: (i) => defaultFingerprintBuilder(i.payload)
};

app.post("/payments", async (req, res, next) => {
  try {
    const result = await service.handle(
      {
        method: req.method,
        route: req.route.path,
        idempotencyKey: req.header("idempotency-key") ?? undefined,
        actor: req.header("x-actor") ?? undefined,
        payload: req.body
      },
      policy
    );

    if (result.action === "replay") {
      return res.status(result.statusCode ?? 200).json(result.body);
    }
    if (result.action === "reject" || result.action === "accepted") {
      return res.status(result.statusCode ?? 409).json(result.body);
    }

    const responseBody = { id: `pay_${Date.now()}`, status: "captured", ...req.body };
    await service.complete(result.scopeKey, {
      statusCode: 201,
      headers: {},
      body: responseBody,
      completedAt: new Date().toISOString()
    });
    return res.status(201).json(responseBody);
  } catch (err) {
    if (err instanceof IdempotencyKeyRequiredError) {
      return res.status(401).json({ message: err.message });
    }
    if (err instanceof IdempotencyConflictError) {
      return res.status(409).json({ message: err.message });
    }
    return next(err);
  }
});
```

### Fastify pattern

```ts
import Fastify from "fastify";
import {
  IdempotencyService,
  defaultFingerprintBuilder,
  IdempotencyConflictError,
  IdempotencyKeyRequiredError
} from "@aif/idempotency-core";
import { SqlIdempotencyStore } from "@aif/idempotency-adapter-sql";

const app = Fastify();
const service = new IdempotencyService(new SqlIdempotencyStore(sqlDriver));

app.post("/orders", async (request, reply) => {
  try {
    const result = await service.handle(
      {
        method: "POST",
        route: "/orders",
        idempotencyKey: request.headers["idempotency-key"] as string | undefined,
        actor: request.headers["x-actor"] as string | undefined,
        payload: request.body
      },
      {
        requireKey: true,
        ttlSeconds: 600,
        inProgressStrategy: "reject",
        scopeBuilder: (i) => `${i.method}:${i.route}:${i.idempotencyKey}`,
        fingerprintBuilder: (i) => defaultFingerprintBuilder(i.payload)
      }
    );

    if (result.action === "replay") {
      return reply.code(result.statusCode ?? 200).send(result.body);
    }
    if (result.action === "reject" || result.action === "accepted") {
      return reply.code(result.statusCode ?? 409).send(result.body);
    }

    const responseBody = { id: `ord_${Date.now()}`, ...(request.body as object) };
    await service.complete(result.scopeKey, {
      statusCode: 201,
      headers: {},
      body: responseBody,
      completedAt: new Date().toISOString()
    });
    return reply.code(201).send(responseBody);
  } catch (err) {
    if (err instanceof IdempotencyKeyRequiredError) {
      return reply.code(401).send({ message: err.message });
    }
    if (err instanceof IdempotencyConflictError) {
      return reply.code(409).send({ message: err.message });
    }
    throw err;
  }
});
```

### Integration notes

- Always call `complete(...)` only after side effects are committed.
- On business failure, call `fail(...)` with meaningful status and message.
- Prefer Redis or SQL adapters in multi-instance production environments.
- Build scope carefully (method + route + actor/tenant + key) to avoid cross-user collisions.

## Rollout strategy

- Optional mode: observe metrics/logs first
- Soft enforce: require key on critical routes (payments/callbacks)
- Hard enforce: require key for all configured write routes

## Nonce vs idempotency

- Nonce protects protocol/security replay concerns
- Idempotency protects business operation replay concerns (semantic dedupe)

Use both when needed; they solve different layers of risk.

## Additional docs

- Architecture decisions: `docs/architecture.md`
- Usage cookbook: `docs/cookbook.md`
- Deploy and publish guide: `docs/deploy.md`
- Package changelog: `CHANGELOG.md`
