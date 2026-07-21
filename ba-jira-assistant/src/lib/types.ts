export type TicketIntent =
  | "feature-story"
  | "bug"
  | "tech-enabler"
  | "content-copy"
  | "analytics-tracking"
  | "integration"
  | "spike"
  | "qa-companion";

export type DorRow = {
  criterion: string;
  status: "Yes" | "No" | "Partial" | "N/A";
  notes: string;
};

export type GherkinScenario = {
  title: string;
  given: string[];
  when: string[];
  then: string[];
};

export type TechnicalStub = {
  approach: string;
  servicesApis: string;
  dataModel: string;
  featureFlags: string;
  rolloutMonitoring: string;
  openQuestions: string;
};

export type TicketDraft = {
  intent: TicketIntent;
  summary: string;
  projectKey: string;
  issueType: string;
  epicKey?: string;
  epicName?: string;
  labels: string[];
  priority?: string;
  productOverview: string;
  description: string;
  technical: TechnicalStub;
  gherkin: GherkinScenario[];
  definitionOfReady: DorRow[];
  attachments: string[];
  sourceNotes: string;
  missingFields: string[];
};

export type ContextMemory = {
  updatedAt: string;
  productGlossary: Record<string, string>;
  epicMap: Record<string, string>;
  defaultProjectKey: string;
  defaultIssueType: string;
  defaultLabels: string[];
  definitionOfReady: DorRow[];
  houseStyleNotes: string[];
  briefs: Array<{
    id: string;
    createdAt: string;
    text: string;
    files: string[];
  }>;
  createdTickets: Array<{
    key: string;
    summary: string;
    createdAt: string;
    dryRun: boolean;
  }>;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
};

export type CreateTicketResult = {
  dryRun: boolean;
  key?: string;
  id?: string;
  self?: string;
  previewMarkdown: string;
  payload: unknown;
  warnings: string[];
};
