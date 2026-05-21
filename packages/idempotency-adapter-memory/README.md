# @bounkhong/idempotency-adapter-memory

In-memory idempotency store implementation for local development and tests.

## Install

```bash
pnpm add @bounkhong/idempotency-adapter-memory @bounkhong/idempotency-core
```

## Usage

```ts
import { IdempotencyService } from "@bounkhong/idempotency-core";
import { MemoryIdempotencyStore } from "@bounkhong/idempotency-adapter-memory";

const service = new IdempotencyService(new MemoryIdempotencyStore());
```

## Notes

- Process-local only (not shared across instances)
- Best for tests, examples, and single-instance dev
- Not recommended for production multi-instance deployments
