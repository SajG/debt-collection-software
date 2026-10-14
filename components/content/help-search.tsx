"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { mkt } from "@/components/marketing/tokens";

type Item = { slug: string; title: string; description: string; text: string };

// Search box for /help. Fifteen short articles: the whole index is
// already on the page, so filtering in the browser is instant and needs
// no request.
export function HelpSearch({ items }: { items: Item[] }) {
  const [q, setQ] = useState("");
  const results = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return items;
    return items
      .map((it) => {
        const title = it.title.toLowerCase();
        const hay = `${title} ${it.description.toLowerCase()} ${it.text.toLowerCase()}`;
        if (!words.every((w) => hay.includes(w))) return null;
        const score = words.reduce((s, w) => s + (title.includes(w) ? 3 : 1), 0);
        return { it, score };
      })
      .filter((r): r is { it: Item; score: number } => r !== null)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.it);
  }, [q, items]);

  return (
    <div>
      <label htmlFor="help-search" className="sr-only">
        Search help
      </label>
      <input
        id="help-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search help — try “Tally”, “invite”, “payment”"
        autoComplete="off"
        className="w-full rounded-xl border bg-white px-4 py-3 text-base outline-none focus:ring-2"
        style={{ borderColor: mkt.border, color: mkt.ink }}
      />
      <p className="mt-2 text-sm" style={{ color: mkt.ink2 }} aria-live="polite">
        {q ? `${results.length} ${results.length === 1 ? "article" : "articles"}` : `${items.length} articles`}
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {results.map((it) => (
          <li key={it.slug}>
            <Link
              href={`/help/${it.slug}`}
              className="block h-full rounded-xl border bg-white p-4 transition-shadow hover:shadow-sm"
              style={{ borderColor: mkt.border }}
            >
              <span className="block font-semibold" style={{ color: mkt.ink }}>
                {it.title}
              </span>
              <span className="mt-1 block text-sm leading-relaxed" style={{ color: mkt.ink2 }}>
                {it.description}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {results.length === 0 ? (
        <p className="mt-4 text-base" style={{ color: mkt.ink2 }}>
          Nothing matched. Message us on WhatsApp — the button is below.
        </p>
      ) : null}
    </div>
  );
}
