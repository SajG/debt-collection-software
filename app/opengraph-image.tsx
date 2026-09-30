import { ImageResponse } from "next/og";

// SY26 — global Open Graph image for the marketing surface.
//
// Serves as the default for /features, /tally, /pricing, /download,
// /contact, /blog and the legal pages. Each page can override with
// its own opengraph-image.tsx sibling if the copy warrants a
// bespoke card.
//
// Rendered at request time by @vercel/og. Kept intentionally simple
// so it stays fast and doesn't need external fonts.

export const runtime = "edge";
export const alt =
  "Syncit — Order-to-cash for Indian manufacturers & distributors";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          background:
            "linear-gradient(135deg, #F5F2EC 0%, #ECE8DF 60%, #DDD8CF 100%)",
          fontFamily: "'Inter', system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 68,
              height: 68,
              borderRadius: 18,
              backgroundColor: "#0D5C4A",
              color: "#FFFFFF",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 34,
              fontWeight: 700,
            }}
          >
            ₹
          </div>
          <span style={{ fontSize: 42, fontWeight: 700, color: "#0B1D18" }}>
            Syncit
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              display: "inline-flex",
              alignSelf: "flex-start",
              padding: "8px 16px",
              borderRadius: 999,
              backgroundColor: "#E8F4F0",
              color: "#0D5C4A",
              fontSize: 20,
              fontWeight: 600,
            }}
          >
            Order-to-cash for MSME distributors
          </div>
          <div
            style={{
              fontSize: 68,
              fontWeight: 700,
              color: "#0B1D18",
              lineHeight: 1.1,
              maxWidth: 900,
            }}
          >
            Every order, dispatch and payment in one app.
          </div>
          <div style={{ fontSize: 28, color: "#57534E", maxWidth: 900 }}>
            Get paid faster, without chasing.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 22,
            color: "#57534E",
          }}
        >
          <span>getsyncit.app</span>
          <span>14 days free · No credit card</span>
        </div>
      </div>
    ),
    size,
  );
}
