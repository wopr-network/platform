import proxy from "@core/proxy";

export const middleware = proxy;

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
