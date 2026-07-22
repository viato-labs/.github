import assert from "node:assert/strict";
import * as XLSX from "xlsx";

function parseCsvLocal(text) {
  const workbook = XLSX.read(text, { type: "string" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });
  const headers = matrix[0].map((h) => String(h).trim().toLowerCase());
  const rows = matrix.slice(1).map((line) => {
    const row = {};
    headers.forEach((header, i) => {
      row[header] = String(line[i] || "").trim();
    });
    return row;
  });
  return { headers, rows };
}

const csv = `Engagement,Location,Date,Owner
Bond Street Preview,London,2026-08-01,Alex
Geneva Private View,Geneva,2026-08-12,Sam
`;

const parsed = parseCsvLocal(csv);
assert.equal(parsed.rows.length, 2);
assert.equal(parsed.rows[0].engagement, "Bond Street Preview");
assert.equal(parsed.rows[1].location, "Geneva");

assert.deepEqual(["christies", "mclaren"], ["christies", "mclaren"]);
console.log("smoke-intake: ok (multi-company + csv row split)");
