import type { DorRow, TechnicalStub, TicketIntent } from "@/lib/types";

/** Default Definition of Ready — replace by harvesting a golden Christie's ticket. */
export const DEFAULT_DEFINITION_OF_READY: DorRow[] = [
  {
    criterion: "Business outcome and user value are clear",
    status: "Yes",
    notes: "",
  },
  {
    criterion: "Acceptance criteria written in Gherkin and reviewable by QA",
    status: "Yes",
    notes: "",
  },
  {
    criterion: "In scope / out of scope called out",
    status: "Yes",
    notes: "",
  },
  {
    criterion: "Dependencies and upstream/downstream systems identified",
    status: "Partial",
    notes: "Confirm with tech lead if unknown",
  },
  {
    criterion: "Design / UX assets linked (or N/A)",
    status: "N/A",
    notes: "",
  },
  {
    criterion: "Analytics / tracking requirements stated (or N/A)",
    status: "N/A",
    notes: "",
  },
  {
    criterion: "Edge cases and error states considered",
    status: "Yes",
    notes: "",
  },
  {
    criterion: "Ready for engineering estimate / refinement",
    status: "Yes",
    notes: "",
  },
];

export const EMPTY_TECHNICAL_STUB: TechnicalStub = {
  approach: "[To be completed by developer]",
  servicesApis: "[To be completed by developer]",
  dataModel: "[To be completed by developer]",
  featureFlags: "[To be completed by developer]",
  rolloutMonitoring: "[To be completed by developer]",
  openQuestions: "[To be completed by developer]",
};

export const INTENT_META: Record<
  TicketIntent,
  {
    label: string;
    summaryPrefix?: string;
    defaultLabels: string[];
    requireGherkin: boolean;
  }
> = {
  "feature-story": {
    label: "Feature story",
    defaultLabels: ["ba", "feature"],
    requireGherkin: true,
  },
  bug: {
    label: "Bug",
    summaryPrefix: "[Bug]",
    defaultLabels: ["ba", "bug"],
    requireGherkin: true,
  },
  "tech-enabler": {
    label: "Tech enabler",
    summaryPrefix: "[Enabler]",
    defaultLabels: ["ba", "enabler"],
    requireGherkin: false,
  },
  "content-copy": {
    label: "Content / copy",
    summaryPrefix: "[Content]",
    defaultLabels: ["ba", "content"],
    requireGherkin: true,
  },
  "analytics-tracking": {
    label: "Analytics / tracking",
    summaryPrefix: "[Analytics]",
    defaultLabels: ["ba", "analytics"],
    requireGherkin: true,
  },
  integration: {
    label: "Integration",
    summaryPrefix: "[Integration]",
    defaultLabels: ["ba", "integration"],
    requireGherkin: true,
  },
  spike: {
    label: "Spike",
    summaryPrefix: "[Spike]",
    defaultLabels: ["ba", "spike"],
    requireGherkin: false,
  },
  "qa-companion": {
    label: "QA companion",
    summaryPrefix: "[QA]",
    defaultLabels: ["ba", "qa"],
    requireGherkin: true,
  },
};
