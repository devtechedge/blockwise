import type { Marks, RichText, Span } from "@blockwise/core";
import { normalize } from "@blockwise/core";

const ESC = /([\\`*_~[\]$<>])/g;

export function escapeMd(s: string): string {
  return s.replace(ESC, "\\$1");
}

/** Rich text to inline Markdown, Notion export flavour. Underline and colour have no Markdown form. */
export function inlineToMd(rt: RichText): string {
  let out = "";
  for (const s of normalize(rt)) {
    if (s.equation !== undefined) { out += `$${s.equation}$`; continue; }
    if (s.mention) {
      const m = s.mention;
      out += m.kind === "date" ? `@${m.start}${m.end ? " \u2192 " + m.end : ""}` : m.kind === "page" ? `[${m.title ?? "Untitled"}](${m.id.replace(/-/g, "")})` : `@${m.name ?? m.id}`;
      continue;
    }
    const mk = s.marks ?? {};
    // Keep surrounding whitespace outside the markers so the result parses back.
    const lead = s.text.match(/^\s*/)![0];
    const trail = s.text.slice(lead.length).match(/\s*$/)![0];
    let core = s.text.slice(lead.length, s.text.length - trail.length);
    if (!core) { out += s.text; continue; }
    if (mk.code) core = core.includes("`") ? "`` " + core + " ``" : "`" + core + "`";
    else core = escapeMd(core);
    if (mk.strike) core = `~~${core}~~`;
    if (mk.italic) core = `*${core}*`;
    if (mk.bold) core = `**${core}**`;
    if (mk.link) core = `[${core}](${mk.link.replace(/\)/g, "%29").replace(/ /g, "%20")})`;
    out += lead + core + trail;
  }
  return out;
}

/** Inline Markdown to rich text. Supports the subset Notion exports. */
export function mdToInline(src: string): RichText {
  const out: Span[] = [];
  const walk = (s: string, marks: Marks) => {
    let i = 0;
    let buf = "";
    const flush = () => { if (buf) { out.push({ text: buf, marks: { ...marks } }); buf = ""; } };
    while (i < s.length) {
      const ch = s[i]!;
      const rest = s.slice(i);
      if (ch === "\\" && i + 1 < s.length && ESC.test(s[i + 1]!)) { ESC.lastIndex = 0; buf += s[i + 1]; i += 2; continue; }
      ESC.lastIndex = 0;
      let m: RegExpMatchArray | null;
      if ((m = rest.match(/^``\s(.+?)\s``/)) || (m = rest.match(/^`([^`]+)`/))) { flush(); out.push({ text: m[1]!, marks: { ...marks, code: true } }); i += m[0].length; continue; }
      if ((m = rest.match(/^\$([^$\s][^$]*?)\$/))) { flush(); out.push({ text: m[1]!, equation: m[1]! }); i += m[0].length; continue; }
      if ((m = rest.match(/^\*\*(.+?)\*\*(?!\*)/s)) || (m = rest.match(/^__(.+?)__/s))) { flush(); walk(m[1]!, { ...marks, bold: true }); i += m[0].length; continue; }
      if ((m = rest.match(/^~~(.+?)~~/s))) { flush(); walk(m[1]!, { ...marks, strike: true }); i += m[0].length; continue; }
      if ((m = rest.match(/^\*(?!\s)(.+?)(?<!\s)\*/s)) || (m = rest.match(/^_(?!\s)(.+?)(?<!\s)_(?![A-Za-z0-9])/s))) { flush(); walk(m[1]!, { ...marks, italic: true }); i += m[0].length; continue; }
      if ((m = rest.match(/^\[((?:\\.|[^\]])*)\]\(([^)\s]*)\)/))) { flush(); walk(m[1]!, { ...marks, link: decodeLink(m[2]!) }); i += m[0].length; continue; }
      if ((m = rest.match(/^<(https?:\/\/[^>\s]+)>/))) { flush(); out.push({ text: m[1]!, marks: { ...marks, link: m[1]! } }); i += m[0].length; continue; }
      buf += ch;
      i++;
    }
    flush();
  };
  walk(src, {});
  return normalize(out);
}

function decodeLink(u: string): string {
  return u.replace(/%29/g, ")").replace(/%20/g, " ");
}
