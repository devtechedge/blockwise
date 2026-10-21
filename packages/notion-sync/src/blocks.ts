import type { BlockInput } from "@blockwise/core";
import { plain } from "@blockwise/core";
import { fromApiRichText, toApiRichText, type ApiRichText } from "./rich-text.js";

/** A block object as returned by GET /v1/blocks/{id}/children (subset). */
export interface ApiBlock {
  object?: "block";
  id: string;
  type: string;
  has_children?: boolean;
  [key: string]: unknown;
}

/** Notion API language names are lower case and match ours for common ones. */
const API_LANGUAGES = new Set(["abap", "arduino", "bash", "basic", "c", "clojure", "coffeescript", "c++", "c#", "css", "dart", "diff", "docker", "elixir", "elm", "erlang", "flow", "fortran", "f#", "gherkin", "glsl", "go", "graphql", "groovy", "haskell", "html", "java", "javascript", "json", "julia", "kotlin", "latex", "less", "lisp", "livescript", "lua", "makefile", "markdown", "markup", "matlab", "mermaid", "nix", "objective-c", "ocaml", "pascal", "perl", "php", "plain text", "powershell", "prolog", "protobuf", "python", "r", "reason", "ruby", "rust", "sass", "scala", "scheme", "scss", "shell", "sql", "swift", "typescript", "vb.net", "verilog", "vhdl", "visual basic", "webassembly", "xml", "yaml", "java/c/c++/c#"]);

export function apiLanguage(l?: string): string {
  const x = (l ?? "plain text").toLowerCase();
  return API_LANGUAGES.has(x) ? x : "plain text";
}

/** Convert one API block (children supplied separately) into our input form. */
export function fromApiBlock(b: ApiBlock, children: BlockInput[] = []): BlockInput | null {
  const body = (b[b.type] ?? {}) as Record<string, unknown>;
  const rt = (k = "rich_text") => fromApiRichText(body[k] as ApiRichText[] | undefined);
  const color = typeof body.color === "string" && body.color !== "default" ? { color: body.color } : {};
  const withKids = (x: BlockInput): BlockInput => (children.length ? { ...x, children } : x);
  const text = (x: BlockInput): BlockInput => { const t = rt(); return t.length ? { ...x, text: t } : x; };
  switch (b.type) {
    case "paragraph": case "heading_1": case "heading_2": case "heading_3": case "bulleted_list_item": case "numbered_list_item": case "toggle": case "quote":
      return withKids(text({ type: b.type, ...(Object.keys(color).length ? { props: color as never } : {}) }));
    case "to_do": return withKids(text({ type: "to_do", props: { checked: Boolean(body.checked), ...(color as object) } }));
    case "callout": {
      const icon = body.icon as { type?: string; emoji?: string } | undefined;
      return withKids(text({ type: "callout", props: { icon: icon?.type === "emoji" && icon.emoji ? icon.emoji : "\u{1F4A1}", ...(color as object) } }));
    }
    case "code": {
      const cap = rt("caption");
      return { type: "code", ...(rt().length ? { text: [{ text: plain(rt()) }] } : {}), props: { language: String(body.language ?? "plain text"), ...(cap.length ? { caption: cap } : {}) } };
    }
    case "divider": return { type: "divider" };
    case "equation": return { type: "equation", props: { expression: String(body.expression ?? "") } };
    case "image": {
      const file = (body.type === "external" ? body.external : body.file) as { url?: string } | undefined;
      const cap = rt("caption");
      return { type: "image", props: { url: file?.url ?? "", ...(cap.length ? { caption: cap } : {}) } };
    }
    case "table": return { type: "table", props: { width: Number(body.table_width ?? 0), hasColumnHeader: Boolean(body.has_column_header), hasRowHeader: Boolean(body.has_row_header) }, children };
    case "table_row": return { type: "table_row", props: { cells: ((body.cells ?? []) as ApiRichText[][]).map(fromApiRichText) } };
    case "column_list": return { type: "column_list", children };
    case "column": return withKids({ type: "column" });
    case "child_page": return null; // child pages become separate pages
    default: {
      // Unsupported blocks keep any text they have so nothing silently disappears.
      const t = rt();
      return t.length ? withKids({ type: "paragraph", text: t }) : null;
    }
  }
}

/** Our block to an API block object for append (children attached by the caller). */
export function toApiBlock(b: BlockInput): Record<string, unknown> | null {
  const rich = toApiRichText(b.text ?? []);
  const color = b.props?.color ? { color: b.props.color } : {};
  switch (b.type) {
    case "paragraph": case "heading_1": case "heading_2": case "heading_3": case "bulleted_list_item": case "numbered_list_item": case "toggle": case "quote":
      return { type: b.type, [b.type]: { rich_text: rich, ...color } };
    case "to_do": return { type: "to_do", to_do: { rich_text: rich, checked: Boolean(b.props?.checked), ...color } };
    case "callout": return { type: "callout", callout: { rich_text: rich, icon: { type: "emoji", emoji: b.props?.icon ?? "\u{1F4A1}" }, ...color } };
    case "code": return { type: "code", code: { rich_text: rich, language: apiLanguage(b.props?.language), ...(b.props?.caption ? { caption: toApiRichText(b.props.caption) } : {}) } };
    case "divider": return { type: "divider", divider: {} };
    case "equation": return { type: "equation", equation: { expression: b.props?.expression ?? "" } };
    case "image": {
      const url = b.props?.url ?? "";
      if (!/^https?:\/\//.test(url)) return { type: "paragraph", paragraph: { rich_text: toApiRichText([{ text: "[image not uploaded: only external URLs can be synced]" }]) } };
      return { type: "image", image: { type: "external", external: { url }, ...(b.props?.caption ? { caption: toApiRichText(b.props.caption) } : {}) } };
    }
    case "table": return { type: "table", table: { table_width: b.props?.width ?? 1, has_column_header: Boolean(b.props?.hasColumnHeader), has_row_header: Boolean(b.props?.hasRowHeader) } };
    case "table_row": return { type: "table_row", table_row: { cells: (b.props?.cells ?? []).map(toApiRichText) } };
    case "column_list": return { type: "column_list", column_list: {} };
    case "column": return { type: "column", column: {} };
    default: return rich.length ? { type: "paragraph", paragraph: { rich_text: rich } } : null;
  }
}
