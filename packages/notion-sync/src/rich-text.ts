import type { Marks, RichText, Span } from "@blockwise/core";
import { MENTION_PLACEHOLDER, normalize } from "@blockwise/core";

/** Public API rich text item (subset we read and write). */
export interface ApiRichText {
  type: "text" | "mention" | "equation";
  text?: { content: string; link?: { url: string } | null };
  mention?: { type: string; page?: { id: string }; user?: { id: string; name?: string }; date?: { start: string; end?: string | null } };
  equation?: { expression: string };
  annotations?: { bold?: boolean; italic?: boolean; strikethrough?: boolean; underline?: boolean; code?: boolean; color?: string };
  plain_text?: string;
  href?: string | null;
}

const MAX_TEXT = 2000; // API limit per rich text item

function annotationsOf(m: Marks | undefined): ApiRichText["annotations"] | undefined {
  if (!m) return undefined;
  const a: NonNullable<ApiRichText["annotations"]> = {};
  if (m.bold) a.bold = true;
  if (m.italic) a.italic = true;
  if (m.strike) a.strikethrough = true;
  if (m.underline) a.underline = true;
  if (m.code) a.code = true;
  if (m.color) a.color = m.color;
  return Object.keys(a).length ? a : undefined;
}

export function toApiRichText(rt: RichText): ApiRichText[] {
  const out: ApiRichText[] = [];
  for (const s of normalize(rt)) {
    const annotations = annotationsOf(s.marks);
    const extra = annotations ? { annotations } : {};
    if (s.equation !== undefined) { out.push({ type: "equation", equation: { expression: s.equation }, ...extra }); continue; }
    if (s.mention) {
      const m = s.mention;
      if (m.kind === "page") out.push({ type: "mention", mention: { type: "page", page: { id: m.id } }, ...extra });
      else if (m.kind === "user") out.push({ type: "mention", mention: { type: "user", user: { id: m.id } }, ...extra });
      else out.push({ type: "mention", mention: { type: "date", date: { start: m.start, ...(m.end ? { end: m.end } : {}) } }, ...extra });
      continue;
    }
    for (let i = 0; i < s.text.length; i += MAX_TEXT) {
      const content = s.text.slice(i, i + MAX_TEXT);
      out.push({ type: "text", text: { content, ...(s.marks?.link ? { link: { url: s.marks.link } } : {}) }, ...extra });
    }
  }
  return out;
}

export function fromApiRichText(items: ApiRichText[] | undefined): RichText {
  const out: Span[] = [];
  for (const it of items ?? []) {
    const a = it.annotations ?? {};
    const marks: Marks = {};
    if (a.bold) marks.bold = true;
    if (a.italic) marks.italic = true;
    if (a.strikethrough) marks.strike = true;
    if (a.underline) marks.underline = true;
    if (a.code) marks.code = true;
    if (a.color && a.color !== "default") marks.color = a.color as Marks["color"];
    const span: Span = { text: "" };
    if (it.type === "equation" && it.equation) { span.text = it.equation.expression; span.equation = it.equation.expression; }
    else if (it.type === "mention" && it.mention) {
      const m = it.mention;
      span.text = MENTION_PLACEHOLDER;
      if (m.type === "page" && m.page) span.mention = { kind: "page", id: m.page.id, ...(it.plain_text ? { title: it.plain_text } : {}) };
      else if (m.type === "user" && m.user) span.mention = { kind: "user", id: m.user.id, ...(m.user.name ? { name: m.user.name } : {}) };
      else if (m.type === "date" && m.date) span.mention = { kind: "date", start: m.date.start, ...(m.date.end ? { end: m.date.end } : {}) };
      else span.text = it.plain_text ?? "";
    } else {
      span.text = it.text?.content ?? it.plain_text ?? "";
      const link = it.text?.link?.url ?? it.href;
      if (link) marks.link = link;
    }
    if (Object.keys(marks).length) span.marks = marks;
    out.push(span);
  }
  return normalize(out);
}
