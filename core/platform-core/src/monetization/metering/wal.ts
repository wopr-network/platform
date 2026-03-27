import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { MeterEvent } from "@wopr-network/platform-core/metering";

/**
 * Write-Ahead Log for meter events.
 *
 * Provides durable, fail-closed event persistence. Events are written
 * to disk BEFORE being buffered, ensuring no event is lost even if
 * the process crashes before flush completes.
 */
export class MeterWAL {
  private readonly walPath: string;
  private lock: Promise<void> = Promise.resolve();

  private async withLock<T>(fn: () => T | Promise<T>): Promise<T> {
    const prev = this.lock;
    let resolve!: () => void;
    this.lock = new Promise<void>((r) => {
      resolve = r;
    });
    try {
      await prev;
      return await fn();
    } finally {
      resolve();
    }
  }

  constructor(walPath: string) {
    this.walPath = walPath;
    this.ensureDir();
  }

  private ensureDir(): void {
    const dir = dirname(this.walPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Append an event to the WAL. appendFileSync is atomic on POSIX (O_APPEND),
   * so no mutex is needed here. Returns the event with a generated ID.
   */
  append(event: MeterEvent & { id?: string }): MeterEvent & { id: string } {
    const eventWithId = {
      ...event,
      id: event.id ?? crypto.randomUUID(),
    };

    const line = `${JSON.stringify(eventWithId)}\n`;
    appendFileSync(this.walPath, line, { encoding: "utf8", flag: "a" });

    return eventWithId;
  }

  /**
   * Read all events from the WAL. Returns events in the order they were written.
   * Skips malformed lines (defensive against incomplete writes).
   */
  readAll(): Array<MeterEvent & { id: string }> {
    if (!existsSync(this.walPath)) {
      return [];
    }

    const content = readFileSync(this.walPath, "utf8");
    if (!content.trim()) {
      return [];
    }

    const events: Array<MeterEvent & { id: string }> = [];
    for (const line of content.trim().split("\n")) {
      try {
        events.push(JSON.parse(line) as MeterEvent & { id: string });
      } catch {
        // Skip malformed lines (e.g., from incomplete writes).
      }
    }
    return events;
  }

  /**
   * Remove specific event IDs from the WAL. This is done by rewriting
   * the entire file without the specified events. Mutex-guarded.
   */
  async remove(eventIds: Set<string>): Promise<void> {
    return this.withLock(() => {
      if (!existsSync(this.walPath) || eventIds.size === 0) {
        return;
      }

      const events = this.readAll();
      const filtered = events.filter((e) => !eventIds.has(e.id));

      if (filtered.length === 0) {
        this._clear();
      } else {
        const content = `${filtered.map((e) => JSON.stringify(e)).join("\n")}\n`;
        const tmpPath = join(dirname(this.walPath), `.wal-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`);
        writeFileSync(tmpPath, content, { encoding: "utf8" });
        renameSync(tmpPath, this.walPath);
      }
    });
  }

  private _clear(): void {
    try {
      unlinkSync(this.walPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }

  /**
   * Clear the entire WAL (typically after successful flush). Mutex-guarded.
   */
  async clear(): Promise<void> {
    return this.withLock(() => {
      this._clear();
    });
  }

  /**
   * Check if the WAL is empty.
   */
  isEmpty(): boolean {
    if (!existsSync(this.walPath)) {
      return true;
    }
    const content = readFileSync(this.walPath, "utf8");
    return !content.trim();
  }

  /**
   * Get the number of events in the WAL.
   */
  count(): number {
    return this.readAll().length;
  }
}
