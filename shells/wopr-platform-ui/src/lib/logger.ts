type LogFn = (...args: unknown[]) => void;

interface Logger {
  debug: LogFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;
}

export function logger(namespace: string): Logger {
  const prefix = `[wopr-ui:${namespace}]`;
  return {
    // biome-ignore lint/suspicious/noConsole: logger wraps console intentionally
    debug: (...args) => console.info(prefix, ...args),
    // biome-ignore lint/suspicious/noConsole: logger wraps console intentionally
    info: (...args) => console.info(prefix, ...args),
    // biome-ignore lint/suspicious/noConsole: logger wraps console intentionally
    warn: (...args) => console.warn(prefix, ...args),
    // biome-ignore lint/suspicious/noConsole: logger wraps console intentionally
    error: (...args) => console.error(prefix, ...args),
  };
}
