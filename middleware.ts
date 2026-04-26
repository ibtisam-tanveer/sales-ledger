import { NextResponse, type NextRequest } from "next/server";
import { authCookieName, authEnabled, verifyAuthToken } from "@/lib/auth/session";

function isPublicPath(pathname: string): boolean {
  if (pathname === "/login") return true;
  if (pathname.startsWith("/api/auth/")) return true;
  if (pathname.startsWith("/_next/")) return true;
  if (pathname.startsWith("/favicon")) return true;
  return false;
}

export async function middleware(req: NextRequest) {
  // Helpful in dev to confirm middleware is actually running.
  const debug = process.env.NODE_ENV === "development";

  // Auth is required whenever routes are accessed (dev and prod).
  if (!authEnabled()) {

    const { pathname } = req.nextUrl;
    if (isPublicPath(pathname)) return NextResponse.next();

    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Auth is not configured (set AUTH_PASSWORD and AUTH_SECRET)" },
        { status: 503 }
      );
    }

    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname + (req.nextUrl.search || ""));
    url.searchParams.set("error", "auth_not_configured");
    return NextResponse.redirect(url);
  }

  const { pathname } = req.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  const token = req.cookies.get(authCookieName())?.value ?? "";
  const ok = token ? await verifyAuthToken(token) : false;
  if (ok) {
    const res = NextResponse.next();
    if (debug) res.headers.set("x-sl-mw", "ok");
    return res;
  }

  // API: return 401 JSON. Pages: redirect to login.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname + (req.nextUrl.search || ""));
  const res = NextResponse.redirect(url);
  if (debug) res.headers.set("x-sl-mw", "redirect");
  return res;
}

export const config = {
  matcher: ["/:path*"],
};

