"use client";

import { FadeIn } from "./fade-in";

type Props = {
  code: string;
  code2?: string;
  title: string;
  paragraphs: string[];
  punchline: string;
  punchline2?: string;
};

export function CodeVsCritique({ code, code2, title, paragraphs, punchline, punchline2 }: Props) {
  return (
    <FadeIn>
      <section className="px-6 md:px-16 lg:px-24 py-16 md:py-24">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-start">
          <div className="space-y-4">
            <pre className="bg-off-white/[0.03] border border-off-white/10 rounded-lg p-5 overflow-x-auto text-sm leading-relaxed font-mono text-off-white/40">
              <code>{code}</code>
            </pre>
            {code2 && (
              <pre className="bg-off-white/[0.03] border border-off-white/10 rounded-lg p-5 overflow-x-auto text-sm leading-relaxed font-mono text-off-white/40">
                <code>{code2}</code>
              </pre>
            )}
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-off-white mb-6">{title}</h2>
            <div className="space-y-4 text-lg md:text-xl leading-relaxed text-off-white/70">
              {paragraphs.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
          </div>
        </div>
        <p className="text-2xl md:text-3xl font-bold text-signal-orange text-center mt-16">{punchline}</p>
        {punchline2 && <p className="text-lg md:text-xl text-off-white/40 text-center mt-3">{punchline2}</p>}
      </section>
    </FadeIn>
  );
}
