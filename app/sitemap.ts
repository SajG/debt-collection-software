import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Public marketing + legal routes only. /login, /signup, and everything
// under (dashboard) are deliberately excluded.
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    {
      url: SITE_URL,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    ...[
      "/terms",
      "/privacy",
      "/refund-policy",
      "/cancellation-policy",
      "/data-policy",
    ].map((path) => ({
      url: `${SITE_URL}${path}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.3,
    })),
  ];
}
