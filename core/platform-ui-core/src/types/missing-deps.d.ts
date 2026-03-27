/**
 * Stub type declarations for packages whose type files cannot be resolved
 * by moduleResolution:"bundler" due to missing `types` conditions in their
 * package.json `exports` maps, or for Node.js built-in modules.
 *
 * Remove individual stubs when the upstream package fixes its exports map.
 */

// ---------------------------------------------------------------------------
// NodeJS.Process augmentation – @types/node in this install omits env/Process.
// Ensures process.env is typed throughout the codebase.
// ---------------------------------------------------------------------------
declare namespace NodeJS {
  interface Process {
    env: ProcessEnv;
  }
  interface ProcessEnv {
    readonly NODE_ENV?: "development" | "production" | "test";
    [key: string]: string | undefined;
  }
}

// ---------------------------------------------------------------------------
// node:path – @types/node path.d.ts is empty in this install.
// Explicitly declares the named exports used by this codebase.
// ---------------------------------------------------------------------------
declare module "node:path" {
  export function resolve(...paths: string[]): string;
  export function join(...paths: string[]): string;
  export function dirname(path: string): string;
  export function basename(path: string, ext?: string): string;
  export function extname(path: string): string;
  export function normalize(path: string): string;
  export function isAbsolute(path: string): boolean;
  export function relative(from: string, to: string): string;
  export const sep: string;
  export const delimiter: string;
}

// ---------------------------------------------------------------------------
// node:fs – @types/node fs.d.ts declarations for sync file reading used in tests.
// ---------------------------------------------------------------------------
declare module "node:fs" {
  export function readFileSync(path: string, encoding: BufferEncoding): string;
  export function readFileSync(
    path: string,
    options: { encoding: BufferEncoding; flag?: string },
  ): string;
  export function readFileSync(path: string): Buffer;
  export function existsSync(path: string): boolean;
  export function writeFileSync(
    path: string,
    data: string | Buffer,
    options?: { encoding?: BufferEncoding; flag?: string },
  ): void;
}

// ---------------------------------------------------------------------------
// node:fs/promises – async file operations
// ---------------------------------------------------------------------------
declare module "node:fs/promises" {
  export function readFile(path: string, encoding: BufferEncoding): Promise<string>;
  export function writeFile(path: string, data: string | Buffer): Promise<void>;
  export function access(path: string, mode?: number): Promise<void>;
}

// ---------------------------------------------------------------------------
// node:url – URL utilities
// ---------------------------------------------------------------------------
declare module "node:url" {
  export function fileURLToPath(url: string | URL): string;
  export function pathToFileURL(path: string): URL;
  export class URL {
    constructor(input: string, base?: string | URL);
    href: string;
    origin: string;
    protocol: string;
    host: string;
    hostname: string;
    port: string;
    pathname: string;
    search: string;
    hash: string;
  }
}

// ---------------------------------------------------------------------------
// node:os – OS utilities
// ---------------------------------------------------------------------------
declare module "node:os" {
  export function tmpdir(): string;
  export function homedir(): string;
  export function platform(): string;
  export function arch(): string;
}

// ---------------------------------------------------------------------------
// react-markdown – markdown renderer for React
// The package ships index.d.ts but does not expose it via its exports map,
// so moduleResolution:bundler cannot find it. Stub the default export here.
// ---------------------------------------------------------------------------
declare module "react-markdown" {
  import type { ReactNode, ComponentType } from "react";
  interface ReactMarkdownProps {
    children?: string;
    remarkPlugins?: unknown[];
    rehypePlugins?: unknown[];
    components?: Record<string, ComponentType<Record<string, unknown>>>;
  }
  export default function ReactMarkdown(props: ReactMarkdownProps): ReactNode;
}

// ---------------------------------------------------------------------------
// remark-gfm – GitHub-Flavored Markdown plugin for remark/react-markdown
// Same exports-map issue as react-markdown above.
// ---------------------------------------------------------------------------
declare module "remark-gfm" {
  const remarkGfm: (...args: unknown[]) => unknown;
  export default remarkGfm;
}

// ---------------------------------------------------------------------------
// rehype-sanitize – HTML sanitization plugin for rehype/react-markdown
// Same exports-map issue as react-markdown above.
// ---------------------------------------------------------------------------
declare module "rehype-sanitize" {
  interface SanitizeSchema {
    tagNames?: string[];
    attributes?: Record<string, string[]>;
    protocols?: Record<string, string[]>;
    [key: string]: unknown;
  }
  export const defaultSchema: SanitizeSchema;
  const rehypeSanitize: (...args: unknown[]) => unknown;
  export default rehypeSanitize;
}

// ---------------------------------------------------------------------------
// node:child_process – child process utilities
// ---------------------------------------------------------------------------
declare module "node:child_process" {
  export interface SpawnOptions {
    cwd?: string;
    env?: Record<string, string>;
    stdio?: "pipe" | "inherit" | "ignore";
  }
  export interface ChildProcess {
    pid?: number;
    stdout: unknown;
    stderr: unknown;
    stdin: unknown;
    on(event: string, listener: (...args: unknown[]) => void): this;
    kill(signal?: string): boolean;
  }
  export function spawn(command: string, args?: string[], options?: SpawnOptions): ChildProcess;
  export function execSync(
    command: string,
    options?: { encoding?: BufferEncoding; cwd?: string },
  ): string | Buffer;
}
