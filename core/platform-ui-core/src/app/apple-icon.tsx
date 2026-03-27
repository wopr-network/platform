import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        backgroundColor: "#000000",
        borderRadius: "22px",
      }}
    >
      <span
        style={{
          fontSize: "140px",
          fontWeight: 700,
          fontFamily: "monospace",
          color: "#00FF41",
        }}
      >
        W
      </span>
    </div>,
    { ...size },
  );
}
