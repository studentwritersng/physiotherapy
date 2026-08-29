import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { revokeSession, sessionCookieOptions } from "@/server/auth/session";
import { getCurrentUser } from "@/server/auth/rbac";
import { audit } from "@/server/audit";
import { requestMeta } from "@/server/http";
import { env } from "@/lib/env";

export async function POST(req: Request) {
  const jar = await cookies();
  const token = jar.get(env.SESSION_COOKIE_NAME)?.value;
  const user = await getCurrentUser();

  if (token) await revokeSession(token);
  if (user) {
    await audit({
      userId: user.id,
      action: "logout",
      entityType: "user",
      entityId: user.id,
      ipAddress: requestMeta(req).ipAddress,
    });
  }

  const { name, ...cookieOptions } = sessionCookieOptions();
  jar.set(name, "", { ...cookieOptions, maxAge: 0 });

  return NextResponse.json({ ok: true, redirectTo: "/" });
}
