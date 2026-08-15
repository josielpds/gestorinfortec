export type ImportColumn = { key: string; label: string; example: string };

export function parseDelimited(text: string): string[][] {
  const rows: string[][] = [];
  if (!text) return rows;
  const firstLine = text.split(/\r?\n/)[0] ?? "";
  const sep = firstLine.includes(";") ? ";" : firstLine.includes("\t") ? "\t" : ",";
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === sep) {
      row.push(cur);
      cur = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur);
      cur = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else {
      cur += ch;
    }
  }
  row.push(cur);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

export function downloadTemplate(filename: string, columns: ImportColumn[]) {
  const header = columns.map((c) => c.label).join(";");
  const sample = columns.map((c) => c.example).join(";");
  const csv = "\uFEFF" + header + "\n" + sample + "\n";
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function parseValor(s: string): number | null {
  const t = (s ?? "").trim().replace(/R\$\s?/i, "");
  if (!t || !/^[\d.,]+$/.test(t)) return null;
  const parts = t.split(".");
  const n = t.includes(",")
    ? parseFloat(t.replace(/\./g, "").replace(",", "."))
    : parts.length === 2 && parts[1].length <= 2
      ? parseFloat(t)
      : parseFloat(t.replace(/\./g, ""));
  return isNaN(n) ? null : n;
}
