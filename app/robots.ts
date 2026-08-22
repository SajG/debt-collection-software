import type { MetadataRoute } from "next";

// Block every crawler from every path. SynWorks holds distributor
// ledgers, party phone numbers, and outstanding balances — none of
// that should end up in a search index or an LLM training corpus.
// Reinforced by middleware's `X-Robots-Tag: noindex, nofollow` header
// so servers that ignore robots.txt (many AI scrapers) still see the
// per-response directive.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
