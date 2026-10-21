/**
 * Rich text is a list of spans. Each span carries its text and a set of marks.
 * The shape is our own, but it maps one to one onto Notion's "title" arrays
 * (see docs/specs/clipboard.md) and onto the public API's rich_text objects.
 */
export type Color =
  | "default" | "gray" | "brown" | "orange" | "yellow" | "green" | "blue" | "purple" | "pink" | "red"
  | `${"gray" | "brown" | "orange" | "yellow" | "green" | "blue" | "purple" | "pink" | "red"}_background`;

export interface Marks {
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  underline?: boolean;
  code?: boolean;
  color?: Color;
  link?: string;
}

export type Mention =
  | { kind: "page"; id: string; title?: string }
  | { kind: "user"; id: string; name?: string }
  | { kind: "date"; start: string; end?: string };

export interface Span {
  text: string;
  marks?: Marks;
  /** Inline equation, TeX source. When set, `text` is the TeX as well. */
  equation?: string;
  mention?: Mention;
}

export type RichText = Span[];

export const MENTION_PLACEHOLDER = "\u2023";

export function plain(rt: RichText): string {
  return rt.map((s) => s.text).join("");
}

export function text(t: string, marks?: Marks): RichText {
  if (t === "") return [];
  return [marks && Object.keys(marks).length ? { text: t, marks: { ...marks } } : { text: t }];
}

function cleanMarks(m: Marks | undefined): Marks | undefined {
  if (!m) return undefined;
  const out: Marks = {};
  for (const [k, v] of Object.entries(m) as [keyof Marks, unknown][]) {
    if (v === undefined || v === false || v === "default") continue;
    (out as Record<string, unknown>)[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

export function sameMarks(a?: Marks, b?: Marks): boolean {
  const x = cleanMarks(a) ?? {};
  const y = cleanMarks(b) ?? {};
  const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
  for (const k of keys) if ((x as Record<string, unknown>)[k] !== (y as Record<string, unknown>)[k]) return false;
  return true;
}

/** Merge neighbouring plain spans with equal marks, drop empty spans, strip default marks. */
export function normalize(rt: RichText): RichText {
  const out: RichText = [];
  for (const s of rt) {
    if (s.text === "" && !s.mention && !s.equation) continue;
    const marks = cleanMarks(s.marks);
    const span: Span = { text: s.text };
    if (marks) span.marks = marks;
    if (s.equation !== undefined) span.equation = s.equation;
    if (s.mention) span.mention = s.mention;
    const prev = out[out.length - 1];
    if (prev && !prev.mention && prev.equation === undefined && !span.mention && span.equation === undefined && sameMarks(prev.marks, span.marks)) {
      prev.text += span.text;
    } else out.push(span);
  }
  return out;
}

export function length(rt: RichText): number {
  return rt.reduce((n, s) => n + s.text.length, 0);
}

/** Split at a character offset. Mentions and equations are atomic. */
export function splitAt(rt: RichText, offset: number): [RichText, RichText] {
  const left: RichText = [];
  const right: RichText = [];
  let pos = 0;
  for (const s of rt) {
    const end = pos + s.text.length;
    if (end <= offset) left.push(s);
    else if (pos >= offset || s.mention || s.equation !== undefined) right.push(s);
    else {
      const cut = offset - pos;
      left.push({ ...s, text: s.text.slice(0, cut) });
      right.push({ ...s, text: s.text.slice(cut) });
    }
    pos = end;
  }
  return [normalize(left), normalize(right)];
}

export function slice(rt: RichText, from: number, to: number): RichText {
  return splitAt(splitAt(rt, to)[0], from)[1];
}

export function concat(...parts: RichText[]): RichText {
  return normalize(parts.flat());
}

/** Apply (or remove, when value is undefined/false) a mark across [from, to). */
export function applyMark<K extends keyof Marks>(rt: RichText, from: number, to: number, key: K, value: Marks[K]): RichText {
  const [a, rest] = splitAt(rt, from);
  const [mid, b] = splitAt(rest, to - from);
  const changed = mid.map((s) => ({ ...s, marks: { ...(s.marks ?? {}), [key]: value } }));
  return concat(a, changed, b);
}

/** True when every character in [from, to) carries the mark. */
export function hasMark(rt: RichText, from: number, to: number, key: keyof Marks): boolean {
  const mid = slice(rt, from, to);
  return mid.length > 0 && mid.every((s) => Boolean(s.marks?.[key]));
}

export function insertText(rt: RichText, offset: number, t: string, marks?: Marks): RichText {
  const [a, b] = splitAt(rt, offset);
  const inherit = marks ?? a[a.length - 1]?.marks;
  const m = inherit ? { ...inherit } : undefined;
  if (m) delete m.link;
  return concat(a, text(t, m), b);
}

export function deleteRange(rt: RichText, from: number, to: number): RichText {
  const [a, rest] = splitAt(rt, from);
  return concat(a, splitAt(rest, to - from)[1]);
}
