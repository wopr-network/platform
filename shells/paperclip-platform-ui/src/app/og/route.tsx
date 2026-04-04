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
        justifyContent: "center",
        alignItems: "center",
        background: "linear-gradient(135deg, #09090b 0%, #1a1a2e 50%, #09090b 100%)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Large indigo glow */}
      <div
        style={{
          position: "absolute",
          top: "-100px",
          left: "50%",
          width: "900px",
          height: "500px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(99,102,241,0.25) 0%, rgba(139,92,246,0.1) 40%, transparent 70%)",
          transform: "translateX(-50%)",
          display: "flex",
        }}
      />

      {/* Paperclip emoji + brand */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "20px",
          marginBottom: "40px",
        }}
      >
        <div
          style={{
            width: "72px",
            height: "72px",
            borderRadius: "18px",
            background: "linear-gradient(135deg, #818cf8, #6366f1)",
            boxShadow: "0 0 60px rgba(99,102,241,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "40px",
          }}
        >
          📎
        </div>
        <div
          style={{
            fontSize: "48px",
            fontWeight: 700,
            color: "#ffffff",
            letterSpacing: "-0.02em",
            display: "flex",
          }}
        >
          Paperclip
        </div>
      </div>

      {/* Headline */}
      <div
        style={{
          fontSize: "72px",
          fontWeight: 700,
          color: "#ffffff",
          lineHeight: 1.1,
          textAlign: "center",
          display: "flex",
          letterSpacing: "-0.03em",
        }}
      >
        Deploy your AI workforce
      </div>

      {/* Subline */}
      <div
        style={{
          fontSize: "28px",
          color: "#a1a1aa",
          marginTop: "20px",
          display: "flex",
        }}
      >
        Agents that code, ship, and iterate — while you sleep.
      </div>

      {/* Bottom accent line */}
      <div
        style={{
          position: "absolute",
          bottom: "0",
          left: "0",
          right: "0",
          height: "4px",
          background: "linear-gradient(90deg, transparent, #818cf8, #6366f1, #818cf8, transparent)",
          display: "flex",
        }}
      />
    </div>,
    {
      width: 1200,
      height: 630,
    },
  );
}
