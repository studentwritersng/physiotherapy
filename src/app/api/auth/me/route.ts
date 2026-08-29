import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/rbac";
import { handleAuthError } from "@/server/http";

export async function GET() {
  try {
    const user = await requireSession();
    return NextResponse.json({ user });
  } catch (error) {
    return handleAuthError(error);
  }
}
