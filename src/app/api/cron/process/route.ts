import { processOneImport } from "@/lib/worker";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.get("x-cron-secret") || request.headers.get("authorization")?.replace("Bearer ", "");
  if (!secret || supplied !== secret) {
    return Response.json({ error: "unauthorized", message: "Cron secret is required." }, { status: 401 });
  }

  const result = await processOneImport();
  return Response.json({ ok: true, ...result });
}

export async function GET(request: Request) {
  return POST(request);
}