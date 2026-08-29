import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { changePassword } from "@/server/auth/login";
import { createSession, sessionCookieOptions } from "@/server/auth/session";
import { requireSession } from "@/server/auth/rbac";
import { changePasswordSchema } from "@/lib/zod/auth";
import { handleAuthError, jsonError, requestMeta } from "@/server/http";

export async function POST(req: Request) {
  try {
    const user = await requireSession();

    const parsed = changePasswordSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return jsonError(400, parsed.error.issues[0]?.message ?? "Check the details you entered");
    }

    const meta = requestMeta(req);
    const result = await changePassword(user.id, parsed.data, meta);
    if (!result.ok) return jsonError(400, "Your current password is incorrect");

    // changePassword revoked every session, including this one. Issue a fresh
    // session so the user is not bounced to the login screen on success.
    const token = await createSession(user.id, meta);
    const { name, ...cookieOptions } = sessionCookieOptions();
    (await cookies()).set(name, token, cookieOptions);

    return NextResponse.json({
      ok: true,
      redirectTo: user.role === "patient" ? "/portal" : "/staff",
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
