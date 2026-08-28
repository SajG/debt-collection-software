"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTableKeyboardNav } from "./use-table-keyboard-nav";

// Drop this on any list page to enable j/k/enter/slash navigation.
// The server-rendered rows must carry `data-kbnav-index={i}` (any
// integer, ascending, gap-free) and `data-kbnav-href` — the URL to
// open on Enter. This catcher listens globally, mutates a
// `data-kbnav-active` attribute on the current row so styling is
// pure CSS, and routes on Enter.
//
// Usage on the server:
//   <KeyboardNavCatcher rowCount={orders.length} />
//   <tr data-kbnav-index={i} data-kbnav-href={`/orders/${o.id}`}>
//
// Add this once to the page rule set to see the highlight:
//   [data-kbnav-active="true"] { background: hsl(var(--muted)); outline: 2px solid hsl(var(--primary)/0.4); }

export function KeyboardNavCatcher({ rowCount }: { rowCount: number }) {
  const router = useRouter();

  const open = useCallback(
    (row: { href: string }) => {
      router.push(row.href);
    },
    [router],
  );

  // Read hrefs off the DOM lazily — the server rendered them; we
  // don't want to serialise the whole list twice into a client prop.
  const rows = Array.from({ length: rowCount }, (_, i) => ({
    href: "",
    index: i,
  }));

  const { activeIndex } = useTableKeyboardNav({
    rows,
    onOpen: (row) => {
      const el = document.querySelector<HTMLElement>(
        `[data-kbnav-index="${row.index}"]`,
      );
      const href = el?.getAttribute("data-kbnav-href");
      if (href) open({ href });
    },
  });

  // Paint the "active" attribute.
  useEffect(() => {
    const all = document.querySelectorAll<HTMLElement>("[data-kbnav-index]");
    all.forEach((el) => el.removeAttribute("data-kbnav-active"));
    const active = document.querySelector<HTMLElement>(
      `[data-kbnav-index="${activeIndex}"]`,
    );
    active?.setAttribute("data-kbnav-active", "true");
  }, [activeIndex, rowCount]);

  return null;
}
