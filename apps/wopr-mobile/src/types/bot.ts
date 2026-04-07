export interface BotInstance {
  id: string;
  name: string;
  status: "running" | "stopped" | "starting" | "error";
  tenantId: string;
  lastMessage?: string;
  updatedAt: string;
}
