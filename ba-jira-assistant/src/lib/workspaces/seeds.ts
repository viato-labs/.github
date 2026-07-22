import { DEFAULT_DEFINITION_OF_READY } from "@/lib/templates/defaults";
import type {
  CompanyWorkspace,
  ContextMemory,
  JiraConnectionPublic,
  Playbook,
  WorkflowSettings,
} from "@/lib/types";

const SHARED_PLAYBOOKS: Playbook[] = [
  {
    id: "single-brief",
    name: "Single brief",
    description: "One chat brief → one ticket using company house style.",
    defaultIntent: "feature-story",
    rowTitleFields: ["summary", "title"],
    rowBodyFields: ["description", "notes", "details"],
  },
  {
    id: "bulk-rows",
    name: "Bulk rows",
    description: "Each spreadsheet row becomes one ticket.",
    defaultIntent: "feature-story",
    rowTitleFields: ["summary", "title", "name", "item"],
    rowBodyFields: ["description", "notes", "details", "acceptance", "ac"],
  },
];

/** Known company Jira homes (from BA-provided browse URLs). */
export const KNOWN_JIRA_HOMES: Record<string, string> = {
  christies: "https://christiestech.atlassian.net",
  mclaren: "https://jira.task.mclaren.com",
};

function connectionStub(baseUrl = ""): JiraConnectionPublic {
  return {
    baseUrl,
    email: "",
    tokenConfigured: false,
    oauthConnected: false,
    dryRun: true,
  };
}

function workflowSettings(
  overrides: Partial<WorkflowSettings> = {},
): WorkflowSettings {
  return {
    commonStatuses: ["To Do", "In Progress", "In Review", "Done"],
    enablePostCreateTransition: false,
    ...overrides,
  };
}

function baseMemory(defaults: Partial<ContextMemory> = {}): ContextMemory {
  return {
    updatedAt: new Date().toISOString(),
    productGlossary: {},
    epicMap: {},
    defaultProjectKey: "PROJ",
    defaultIssueType: "Story",
    defaultLabels: ["ba-assisted"],
    definitionOfReady: DEFAULT_DEFINITION_OF_READY,
    houseStyleNotes: [
      "Product Overview → Description → Technical stub → Gherkin QA → Definition of Ready.",
      "Technical Information is left for developers.",
      "Reuse this company's historical tickets and DoR — never borrow another company's style.",
    ],
    sections: [],
    historicalTickets: [],
    confluencePages: [],
    researchQueries: [],
    briefs: [],
    createdTickets: [],
    ...defaults,
  };
}

export function seedChristies(): CompanyWorkspace {
  const now = new Date().toISOString();
  return {
    id: "company_christies",
    name: "Christie's",
    slug: "christies",
    createdAt: now,
    updatedAt: now,
    boards: [
      {
        id: "board_engs",
        name: "Engineering",
        projectKey: "ENGS",
        defaultIssueType: "Story",
        notes: "Primary engineering board (e.g. ENGS-19826)",
      },
      {
        id: "board_field",
        name: "Field / Engagement Ops",
        projectKey: "FIELD",
        defaultIssueType: "Task",
        notes: "Field trip / engagement operational tickets",
      },
    ],
    playbooks: [
      ...SHARED_PLAYBOOKS,
      {
        id: "field-trip-by-engagement",
        name: "Engagement → SCO tickets (BAU)",
        description:
          "Filtered engagement Excel/CSV → one SCO ticket per row, mapped to the BAU epic.",
        defaultIntent: "field-ops",
        rowTitleFields: [
          "engagement",
          "engagement name",
          "client",
          "title",
          "summary",
          "sco",
        ],
        rowBodyFields: [
          "location",
          "date",
          "owner",
          "notes",
          "description",
          "contact",
          "region",
          "sco type",
          "priority",
        ],
      },
    ],
    workflow: workflowSettings({
      defaultPostCreateStatus: "In Analysis",
      commonStatuses: [
        "In Analysis",
        "To Do",
        "Ready for Dev",
        "In Progress",
        "In Review",
        "Done",
      ],
      enablePostCreateTransition: true,
    }),
    connection: connectionStub(KNOWN_JIRA_HOMES.christies),
    memory: baseMemory({
      defaultProjectKey: "ENGS",
      defaultLabels: ["ba-assisted", "christies"],
      productGlossary: {
        lot: "An auction item available for bidding or purchase",
        "my lots": "Signed-in collector area for saved / followed lots",
        consignor: "Party consigning property for sale",
        engagement: "Client/field engagement used for planning visits and actions",
        sco: "Special Client / field engagement operational ticket type used in BAU",
        bau: "Business-as-usual epic for recurring engagement / field work",
      },
      epicMap: {
        Discovery: "EPIC-100",
        Checkout: "EPIC-200",
        "My Account": "EPIC-300",
        "Field Ops": "EPIC-400",
        BAU: "EPIC-BAU",
        SCO: "EPIC-BAU",
      },
      sections: ["Search", "Lot page", "My Lots", "Checkout", "Account"],
      historicalTickets: [
        {
          key: "ENGS-19826",
          summary: "Christie's engineering reference ticket",
          intent: "feature-story",
          section: "Engineering",
          notes:
            "Style/format reference from https://christiestech.atlassian.net/browse/ENGS-19826",
          source: "seed",
          capturedAt: now,
        },
      ],
    }),
  };
}

export function seedMclaren(): CompanyWorkspace {
  const now = new Date().toISOString();
  return {
    id: "company_mclaren",
    name: "McLaren",
    slug: "mclaren",
    createdAt: now,
    updatedAt: now,
    boards: [
      {
        id: "board_dvc",
        name: "DVC",
        projectKey: "DVC",
        defaultIssueType: "Story",
        notes: "Primary delivery board (e.g. DVC-1128)",
      },
      {
        id: "board_config",
        name: "Configurator",
        projectKey: "CFG",
        defaultIssueType: "Story",
        notes: "Vehicle configurator design + build",
      },
    ],
    playbooks: [
      ...SHARED_PLAYBOOKS,
      {
        id: "configurator-design-sections",
        name: "Configurator design sections",
        description:
          "Create design tickets per configurator section from company knowledge + optional spreadsheet.",
        defaultIntent: "design",
        rowTitleFields: ["section", "title", "summary", "component"],
        rowBodyFields: ["notes", "description", "acceptance", "figma", "priority"],
      },
    ],
    workflow: workflowSettings({
      defaultPostCreateStatus: "To Do",
      commonStatuses: ["To Do", "Design", "In Progress", "In Review", "Done"],
      enablePostCreateTransition: false,
    }),
    connection: connectionStub(KNOWN_JIRA_HOMES.mclaren),
    memory: baseMemory({
      defaultProjectKey: "DVC",
      defaultIssueType: "Story",
      defaultLabels: ["ba-assisted", "mclaren"],
      productGlossary: {
        configurator: "Client vehicle configuration experience",
        exterior: "Exterior design and finish choices",
        interior: "Cabin materials, colours, and options",
        pack: "Optional equipment pack grouping related features",
      },
      epicMap: {
        Configurator: "CFG-1",
        Exterior: "CFG-10",
        Interior: "CFG-20",
        Performance: "CFG-30",
      },
      sections: [
        "Exterior",
        "Wheels",
        "Interior",
        "Performance",
        "Packs",
        "Summary / Review",
      ],
      houseStyleNotes: [
        "Design tickets describe visual/interaction intent, not implementation.",
        "Reference existing configurator section patterns and prior design tickets.",
        "Keep McLaren vocabulary; never mix Christie's auction language.",
        "McLaren Jira is on jira.task.mclaren.com (session / Chrome agent preferred).",
      ],
      historicalTickets: [
        {
          key: "DVC-1128",
          summary: "McLaren delivery reference ticket",
          intent: "feature-story",
          section: "DVC",
          notes:
            "Style/format reference from https://jira.task.mclaren.com/browse/DVC-1128",
          source: "seed",
          capturedAt: now,
        },
      ],
    }),
  };
}

export function seedBlankCompany(name: string, slug: string): CompanyWorkspace {
  const now = new Date().toISOString();
  return {
    id: `company_${slug}`,
    name,
    slug,
    createdAt: now,
    updatedAt: now,
    boards: [
      {
        id: `board_${slug}_main`,
        name: "Main",
        projectKey: "PROJ",
        defaultIssueType: "Story",
      },
    ],
    playbooks: SHARED_PLAYBOOKS,
    workflow: workflowSettings(),
    connection: connectionStub(),
    memory: baseMemory({
      defaultLabels: ["ba-assisted", slug],
    }),
  };
}

export const DEFAULT_SEEDS = [seedChristies(), seedMclaren()];
