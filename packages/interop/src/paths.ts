import { compactId } from "@blockwise/core";

/** File name rules seen in Notion exports: "Title <32 hex>.ext", unsafe characters dropped. */
export function safeName(title: string): string {
  const t = title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 50).trim();
  return t || "Untitled";
}

export function exportBase(title: string, id: string): string {
  return `${safeName(title)} ${compactId(id)}`;
}

const ID_SUFFIX = /^(.*?)\s([0-9a-f]{32})(_all)?$/i;

/** Split "Title 0123abcd...ef" into title and id; ids are optional in some exports. */
export function splitBase(base: string): { title: string; id: string | null; all: boolean } {
  const m = base.match(ID_SUFFIX);
  if (m) return { title: m[1]!, id: m[2]!.toLowerCase(), all: Boolean(m[3]) };
  const all = base.endsWith("_all");
  return { title: all ? base.slice(0, -4) : base, id: null, all };
}

export function encodePath(p: string): string {
  return p.split("/").map((s) => encodeURIComponent(s).replace(/%20/g, "%20")).join("/");
}
