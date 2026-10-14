import Link from "next/link";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import type { ComponentPropsWithoutRef } from "react";
import { mkt } from "@/components/marketing/tokens";

// Server-side MDX → HTML for help articles and blog posts. Rendered as
// a React Server Component: the reader's browser gets plain HTML and no
// MDX or content JavaScript.

function A({ href = "", children, ...rest }: ComponentPropsWithoutRef<"a">) {
  const style = { color: mkt.teal };
  const cls = "underline underline-offset-4";
  if (href.startsWith("/")) {
    return (
      <Link href={href} className={cls} style={style}>
        {children}
      </Link>
    );
  }
  const external = /^https?:/.test(href);
  return (
    <a
      href={href}
      className={cls}
      style={style}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      {...rest}
    >
      {children}
    </a>
  );
}

const components = {
  a: A,
  h2: (p: ComponentPropsWithoutRef<"h2">) => (
    <h2 className="font-display font-bold text-2xl mt-10 mb-3" style={{ color: mkt.ink }} {...p} />
  ),
  h3: (p: ComponentPropsWithoutRef<"h3">) => (
    <h3 className="font-display font-semibold text-xl mt-8 mb-2" style={{ color: mkt.ink }} {...p} />
  ),
  p: (p: ComponentPropsWithoutRef<"p">) => (
    <p className="text-[17px] leading-relaxed my-4" style={{ color: mkt.ink2 }} {...p} />
  ),
  ul: (p: ComponentPropsWithoutRef<"ul">) => (
    <ul className="list-disc pl-6 my-4 space-y-2 text-[17px] leading-relaxed" style={{ color: mkt.ink2 }} {...p} />
  ),
  ol: (p: ComponentPropsWithoutRef<"ol">) => (
    <ol className="list-decimal pl-6 my-4 space-y-2 text-[17px] leading-relaxed" style={{ color: mkt.ink2 }} {...p} />
  ),
  strong: (p: ComponentPropsWithoutRef<"strong">) => (
    <strong className="font-semibold" style={{ color: mkt.ink }} {...p} />
  ),
  blockquote: (p: ComponentPropsWithoutRef<"blockquote">) => (
    <blockquote
      className="my-5 rounded-r-lg border-l-4 px-4 py-2"
      style={{ borderColor: mkt.teal, backgroundColor: mkt.tealLight }}
      {...p}
    />
  ),
  code: (p: ComponentPropsWithoutRef<"code">) => (
    <code className="rounded px-1.5 py-0.5 text-[0.9em]" style={{ backgroundColor: mkt.bgAlt }} {...p} />
  ),
  pre: (p: ComponentPropsWithoutRef<"pre">) => (
    <pre
      className="my-5 overflow-x-auto whitespace-pre-wrap rounded-xl p-4 text-[15px] leading-relaxed"
      style={{ backgroundColor: mkt.bgAlt, color: mkt.ink }}
      {...p}
    />
  ),
  table: (p: ComponentPropsWithoutRef<"table">) => (
    <div className="my-6 overflow-x-auto">
      <table className="w-full border-collapse text-left text-[15px]" {...p} />
    </div>
  ),
  th: (p: ComponentPropsWithoutRef<"th">) => (
    <th className="border-b px-3 py-2 font-semibold" style={{ borderColor: mkt.border, color: mkt.ink }} {...p} />
  ),
  td: (p: ComponentPropsWithoutRef<"td">) => (
    <td className="border-b px-3 py-2 align-top" style={{ borderColor: mkt.border, color: mkt.ink2 }} {...p} />
  ),
  hr: () => <hr className="my-10" style={{ borderColor: mkt.border }} />,
};

export function Mdx({ source }: { source: string }) {
  return (
    <MDXRemote
      source={source}
      components={components}
      options={{ mdxOptions: { remarkPlugins: [remarkGfm], format: "mdx" } }}
    />
  );
}
