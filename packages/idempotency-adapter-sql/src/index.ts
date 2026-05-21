import type { BeginResult, ErrorMeta, IdempotencyRecord, IdempotencyStore, ResponseMeta } from "@bounkhong/idempotency-core";

export interface SqlDriver {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export class SqlIdempotencyStore implements IdempotencyStore {
  constructor(private readonly driver: SqlDriver, private readonly tableName = "idempotency_records") {}

  async begin(scopeKey: string, requestHash: string, ttlSeconds: number): Promise<BeginResult> {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    const sql = `
      INSERT INTO ${this.tableName}(scope_key, request_hash, state, expires_at)
      VALUES($1, $2, 'IN_PROGRESS', $3)
      ON CONFLICT(scope_key) DO NOTHING
      RETURNING scope_key AS "scopeKey", request_hash AS "requestHash", state, expires_at AS "expiresAt"
    `;
    const inserted = await this.driver.query<IdempotencyRecord>(sql, [scopeKey, requestHash, expiresAt]);
    if (inserted.rows.length) {
      return { kind: "started", record: inserted.rows[0] };
    }
    const existing = await this.get(scopeKey);
    if (!existing) {
      throw new Error("Record disappeared after conflict");
    }
    return { kind: "existing", record: existing };
  }

  async get(scopeKey: string): Promise<IdempotencyRecord | null> {
    const rs = await this.driver.query<IdempotencyRecord>(
      `SELECT scope_key AS "scopeKey", request_hash AS "requestHash", state, expires_at AS "expiresAt", response_meta AS "responseMeta", error_meta AS "errorMeta" FROM ${this.tableName} WHERE scope_key=$1`,
      [scopeKey]
    );
    return rs.rows[0] ?? null;
  }

  async complete(scopeKey: string, responseMeta: ResponseMeta): Promise<void> {
    await this.driver.query(`UPDATE ${this.tableName} SET state='COMPLETED', response_meta=$2 WHERE scope_key=$1`, [scopeKey, responseMeta]);
  }

  async fail(scopeKey: string, errorMeta: ErrorMeta): Promise<void> {
    await this.driver.query(`UPDATE ${this.tableName} SET state='FAILED', error_meta=$2 WHERE scope_key=$1`, [scopeKey, errorMeta]);
  }

  async heartbeat(scopeKey: string, ttlSeconds: number): Promise<void> {
    await this.driver.query(`UPDATE ${this.tableName} SET expires_at=$2 WHERE scope_key=$1`, [scopeKey, new Date(Date.now() + ttlSeconds * 1000).toISOString()]);
  }
}

export const createSqlSchema = (tableName = "idempotency_records") => `
CREATE TABLE IF NOT EXISTS ${tableName} (
  scope_key TEXT PRIMARY KEY,
  request_hash TEXT NOT NULL,
  state TEXT NOT NULL,
  response_meta JSONB NULL,
  error_meta JSONB NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ${tableName}_expires_at_idx ON ${tableName}(expires_at);
`;

export const cleanupExpiredSql = (tableName = "idempotency_records") =>
  `DELETE FROM ${tableName} WHERE expires_at < NOW()`;
