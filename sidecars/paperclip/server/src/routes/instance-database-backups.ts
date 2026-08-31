import { Router } from "express";
import type { BackupRetentionPolicy, RunDatabaseBackupResult } from "@paperclipai/db";
import { assertInstanceAdmin } from "./authz.js";
import { hostedModeGuard } from "../middleware/hosted-mode-guard.js";

export type InstanceDatabaseBackupTrigger = "manual" | "scheduled";

export type InstanceDatabaseBackupRunResult = RunDatabaseBackupResult & {
  trigger: InstanceDatabaseBackupTrigger;
  backupDir: string;
  retention: BackupRetentionPolicy;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
};

export type InstanceDatabaseBackupService = {
  runManualBackup(): Promise<InstanceDatabaseBackupRunResult>;
};

export function instanceDatabaseBackupRoutes(service: InstanceDatabaseBackupService) {
  const router = Router();

  router.post(
    "/instance/database-backups",
    hostedModeGuard({ operation: "Manual database backup" }),
    async (req, res) => {
      assertInstanceAdmin(req);
      const result = await service.runManualBackup();
      res.status(201).json(result);
    },
  );

  return router;
}
