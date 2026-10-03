import { NextResponse, type NextRequest } from "next/server";

const COOKIE = "ff_owner";
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function middleware(req: NextRequest) {
  const existing = req.cookies.get(COOKIE)?.value;
  if (existing && TOKEN.test(existing)) return NextResponse.next();
  const res = NextResponse.next();
  res.cookies.set(COOKIE, newToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}

export const config = {
  matcher: ["/dashboard/:path*", "/convert/:path*", "/start", "/api/uploads/:path*"],
};
