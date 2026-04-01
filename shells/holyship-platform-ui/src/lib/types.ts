export interface RepoConfig {
  repo: string;
  defaultBranch: string;
  description: string;
  languages: string[];
  monorepo: boolean;
  ci: {
    supported: boolean;
    provider?: string;
    gateCommand?: string;
    hasMergeQueue?: boolean;
    requiredChecks?: string[];
  };
  testing: {
    supported: boolean;
    framework?: string;
    runCommand?: string;
    hasCoverage?: boolean;
    coverageThreshold?: number;
  };
  linting: { supported: boolean; tool?: string; runCommand?: string };
  formatting: { supported: boolean; tool?: string; runCommand?: string };
  typeChecking: { supported: boolean; tool?: string; runCommand?: string };
  build: { supported: boolean; runCommand?: string; dockerfile?: boolean };
  reviewBots: { supported: boolean; bots?: string[] };
  docs: { supported: boolean; location?: string | null; hasApiDocs?: boolean };
  specManagement: {
    tracker: string;
    specLocation?: string;
    hasTemplates?: boolean;
  };
  security: {
    hasEnvExample?: boolean;
    hasSecurityPolicy?: boolean;
    hasSecretScanning?: boolean;
    hasDependencyUpdates?: boolean;
  };
  intelligence: {
    hasClaudeMd: boolean;
    hasAgentsMd: boolean;
    conventions: string[];
    ciGateCommand?: string | null;
  };
}

export interface Gap {
  id: string;
  capability: string;
  title: string;
  priority: "critical" | "high" | "medium" | "low";
  description: string;
  status: string;
  issueUrl: string | null;
}

export interface CreatedIssue {
  gapId: string;
  issueNumber: number;
  issueUrl: string;
  entityId?: string;
}

export type AuditCategory = "code_quality" | "security" | "test_coverage" | "ecosystem" | "tech_debt";

export interface ProposedIssue {
  category: AuditCategory;
  title: string;
  priority: "critical" | "high" | "medium" | "low";
  file: string;
  line?: number;
  description: string;
}

export interface AuditResult {
  repoConfigId: string;
  issues: ProposedIssue[];
  categories: AuditCategory[];
}

export interface DesignedFlowState {
  name: string;
  agentRole?: string;
  modelTier?: string;
  mode?: string;
}

export interface DesignedFlowGateOutcome {
  proceed?: boolean;
  toState?: string;
}

export interface DesignedFlowGate {
  name: string;
  type: string;
  primitiveOp?: string;
  primitiveParams?: Record<string, unknown>;
  timeoutMs?: number;
  outcomes?: Record<string, DesignedFlowGateOutcome>;
}

export interface DesignedFlowTransition {
  fromState: string;
  toState: string;
  trigger: string;
}

export interface DesignedFlow {
  flow: { name: string; description: string; initialState: string };
  states: DesignedFlowState[];
  gates: DesignedFlowGate[];
  transitions: DesignedFlowTransition[];
  gateWiring: Record<string, { fromState: string; trigger: string }>;
  notes: string;
}

export interface FlowResponse {
  yaml: string;
  flow: DesignedFlow;
  sha: string;
}

export interface FlowEditResponse {
  updatedYaml: string;
  updatedFlow: DesignedFlow;
  explanation: string;
  diff: string[];
}

export interface FlowApplyResponse {
  prUrl: string;
  prNumber: number;
  branch: string;
}

export interface FlowChatMessage {
  role: "user" | "ai";
  text: string;
  changes?: string[];
}

export interface RepoSummary {
  id: number;
  full_name: string;
  name: string;
  analyzed?: boolean;
  config?: RepoConfig | null;
  inFlight?: number;
  shippedToday?: number;
  openGaps?: number;
}
