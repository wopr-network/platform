"use client";

import type { ComponentPropsWithoutRef } from "react";
import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";

const sanitizeSchema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    href: ["http", "https", "mailto"],
  },
};

interface SuperpowerContentProps {
  markdown: string;
}

interface Section {
  heading: string;
  body: string;
  collapsed: boolean;
}

function parseSections(md: string): { preamble: string; sections: Section[] } {
  const lines = md.split("\n");
  let preamble = "";
  const sections: Section[] = [];
  let current: Section | null = null;

  for (const line of lines) {
    const h2Match = line.match(/^## (.+)$/);
    if (h2Match) {
      if (current) sections.push(current);
      const heading = h2Match[1];
      current = {
        heading,
        body: "",
        collapsed: /what gets installed/i.test(heading),
      };
    } else if (current) {
      current.body += `${line}\n`;
    } else {
      preamble += `${line}\n`;
    }
  }
  if (current) sections.push(current);

  return { preamble, sections };
}

const mdComponents = {
  h1: ({ children }: ComponentPropsWithoutRef<"h1">) => (
    <h1 className="text-4xl font-bold tracking-tight lg:text-5xl">{children}</h1>
  ),
  p: ({ children }: ComponentPropsWithoutRef<"p">) => (
    <p className="text-base leading-relaxed text-muted-foreground">{children}</p>
  ),
  em: ({ children }: ComponentPropsWithoutRef<"em">) => (
    <em className="text-lg text-muted-foreground not-italic font-light">{children}</em>
  ),
  ul: ({ children }: ComponentPropsWithoutRef<"ul">) => (
    <ul className="space-y-2 ml-1">{children}</ul>
  ),
  li: ({ children }: ComponentPropsWithoutRef<"li">) => (
    <li className="flex items-start gap-2 text-sm leading-relaxed">
      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
      <span>{children}</span>
    </li>
  ),
};

export function SuperpowerContent({ markdown }: SuperpowerContentProps) {
  const { preamble, sections } = useMemo(() => parseSections(markdown), [markdown]);

  return (
    <div className="space-y-6">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
        components={mdComponents}
      >
        {preamble}
      </ReactMarkdown>

      {sections.map((section) =>
        section.collapsed ? (
          <details key={section.heading} className="group rounded-lg border p-4">
            <summary className="cursor-pointer text-lg font-semibold">{section.heading}</summary>
            <div className="mt-3">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
                components={mdComponents}
              >
                {section.body}
              </ReactMarkdown>
            </div>
          </details>
        ) : (
          <div key={section.heading}>
            <h2 className="text-xl font-semibold tracking-tight mb-3">{section.heading}</h2>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
              components={mdComponents}
            >
              {section.body}
            </ReactMarkdown>
          </div>
        ),
      )}
    </div>
  );
}
