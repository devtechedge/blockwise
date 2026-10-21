import type { BlockInput, Color, Marks, RichText, Span } from "@blockwise/core";
import { normalize, plain } from "@blockwise/core";
import { parse, HTMLElement, TextNode, type Node } from "node-html-parser";

// ---------------- writer ----------------

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function inlineToHtml(rt: RichText): string {
  return normalize(rt).map((s) => {
    if (s.equation !== undefined) return `<span class="notion-text-equation-token" data-tex="${escapeHtml(s.equation)}">${escapeHtml(s.equation)}</span>`;
    if (s.mention) {
      const m = s.mention;
      if (m.kind === "date") return `<time>@${escapeHtml(m.start)}${m.end ? " \u2192 " + escapeHtml(m.end) : ""}</time>`;
      if (m.kind === "user") return `<span class="user">@${escapeHtml(m.name ?? m.id)}</span>`;
      return `<a href="${escapeHtml(m.id.replace(/-/g, ""))}">${escapeHtml(m.title ?? "Untitled")}</a>`;
    }
    let h = escapeHtml(s.text).replace(/\n/g, "<br/>");
    const mk = s.marks ?? {};
    if (mk.code) h = `<code>${h}</code>`;
    if (mk.strike) h = `<del>${h}</del>`;
    if (mk.underline) h = `<span style="border-bottom:0.05em solid">${h}</span>`;
    if (mk.italic) h = `<em>${h}</em>`;
    if (mk.bold) h = `<strong>${h}</strong>`;
    if (mk.color) h = `<mark class="highlight-${mk.color}">${h}</mark>`;
    if (mk.link) h = `<a href="${escapeHtml(mk.link)}">${h}</a>`;
    return h;
  }).join("");
}

export interface HtmlOptions { imagePath?: (url: string) => string; ids?: boolean }

function attrs(b: BlockInput, cls: string | null, opts: HtmlOptions): string {
  const parts: string[] = [];
  if (opts.ids && b.id) parts.push(`id="${b.id}"`);
  const classes = [cls, b.props?.color ? `block-color-${b.props.color}` : null].filter(Boolean);
  if (classes.length) parts.push(`class="${classes.join(" ")}"`);
  return parts.length ? " " + parts.join(" ") : "";
}

export function blocksToHtml(blocks: BlockInput[], opts: HtmlOptions = {}): string {
  let numberRun = 0;
  return blocks.map((b, i) => {
    numberRun = b.type === "numbered_list_item" ? (blocks[i - 1]?.type === "numbered_list_item" ? numberRun + 1 : 1) : 0;
    const t = inlineToHtml(b.text ?? []);
    const kids = b.children?.length ? blocksToHtml(b.children, opts) : "";
    const indented = kids ? `<div class="indented">${kids}</div>` : "";
    switch (b.type) {
      case "paragraph": return `<p${attrs(b, null, opts)}>${t}</p>${indented}`;
      case "heading_1": return `<h1${attrs(b, null, opts)}>${t}</h1>${indented}`;
      case "heading_2": return `<h2${attrs(b, null, opts)}>${t}</h2>${indented}`;
      case "heading_3": return `<h3${attrs(b, null, opts)}>${t}</h3>${indented}`;
      case "bulleted_list_item": return `<ul${attrs(b, "bulleted-list", opts)}><li>${t}${kids}</li></ul>`;
      case "numbered_list_item": return `<ol${attrs(b, "numbered-list", opts)} start="${numberRun}"><li>${t}${kids}</li></ol>`;
      case "to_do": {
        const on = Boolean(b.props?.checked);
        return `<ul${attrs(b, "to-do-list", opts)}><li><input type="checkbox" class="checkbox ${on ? "checkbox-on" : "checkbox-off"}"${on ? " checked" : ""} disabled/> <span class="to-do-children-${on ? "checked" : "unchecked"}">${t}</span>${indented}</li></ul>`;
      }
      case "toggle": return `<ul${attrs(b, "toggle", opts)}><li><details open=""><summary>${t}</summary>${indented}</details></li></ul>`;
      case "quote": return `<blockquote${attrs(b, null, opts)}>${t}${kids}</blockquote>`;
      case "callout": return `<aside${attrs(b, "callout", opts)}><span class="icon">${escapeHtml(b.props?.icon ?? "")}</span><div>${t}${kids}</div></aside>`;
      case "code": return `<pre${attrs(b, "code", opts)}><code class="language-${escapeHtml((b.props?.language ?? "plain text").replace(/ /g, "-"))}">${escapeHtml(plain(b.text ?? []))}</code></pre>`;
      case "divider": return `<hr${attrs(b, null, opts)}/>`;
      case "equation": return `<figure${attrs(b, "equation", opts)}><div class="equation-container" data-tex="${escapeHtml(b.props?.expression ?? "")}">${escapeHtml(b.props?.expression ?? "")}</div></figure>`;
      case "image": {
        const url = b.props?.url ?? "";
        const src = opts.imagePath ? opts.imagePath(url) : url;
        const cap = b.props?.caption?.length ? `<figcaption>${inlineToHtml(b.props.caption)}</figcaption>` : "";
        return `<figure${attrs(b, "image", opts)}><a href="${escapeHtml(src)}"><img src="${escapeHtml(src)}"/></a>${cap}</figure>`;
      }
      case "table": {
        const rows = b.children ?? [];
        const head = b.props?.hasColumnHeader;
        const rowHead = b.props?.hasRowHeader;
        const body = rows.map((r, ri) => `<tr>${(r.props?.cells ?? []).map((c, ci) => {
          const isHead = (head && ri === 0) || (rowHead && ci === 0);
          return isHead ? `<th class="simple-table-header">${inlineToHtml(c)}</th>` : `<td>${inlineToHtml(c)}</td>`;
        }).join("")}</tr>`).join("");
        return `<table${attrs(b, "simple-table", opts)}><tbody>${body}</tbody></table>`;
      }
      case "column_list": return `<div${attrs(b, "column-list", opts)}>${(b.children ?? []).map((c) => `<div class="column"${c.props?.ratio !== undefined ? ` style="width:${(c.props.ratio * 100).toFixed(2).replace(/\.?0+$/, "")}%"` : ""}>${blocksToHtml(c.children ?? [], opts)}</div>`).join("")}</div>`;
      case "column": return `<div class="column">${kids}</div>`;
      case "page": return `<figure${attrs(b, "link-to-page", opts)}><a href="${escapeHtml((b.id ?? "").replace(/-/g, ""))}">${escapeHtml(plain(b.text ?? []) || "Untitled")}</a></figure>`;
      default: return `<p>${t}</p>${indented}`;
    }
  }).join("");
}

export function pageToHtml(title: string, blocks: BlockInput[], opts: HtmlOptions & { id?: string; icon?: string } = {}): string {
  const icon = opts.icon ? `<div class="page-header-icon"><span class="icon">${escapeHtml(opts.icon)}</span></div>` : "";
  return `<html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"/><title>${escapeHtml(title)}</title></head><body><article${opts.id ? ` id="${opts.id}"` : ""} class="page sans"><header>${icon}<h1 class="page-title">${escapeHtml(title)}</h1></header><div class="page-body">${blocksToHtml(blocks, opts)}</div></article></body></html>\n`;
}

// ---------------- parser ----------------

const HIGHLIGHT = /^(?:highlight|block-color)-([a-z_]+)$/;

function el(n: Node): HTMLElement | null { return n instanceof HTMLElement ? n : null; }
function cls(e: HTMLElement): string[] { return (e.getAttribute("class") ?? "").split(/\s+/).filter(Boolean); }
function styleOf(e: HTMLElement): string { return (e.getAttribute("style") ?? "").toLowerCase().replace(/\s+/g, ""); }

function colorFrom(e: HTMLElement): Color | undefined {
  for (const c of cls(e)) { const m = c.match(HIGHLIGHT); if (m && m[1] !== "default") return m[1] as Color; }
  return undefined;
}

export function htmlInline(nodes: Node[], marks: Marks = {}, opts: { preserveWhitespace?: boolean } = {}): RichText {
  const out: Span[] = [];
  const walk = (n: Node, m: Marks) => {
    if (n instanceof TextNode) {
      const t = opts.preserveWhitespace ? n.text : n.text.replace(/[ \t\r\n]+/g, " ");
      if (t) out.push({ text: decodeEntities(t), marks: { ...m } });
      return;
    }
    const e = el(n);
    if (!e) return;
    const tag = e.tagName?.toLowerCase();
    if (tag === "br") { out.push({ text: "\n", marks: { ...m } }); return; }
    if (tag === "input" || tag === "style" || tag === "script") return;
    const c = cls(e);
    const tex = e.getAttribute("data-tex") ?? (c.includes("notion-text-equation-token") ? e.querySelector("annotation")?.text : undefined);
    if (tex !== undefined && tex !== null) { out.push({ text: tex, equation: tex }); return; }
    const st = styleOf(e);
    const next: Marks = { ...m };
    if (tag === "strong" || tag === "b" || /font-weight:(bold|[6-9]00)/.test(st)) next.bold = true;
    if (tag === "em" || tag === "i" || /font-style:italic/.test(st)) next.italic = true;
    if (tag === "del" || tag === "s" || tag === "strike" || /text-decoration:[^;]*line-through/.test(st)) next.strike = true;
    if (tag === "u" || /border-bottom:0\.05emsolid/.test(st) || /text-decoration:[^;]*underline/.test(st)) next.underline = true;
    if (tag === "code" || tag === "kbd") next.code = true;
    if (tag === "a" && e.getAttribute("href")) next.link = decodeEntities(e.getAttribute("href")!);
    const color = colorFrom(e);
    if (color) next.color = color;
    for (const ch of e.childNodes) walk(ch, next);
  };
  for (const n of nodes) walk(n, marks);
  // Trim leading/trailing collapsible space like a browser would.
  const rt = normalize(out);
  if (rt.length && !opts.preserveWhitespace) {
    const first = rt[0]!;
    if (!first.equation && !first.mention) first.text = first.text.replace(/^ +/, "");
    const last = rt[rt.length - 1]!;
    if (!last.equation && !last.mention) last.text = last.text.replace(/ +$/, "");
  }
  return normalize(rt);
}

function decodeEntities(s: string): string {
  return s.replace(/&nbsp;/g, "\u00a0").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&amp;/g, "&");
}

const BLOCK_TAGS = new Set(["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote", "pre", "hr", "figure", "table", "aside", "details", "summary", "section", "article", "header", "main", "img", "body", "html", "nav", "footer"]);

function isBlockEl(n: Node): boolean { const e = el(n); return Boolean(e && BLOCK_TAGS.has(e.tagName?.toLowerCase())); }

/** Split mixed content: runs of inline nodes become paragraphs, block elements are parsed. */
function parseFlow(nodes: Node[]): BlockInput[] {
  const out: BlockInput[] = [];
  let run: Node[] = [];
  const flushRun = () => {
    const rt = htmlInline(run);
    if (plain(rt).trim() || rt.some((s) => s.equation || s.mention)) out.push({ type: "paragraph", text: rt });
    run = [];
  };
  for (const n of nodes) {
    const e = el(n);
    if (e && e.tagName?.toLowerCase() === "div" && cls(e).includes("indented") && (run.length === 0 || !plain(htmlInline(run)).trim())) {
      flushRun();
      const kids = parseFlow(e.childNodes);
      const prev = out[out.length - 1];
      if (prev) prev.children = [...(prev.children ?? []), ...kids]; else out.push(...kids);
      continue;
    }
    if (isBlockEl(n)) { flushRun(); out.push(...parseBlock(e!)); } else run.push(n);
  }
  flushRun();
  return out;
}

function withKids(b: BlockInput, kids: BlockInput[]): BlockInput {
  if (kids.length) b.children = kids;
  return b;
}

function colorProps(e: HTMLElement): { color?: Color } {
  const c = colorFrom(e);
  return c ? { color: c } : {};
}

/** Split an <li> into its own inline text and nested blocks. */
function liParts(li: HTMLElement): { text: RichText; kids: BlockInput[] } {
  const inline: Node[] = [];
  const blocks: Node[] = [];
  for (const ch of li.childNodes) {
    const e = el(ch);
    const tag = e?.tagName?.toLowerCase();
    if (e && (tag === "ul" || tag === "ol" || (tag === "div" && cls(e).includes("indented")) || tag === "p" && inline.length > 0 || tag === "pre" || tag === "blockquote" || tag === "table" || tag === "figure" || tag === "details")) blocks.push(ch);
    else if (blocks.length) blocks.push(ch);
    else if (tag === "p" || tag === "span" && cls(e!).some((c) => c.startsWith("to-do-children"))) inline.push(...e!.childNodes);
    else inline.push(ch);
  }
  const kids = blocks.flatMap((b) => { const e = el(b); return e && e.tagName.toLowerCase() === "div" && cls(e).includes("indented") ? parseFlow(e.childNodes) : parseFlow([b]); });
  return { text: htmlInline(inline), kids };
}

function parseBlock(e: HTMLElement): BlockInput[] {
  const tag = e.tagName.toLowerCase();
  const c = cls(e);
  switch (tag) {
    case "h1": return [{ type: "heading_1", text: htmlInline(e.childNodes), ...props(colorProps(e)) }];
    case "h2": return [{ type: "heading_2", text: htmlInline(e.childNodes), ...props(colorProps(e)) }];
    case "h3": case "h4": case "h5": case "h6": return [{ type: "heading_3", text: htmlInline(e.childNodes), ...props(colorProps(e)) }];
    case "p": {
      const rt = htmlInline(e.childNodes);
      return [{ type: "paragraph", text: rt, ...props(colorProps(e)) }];
    }
    case "hr": return [{ type: "divider" }];
    case "pre": {
      const raw = e.innerHTML;
      const lm = raw.match(/class="[^"]*language-([^"\s]+)/) ?? (e.getAttribute("class") ?? "").match(/language-([^"\s]+)/);
      const lang = lm ? lm[1]!.replace(/-/g, " ").toLowerCase() : "plain text";
      const txt = decodeEntities(raw.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")).replace(/\n$/, "");
      return [{ type: "code", text: txt ? [{ text: txt }] : [], props: { language: lang || "plain text" } }];
    }
    case "blockquote": {
      const inner = e.childNodes;
      const firstBlock = inner.findIndex(isBlockEl);
      if (firstBlock < 0) return [{ type: "quote", text: htmlInline(inner), ...props(colorProps(e)) }];
      const flow = parseFlow(inner);
      const head = flow[0]?.type === "paragraph" ? flow.shift()! : { type: "paragraph" as const, text: [] };
      return [withKids({ type: "quote", text: head.text ?? [] }, flow)];
    }
    case "aside": {
      const iconEl = e.querySelector(".icon");
      const icon = iconEl?.text.trim();
      const body = e.childNodes.filter((n) => n !== iconEl && !(el(n) && el(n)!.tagName.toLowerCase() === "div" && el(n)!.querySelector(".icon") === iconEl && iconEl));
      const flatten = body.length === 1 && el(body[0]!) && el(body[0]!)!.tagName.toLowerCase() === "div" ? el(body[0]!)!.childNodes : body;
      const flow = parseFlow(flatten);
      const head = flow[0]?.type === "paragraph" ? flow.shift()! : { type: "paragraph" as const, text: [] };
      return [withKids({ type: "callout", text: head.text ?? [], props: { icon: icon || "\u{1F4A1}", ...colorProps(e) } }, flow)];
    }
    case "figure": {
      if (c.includes("callout")) return parseBlock(Object.assign(e, { tagName: "ASIDE" }) as HTMLElement);
      if (c.includes("equation")) { const tex = e.querySelector("[data-tex]")?.getAttribute("data-tex") ?? e.querySelector("annotation")?.text ?? e.text.trim(); return [{ type: "equation", props: { expression: decodeEntities(tex) } }]; }
      if (c.includes("link-to-page")) { const a = e.querySelector("a"); return [{ type: "paragraph", text: htmlInline(a ? [a] : e.childNodes) }]; }
      const img = e.querySelector("img");
      if (img) {
        const capEl = e.querySelector("figcaption");
        const cap = capEl ? htmlInline(capEl.childNodes) : [];
        return [{ type: "image", props: { url: decodeEntities(img.getAttribute("src") ?? ""), ...(cap.length ? { caption: cap } : {}) } }];
      }
      return parseFlow(e.childNodes);
    }
    case "img": return [{ type: "image", props: { url: decodeEntities(e.getAttribute("src") ?? "") } }];
    case "table": {
      const rows = e.querySelectorAll("tr");
      const cells = rows.map((r) => r.childNodes.filter((n) => { const t = el(n)?.tagName?.toLowerCase(); return t === "td" || t === "th"; }).map((n) => el(n)!));
      const width = Math.max(0, ...cells.map((r) => r.length));
      const hasColumnHeader = cells[0]?.length ? cells[0].every((x) => x.tagName.toLowerCase() === "th") : false;
      const hasRowHeader = cells.length > 1 && cells.slice(hasColumnHeader ? 1 : 0).every((r) => r[0]?.tagName.toLowerCase() === "th");
      return [{ type: "table", props: { width, hasColumnHeader, hasRowHeader }, children: cells.map((r) => ({ type: "table_row", props: { cells: Array.from({ length: width }, (_, i) => r[i] ? htmlInline(r[i]!.childNodes) : []) } })) }];
    }
    case "details": {
      const sum = e.childNodes.find((n) => el(n)?.tagName?.toLowerCase() === "summary");
      const rest = e.childNodes.filter((n) => n !== sum);
      const kids = rest.flatMap((n) => { const x = el(n); return x && x.tagName.toLowerCase() === "div" && cls(x).includes("indented") ? parseFlow(x.childNodes) : parseFlow([n]); });
      return [withKids({ type: "toggle", text: sum ? htmlInline(el(sum)!.childNodes) : [] }, kids)];
    }
    case "ul": case "ol": {
      const items = e.childNodes.filter((n) => el(n)?.tagName?.toLowerCase() === "li").map((n) => el(n)!);
      return items.flatMap((li): BlockInput[] => {
        const details = li.childNodes.find((n) => el(n)?.tagName?.toLowerCase() === "details");
        if (c.includes("toggle") || (details && li.childNodes.filter((n) => el(n) || n.text.trim()).length === 1)) return details ? parseBlock(el(details)!) : [{ type: "toggle", text: htmlInline(li.childNodes) }];
        const box = li.querySelector("input") ?? li.querySelector(".checkbox");
        const isTodo = c.includes("to-do-list") || (box && box.tagName.toLowerCase() === "input" && box.getAttribute("type") === "checkbox" && li.childNodes.indexOf(box) <= 1);
        const { text, kids } = liParts(li);
        if (isTodo) {
          const checked = box ? (box.tagName.toLowerCase() === "input" && box.hasAttribute("checked")) || cls(box).includes("checkbox-on") : false;
          return [withKids({ type: "to_do", text, props: { checked } }, kids)];
        }
        return [withKids({ type: tag === "ol" ? "numbered_list_item" : "bulleted_list_item", text, ...props(colorProps(e)) }, kids)];
      });
    }
    case "li": return parseBlock(Object.assign(parse(`<ul>${e.outerHTML}</ul>`).firstChild as HTMLElement));
    case "summary": return [{ type: "paragraph", text: htmlInline(e.childNodes) }];
    case "div": {
      if (c.includes("column-list")) {
        const cols = e.childNodes.filter((n) => el(n) && cls(el(n)!).includes("column")).map((n) => el(n)!);
        return [{ type: "column_list", children: cols.map((col) => {
          const w = styleOf(col).match(/width:([\d.]+)%/);
          return withKids({ type: "column", ...(w ? { props: { ratio: Number(w[1]) / 100 } } : {}) }, parseFlow(col.childNodes));
        }) }];
      }
      return parseFlow(e.childNodes);
    }
    default: return parseFlow(e.childNodes);
  }
}

function props(p: Record<string, unknown>): { props?: Record<string, unknown> } {
  return Object.keys(p).length ? { props: p } : {};
}

export function htmlToBlocks(html: string): BlockInput[] {
  const cleaned = html.replace(/<!--[\s\S]*?-->/g, "").replace(/^\s*<meta[^>]*>/i, "");
  const root = parse(cleaned, { comment: false, blockTextElements: { script: false, style: false, pre: true } });
  const body = root.querySelector(".page-body") ?? root.querySelector("body") ?? root;
  return parseFlow(body.childNodes);
}

export function parseExportHtml(html: string): { title: string; blocks: BlockInput[]; icon?: string } {
  const root = parse(html);
  const title = root.querySelector(".page-title")?.text.trim() ?? root.querySelector("title")?.text.trim() ?? "";
  const icon = root.querySelector(".page-header-icon .icon")?.text.trim();
  return { title: decodeEntities(title), blocks: htmlToBlocks(html), ...(icon ? { icon } : {}) };
}
