import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "edge";

// SY27 — /download/latest.json
//
// The connector auto-update check hits this URL on the marketing
// domain. We forward to the latest GitHub release asset so we don't
// have to redeploy the marketing site to publish an update — the
// workflow that builds the installer also uploads latest.json to the
// release, and this route reads it live.
//
// Falls back to a hard-coded response when the fetch fails so a
// GitHub outage doesn't stop connectors from starting up cleanly.

const RELEASES_LATEST =
  "https://api.github.com/repos/sajal-ghatpande/debt-collection-software/releases/latest";

type LatestJson = {
  version: string;
  released_at: string;
  installer: {
    name: string;
    sha256: string;
    url: string;
  };
};

const FALLBACK: LatestJson = {
  version: "0.0.0",
  released_at: "1970-01-01T00:00:00Z",
  installer: {
    name: "",
    sha256: "",
    url: "",
  },
};

export async function GET() {
  try {
    const res = await fetch(RELEASES_LATEST, {
      headers: { accept: "application/vnd.github+json" },
      next: { revalidate: 300 },
    });
    if (!res.ok) throw new Error(`GitHub returned ${res.status}`);
    const body = (await res.json()) as {
      tag_name?: string;
      published_at?: string;
      assets?: { name: string; browser_download_url: string }[];
    };
    const latestJsonAsset = body.assets?.find((a) => a.name === "latest.json");
    if (latestJsonAsset) {
      const asset = await fetch(latestJsonAsset.browser_download_url).then(
        (r) => r.json() as Promise<LatestJson>,
      );
      return NextResponse.json(asset, {
        headers: { "cache-control": "public, max-age=300" },
      });
    }
    // No latest.json attached — synthesise from the release.
    const exe = body.assets?.find((a) => a.name.endsWith(".exe"));
    if (!exe || !body.tag_name) throw new Error("No .exe asset on release");
    const synth: LatestJson = {
      version: body.tag_name.replace(/^connector-v/, ""),
      released_at: body.published_at ?? new Date().toISOString(),
      installer: {
        name: exe.name,
        sha256: "",
        url: exe.browser_download_url,
      },
    };
    return NextResponse.json(synth, {
      headers: { "cache-control": "public, max-age=300" },
    });
  } catch {
    return NextResponse.json(FALLBACK, {
      status: 200,
      headers: { "cache-control": "no-store" },
    });
  }
}
