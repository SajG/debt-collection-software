import type { MetadataRoute } from "next";

// Syncit holds distributor ledgers, party phone numbers, credit
// limits, and order history — none of it should end up in a search
// index or an LLM training corpus.
//
// Robots.txt is a request, not a control. The real defence is that
// nothing is reachable without a session (see middleware.ts and the
// vitest `auth-gate.test.ts` suite). This file exists so that
// well-behaved crawlers respect our wishes even when a preview URL
// leaks somewhere and the WAF hasn't caught up yet.
//
// Named user-agent blocks are duplicated below the wildcard because
// several crawlers (notably GPTBot, ClaudeBot, Google-Extended)
// only respect a rule when their name is spelled out — the wildcard
// is treated as "we don't know what you meant." Reinforced by
// middleware's `X-Robots-Tag: noindex, nofollow, noai, noimageai`
// per-response header for anyone who ignores robots.txt entirely.

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

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // Blanket deny for everything else.
      { userAgent: "*", disallow: "/" },
      // Named AI / scraping agents. Same effective policy, just
      // spelled out so a crawler with strict UA matching cannot
      // claim the wildcard didn't apply to it.
      ...AI_AGENTS.map((userAgent) => ({ userAgent, disallow: "/" })),
      // Honeypot — anything requesting this after seeing robots.txt
      // is by definition scanning us. See app/api/v1/export-all.
      { userAgent: "*", disallow: "/api/v1/export-all" },
    ],
  };
}
