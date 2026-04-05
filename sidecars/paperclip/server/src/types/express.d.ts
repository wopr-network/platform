import "express";

interface Actor {
  type: "board" | "agent" | "none";
  userId?: string;
  agentId?: string;
  companyId?: string;
  companyIds?: string[];
  isInstanceAdmin?: boolean;
  keyId?: string;
  runId?: string;
  source?: "local_implicit" | "session" | "board_key" | "agent_key" | "agent_jwt" | "none";
}

declare module "express-serve-static-core" {
  interface Request {
    actor: Actor;
  }
}

declare global {
  namespace Express {
    interface Request {
      actor: Actor;
    }
  }
}
