# @bounkhong/idempotency-adapter-sql

SQL-backed idempotency store with ORM-agnostic driver interface.

## Install

```bash
pnpm add @bounkhong/idempotency-adapter-sql @bounkhong/idempotency-core
```

## Driver contract

Provide a driver implementing:

```ts
interface SqlDriver {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
```

## Usage

```ts
import { SqlIdempotencyStore, createSqlSchema, cleanupExpiredSql } from "@bounkhong/idempotency-adapter-sql";

const store = new SqlIdempotencyStore(driver, "idempotency_records");
```

## Schema and TTL cleanup

- Create table/index using `createSqlSchema()`
- Run periodic cleanup job with `cleanupExpiredSql()`

Example cleanup cron idea:
- every 1-5 minutes: `DELETE FROM idempotency_records WHERE expires_at < NOW()`
