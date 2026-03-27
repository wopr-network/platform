import { Hono } from "hono";
import { describe, expect, it, type MockedFunction, vi } from "vitest";
import type { Auth } from "./better-auth.js";

type HandlerFn = (req: Request) => Promise<Response>;

/**
 * Build a mock Auth whose `.handler` returns the given Response for any request.
 * Also exposes `.api.getSession` for middleware compatibility.
 */
function mockAuthWithHandler(handlerResponse: Response): Auth & {
  handler: MockedFunction<HandlerFn>;
} {
  const handler = vi.fn<HandlerFn>().mockResolvedValue(handlerResponse);
  return {
    handler,
    api: {
      getSession: vi.fn().mockResolvedValue(null),
    },
  } as unknown as Auth & { handler: MockedFunction<HandlerFn> };
}

/**
 * Mount auth.handler on a Hono app at /api/auth/* -- mirrors the pattern
 * used by consuming apps (wopr-platform, wopr-platform-ui).
 */
function createAuthApp(auth: Auth & { handler: HandlerFn }) {
  const app = new Hono();
  app.on(["GET", "POST"], "/api/auth/*", (c) => {
    return auth.handler(c.req.raw);
  });
  return app;
}

// ---------------------------------------------------------------------------
// GET /api/auth/get-session
// ---------------------------------------------------------------------------

describe("GET /api/auth/get-session", () => {
  it("delegates to auth.handler and returns its response", async () => {
    const sessionPayload = { user: { id: "u-1", email: "a@b.com" }, session: { id: "s-1" } };
    const auth = mockAuthWithHandler(
      new Response(JSON.stringify(sessionPayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const app = createAuthApp(auth);

    const res = await app.request("/api/auth/get-session");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(sessionPayload);
    expect(auth.handler).toHaveBeenCalledOnce();
  });

  it("returns 401 when handler returns 401 (no session cookie)", async () => {
    const auth = mockAuthWithHandler(
      new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const app = createAuthApp(auth);

    const res = await app.request("/api/auth/get-session");
    expect(res.status).toBe(401);
    expect(auth.handler).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/sign-up/email
// ---------------------------------------------------------------------------

describe("POST /api/auth/sign-up/email", () => {
  it("delegates sign-up request to auth.handler", async () => {
    const created = { user: { id: "u-new", email: "new@test.com" } };
    const auth = mockAuthWithHandler(
      new Response(JSON.stringify(created), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const app = createAuthApp(auth);

    const res = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test User",
        email: "new@test.com",
        password: "strongpassword123",
      }),
    });

    expect(res.status).toBe(200);
    expect(auth.handler).toHaveBeenCalledOnce();
    // Verify the raw Request was forwarded
    const forwardedReq = auth.handler.mock.calls[0][0];
    expect(forwardedReq).toBeInstanceOf(Request);
    expect(new URL(forwardedReq.url).pathname).toBe("/api/auth/sign-up/email");
    expect(forwardedReq.method).toBe("POST");
  });

  it("returns error when handler rejects invalid fields", async () => {
    const auth = mockAuthWithHandler(
      new Response(JSON.stringify({ error: "Email is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const app = createAuthApp(auth);

    const res = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    expect(auth.handler).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/sign-in/email
// ---------------------------------------------------------------------------

describe("POST /api/auth/sign-in/email", () => {
  it("delegates sign-in request to auth.handler", async () => {
    const session = { user: { id: "u-1" }, session: { id: "s-1", token: "tok" } };
    const auth = mockAuthWithHandler(
      new Response(JSON.stringify(session), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": "better-auth.session_token=tok; Path=/; HttpOnly",
        },
      }),
    );
    const app = createAuthApp(auth);

    const res = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "a@b.com", password: "password123456" }),
    });

    expect(res.status).toBe(200);
    expect(auth.handler).toHaveBeenCalledOnce();
    const forwardedReq = auth.handler.mock.calls[0][0];
    expect(new URL(forwardedReq.url).pathname).toBe("/api/auth/sign-in/email");
  });

  it("returns 401 for invalid credentials", async () => {
    const auth = mockAuthWithHandler(
      new Response(JSON.stringify({ error: "Invalid credentials" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const app = createAuthApp(auth);

    const res = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "a@b.com", password: "wrong" }),
    });

    expect(res.status).toBe(401);
    expect(auth.handler).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/sign-out
// ---------------------------------------------------------------------------

describe("POST /api/auth/sign-out", () => {
  it("delegates sign-out request to auth.handler", async () => {
    const auth = mockAuthWithHandler(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": "better-auth.session_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT",
        },
      }),
    );
    const app = createAuthApp(auth);

    const res = await app.request("/api/auth/sign-out", {
      method: "POST",
      headers: {
        Cookie: "better-auth.session_token=existing-tok",
      },
    });

    expect(res.status).toBe(200);
    expect(auth.handler).toHaveBeenCalledOnce();
    const forwardedReq = auth.handler.mock.calls[0][0];
    expect(new URL(forwardedReq.url).pathname).toBe("/api/auth/sign-out");
    expect(forwardedReq.method).toBe("POST");
  });
});

// ---------------------------------------------------------------------------
// Route matching
// ---------------------------------------------------------------------------

describe("auth route matching", () => {
  it("does not match non-auth routes", async () => {
    const auth = mockAuthWithHandler(new Response("ok"));
    const app = createAuthApp(auth);
    app.get("/api/other", (c) => c.json({ other: true }));

    const res = await app.request("/api/other");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.other).toBe(true);
    expect(auth.handler).not.toHaveBeenCalled();
  });

  it("forwards the raw Request object to auth.handler", async () => {
    const auth = mockAuthWithHandler(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const app = createAuthApp(auth);

    await app.request("/api/auth/get-session", {
      headers: { Cookie: "better-auth.session_token=test-tok" },
    });

    expect(auth.handler).toHaveBeenCalledOnce();
    const forwardedReq = auth.handler.mock.calls[0][0];
    expect(forwardedReq).toBeInstanceOf(Request);
    expect(forwardedReq.headers.get("Cookie")).toBe("better-auth.session_token=test-tok");
  });
});
