"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SearchHit } from "@/app/api/search/route";

// Cmd/Ctrl-K palette. Fetches /api/search on debounce, arrow-navs the
// hit list, Enter routes. Escape closes. Kept dependency-free — the
// list is short by design (MAX_TOTAL server-side) so we do not need
// virtualisation. The API is the RLS boundary; the UI just renders.

const DEBOUNCE_MS = 120;
const OPEN_KEY = "k";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Global shortcut: Cmd/Ctrl-K opens; typing "/" also opens as long
  // as focus is not already in an input.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === OPEN_KEY) {
        e.preventDefault();
        setOpen(true);
        return;
      }
      if (e.key === "/" && !isEditableTarget(e.target)) {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) {
      setQ("");
      setHits([]);
      setCursor(0);
      return;
    }
    // Focus after paint so the ring animation looks right.
    const id = setTimeout(() => inputRef.current?.focus(), 20);
    return () => clearTimeout(id);
  }, [open]);

  // Debounced fetch. AbortController cancels in-flight when the user
  // keeps typing, so a fast typer never sees a stale render.
  useEffect(() => {
    if (!open || q.trim().length === 0) {
      setHits([]);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(q.trim())}`,
          { signal: ctrl.signal, cache: "no-store" },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { hits: SearchHit[] };
        setHits(body.hits ?? []);
        setCursor(0);
      } catch (e) {
        if ((e as { name?: string })?.name === "AbortError") return;
        setHits([]);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
  }, [q, open]);

  const go = useCallback(
    (hit: SearchHit) => {
      setOpen(false);
      router.push(hit.href);
    },
    [router],
  );

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, Math.max(hits.length - 1, 0)));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      const hit = hits[cursor];
      if (hit) {
        e.preventDefault();
        go(hit);
      }
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 px-4 pt-24"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="w-full max-w-xl overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <span className="text-lg text-muted-foreground" aria-hidden>
            ⌘
          </span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Jump to order, party, invoice, or admin page…"
            className="flex-1 bg-transparent text-base text-foreground placeholder:text-muted-foreground focus:outline-none"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
            ESC
          </kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {q.trim().length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Type to search. Cmd/Ctrl-K opens this from anywhere.
            </div>
          ) : loading && hits.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Searching…
            </div>
          ) : hits.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No matches for &ldquo;{q.trim()}&rdquo;.
            </div>
          ) : (
            <ul className="py-1">
              {hits.map((h, i) => (
                <li key={`${h.kind}-${h.id}`}>
                  <button
                    type="button"
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => go(h)}
                    className={`flex w-full items-baseline justify-between gap-3 px-4 py-2 text-left ${
                      i === cursor
                        ? "bg-muted/70 text-foreground"
                        : "hover:bg-muted/40"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">
                        {h.title}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {h.subtitle}
                      </div>
                    </div>
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                      {h.kind}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-border bg-muted/40 px-4 py-2 text-[11px] text-muted-foreground">
          <kbd className="mr-2 rounded border border-border bg-card px-1 py-0.5 text-[10px] font-semibold">
            ↑ ↓
          </kbd>
          navigate
          <kbd className="mx-2 rounded border border-border bg-card px-1 py-0.5 text-[10px] font-semibold">
            ↵
          </kbd>
          open
          <kbd className="mx-2 rounded border border-border bg-card px-1 py-0.5 text-[10px] font-semibold">
            /
          </kbd>
          re-open from anywhere
        </div>
      </div>
    </div>
  );
}

function isEditableTarget(el: EventTarget | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
