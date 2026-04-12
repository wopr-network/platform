import { act, render } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SidecarBridgeProvider, useSidecarBridge } from "@/hooks/use-sidecar-bridge";

function IframeRegistrar({ iframe }: { iframe: HTMLIFrameElement }) {
  const { setIframeRef } = useSidecarBridge();
  useEffect(() => {
    setIframeRef(iframe);
    return () => setIframeRef(null);
  }, [iframe, setIframeRef]);
  return null;
}

function makeIframeWithSpy() {
  const postMessage = vi.fn();
  const iframe = {
    contentWindow: { postMessage } as unknown as Window,
  } as unknown as HTMLIFrameElement;
  return { iframe, postMessage };
}

function fireReady() {
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "ready" },
        origin: window.location.origin,
      }),
    );
  });
}

describe("SidecarBridgeProvider — initial deep-link forwarding", () => {
  const originalUrl = window.location.pathname + window.location.search + window.location.hash;

  beforeEach(() => {
    window.history.replaceState(null, "", "/dashboard");
  });

  afterEach(() => {
    window.history.replaceState(null, "", originalUrl);
  });

  it("forwards the shell pathname to the sidecar when ready fires on an iframe route", () => {
    window.history.replaceState(null, "", "/issues/IRA-10");
    const { iframe, postMessage } = makeIframeWithSpy();

    render(
      <SidecarBridgeProvider>
        <IframeRegistrar iframe={iframe} />
      </SidecarBridgeProvider>,
    );

    fireReady();

    expect(postMessage).toHaveBeenCalledWith({ type: "navigate", path: "/issues/IRA-10" }, window.location.origin);
  });

  it("preserves query strings when forwarding", () => {
    window.history.replaceState(null, "", "/issues?filter=open");
    const { iframe, postMessage } = makeIframeWithSpy();

    render(
      <SidecarBridgeProvider>
        <IframeRegistrar iframe={iframe} />
      </SidecarBridgeProvider>,
    );

    fireReady();

    expect(postMessage).toHaveBeenCalledWith({ type: "navigate", path: "/issues?filter=open" }, window.location.origin);
  });

  it("forwards /plugins/* deep links (prefix has no trailing slash)", () => {
    window.history.replaceState(null, "", "/plugins/marketplace");
    const { iframe, postMessage } = makeIframeWithSpy();

    render(
      <SidecarBridgeProvider>
        <IframeRegistrar iframe={iframe} />
      </SidecarBridgeProvider>,
    );

    fireReady();

    expect(postMessage).toHaveBeenCalledWith(
      { type: "navigate", path: "/plugins/marketplace" },
      window.location.origin,
    );
  });

  it("does not forward when the shell is on a native (non-iframe) route", () => {
    window.history.replaceState(null, "", "/settings");
    const { iframe, postMessage } = makeIframeWithSpy();

    render(
      <SidecarBridgeProvider>
        <IframeRegistrar iframe={iframe} />
      </SidecarBridgeProvider>,
    );

    fireReady();

    expect(postMessage).not.toHaveBeenCalled();
  });
});
