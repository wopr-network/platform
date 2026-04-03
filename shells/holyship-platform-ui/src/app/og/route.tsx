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
        padding: "60px 80px",
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
            fontSize: 60,
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
            display: "flex",
            position: "relative",
            lineHeight: 0.85,
          }}
        >
          <span
            style={{
              fontSize: 175,
              fontWeight: 900,
              color: "#fafafa",
              letterSpacing: "-0.03em",
              fontFamily: "monospace",
            }}
          >
            SHIP
          </span>
          <span
            style={{
              position: "absolute",
              right: -74,
              bottom: 2,
              fontSize: 58,
              fontWeight: 700,
              color: "#ff6200",
              fontFamily: "monospace",
            }}
          >
            .wtf
          </span>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 35,
          color: "#fafafa",
          marginTop: 48,
          fontFamily: "monospace",
          textAlign: "center",
          lineHeight: 1.4,
        }}
      >
        <span>The intelligence isn&apos;t low. It&apos;s&nbsp;</span>
        <span style={{ color: "#ff6200", fontStyle: "italic" }}>jagged.</span>
      </div>
      <div
        style={{
          fontSize: 40,
          color: "#ff6200",
          fontWeight: 700,
          marginTop: 20,
          fontFamily: "monospace",
        }}
      >
        We raise the floor.
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
    },
  );
}
