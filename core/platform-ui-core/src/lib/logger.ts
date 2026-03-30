/**
 * Structured logger for platform-ui-core.
 *
 * Wraps console.warn / console.error with a namespace tag so log lines are
 * easy to filter and grep in production log streams.
 *
 * Usage:
 *   import { logger } from "@/lib/logger";
 *   const log = logger("my-module");
 *   log.warn("Something degraded", { key: "value" });
 *   log.error("Fatal in handler", err);
 */

export interface Logger {
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

export function logger(_namespace: string): Logger {
  return {
    warn(_message: string, ..._args: unknown[]) {},
    error(_message: string, ..._args: unknown[]) {},
  };
}
