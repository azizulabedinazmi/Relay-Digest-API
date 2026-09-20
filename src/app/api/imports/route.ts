import { authenticate, unauthorized } from "@/lib/auth";
import { ensureSchema, query } from "@/lib/db";
import { newImportId } from "@/lib/worker";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const account = authenticate(request);
  if (!account) return unauthorized();

  await ensureSchema();
  const result = await query(
    `SELECT id, status, attempts, item_count, last_error, created_at, completed_at
     FROM imports WHERE account_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [account.id],
  );
  return NextResponse.json({ imports: result.rows });
}

export async function POST(request: Request) {
  const account = authenticate(request);
  if (!account) return unauthorized();

  const body = await request.json().catch(() => null);
  const csvText = typeof body?.csvText === "string" ? body.csvText.trim() : "";
  const idempotencyKey = typeof body?.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
  if (!csvText || !idempotencyKey) {
    return NextResponse.json(
      { error: "invalid_request", message: "csvText and idempotencyKey are required." },
      { status: 400 },
    );
  }
  if (csvText.length > 1_000_000) {
    return NextResponse.json(
      { error: "payload_too_large", message: "CSV imports are limited to 1 MB." },
      { status: 413 },
    );
  }

  await ensureSchema();
  const inserted = await query<{ id: string }>(
    `INSERT INTO imports (id, account_id, idempotency_key, csv_text)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (account_id, idempotency_key) DO NOTHING
     RETURNING id`,
    [newImportId(), account.id, idempotencyKey, csvText],
  );
  const id = inserted.rows[0]?.id;
  const existing = id
    ? null
    : await query<{ id: string; status: string }>(
        `SELECT id, status FROM imports WHERE account_id = $1 AND idempotency_key = $2`,
        [account.id, idempotencyKey],
      );
  const importId = id || existing?.rows[0]?.id;
  return NextResponse.json(
    { importId, status: existing?.rows[0]?.status || "queued", accepted: true },
    { status: 202 },
  );
}