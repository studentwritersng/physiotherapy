import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { login } from "@/server/auth/login";
import { sessionCookieOptions } from "@/server/auth/session";
import { staffLoginSchema } from "@/lib/zod/auth";
import { jsonError, requestMeta } from "@/server/http";

export async function POST(req: Request) {
  const parsed = staffLoginSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(400, "Enter your email or phone and your password");
  }

  const result = await login(parsed.data, requestMeta(req));

  if (!result.ok) {
    if (result.reason === "rate_limited") {
      return NextResponse.json(
        { error: "Too many failed attempts. Please try again shortly." },
        { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } },
      );
    }
    if (result.reason === "account_inactive") {
      return jsonError(403, "This account has been deactivated. Contact your administrator.");
    }
    return jsonError(401, "Incorrect login details");
  }

  const { name, ...cookieOptions } = sessionCookieOptions();
  (await cookies()).set(name, result.token, cookieOptions);

  return NextResponse.json({
    user: {
      id: result.user.id,
      name: result.user.name,
      role: result.user.role,
      mustResetPassword: result.user.mustResetPassword,
    },
    redirectTo: result.user.mustResetPassword ? "/reset-password" : "/staff",
  });
}
