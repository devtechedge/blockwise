import type { RichText } from "@blockwise/core";
import { normalize } from "@blockwise/core";
import { htmlInline, inlineToHtml } from "@blockwise/notion-format";
import { parse } from "node-html-parser";

/** Rich text to the HTML shown inside a contentEditable block. */
export function richToHtml(rt: RichText): string {
  const html = inlineToHtml(rt);
  // A trailing <br> needs a second one to be visible in contentEditable.
  return /<br\/>$/.test(html) ? html + "<br/>" : html;
}

/** Read rich text back from a contentEditable element. */
export function domToRich(el: HTMLElement): RichText {
  let html = el.innerHTML.replace(/<br\s*\/?>\s*$/i, (m) => (el.innerHTML.match(/<br\s*\/?>\s*<br\s*\/?>\s*$/i) ? m : ""));
  html = html.replace(/&nbsp;/g, "\u00a0");
  const rt = htmlInline(parse(html).childNodes, {}, { preserveWhitespace: true });
  // Browsers insert non breaking spaces for typed trailing spaces; store regular spaces.
  return normalize(rt.map((s) => ({ ...s, text: s.equation !== undefined || s.mention ? s.text : s.text.replace(/\u00a0/g, " ") })));
}
