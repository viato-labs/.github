/** Minimal Atlassian Document Format helpers for Jira Cloud descriptions. */

export type AdfNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: AdfNode[];
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
};

export type AdfDoc = {
  type: "doc";
  version: 1;
  content: AdfNode[];
};

export function doc(...content: AdfNode[]): AdfDoc {
  return { type: "doc", version: 1, content };
}

export function heading(level: number, text: string): AdfNode {
  return {
    type: "heading",
    attrs: { level },
    content: [{ type: "text", text }],
  };
}

export function paragraph(...textNodes: AdfNode[]): AdfNode {
  return {
    type: "paragraph",
    content: textNodes.length ? textNodes : [{ type: "text", text: " " }],
  };
}

export function text(value: string, marks?: AdfNode["marks"]): AdfNode {
  return marks?.length ? { type: "text", text: value, marks } : { type: "text", text: value };
}

export function bulletList(items: string[]): AdfNode {
  return {
    type: "bulletList",
    content: items.map((item) => ({
      type: "listItem",
      content: [paragraph(text(item))],
    })),
  };
}

export function codeBlock(code: string, language = "gherkin"): AdfNode {
  return {
    type: "codeBlock",
    attrs: { language },
    content: [{ type: "text", text: code }],
  };
}

export function table(headers: string[], rows: string[][]): AdfNode {
  const headerRow: AdfNode = {
    type: "tableRow",
    content: headers.map((h) => ({
      type: "tableHeader",
      attrs: {},
      content: [paragraph(text(h))],
    })),
  };

  const bodyRows: AdfNode[] = rows.map((row) => ({
    type: "tableRow",
    content: row.map((cell) => ({
      type: "tableCell",
      attrs: {},
      content: [paragraph(text(cell || " "))],
    })),
  }));

  return {
    type: "table",
    attrs: {
      isNumberColumnEnabled: false,
      layout: "default",
    },
    content: [headerRow, ...bodyRows],
  };
}

export function rule(): AdfNode {
  return { type: "rule" };
}
