import type { Marks, RichText, Span } from "@blockwise/core";
import { MENTION_PLACEHOLDER, normalize } from "@blockwise/core";

/**
 * Notion's internal rich text ("title" array), see docs/specs/clipboard.md.
 * [["plain"], ["bold", [["b"]]], ["link", [["a", "https://..."]]], ["\u204d", [["e", "x^2"]]]]
 */
export type Annotation = [string, ...unknown[]];
export type TitleSegment = [string] | [string, Annotation[]];
export type TitleArray = TitleSegment[];

export const EQUATION_PLACEHOLDER = "\u204d";

/**
 * Notion's internal palette calls green "teal" (paste parser color list,
 * evidence/README.md). Blockwise and the public API say "green".
 */
export function toNotionColor(c: string): string { return c.replace(/^green(?=$|_)/, "teal"); }
export function fromNotionColor(c: string): string { return c.replace(/^teal(?=$|_)/, "green"); }

export function toTitle(rt: RichText): TitleArray {
  return normalize(rt).map((s): TitleSegment => {
    const a: Annotation[] = [];
    if (s.mention) {
      const m = s.mention;
      if (m.kind === "page") a.push(["p", m.id]);
      else if (m.kind === "user") a.push(["u", m.id]);
      else a.push(["d", m.end ? { type: "daterange", start_date: m.start, end_date: m.end } : { type: "date", start_date: m.start }]);
    }
    if (s.equation !== undefined) a.push(["e", s.equation]);
    const mk = s.marks ?? {};
    if (mk.bold) a.push(["b"]);
    if (mk.italic) a.push(["i"]);
    if (mk.strike) a.push(["s"]);
    if (mk.underline) a.push(["_"]);
    if (mk.code) a.push(["c"]);
    if (mk.color) a.push(["h", toNotionColor(mk.color)]);
    if (mk.link) a.push(["a", mk.link]);
    const t = s.mention ? MENTION_PLACEHOLDER : s.equation !== undefined ? EQUATION_PLACEHOLDER : s.text;
    return a.length ? [t, a] : [t];
  });
}

export function fromTitle(title: unknown): RichText {
  if (!Array.isArray(title)) return [];
  const out: Span[] = [];
  for (const seg of title) {
    if (!Array.isArray(seg) || typeof seg[0] !== "string") continue;
    const [t, anns] = seg as [string, Annotation[] | undefined];
    const marks: Marks = {};
    const span: Span = { text: t };
    for (const a of Array.isArray(anns) ? anns : []) {
      if (!Array.isArray(a)) continue;
      switch (a[0]) {
        case "b": marks.bold = true; break;
        case "i": marks.italic = true; break;
        case "s": marks.strike = true; break;
        case "_": marks.underline = true; break;
        case "c": marks.code = true; break;
        case "h": marks.color = fromNotionColor(String(a[1])) as Marks["color"]; break;
        case "a": marks.link = String(a[1]); break;
        case "e": span.equation = String(a[1]); span.text = String(a[1]); break;
        case "p": span.mention = { kind: "page", id: String(a[1]) }; break;
        case "u": span.mention = { kind: "user", id: String(a[1]) }; break;
        case "d": {
          const d = (a[1] ?? {}) as { start_date?: string; end_date?: string };
          span.mention = d.end_date ? { kind: "date", start: d.start_date ?? "", end: d.end_date } : { kind: "date", start: d.start_date ?? "" };
          break;
        }
        default: break; // unknown annotations (comments, suggestions) are dropped
      }
    }
    if (span.mention) span.text = MENTION_PLACEHOLDER;
    if (Object.keys(marks).length) span.marks = marks;
    out.push(span);
  }
  return normalize(out);
}
