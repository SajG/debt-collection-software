#!/usr/bin/env node
//
// Apply Syncit auth config to a Supabase project via the Management
// API. Idempotent — safe to re-run.
//
// What it changes:
//   * mailer_otp_exp            → 600  (10 minutes, per SY-email)
//   * mailer_subjects_magic_link → "Your Syncit sign-in code"
//   * mailer_templates_magic_link_content → HTML from
//     supabase/templates/magic-link.html  (renders {{ .Token }})
//
// Requires:
//   SUPABASE_ACCESS_TOKEN     — personal access token (dashboard →
//                               Account → Access Tokens)
//   NEXT_PUBLIC_SUPABASE_URL  — used to derive the project ref
//
// Usage:  node --env-file=.env scripts/apply-supabase-auth-config.mjs

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = dirname(HERE);

const token = process.env.SUPABASE_ACCESS_TOKEN;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!token || !url) {
  console.error("SUPABASE_ACCESS_TOKEN + NEXT_PUBLIC_SUPABASE_URL required.");
  process.exit(1);
}

// Derive project ref from https://<ref>.supabase.co
const m = url.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i);
if (!m) {
  console.error(`Could not parse project ref from ${url}`);
  process.exit(1);
}
const projectRef = m[1];

const templateHtml = await readFile(
  join(REPO, "supabase/templates/magic-link.html"),
  "utf8",
);

// Free-tier projects using Supabase's built-in mailer refuse
// template edits ("upgrade or use custom SMTP"). Split the patch
// so the safe pieces still land when the template piece is blocked.
const includeTemplate = process.argv.includes("--template");
const patch = includeTemplate
  ? {
      mailer_otp_exp: 600,
      mailer_subjects_magic_link: "Your Syncit sign-in code",
      mailer_templates_magic_link_content: templateHtml,
    }
  : {
      mailer_otp_exp: 600,
    };

console.log(`\nApplying auth config to project ${projectRef}…`);
for (const [k, v] of Object.entries(patch)) {
  console.log(
    `  ${k} = ${typeof v === "string" && v.length > 40 ? `${v.length} bytes` : JSON.stringify(v)}`,
  );
}
console.log();

const res = await fetch(
  `https://api.supabase.com/v1/projects/${projectRef}/config/auth`,
  {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(patch),
  },
);

if (!res.ok) {
  const body = await res.text();
  console.error(`PATCH failed: HTTP ${res.status}`);
  console.error(body);
  process.exit(1);
}

// Verify by GETting it back.
const verify = await fetch(
  `https://api.supabase.com/v1/projects/${projectRef}/config/auth`,
  { headers: { authorization: `Bearer ${token}` } },
);
if (!verify.ok) {
  console.error(`Verify failed: HTTP ${verify.status}`);
  process.exit(1);
}
const cfg = await verify.json();

console.log("Applied. Current state:");
console.log(`  mailer_otp_exp             = ${cfg.mailer_otp_exp}`);
console.log(`  mailer_subjects_magic_link = "${cfg.mailer_subjects_magic_link}"`);
console.log(
  `  mailer_templates_magic_link_content = ${
    (cfg.mailer_templates_magic_link_content ?? "").length
  } bytes`,
);
console.log();
console.log("Next sign-in email from this project will render the 6-digit code.");
console.log(
  "REMINDER: revoke SUPABASE_ACCESS_TOKEN at https://supabase.com/dashboard/account/tokens if it was pasted anywhere it shouldn't have been.",
);
