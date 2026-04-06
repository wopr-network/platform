import pino from "pino";

export interface Logger {
  error(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  info(msg: string, ...args: unknown[]): void;
  debug(msg: string, ...args: unknown[]): void;
}

export const consoleLogger: Logger = {
  // biome-ignore lint/suspicious/noConsole: intentional console delegation
  error: (msg, ...args) => console.error(msg, ...args),
  // biome-ignore lint/suspicious/noConsole: intentional console delegation
  warn: (msg, ...args) => console.warn(msg, ...args),
  // biome-ignore lint/suspicious/noConsole: intentional console delegation
  info: (msg, ...args) => console.info(msg, ...args),
  // biome-ignore lint/suspicious/noConsole: intentional console delegation
  debug: (msg, ...args) => console.debug(msg, ...args),
};

export const noopLogger: Logger = {
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
};

const _pino = pino({ level: process.env.LOG_LEVEL ?? "info" });

function toMeta(args: unknown[]): Record<string, unknown> | undefined {
  if (args.length === 0) return undefined;
  if (args.length === 1 && typeof args[0] === "object" && args[0] !== null) {
    return args[0] as Record<string, unknown>;
  }
  return { args };
}

/** Logger instance backed by pino, conforming to the Logger interface. */
export const logger: Logger = {
  error: (msg, ...args) => {
    const meta = toMeta(args);
    meta ? _pino.error(meta, msg) : _pino.error(msg);
  },
  warn: (msg, ...args) => {
    const meta = toMeta(args);
    meta ? _pino.warn(meta, msg) : _pino.warn(msg);
  },
  info: (msg, ...args) => {
    const meta = toMeta(args);
    meta ? _pino.info(meta, msg) : _pino.info(msg);
  },
  debug: (msg, ...args) => {
    const meta = toMeta(args);
    meta ? _pino.debug(meta, msg) : _pino.debug(msg);
  },
};
