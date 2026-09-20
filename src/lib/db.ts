import { Pool, type PoolClient, type QueryResultRow } from "pg";

const globalForDb = globalThis as unknown as { pool?: Pool };

export const pool =
  globalForDb.pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes("localhost")
      ? false
      : { rejectUnauthorized: false },
    max: 5,
  });

if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
) {
  return pool.query<T>(text, values);
}

export async function withTransaction<T>(work: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function ensureSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS imports (
      id UUID PRIMARY KEY,
      account_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      csv_text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      attempts INTEGER NOT NULL DEFAULT 0,
      item_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      locked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      UNIQUE (account_id, idempotency_key)
    );
    CREATE TABLE IF NOT EXISTS digest_items (
      id BIGSERIAL PRIMARY KEY,
      import_id UUID NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
      account_id TEXT NOT NULL,
      email TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (import_id, email)
    );
    CREATE INDEX IF NOT EXISTS imports_account_created_idx ON imports(account_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS digest_items_account_created_idx ON digest_items(account_id, created_at DESC);
  `);
}