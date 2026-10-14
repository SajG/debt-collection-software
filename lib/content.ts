import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// SY38 — file-based content: help articles and blog posts are MDX
// files under /content. This module only lists and reads them; the MDX
// itself is compiled on the server by components/content/mdx.tsx, so no
// MDX runtime reaches the browser.
//
//   content/help/<slug>.mdx   frontmatter: title, description, order, updated
//   content/blog/<slug>.mdx   frontmatter: title, description, date, updated?, author?
//
// To publish: add a file. The index pages, search and sitemap.xml pick
// it up on the next deploy.

export type ContentKind = "help" | "blog";

export type ContentMeta = {
  slug: string;
  title: string;
  description: string;
  /** help: position in the list */
  order: number;
  /** blog: publication date, ISO yyyy-mm-dd */
  date: string | null;
  updated: string | null;
  author: string | null;
  /** Approximate reading time in minutes. */
  minutes: number;
};

export type ContentDoc = ContentMeta & {
  /** MDX source without the frontmatter block. */
  body: string;
  /** Plain text of the body, for search. */
  text: string;
};

const ROOT = join(process.cwd(), "content");
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function parse(kind: ContentKind, slug: string): ContentDoc | null {
  if (!SLUG_RE.test(slug)) return null; // also blocks path traversal
  let raw: string;
  try {
    raw = readFileSync(join(ROOT, kind, `${slug}.mdx`), "utf8");
  } catch {
    return null;
  }
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  const front: Record<string, string> = {};
  if (m) {
    for (const line of m[1]!.split("\n")) {
      const kv = line.match(/^(\w+):\s*(.*)$/);
      if (kv) front[kv[1]!] = kv[2]!.trim().replace(/^"(.*)"$/, "$1");
    }
  }
  const body = m ? raw.slice(m[0].length) : raw;
  const text = body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return {
    slug,
    title: front.title ?? slug,
    description: front.description ?? "",
    order: Number(front.order ?? 999),
    date: front.date ?? null,
    updated: front.updated ?? null,
    author: front.author ?? null,
    minutes: Math.max(1, Math.round(text.split(" ").length / 200)),
    body,
    text,
  };
}

export function getDoc(kind: ContentKind, slug: string): ContentDoc | null {
  return parse(kind, slug);
}

export function listDocs(kind: ContentKind): ContentDoc[] {
  let files: string[];
  try {
    files = readdirSync(join(ROOT, kind));
  } catch {
    return [];
  }
  const docs = files
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => parse(kind, f.slice(0, -4)))
    .filter((d): d is ContentDoc => d !== null);
  return kind === "help"
    ? docs.sort((a, b) => a.order - b.order)
    : docs.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}
