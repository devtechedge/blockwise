/** RFC 4180 CSV with the conventions Notion exports use (UTF-8 BOM, CRLF optional). */
export function parseCsv(src: string): string[][] {
  const s = src.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let i = 0;
  let quoted = false;
  while (i < s.length) {
    const c = s[i]!;
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"' && field === "") { quoted = true; i++; continue; }
    if (c === ",") { row.push(field); field = ""; i++; continue; }
    if (c === "\r" && s[i + 1] === "\n") { i++; continue; }
    if (c === "\n" || c === "\r") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    field += c; i++;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function cell(v: string): string {
  return /[",\r\n]/.test(v) || /^\s|\s$/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function writeCsv(rows: string[][], opts: { bom?: boolean; eol?: string } = {}): string {
  const eol = opts.eol ?? "\n";
  return (opts.bom === false ? "" : "\uFEFF") + rows.map((r) => r.map(cell).join(",")).join(eol) + eol;
}
