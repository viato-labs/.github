import { DEFAULT_DEFINITION_OF_READY } from "@/lib/templates/defaults";
import type {
  CompanyWorkspace,
  ContextMemory,
  JiraConnectionPublic,
  Playbook,
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

function connectionStub(): JiraConnectionPublic {
  return {
    baseUrl: "",
    email: "",
    tokenConfigured: false,
    oauthConnected: false,
    dryRun: true,
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
        id: "board_web",
        name: "Web Delivery",
        projectKey: "WEB",
        defaultIssueType: "Story",
        notes: "Primary digital delivery board",
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
    connection: connectionStub(),
    memory: baseMemory({
      defaultProjectKey: "FIELD",
      defaultLabels: ["ba-assisted", "christies", "sco"],
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
          key: "WEB-1001",
          summary: "Save lot from search results",
          intent: "feature-story",
          section: "Search",
          notes: "Golden style reference for feature stories",
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
        id: "board_config",
        name: "Configurator",
        projectKey: "CFG",
        defaultIssueType: "Story",
        notes: "Vehicle configurator design + build",
      },
      {
        id: "board_design",
        name: "Design System",
        projectKey: "DSN",
        defaultIssueType: "Task",
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
    connection: connectionStub(),
    memory: baseMemory({
      defaultProjectKey: "CFG",
      defaultIssueType: "Story",
      defaultLabels: ["ba-assisted", "mclaren", "configurator"],
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
      ],
      historicalTickets: [
        {
          key: "DSN-220",
          summary: "[Design] Exterior colour swatch interaction",
          intent: "design",
          section: "Exterior",
          notes: "Reference for design ticket depth and tone",
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
    connection: connectionStub(),
    memory: baseMemory({
      defaultLabels: ["ba-assisted", slug],
    }),
  };
}

export const DEFAULT_SEEDS = [seedChristies(), seedMclaren()];
