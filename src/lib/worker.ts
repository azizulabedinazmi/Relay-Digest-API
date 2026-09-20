import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { ensureSchema, withTransaction } from "./db";

type ImportRow = { id: string; account_id: string; csv_text: string };

function csvRows(csvText: string) {
  const [headerLine, ...lines] = csvText.trim().split(/\r?\n/);
  const headers = (headerLine || "email,name").split(",").map((value) => value.trim().toLowerCase());
  return lines
    .filter(Boolean)
    .map((line) => {
      const values = line.split(",").map((value) => value.trim());
      return {
        email: values[headers.indexOf("email")] || values[0] || "unknown@example.com",
        name: values[headers.indexOf("name")] || values[1] || "",
      };
    })
    .filter((row) => row.email.includes("@"));
}

async function claimJob(client: PoolClient): Promise<ImportRow | null> {
  await client.query(`
    UPDATE imports
    SET status = 'queued', locked_at = NULL, last_error = 'Worker lease expired; returned to queue.'
    WHERE status = 'processing' AND locked_at < NOW() - INTERVAL '5 minutes'
  `);

  const result = await client.query<ImportRow>(`
    SELECT id, account_id, csv_text
    FROM imports
    WHERE status = 'queued'
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  `);
  const job = result.rows[0];
  if (!job) return null;

  await client.query(
    `UPDATE imports SET status = 'processing', attempts = attempts + 1, locked_at = NOW(), last_error = NULL WHERE id = $1`,
    [job.id],
  );
  return job;
}

export async function processOneImport() {
  await ensureSchema();
  return withTransaction(async (client) => {
    const job = await claimJob(client);
    if (!job) return { processed: false as const };

    try {
      const rows = csvRows(job.csv_text);
      for (const row of rows) {
        await client.query(
          `INSERT INTO digest_items (import_id, account_id, email, name, summary)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (import_id, email) DO NOTHING`,
          [job.id, job.account_id, row.email, row.name, `${row.name || row.email} is included in your digest.`],
        );
      }
      await client.query(
        `UPDATE imports SET status = 'completed', item_count = $2, completed_at = NOW(), locked_at = NULL WHERE id = $1`,
        [job.id, rows.length],
      );
      return { processed: true as const, id: job.id, itemCount: rows.length };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown worker error";
      await client.query(
        `UPDATE imports SET status = 'failed', last_error = $2, locked_at = NULL WHERE id = $1`,
        [job.id, message.slice(0, 500)],
      );
      return { processed: true as const, id: job.id, failed: true as const };
    }
  });
}

export function newImportId() {
  return randomUUID();
}