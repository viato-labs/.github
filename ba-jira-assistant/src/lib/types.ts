export type TicketIntent =
  | "feature-story"
  | "bug"
  | "tech-enabler"
  | "content-copy"
  | "analytics-tracking"
  | "integration"
  | "spike"
  | "qa-companion"
  | "design"
  | "field-ops";

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
  companyId: string;
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
  confidence: number;
  playbookId?: string;
  sourceRow?: Record<string, string>;
};

export type HistoricalTicketRef = {
  key: string;
  summary: string;
  intent?: TicketIntent;
  section?: string;
  notes?: string;
  capturedAt: string;
};

export type PlaybookId =
  | "single-brief"
  | "bulk-rows"
  | "field-trip-by-engagement"
  | "configurator-design-sections";

export type Playbook = {
  id: PlaybookId;
  name: string;
  description: string;
  defaultIntent: TicketIntent;
  rowTitleFields: string[];
  rowBodyFields: string[];
};

export type BoardTarget = {
  id: string;
  name: string;
  projectKey: string;
  defaultIssueType: string;
  notes?: string;
};

export type JiraConnectionPublic = {
  baseUrl: string;
  email: string;
  tokenConfigured: boolean;
  dryRun: boolean;
};

export type JiraConnectionSecrets = {
  baseUrl: string;
  email: string;
  apiToken: string;
  dryRun: boolean;
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
  sections: string[];
  historicalTickets: HistoricalTicketRef[];
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
    playbookId?: string;
  }>;
};

export type CompanyWorkspace = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
  boards: BoardTarget[];
  playbooks: Playbook[];
  connection: JiraConnectionPublic;
  memory: ContextMemory;
};

export type CompanySummary = {
  id: string;
  name: string;
  slug: string;
  boards: BoardTarget[];
  playbooks: Playbook[];
  connection: JiraConnectionPublic;
  memoryStats: {
    briefs: number;
    createdTickets: number;
    historicalTickets: number;
    epics: number;
    glossaryTerms: number;
    sections: number;
  };
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
  companyId: string;
};

export type BulkDraftResult = {
  companyId: string;
  playbookId: PlaybookId;
  drafts: TicketDraft[];
  skippedRows: Array<{ rowNumber: number; reason: string }>;
};
