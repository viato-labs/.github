/** Pull plain text from Atlassian Document Format or unknown description shapes. */

export function adfToPlainText(node: unknown, maxLen = 500): string {
  if (!node) return "";
  if (typeof node === "string") return node.slice(0, maxLen);

  const parts: string[] = [];

  function walk(value: unknown) {
    if (!value || parts.join(" ").length >= maxLen) return;
    if (typeof value === "string") {
      parts.push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (typeof value === "object") {
      const obj = value as { text?: string; content?: unknown };
      if (obj.text) parts.push(obj.text);
      if (obj.content) walk(obj.content);
    }
  }

  walk(node);
  return parts.join(" ").replace(/\s+/g, " ").trim().slice(0, maxLen);
}
