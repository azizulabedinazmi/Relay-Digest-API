import { createHash, timingSafeEqual } from "node:crypto";

export type Account = { id: string };

export function authenticate(request: Request): Account | null {
  const configuredToken = process.env.AUTH_TOKEN;
  const authorization = request.headers.get("authorization") ?? "";
  const suppliedToken = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  if (!configuredToken || !suppliedToken) return null;

  const expected = createHash("sha256").update(configuredToken).digest();
  const actual = createHash("sha256").update(suppliedToken).digest();
  if (!timingSafeEqual(expected, actual)) return null;

  return { id: process.env.ACCOUNT_ID || "primary-account" };
}

export function unauthorized() {
  return Response.json(
    { error: "unauthorized", message: "Provide a valid Bearer token." },
    { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
  );
}