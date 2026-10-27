import { NextResponse, type NextRequest } from "next/server";

const COOKIE = "somm_ws";

/** Gives every browser an anonymous workspace so its runs and kits stay its own. No login. */
export function proxy(request: NextRequest) {
  if (request.cookies.get(COOKIE)) return NextResponse.next();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const id = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const headers = new Headers(request.headers);
  headers.set("cookie", `${request.headers.get("cookie") ?? ""}${request.headers.get("cookie") ? "; " : ""}${COOKIE}=${id}`);
  const response = NextResponse.next({ request: { headers } });
  response.cookies.set(COOKIE, id, { httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\.(?:png|svg|jpg|webp|woff2)$).*)"],
};
