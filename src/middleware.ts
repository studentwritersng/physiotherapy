import { NextResponse, type NextRequest } from "next/server";

/**
 * Cheap redirect for requests with no session cookie. It deliberately does NOT
 * authorize: middleware runs on the edge runtime and cannot reach Prisma, so the
 * real decision happens in requireSession/requireRole (spec §5.3). A forged
 * cookie gets past this and is then rejected server-side.
 *
 * Also forwards the request pathname to a request header so server components
 * can know which route they are rendering — the only way to get a pathname from
 * inside a server component, where `usePathname()` is unavailable.
 */
const COOKIE = process.env.SESSION_COOKIE_NAME ?? "tp_session";
const PATHNAME_HEADER = "x-tp-pathname";

export function middleware(req: NextRequest) {
  if (req.cookies.has(COOKIE)) {
    const response = NextResponse.next();
    response.headers.set(PATHNAME_HEADER, req.nextUrl.pathname);
    return response;
  }

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