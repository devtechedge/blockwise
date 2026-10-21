import type { BlockInput, RichText } from "@blockwise/core";
import { plain } from "@blockwise/core";
import { inlineToMd, mdToInline } from "./inline-md.js";

export interface MarkdownOptions {
  /** Indent used for nested blocks. Notion export uses 4 spaces. */
  indent?: string;
  /** Resolve an image url to the path written in the export. */
  imagePath?: (url: string) => string;
  /** Write toggles as <details> (newer exports) instead of list items. */
  detailsToggles?: boolean;
}

function cellMd(rt: RichText): string {
  return inlineToMd(rt).replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}

export function blocksToMarkdown(blocks: BlockInput[], opts: MarkdownOptions = {}): string {
  const ind = opts.indent ?? "    ";
  const lines: string[] = [];
  const render = (list: BlockInput[], prefix: string) => {
    let num = 0;
    list.forEach((b, idx) => {
      const prev = list[idx - 1];
      num = b.type === "numbered_list_item" ? (prev?.type === "numbered_list_item" ? num + 1 : 1) : 0;
      const t = inlineToMd(b.text ?? []);
      const kids = b.children ?? [];
      const listy = ["bulleted_list_item", "numbered_list_item", "to_do"].includes(b.type) || (b.type === "toggle" && !opts.detailsToggles);
      const nextListy = list[idx + 1] && ["bulleted_list_item", "numbered_list_item", "to_do"].includes(list[idx + 1]!.type);
      const push = (s: string) => lines.push(s === "" ? "" : prefix + s);
      switch (b.type) {
        case "heading_1": push(`# ${t}`); break;
        case "heading_2": push(`## ${t}`); break;
        case "heading_3": push(`### ${t}`); break;
        case "bulleted_list_item": case "toggle":
          if (b.type === "toggle" && opts.detailsToggles) { push("<details>"); push(`<summary>${t}</summary>`); push(""); render(kids, prefix); push("</details>"); break; }
          push(`- ${t}`); break;
        case "numbered_list_item": push(`${num}. ${t}`); break;
        case "to_do": push(`- [${b.props?.checked ? "x" : " "}] ${t}`); break;
        case "quote": (t || " ").split("\n").forEach((l) => push(`> ${l}`)); break;
        case "callout": push("<aside>"); push(`${b.props?.icon ?? ""} ${t}`.trim()); kids.length && (push(""), render(kids, prefix)); push("</aside>"); break;
        case "code": { const fence = plain(b.text ?? []).includes("```") ? "````" : "```"; push(fence + (b.props?.language && b.props.language !== "plain text" ? b.props.language : "")); plain(b.text ?? []).split("\n").forEach((l) => lines.push(prefix + l)); push(fence); break; }
        case "divider": push("---"); break;
        case "equation": push("$$"); push(b.props?.expression ?? ""); push("$$"); break;
        case "image": { const url = b.props?.url ?? ""; push(`![${plain(b.props?.caption ?? [])}](${(opts.imagePath ? opts.imagePath(url) : url).replace(/ /g, "%20")})`); break; }
        case "table": {
          const rows = (b.children ?? []).map((r) => (r.props?.cells ?? []).map(cellMd));
          const w = b.props?.width ?? Math.max(0, ...rows.map((r) => r.length));
          const pad = (r: string[]) => Array.from({ length: w }, (_, i) => r[i] ?? "");
          const [head, ...body] = rows.length ? rows : [[]];
          push(`| ${pad(head!).join(" | ")} |`);
          push(`|${" --- |".repeat(w)}`);
          body.forEach((r) => push(`| ${pad(r).join(" | ")} |`));
          break;
        }
        case "column_list": kids.forEach((c) => render(c.children ?? [], prefix)); break;
        case "column": render(kids, prefix); break;
        case "page": push(`[${plain(b.text ?? []) || "Untitled"}](${b.id ? b.id.replace(/-/g, "") : "#"})`); break;
        case "database": push(`[${plain(b.text ?? []) || "Untitled"}](database)`); break;
        default: (t || "").split("\n").forEach((l) => push(l)); break;
      }
      if (kids.length && !["callout", "column_list", "column", "table"].includes(b.type) && !(b.type === "toggle" && opts.detailsToggles)) {
        if (!listy) lines.push("");
        render(kids, prefix + ind);
      }
      const lastNested = prefix !== "" && idx === list.length - 1;
      if (!(listy && (nextListy || lastNested)) && !(listy && kids.length === 0 && list[idx + 1]?.type === b.type)) lines.push("");
    });
  };
  render(blocks, "");
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\s+$/, "") + "\n";
}

// ---------------- parser ----------------

interface Line { indent: number; text: string; raw: string }

function measure(raw: string): Line {
  const m = raw.match(/^[ \t]*/)![0];
  let n = 0;
  for (const c of m) n += c === "\t" ? 4 : 1;
  return { indent: n, text: raw.slice(m.length), raw };
}

/**
 * Parse Markdown (Notion export flavour, also plain CommonMark-ish text) into blocks.
 * Nesting follows indentation: any indented line after a block becomes its child.
 */
export function markdownToBlocks(md: string): BlockInput[] {
  const lines = md.replace(/\r\n?/g, "\n").replace(/^\uFEFF/, "").split("\n").map(measure);
  let pos = 0;

  const parseLevel = (parentIndent: number): BlockInput[] => {
    const out: BlockInput[] = [];
    while (pos < lines.length) {
      const ln = lines[pos]!;
      if (ln.text === "") { pos++; continue; }
      if (ln.indent <= parentIndent) break;
      const base = ln.indent;
      const t = ln.text;
      let m: RegExpMatchArray | null;
      const withChildren = (b: BlockInput): BlockInput => {
        pos++;
        const kids = parseChildren(base);
        if (kids.length) b.children = [...(b.children ?? []), ...kids];
        return b;
      };
      if ((m = t.match(/^(`{3,}|~{3,})\s*([^`]*)$/))) {
        const fence = m[1]!;
        const lang = m[2]!.trim();
        pos++;
        const body: string[] = [];
        while (pos < lines.length && !lines[pos]!.text.startsWith(fence)) { body.push(lines[pos]!.raw.slice(Math.min(base, lines[pos]!.indent))); pos++; }
        pos++;
        out.push({ type: "code", text: body.length ? [{ text: body.join("\n") }] : [], props: { language: lang ? lang.toLowerCase() : "plain text" } });
        continue;
      }
      if (t === "$$") {
        pos++;
        const body: string[] = [];
        while (pos < lines.length && lines[pos]!.text !== "$$") { body.push(lines[pos]!.text); pos++; }
        pos++;
        out.push({ type: "equation", props: { expression: body.join("\n") } });
        continue;
      }
      if (t === "<aside>") {
        pos++;
        const inner: string[] = [];
        while (pos < lines.length && lines[pos]!.text !== "</aside>") { inner.push(lines[pos]!.raw.slice(Math.min(base, lines[pos]!.indent))); pos++; }
        pos++;
        let firstIdx = inner.findIndex((l) => l.trim() !== "");
        if (firstIdx < 0) firstIdx = inner.length;
        let endIdx = firstIdx;
        while (endIdx < inner.length && inner[endIdx]!.trim() !== "") endIdx++;
        const first = inner.slice(firstIdx, endIdx).map((l) => l.trim()).join("\n");
        const iconMatch = first.match(/^(\p{Extended_Pictographic}\uFE0F?|\S)\s+([\s\S]*)$/u);
        const isIcon = iconMatch && /\p{Extended_Pictographic}/u.test(iconMatch[1]!);
        const children = markdownToBlocks(inner.slice(endIdx).join("\n"));
        const b: BlockInput = { type: "callout", text: mdToInline(isIcon ? iconMatch![2]! : first), props: { icon: isIcon ? iconMatch![1]! : "\u{1F4A1}" } };
        if (children.length) b.children = children;
        out.push(b);
        continue;
      }
      if (t === "<details>" || t.startsWith("<details")) {
        pos++;
        let summary = "";
        const inner: string[] = [];
        let depthCount = 1;
        while (pos < lines.length) {
          const x = lines[pos]!.text;
          if (x.startsWith("<details")) depthCount++;
          if (x === "</details>" && --depthCount === 0) break;
          const sm = x.match(/^<summary>(.*)<\/summary>$/);
          if (sm && !summary && depthCount === 1) summary = sm[1]!;
          else inner.push(lines[pos]!.raw.slice(Math.min(base, lines[pos]!.indent)));
          pos++;
        }
        pos++;
        const children = markdownToBlocks(inner.join("\n"));
        const b: BlockInput = { type: "toggle", text: mdToInline(summary) };
        if (children.length) b.children = children;
        out.push(b);
        continue;
      }
      if (/^\|.*\|$/.test(t) && pos + 1 < lines.length && /^\|?\s*:?-{3,}/.test(lines[pos + 1]!.text)) {
        const rows: string[][] = [];
        const split = (s: string) => s.replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
        rows.push(split(t));
        pos += 2;
        while (pos < lines.length && /^\|.*\|$/.test(lines[pos]!.text)) { rows.push(split(lines[pos]!.text)); pos++; }
        const width = Math.max(...rows.map((r) => r.length));
        out.push({ type: "table", props: { width, hasColumnHeader: true, hasRowHeader: false }, children: rows.map((r) => ({ type: "table_row", props: { cells: Array.from({ length: width }, (_, i) => mdToInline((r[i] ?? "").replace(/<br>/g, "\n"))) } })) });
        continue;
      }
      if ((m = t.match(/^(#{1,3})\s+(.*)$/))) { out.push(withChildren({ type: (["heading_1", "heading_2", "heading_3"] as const)[m[1]!.length - 1]!, text: mdToInline(m[2]!) })); continue; }
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { pos++; out.push({ type: "divider" }); continue; }
      if ((m = t.match(/^[-*+]\s+\[([ xX])\]\s?(.*)$/))) { out.push(withChildren({ type: "to_do", text: mdToInline(m[2]!), props: { checked: m[1] !== " " } })); continue; }
      if ((m = t.match(/^[-*+]\s+(.*)$/)) || t === "-") { out.push(withChildren({ type: "bulleted_list_item", text: mdToInline(m ? m[1]! : "") })); continue; }
      if ((m = t.match(/^\d+[.)]\s+(.*)$/))) { out.push(withChildren({ type: "numbered_list_item", text: mdToInline(m[1]!) })); continue; }
      if ((m = t.match(/^!\[([^\]]*)\]\(([^)]*)\)$/))) { pos++; const cap = mdToInline(m[1]!); out.push({ type: "image", props: { url: decodeURI(m[2]!), ...(cap.length ? { caption: cap } : {}) } }); continue; }
      if (t.startsWith(">")) {
        const q: string[] = [];
        while (pos < lines.length && lines[pos]!.text.startsWith(">") && lines[pos]!.indent === base) { q.push(lines[pos]!.text.replace(/^>\s?/, "")); pos++; }
        out.push({ type: "quote", text: mdToInline(q.join("\n").trim()) });
        continue;
      }
      // Paragraph: consecutive non-blank lines at this indent that do not start another block.
      const para: string[] = [t];
      pos++;
      while (pos < lines.length) {
        const nx = lines[pos]!;
        if (nx.text === "" || nx.indent !== base || /^(#{1,3}\s|[-*+]\s|\d+[.)]\s|>|```|~~~|\$\$|<aside>|<details|\|)/.test(nx.text)) break;
        para.push(nx.text);
        pos++;
      }
      const p: BlockInput = { type: "paragraph", text: mdToInline(para.join("\n")) };
      const kids = parseChildren(base);
      if (kids.length) p.children = kids;
      out.push(p);
    }
    return out;
  };

  const parseChildren = (parentIndent: number): BlockInput[] => {
    // Children are the following lines indented deeper than the parent (blank lines allowed between).
    let look = pos;
    while (look < lines.length && lines[look]!.text === "") look++;
    if (look >= lines.length || lines[look]!.indent <= parentIndent) return [];
    pos = look;
    return parseLevel(parentIndent);
  };

  return parseLevel(-1);
}

/** A Notion export page: first line is "# Title", optional "Key: value" property lines follow. */
export function parseExportPage(md: string): { title: string; properties: Record<string, string>; blocks: BlockInput[] } {
  const src = md.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const lines = src.split("\n");
  let title = "";
  let i = 0;
  if (lines[0]?.startsWith("# ")) { title = plain(mdToInline(lines[0].slice(2))); i = 1; }
  const properties: Record<string, string> = {};
  let j = i;
  while (j < lines.length && lines[j] === "") j++;
  let k = j;
  while (k < lines.length && /^[^\s:#>|`-][^:]{0,60}: /.test(lines[k]!)) k++;
  // Only treat the run as properties when it is followed by a blank line or the end.
  if (k > j && (k === lines.length || lines[k] === "")) {
    for (const l of lines.slice(j, k)) { const at = l.indexOf(": "); properties[l.slice(0, at)] = l.slice(at + 2); }
    i = k;
  }
  return { title, properties, blocks: markdownToBlocks(lines.slice(i).join("\n")) };
}

export function pageToMarkdown(title: string, blocks: BlockInput[], properties: Record<string, string> = {}, opts: MarkdownOptions = {}): string {
  const head = [`# ${inlineToMd([{ text: title }])}`, ""];
  const props = Object.entries(properties);
  if (props.length) head.push(...props.map(([k, v]) => `${k}: ${v}`), "");
  const body = blocksToMarkdown(blocks, opts);
  return head.join("\n") + (body.trim() ? "\n" + body : "");
}
