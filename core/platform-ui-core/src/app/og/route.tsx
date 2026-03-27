import { ImageResponse } from "next/og";
import { getBrandConfig } from "@/lib/brand-config";

export const runtime = "edge";
export async function GET() {
  const brand = getBrandConfig();
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        backgroundColor: "#000000",
        padding: "80px",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "32px",
        }}
      >
        <div
          style={{
            fontSize: "56px",
            fontWeight: 700,
            color: "#00FF41",
            textAlign: "center",
            lineHeight: 1.2,
          }}
        >
          {brand.tagline}
        </div>
        <div style={{ fontSize: "32px", color: "#A0A0A0" }}>
          {brand.price ? `${brand.price}.` : ""} {brand.domain}
        </div>
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
    },
  );
}
