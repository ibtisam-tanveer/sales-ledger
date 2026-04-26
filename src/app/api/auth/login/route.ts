import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { authCookieName, authEnabled, signAuthToken } from "@/lib/auth/session";

function safeEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  if (aa.length !== bb.length) return false;
  return timingSafeEqual(aa, bb);
}

export async function POST(req: Request) {
  try {
    if (!authEnabled()) {
      return NextResponse.json(
        { error: "Auth is not enabled (set AUTH_PASSWORD and AUTH_SECRET)" },
        { status: 400 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as { password?: unknown };
    const password = typeof body.password === "string" ? body.password : "";
    const expected = process.env.AUTH_PASSWORD ?? "";

    if (!password || !safeEqual(password, expected)) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    const token = await signAuthToken();

    const res = NextResponse.json({ ok: true });
    res.cookies.set(authCookieName(), token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

