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

/** Normaliza um texto para comparação: minúsculas e sem acentos. */
export function norm(s: string): string {
  return (s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isoData(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function dataValida(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** Aceita datas nos formatos comuns salvos por Excel/planilhas e converte para ISO (yyyy-mm-dd). */
export function parseDate(s: string): string | null {
  const t = (s ?? "").trim();
  if (!t) return null;

  let m = t.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return dataValida(y, mo, d) ? isoData(y, mo, d) : null;
  }

  m = t.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    let d: number, mo: number;
    if (a > 12 && b <= 12) {
      d = a;
      mo = b;
    } else if (b > 12 && a <= 12) {
      d = b;
      mo = a;
    } else {
      d = a;
      mo = b;
    }
    return dataValida(y, mo, d) ? isoData(y, mo, d) : null;
  }

  return null;
}

/** Decodifica bytes do arquivo tratando CSV salvos em ANSI/Windows-1252 (padrão do Excel BR). */
export function decodeFileText(buffer: ArrayBuffer): string {
  let content: string;
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    content = new TextDecoder("windows-1252").decode(buffer);
  }
  return content;
}
