"use client";

import { useEffect, useRef, useState } from "react";

// Keyboard nav for a table. Highlights a row by index; wires:
//   j / ArrowDown → next row
//   k / ArrowUp   → previous row
//   Enter         → onOpen(row)
//   /             → focus the search input identified by `searchSelector`
//
// The hook is deliberately dumb — the caller renders however it
// wants and applies whatever "highlighted row" styling suits (add
// a `data-kbnav-index={i}` on the tr and read the returned index).
//
// Skips its handlers when focus is inside an input/textarea/select
// or a contentEditable element so typing in a filter box does not
// jump the row cursor.

type Options<T> = {
  rows: T[];
  onOpen: (row: T) => void;
  /** CSS selector for a search input to focus on "/" */
  searchSelector?: string;
  /** Disable when the table isn't in view (e.g. modal open) */
  enabled?: boolean;
};

export function useTableKeyboardNav<T>({
  rows,
  onOpen,
  searchSelector = 'input[type="search"], input[data-kbnav-search]',
  enabled = true,
}: Options<T>): { activeIndex: number; setActiveIndex: (i: number) => void } {
  const [activeIndex, setActiveIndex] = useState(0);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  useEffect(() => {
    if (!enabled) return;
    function onKey(e: KeyboardEvent) {
      if (isEditableTarget(e.target)) {
        // Only "Escape" from a search input steps back to the table.
        if (e.key === "Escape" && (e.target as HTMLElement).matches?.(searchSelector)) {
          (e.target as HTMLElement).blur();
        }
        return;
      }
      const cur = rowsRef.current;
      if (e.key === "j" || e.key === "ArrowDown") {
        if (cur.length === 0) return;
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, cur.length - 1));
        return;
      }
      if (e.key === "k" || e.key === "ArrowUp") {
        if (cur.length === 0) return;
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        const row = rowsRef.current[activeIndex];
        if (row) {
          e.preventDefault();
          onOpen(row);
        }
        return;
      }
      if (e.key === "/") {
        const input = document.querySelector<HTMLInputElement>(searchSelector);
        if (input) {
          e.preventDefault();
          input.focus();
          input.select?.();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, onOpen, searchSelector, activeIndex]);

  // Keep activeIndex in range when the row set shrinks.
  useEffect(() => {
    if (activeIndex >= rows.length) {
      setActiveIndex(Math.max(rows.length - 1, 0));
    }
  }, [rows.length, activeIndex]);

  // Scroll the active row into view. `data-kbnav-index` on the tr.
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(
      `[data-kbnav-index="${activeIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeIndex]);

  return { activeIndex, setActiveIndex };
}

function isEditableTarget(el: EventTarget | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
