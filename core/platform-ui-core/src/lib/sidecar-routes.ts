// core/platform-ui-core/src/lib/sidecar-routes.ts

export type RouteType = "iframe" | "native";

const IFRAME_PREFIXES = [
  "/dashboard",
  "/inbox",
  "/issues",
  "/routines",
  "/goals",
  "/projects",
  "/agents",
  "/org",
  "/skills",
  "/company",
  "/approvals",
  "/activity",
  "/costs",
  "/execution-workspaces",
  "/plugins",
] as const;

export function getRouteType(pathname: string): RouteType {
  for (const prefix of IFRAME_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return "iframe";
  }
  return "native";
}

export function fromSidecarPath(sidecarPath: string): string {
  const segments = sidecarPath.split("/").filter(Boolean);
  if (segments.length === 0) return "/dashboard";

  const firstSegment = `/${segments[0]}`;
  for (const prefix of IFRAME_PREFIXES) {
    if (firstSegment === prefix || prefix.startsWith(`${firstSegment}/`)) {
      return sidecarPath;
    }
  }

  // First segment is a company prefix — strip it
  return `/${segments.slice(1).join("/")}` || "/dashboard";
}
