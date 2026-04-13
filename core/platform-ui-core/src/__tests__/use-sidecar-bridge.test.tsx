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

/**
 * Initial deep-link forwarding was moved out of `ready` — it now travels
 * through `SidecarFrame`'s iframe src as `?initial-path=…`, which the
 * sidecar's CompanyRootRedirect reads on first render. The ready-time
 * postMessage approach was removed because it raced with the sidecar's
 * own root redirect.
 */
describe("SidecarBridgeProvider", () => {
  const originalUrl = window.location.pathname + window.location.search + window.location.hash;

  beforeEach(() => {
    window.history.replaceState(null, "", "/dashboard");
  });

  afterEach(() => {
    window.history.replaceState(null, "", originalUrl);
  });

  it("does not forward on ready — deep links travel via iframe src", () => {
    window.history.replaceState(null, "", "/issues/IRA-10");
    const { iframe, postMessage } = makeIframeWithSpy();

    render(
      <SidecarBridgeProvider>
        <IframeRegistrar iframe={iframe} />
      </SidecarBridgeProvider>,
    );

    fireReady();

    expect(postMessage).not.toHaveBeenCalled();
  });

  it("ignores duplicate ready messages without erroring", () => {
    window.history.replaceState(null, "", "/dashboard");
    const { iframe, postMessage } = makeIframeWithSpy();

    render(
      <SidecarBridgeProvider>
        <IframeRegistrar iframe={iframe} />
      </SidecarBridgeProvider>,
    );

    fireReady();
    fireReady();

    expect(postMessage).not.toHaveBeenCalled();
  });

  it("still updates shell URL on routeChanged", () => {
    window.history.replaceState(null, "", "/");
    const { iframe } = makeIframeWithSpy();

    render(
      <SidecarBridgeProvider>
        <IframeRegistrar iframe={iframe} />
      </SidecarBridgeProvider>,
    );

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "routeChanged", path: "/LED/issues/LED-1" },
          origin: window.location.origin,
        }),
      );
    });

    expect(window.location.pathname).toBe("/issues/LED-1");
  });
});
