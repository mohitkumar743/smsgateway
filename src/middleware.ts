import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  if (
    process.env.NODE_ENV === "production" &&
    request.nextUrl.pathname.startsWith("/api/") &&
    request.headers.get("x-forwarded-proto") !== "https"
  ) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "HTTPS is required",
        },
      },
      { status: 403 },
    );
  }

  const response = NextResponse.next();
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};
