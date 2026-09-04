import "server-only";
import { forbidden } from "next/navigation";
import type { UserRole } from "@/generated/prisma/client";
import { ForbiddenError, requireRole } from "@/server/auth/rbac";
import type { SessionUser } from "@/server/auth/session";

/**
 * Page/layout variant of requireRole. A ForbiddenError thrown from a Server
 * Component is a 500 to the browser — Next only sends a 403 through the
 * forbidden() boundary (which needs experimental.authInterrupts in
 * next.config.ts). API routes keep requireRole with handleAuthError (JSON
 * 403); Server Actions keep requireRole as-is.
 */
export async function requirePageRole(...roles: UserRole[]): Promise<SessionUser> {
  try {
    return await requireRole(...roles);
  } catch (error) {
    if (error instanceof ForbiddenError) forbidden();
    throw error;
  }
}
