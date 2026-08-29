import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { registerPatient } from "@/server/auth/login";
import { sessionCookieOptions } from "@/server/auth/session";
import { patientRegisterSchema } from "@/lib/zod/auth";
import { jsonError, requestMeta } from "@/server/http";

export async function POST(req: Request) {
  const parsed = patientRegisterSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message ?? "Check the details you entered");
  }

  const result = await registerPatient(parsed.data, requestMeta(req));

  if (!result.ok) {
    return jsonError(409, "An account already exists for that phone number. Try logging in.");
  }

  const { name, ...cookieOptions } = sessionCookieOptions();
  (await cookies()).set(name, result.token, cookieOptions);

  return NextResponse.json({
    user: { id: result.user.id, name: result.user.name },
    redirectTo: "/portal",
  });
}
