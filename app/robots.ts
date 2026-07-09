import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/actions",
          "/dashboard",
          "/import",
          "/parties",
          "/invoices",
          "/payments",
          "/proformas",
          "/worklist",
          "/settings",
          "/onboarding",
          "/login",
          "/signup",
          "/auth/",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
