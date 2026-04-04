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

      {/* Paperclip icon */}
      <svg
        width="80"
        height="80"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ marginBottom: "32px" }}
      >
        <path
          d="M11 22V12a5 5 0 0 1 10 0v8a3 3 0 0 1-6 0V12a1 1 0 0 1 2 0v8"
          stroke="#818cf8"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>

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

      {/* Domain — prominent */}
      <div
        style={{
          position: "absolute",
          bottom: "48px",
          display: "flex",
          alignItems: "center",
          gap: "16px",
        }}
      >
        <div
          style={{
            fontSize: "36px",
            fontWeight: 700,
            color: "#818cf8",
            letterSpacing: "-0.01em",
            display: "flex",
          }}
        >
          runpaperclip.com
        </div>
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
