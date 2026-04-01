import { describe, expect, it, vi } from "vitest";
import { parseOnboardingStream } from "@/lib/onboarding-chat";

describe("parseOnboardingStream", () => {
  it("accumulates delta chunks into content", async () => {
    const lines = [
      'data: {"type":"delta","content":"Hello"}',
      'data: {"type":"delta","content":" world"}',
      'data: {"type":"done"}',
    ];
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        for (const line of lines) {
          controller.enqueue(encoder.encode(line + "\n\n"));
        }
        controller.close();
      },
    });

    const onDelta = vi.fn();
    const result = await parseOnboardingStream(stream, { onDelta });

    expect(onDelta).toHaveBeenCalledWith("Hello");
    expect(onDelta).toHaveBeenCalledWith(" world");
    expect(result).toEqual({ content: "Hello world", plan: null });
  });

  it("extracts plan from done chunk", async () => {
    const lines = [
      'data: {"type":"delta","content":"Here is the plan."}',
      'data: {"type":"done","plan":{"taskTitle":"Build dotsync","taskDescription":"A CLI tool..."}}',
    ];
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        for (const line of lines) {
          controller.enqueue(encoder.encode(line + "\n\n"));
        }
        controller.close();
      },
    });

    const onDelta = vi.fn();
    const result = await parseOnboardingStream(stream, { onDelta });

    expect(result).toEqual({
      content: "Here is the plan.",
      plan: { taskTitle: "Build dotsync", taskDescription: "A CLI tool..." },
    });
  });

  it("returns null plan when done has no plan", async () => {
    const lines = ['data: {"type":"delta","content":"What platforms?"}', 'data: {"type":"done"}'];
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        for (const line of lines) {
          controller.enqueue(encoder.encode(line + "\n\n"));
        }
        controller.close();
      },
    });

    const result = await parseOnboardingStream(stream, { onDelta: vi.fn() });
    expect(result).toEqual({ content: "What platforms?", plan: null });
  });
});
