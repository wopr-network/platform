"use client";

export function CostCurve() {
  return (
    <div className="w-full max-w-3xl mx-auto">
      <svg
        viewBox="0 0 640 380"
        className="w-full"
        role="img"
        aria-label="Cost per issue over time: both curves rise together, then Holy Ship diverges downward while traditional keeps accelerating"
      >
        {/* Axes */}
        <line x1="80" y1="40" x2="80" y2="300" stroke="#fafafa" strokeOpacity="0.1" strokeWidth="1" />
        <line x1="80" y1="300" x2="580" y2="300" stroke="#fafafa" strokeOpacity="0.1" strokeWidth="1" />
        {/* Horizontal grid lines */}
        <line x1="80" y1="235" x2="580" y2="235" stroke="#fafafa" strokeOpacity="0.05" strokeWidth="1" />
        <line x1="80" y1="170" x2="580" y2="170" stroke="#fafafa" strokeOpacity="0.05" strokeWidth="1" />
        <line x1="80" y1="105" x2="580" y2="105" stroke="#fafafa" strokeOpacity="0.05" strokeWidth="1" />

        {/* Y-axis label */}
        <text
          x="20"
          y="170"
          fill="#fafafa"
          fillOpacity="0.4"
          fontSize="12"
          fontFamily="'JetBrains Mono', monospace"
          textAnchor="middle"
          transform="rotate(-90, 20, 170)"
        >
          Cost per issue
        </text>

        {/* X-axis label */}
        <text
          x="330"
          y="338"
          fill="#fafafa"
          fillOpacity="0.3"
          fontSize="11"
          fontFamily="'JetBrains Mono', monospace"
          textAnchor="middle"
        >
          Issues shipped over time →
        </text>

        {/* X-axis tick labels */}
        <text
          x="120"
          y="318"
          fill="#fafafa"
          fillOpacity="0.2"
          fontSize="9"
          fontFamily="'JetBrains Mono', monospace"
          textAnchor="middle"
        >
          #1
        </text>
        <text
          x="220"
          y="318"
          fill="#fafafa"
          fillOpacity="0.2"
          fontSize="9"
          fontFamily="'JetBrains Mono', monospace"
          textAnchor="middle"
        >
          #10
        </text>
        <text
          x="330"
          y="318"
          fill="#fafafa"
          fillOpacity="0.2"
          fontSize="9"
          fontFamily="'JetBrains Mono', monospace"
          textAnchor="middle"
        >
          #50
        </text>
        <text
          x="440"
          y="318"
          fill="#fafafa"
          fillOpacity="0.2"
          fontSize="9"
          fontFamily="'JetBrains Mono', monospace"
          textAnchor="middle"
        >
          #100
        </text>
        <text
          x="560"
          y="318"
          fill="#fafafa"
          fillOpacity="0.2"
          fontSize="9"
          fontFamily="'JetBrains Mono', monospace"
          textAnchor="middle"
        >
          #500
        </text>

        {/* Gradient fill between curves after divergence */}
        <defs>
          <linearGradient id="savingsGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ff6200" stopOpacity="0" />
            <stop offset="40%" stopColor="#ff6200" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#ff6200" stopOpacity="0.15" />
          </linearGradient>
        </defs>
        {/* Fill: traditional top edge → holy ship bottom edge */}
        <path
          d="M250,195 C290,172 330,142 370,108 C410,78 450,55 500,44 C530,40 555,38 570,38 L570,290 C555,288 530,284 500,278 C450,268 410,255 370,240 C330,225 290,212 250,195 Z"
          fill="url(#savingsGrad)"
        />

        {/* Traditional curve — rises together with Holy Ship, then keeps accelerating */}
        <path
          d="M120,280 C150,272 180,260 210,245 C240,228 260,212 280,195 C310,172 340,142 380,108 C420,78 460,55 510,44 C545,38 565,37 570,37"
          fill="none"
          stroke="#fafafa"
          strokeOpacity="0.3"
          strokeWidth="2.5"
          strokeDasharray="8,4"
        />

        {/* Traditional label */}
        <text
          x="570"
          y="32"
          fill="#fafafa"
          fillOpacity="0.4"
          fontSize="11"
          fontFamily="'JetBrains Mono', monospace"
          textAnchor="start"
        >
          Traditional
        </text>

        {/* Holy Ship curve — rises WITH traditional at first, then peaks and trends DOWN */}
        <path
          d="M120,280 C150,272 180,260 210,245 C240,228 260,212 280,198 C310,188 340,195 370,210 C410,232 450,255 510,278 C545,286 560,289 570,290"
          fill="none"
          stroke="#ff6200"
          strokeWidth="3"
        />

        {/* Holy Ship label */}
        <text
          x="570"
          y="298"
          fill="#ff6200"
          fontSize="11"
          fontFamily="'JetBrains Mono', monospace"
          fontWeight="700"
          textAnchor="start"
        >
          Holy Ship
        </text>

        {/* Divergence point annotation */}
        <circle cx="280" cy="196" r="4" fill="#ff6200" fillOpacity="0.6" />
        <text x="284" y="182" fill="#ff6200" fillOpacity="0.5" fontSize="9" fontFamily="'JetBrains Mono', monospace">
          system learns
        </text>

        {/* Annotation: the widening gap */}
        <line
          x1="460"
          y1="52"
          x2="460"
          y2="260"
          stroke="#ff6200"
          strokeOpacity="0.2"
          strokeWidth="1"
          strokeDasharray="4,4"
        />
        <text x="468" y="158" fill="#ff6200" fillOpacity="0.5" fontSize="10" fontFamily="'JetBrains Mono', monospace">
          savings
        </text>

        {/* Bottom tagline */}
        <text
          x="330"
          y="370"
          fill="#fafafa"
          fillOpacity="0.4"
          fontSize="11"
          fontFamily="'JetBrains Mono', monospace"
          textAnchor="middle"
        >
          The curve doesn't flatten. It trends down.
        </text>
      </svg>
    </div>
  );
}
