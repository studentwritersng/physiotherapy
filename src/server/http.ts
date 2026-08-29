import "server-only";
import { NextResponse } from "next/server";
import { ForbiddenError, UnauthenticatedError } from "@/server/auth/rbac";
import type { RequestMeta } from "@/server/auth/login";

export function jsonError(status: number, message: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

/**
 * Trusts x-forwarded-for only for its first hop, which is what a single reverse
 * proxy in front of the app produces.
 */
export function requestMeta(req: Request): RequestMeta {
  const forwarded = req.headers.get("x-forwarded-for");
  return {
    ipAddress: forwarded?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent"),
  };
}

/** Maps guard errors to responses so every handler can use one catch. */
export function handleAuthError(error: unknown): NextResponse {
  if (error instanceof UnauthenticatedError) return jsonError(401, error.message);
  if (error instanceof ForbiddenError) return jsonError(403, error.message);
  console.error("[api] unhandled error", error);
  return jsonError(500, "Something went wrong");
}
