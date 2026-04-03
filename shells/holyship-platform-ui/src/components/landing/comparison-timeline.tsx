"use client";

import { FadeIn } from "./fade-in";

type Props = {
  leftTitle: string;
  leftSteps: string[];
  rightTitle: string;
  rightSteps: string[];
  punchline: string;
  punchline2?: string;
};

export function ComparisonTimeline({ leftTitle, leftSteps, rightTitle, rightSteps, punchline, punchline2 }: Props) {
  return (
    <FadeIn>
      <section className="px-6 md:px-16 lg:px-24 py-16 md:py-24">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16">
          <div>
            <h3 className="text-xl font-bold text-off-white/30 mb-8">{leftTitle}</h3>
            <ol className="space-y-4">
              {leftSteps.map((step, i) => (
                <li key={step} className="flex gap-4 items-start">
                  <span className="shrink-0 w-7 h-7 rounded-full bg-off-white/5 text-off-white/20 text-sm font-mono flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span className="text-lg text-off-white/30">{step}</span>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <h3 className="text-xl font-bold text-signal-orange mb-8">{rightTitle}</h3>
            <ol className="space-y-4">
              {rightSteps.map((step, i) => (
                <li key={step} className="flex gap-4 items-start">
                  <span className="shrink-0 w-7 h-7 rounded-full bg-signal-orange/10 text-signal-orange text-sm font-mono flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span className="text-lg text-off-white/90">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <p className="text-2xl md:text-3xl font-bold text-signal-orange text-center mt-16">{punchline}</p>
        {punchline2 && (
          <p className="text-lg md:text-xl text-off-white/40 text-center mt-3">{punchline2}</p>
        )}
      </section>
    </FadeIn>
  );
}
