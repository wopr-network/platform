import type { AuditEntry } from "../../admin/audit-log.js";

/** Minimal interface for admin audit logging in route factories. */
export interface AdminAuditLogger {
  log(entry: AuditEntry): undefined | Promise<unknown>;
}

/** Safely log an admin audit entry — never throws. */
export function safeAuditLog(logger: (() => AdminAuditLogger) | undefined, entry: AuditEntry): void {
  if (!logger) return;
  try {
    void Promise.resolve(logger().log(entry)).catch(() => {
      /* audit must not break request */
    });
  } catch {
    /* audit must not break request */
  }
}
