import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0D5C4A",
          borderRadius: 40,
        }}
      >
        <svg
          width="120"
          height="120"
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
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
      </div>
    ),
    { ...size }
  );
}
