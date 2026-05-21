# @bounkhong/idempotency-adapter-redis

Redis-backed idempotency store using `SET NX + EX` for atomic begin semantics.

## Install

```bash
pnpm add @bounkhong/idempotency-adapter-redis @bounkhong/idempotency-core
```

## Redis client contract

Your Redis client should provide:

```ts
interface RedisLike {
  set(key: string, value: string, opts: { NX?: boolean; EX?: number }): Promise<"OK" | null>;
  get(key: string): Promise<string | null>;
  expire(key: string, seconds: number): Promise<number>;
}
```

## Usage

```ts
import { RedisIdempotencyStore } from "@bounkhong/idempotency-adapter-redis";

const store = new RedisIdempotencyStore(redisClient);
```

## Notes

- `begin` uses `SET ... NX EX` to ensure one writer starts execution
- completed/failed metadata is stored with remaining TTL
- for long-running requests, call `heartbeat(scopeKey, ttlSeconds)` to extend lock lifetime
