import { authenticate, unauthorized } from "@/lib/auth";
import { ensureSchema, query } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const account = authenticate(request);
  if (!account) return unauthorized();

  const { id } = await context.params;
  await ensureSchema();
  const result = await query(
    `SELECT id, status, attempts, item_count, last_error, created_at, completed_at
     FROM imports WHERE id = $1 AND account_id = $2`,
    [id, account.id],
  );
  if (!result.rows[0]) return Response.json({ error: "not_found", message: "Import not found." }, { status: 404 });
  return Response.json(result.rows[0]);
}