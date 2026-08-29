import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { login } from "@/server/auth/login";
import { sessionCookieOptions } from "@/server/auth/session";
import { patientLoginSchema } from "@/lib/zod/auth";
import { jsonError, requestMeta } from "@/server/http";

export async function POST(req: Request) {
  const parsed = patientLoginSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(
      400,
      parsed.error.issues[0]?.message ?? "Enter your phone number and password",
    );
  }

  const result = await login(
    { identifier: parsed.data.phone, password: parsed.data.password },
    requestMeta(req),
  );

  if (!result.ok) {
    if (result.reason === "rate_limited") {
      return NextResponse.json(
        { error: "Too many failed attempts. Please try again shortly." },
        { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } },
      );
    }
    if (result.reason === "account_inactive") {
      return jsonError(403, "This account is not active. Please call the clinic.");
    }
    return jsonError(401, "Incorrect phone number or password");
  }

  // A staff member must not enter through the patient portal.
  if (result.user.role !== "patient") {
    return jsonError(403, "Please use the staff login page");
  }

  const { name, ...cookieOptions } = sessionCookieOptions();
  (await cookies()).set(name, result.token, cookieOptions);

  return NextResponse.json({
    user: { id: result.user.id, name: result.user.name, role: result.user.role },
    redirectTo: "/portal",
  });
}
