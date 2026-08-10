import { ImageResponse } from "next/og";

export const alt =
  "PayTrack — Know who owes you. Follow up without the daily grind.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 88,
          background: "#F5F2EC",
          backgroundImage: "radial-gradient(#DDD8CF 2px, transparent 2px)",
          backgroundSize: "36px 36px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg
            width="72"
            height="72"
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect width="32" height="32" rx="8" fill="#0D5C4A" />
            <path
              d="M9 10.5h14"
              stroke="#FFFFFF"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
            <path
              d="M9 16h8.5"
              stroke="#FFFFFF"
              strokeWidth="2.4"
              strokeLinecap="round"
              opacity="0.85"
            />
            <path
              d="M9 21.5h4.5"
              stroke="#FFFFFF"
              strokeWidth="2.4"
              strokeLinecap="round"
              opacity="0.7"
            />
            <path
              d="M17 21.5l3.2 3.2 5.8-8"
              stroke="#FEF3C7"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div
            style={{
              fontSize: 52,
              fontWeight: 700,
              color: "#1C1917",
              letterSpacing: -1,
            }}
          >
            PayTrack
          </div>
        </div>
        <div
          style={{
            marginTop: 48,
            fontSize: 72,
            fontWeight: 700,
            lineHeight: 1.1,
            color: "#1C1917",
            maxWidth: 950,
            display: "flex",
            flexWrap: "wrap",
          }}
        >
          Know who owes you. Follow up without the daily grind.
        </div>
        <div
          style={{
            marginTop: 36,
            fontSize: 32,
            color: "#57534E",
            display: "flex",
          }}
        >
          Accounts receivable for Indian MSME distributors
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 16,
            background: "#0D5C4A",
            display: "flex",
          }}
        />
      </div>
    ),
    { ...size }
  );
}
