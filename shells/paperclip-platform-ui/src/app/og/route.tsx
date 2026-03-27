import { getBrandConfig } from "@core/lib/brand-config";
import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
	const brand = getBrandConfig();

	return new ImageResponse(
		<div
			style={{
				width: "100%",
				height: "100%",
				display: "flex",
				flexDirection: "column",
				justifyContent: "center",
				alignItems: "center",
				background: "#09090b",
				position: "relative",
				overflow: "hidden",
			}}
		>
			{/* Subtle gradient glow */}
			<div
				style={{
					position: "absolute",
					top: "-200px",
					left: "50%",
					width: "800px",
					height: "600px",
					borderRadius: "50%",
					background:
						"radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)",
					transform: "translateX(-50%)",
					display: "flex",
				}}
			/>

			{/* Paperclip icon */}
			<svg
				width="64"
				height="64"
				viewBox="0 0 32 32"
				fill="none"
				xmlns="http://www.w3.org/2000/svg"
				role="img"
				aria-label="Paperclip icon"
				style={{ marginBottom: "32px" }}
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

			{/* Headline */}
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					gap: "8px",
				}}
			>
				<div
					style={{
						fontSize: "64px",
						fontWeight: 700,
						background: "linear-gradient(135deg, #fafafa, #818cf8, #a78bfa)",
						backgroundClip: "text",
						color: "transparent",
						lineHeight: 1.1,
						display: "flex",
					}}
				>
					Your AI. Your rules.
				</div>
				<div
					style={{
						fontSize: "24px",
						color: "#a1a1aa",
						marginTop: "16px",
						display: "flex",
					}}
				>
					AI agents that run your business. Deploy in seconds.
				</div>
			</div>

			{/* Bottom bar */}
			<div
				style={{
					position: "absolute",
					bottom: "40px",
					display: "flex",
					alignItems: "center",
					gap: "12px",
				}}
			>
				<div
					style={{
						fontSize: "20px",
						fontWeight: 600,
						color: "#ffffff",
						display: "flex",
					}}
				>
					{brand.productName ?? "Paperclip"}
				</div>
				<div
					style={{
						fontSize: "16px",
						color: "#52525b",
						display: "flex",
					}}
				>
					runpaperclip.com
				</div>
			</div>
		</div>,
		{
			width: 1200,
			height: 630,
		},
	);
}
