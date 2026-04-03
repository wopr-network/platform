import { SITE_URL } from "@core/lib/api-config";
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/dashboard/", "/settings/", "/admin/", "/billing/", "/ship/", "/approvals/", "/connect/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
