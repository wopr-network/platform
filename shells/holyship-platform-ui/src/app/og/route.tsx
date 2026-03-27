import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#0a0a0a",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <div
          style={{
            fontSize: 48,
            fontWeight: 700,
            color: "#ff6200",
            letterSpacing: "0.3em",
            fontFamily: "monospace",
          }}
        >
          HOLY
        </div>
        <div
          style={{
            fontSize: 160,
            fontWeight: 900,
            color: "#fafafa",
            letterSpacing: "-0.03em",
            lineHeight: 0.85,
            fontFamily: "monospace",
          }}
        >
          SHIP
        </div>
      </div>
      <div
        style={{
          fontSize: 32,
          color: "#fafafa",
          opacity: 0.5,
          marginTop: 40,
          fontFamily: "monospace",
        }}
      >
        It's what you'll say when you see the results.
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
    },
  );
}
