import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;
  const role = req.auth?.user?.role;

  const isAuthPage = nextUrl.pathname === "/login";
  const isAdminPage = nextUrl.pathname.startsWith("/admin");
  const isApiAuth = nextUrl.pathname.startsWith("/api/auth");
  // The public share link (/listing/[id]) and its API are opened by clients
  // with no CRM account at all - they must never be redirected to /login.
  const isPublicShare = nextUrl.pathname.startsWith("/listing/") || nextUrl.pathname.startsWith("/api/public/");

  if (isApiAuth || isPublicShare) return NextResponse.next();

  if (!isLoggedIn && !isAuthPage) {
    const loginUrl = new URL("/login", nextUrl);
    loginUrl.searchParams.set("callbackUrl", nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isLoggedIn && isAuthPage) {
    return NextResponse.redirect(new URL("/", nextUrl));
  }

  if (isAdminPage && role !== "ADMIN") {
    return NextResponse.redirect(new URL("/", nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  // Exclude Next.js internals and any request for a static file (by
  // extension) - otherwise unauthenticated requests for images like the
  // login-page logo or the app icon get redirected back to /login instead
  // of served, since the visitor has no session yet.
  matcher: [
    "/((?!_next/static|_next/image|.*\\.(?:ico|png|jpe?g|svg|gif|webp|avif|css|js|map|txt|xml|json|webmanifest|woff2?)$).*)",
  ],
};
