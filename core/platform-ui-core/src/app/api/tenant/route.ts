import { NextResponse } from "next/server";
import { getBrandConfig } from "@/lib/brand-config";

/** Tenant IDs are UUIDs or alphanumeric identifiers — reject anything suspicious. */
const TENANT_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

function cookieName(): string {
  return getBrandConfig().tenantCookieName;
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const tenantId =
    typeof body === "object" && body !== null && "tenantId" in body
      ? (body as Record<string, unknown>).tenantId
      : undefined;

  if (typeof tenantId !== "string" || !tenantId || !TENANT_ID_PATTERN.test(tenantId)) {
    return NextResponse.json({ error: "Invalid tenantId" }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(cookieName(), tenantId, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
  return response;
}

export async function DELETE(): Promise<NextResponse> {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(cookieName(), "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
