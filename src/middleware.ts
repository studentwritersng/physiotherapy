import { NextResponse, type NextRequest } from "next/server";

/**
 * Cheap redirect for requests with no session cookie. It deliberately does NOT
 * authorize: middleware runs on the edge runtime and cannot reach Prisma, so the
 * real decision happens in requireSession/requireRole (spec §5.3). A forged
 * cookie gets past this and is then rejected server-side.
 */
const COOKIE = process.env.SESSION_COOKIE_NAME ?? "tp_session";

export function middleware(req: NextRequest) {
  if (req.cookies.has(COOKIE)) return NextResponse.next();

  const { pathname, search } = req.nextUrl;
  const loginPath = pathname.startsWith("/portal") ? "/portal/login" : "/login";
  const url = new URL(loginPath, req.url);
  url.searchParams.set("next", `${pathname}${search}`);

  return NextResponse.redirect(url);
}

/**
 * `/portal/login` and `/portal/register` must NOT match, or an unauthenticated
 * visitor would be redirected to the page they are already on. The negative
 * lookahead excludes them.
 */
export const config = {
  matcher: ["/staff/:path*", "/portal", "/portal/((?!login|register).*)", "/reset-password"],
};
