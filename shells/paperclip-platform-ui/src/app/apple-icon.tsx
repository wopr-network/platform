import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#09090b",
        borderRadius: "40px",
      }}
    >
      <svg
        width="120"
        height="120"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Paperclip icon"
      >
        <title>Paperclip</title>
        <path
          d="M11 22V12a5 5 0 0 1 10 0v8a3 3 0 0 1-6 0V12a1 1 0 0 1 2 0v8"
          stroke="#818cf8"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    </div>,
    { ...size },
  );
}
