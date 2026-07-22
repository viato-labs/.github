import * as XLSX from "xlsx";

export type TabularParseResult = {
  sheetName: string;
  headers: string[];
  rows: Array<Record<string, string>>;
};

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function cellToString(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

export function parseCsv(text: string): TabularParseResult {
  const workbook = XLSX.read(text, { type: "string" });
  return sheetToRows(workbook, workbook.SheetNames[0]);
}

export function parseSpreadsheetBuffer(
  buffer: ArrayBuffer | Buffer,
  filename?: string,
): TabularParseResult {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const preferred =
    workbook.SheetNames.find((name) =>
      /engagement|field|config|design|sheet1/i.test(name),
    ) || workbook.SheetNames[0];
  const result = sheetToRows(workbook, preferred);
  if (filename) {
    return { ...result, sheetName: `${preferred} (${filename})` };
  }
  return result;
}

function sheetToRows(
  workbook: XLSX.WorkBook,
  sheetName: string,
): TabularParseResult {
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<(string | number | Date | null)[]>(
    sheet,
    {
      header: 1,
      defval: "",
      raw: false,
    },
  );

  if (!matrix.length) {
    return { sheetName, headers: [], rows: [] };
  }

  const headers = (matrix[0] || []).map(normalizeHeader);
  const rows: Array<Record<string, string>> = [];

  for (let i = 1; i < matrix.length; i += 1) {
    const line = matrix[i] || [];
    const row: Record<string, string> = {};
    let hasValue = false;
    headers.forEach((header, index) => {
      if (!header) return;
      const value = cellToString(line[index]);
      row[header] = value;
      if (value) hasValue = true;
    });
    if (hasValue) rows.push(row);
  }

  return { sheetName, headers: headers.filter(Boolean), rows };
}

export function pickField(
  row: Record<string, string>,
  candidates: string[],
): string {
  for (const candidate of candidates) {
    const key = candidate.toLowerCase();
    if (row[key]) return row[key];
  }
  // fuzzy contains
  for (const candidate of candidates) {
    const found = Object.entries(row).find(([header, value]) =>
      Boolean(value) && header.includes(candidate.toLowerCase()),
    );
    if (found) return found[1];
  }
  return "";
}
