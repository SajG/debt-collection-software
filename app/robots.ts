import type { MetadataRoute } from "next";

// SY26 — public marketing routes are crawlable; everything else stays
// blocked. Middleware's per-response `X-Robots-Tag: noindex` on
// authenticated surfaces plus the wildcard disallow below keep the
// dashboard out of every well-behaved crawler AND every AI corpus
// scraper. AI crawlers are named explicitly because several only
// respect rules under their own UA.
//
// The real defence is still auth gating in middleware.ts; robots.txt
// is a request, not a control.

const AI_AGENTS = [
  "GPTBot",
  "ClaudeBot",
  "anthropic-ai",
  "CCBot",
  "Google-Extended",
  "PerplexityBot",
  "Bytespider",
  "Amazonbot",
  "Applebot-Extended",
  "meta-externalagent",
  "Diffbot",
  "Omgilibot",
  "ImagesiftBot",
  "Timpibot",
  "cohere-ai",
];

// Public marketing routes only. Keep this list narrow — every path
// here is fair game for indexing.
const MARKETING_ALLOW = [
  "/",
  "/features",
  "/tally",
  "/pricing",
  "/download",
  "/contact",
  "/blog",
  "/privacy",
  "/terms",
  "/refund-policy",
  "/delete-account",
  "/login",
  "/signup",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // Public marketing surfaces — human traffic + SEO wanted.
      {
        userAgent: "*",
        allow: MARKETING_ALLOW,
        disallow: [
          "/dashboard",
          "/admin",
          "/api",
          "/production",
          "/orders",
          "/invoices",
          "/payments",
          "/parties",
          "/proformas",
          "/actions",
          "/worklist",
          "/settings",
          "/onboarding",
          "/recovery",
          "/escalations",
          "/targets",
          "/stock",
          "/import",
          "/messages",
          "/status",
          "/auth",
        ],
      },
      // AI crawlers — deny everything, including marketing. We're
      // fine being invisible to LLM training corpora.
      ...AI_AGENTS.map((userAgent) => ({ userAgent, disallow: "/" })),
      // Honeypot — anything requesting this after seeing robots.txt
      // is by definition scanning. See app/api/v1/export-all.
      { userAgent: "*", disallow: "/api/v1/export-all" },
    ],
    sitemap: "https://getsyncit.app/sitemap.xml",
    host: "https://getsyncit.app",
  };
}
