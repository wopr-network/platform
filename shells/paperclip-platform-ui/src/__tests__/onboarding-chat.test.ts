import { describe, expect, it, vi } from "vitest";
import { parseStateMachineStream } from "@/lib/onboarding-chat";

describe("parseStateMachineStream", () => {
  it("extracts gate from fenced JSON and streams visible text after it", async () => {
    const lines = [
      'data: {"type":"delta","content":"```json\\n"}',
      'data: {"type":"delta","content":"{\\"ready\\": false}\\n"}',
      'data: {"type":"delta","content":"```\\n"}',
      'data: {"type":"delta","content":"Hello world"}',
      'data: {"type":"done"}',
    ];
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        for (const line of lines) {
          controller.enqueue(encoder.encode(`${line}\n\n`));
        }
        controller.close();
      },
    });

    const onDelta = vi.fn();
    const result = await parseStateMachineStream(stream, { onDelta });

    expect(onDelta).toHaveBeenCalledWith("Hello world");
    expect(result.gate).toEqual({ ready: false });
    expect(result.visibleContent).toBe("Hello world");
  });

  it("extracts ready:true gate with artifact", async () => {
    const json = '{"ready": true, "artifact": {"companyName": "acme-labs"}}';
    const lines = [
      'data: {"type":"delta","content":"```json\\n"}',
      `data: {"type":"delta","content":"${json.replace(/"/g, '\\"')}\\n"}`,
      'data: {"type":"delta","content":"```\\n"}',
      'data: {"type":"delta","content":"Great choice!"}',
      'data: {"type":"done"}',
    ];
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        for (const line of lines) {
          controller.enqueue(encoder.encode(`${line}\n\n`));
        }
        controller.close();
      },
    });

    const onDelta = vi.fn();
    const result = await parseStateMachineStream(stream, { onDelta });

    expect(result.gate).toEqual({ ready: true, artifact: { companyName: "acme-labs" } });
    expect(result.visibleContent).toBe("Great choice!");
  });

  it("returns ready:false when no fenced JSON is found", async () => {
    const lines = ['data: {"type":"delta","content":"Just plain text"}', 'data: {"type":"done"}'];
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        for (const line of lines) {
          controller.enqueue(encoder.encode(`${line}\n\n`));
        }
        controller.close();
      },
    });

    const result = await parseStateMachineStream(stream, { onDelta: vi.fn() });
    expect(result.gate).toEqual({ ready: false });
    expect(result.visibleContent).toBe("Just plain text");
  });
});
