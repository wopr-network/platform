import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

describe("Dockerfile", () => {
  const dockerfile = readFileSync(resolve(root, "Dockerfile"), "utf-8");

  it("exists and is non-empty", () => {
    expect(dockerfile.length).toBeGreaterThan(0);
  });

  it("uses node:20-alpine base image", () => {
    expect(dockerfile).toContain("FROM node:20-alpine");
  });

  it("uses multi-stage build with deps, build, and runtime stages", () => {
    expect(dockerfile).toMatch(/FROM .+ AS deps/);
    expect(dockerfile).toMatch(/FROM .+ AS build/);
    expect(dockerfile).toMatch(/FROM .+ AS runtime/);
  });

  it("installs dependencies with pnpm", () => {
    expect(dockerfile).toContain("pnpm install --frozen-lockfile");
  });

  it("builds with pnpm", () => {
    expect(dockerfile).toContain("pnpm build");
  });

  it("copies standalone output in runtime stage", () => {
    expect(dockerfile).toContain(".next/standalone");
    expect(dockerfile).toContain(".next/static");
    expect(dockerfile).toContain("public");
  });

  it("runs as non-root user", () => {
    expect(dockerfile).toContain("USER wopr");
  });

  it("exposes port 3000", () => {
    expect(dockerfile).toContain("EXPOSE 3000");
  });

  it("runs node server.js as entrypoint", () => {
    expect(dockerfile).toContain('CMD ["node", "server.js"]');
  });

  it("includes a healthcheck", () => {
    expect(dockerfile).toContain("HEALTHCHECK");
  });

  it("accepts NEXT_PUBLIC_API_URL as build arg", () => {
    expect(dockerfile).toContain("ARG NEXT_PUBLIC_API_URL");
  });
});

describe(".dockerignore", () => {
  const dockerignore = readFileSync(resolve(root, ".dockerignore"), "utf-8");

  it("exists and is non-empty", () => {
    expect(dockerignore.length).toBeGreaterThan(0);
  });

  it("excludes node_modules", () => {
    expect(dockerignore).toContain("node_modules");
  });

  it("excludes .next build output", () => {
    expect(dockerignore).toContain(".next");
  });

  it("excludes .git directory", () => {
    expect(dockerignore).toContain(".git");
  });

  it("excludes .env files", () => {
    expect(dockerignore).toContain(".env");
  });
});

describe("docker-compose.yml", () => {
  const compose = readFileSync(resolve(root, "docker-compose.yml"), "utf-8");

  it("exists and is non-empty", () => {
    expect(compose.length).toBeGreaterThan(0);
  });

  it("defines platform-ui service", () => {
    expect(compose).toContain("platform-ui:");
  });

  it("defines platform-api service", () => {
    expect(compose).toContain("platform-api:");
  });

  it("maps port 3000 for platform-ui", () => {
    expect(compose).toContain("3000:3000");
  });

  it("maps port 3001 for platform-api", () => {
    expect(compose).toContain("3001:3001");
  });

  it("uses a shared network", () => {
    expect(compose).toContain("networks:");
    expect(compose).toContain("wopr:");
  });
});
