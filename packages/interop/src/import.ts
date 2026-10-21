import type { BlockInput, Workspace } from "@blockwise/core";
import { addPage, buildDoc, dashedId, emptyWorkspace, uuid } from "@blockwise/core";
import { fromNotionCsv, type Database } from "@blockwise/database";
import { parseExportHtml, parseExportPage } from "@blockwise/notion-format";
import { strFromU8, unzipSync } from "fflate";
import { splitBase } from "./paths.js";

export interface ImportReport {
  pages: number;
  databases: number;
  images: number;
  skipped: string[];
}

function mimeOf(path: string): string {
  const e = path.split(".").pop()!.toLowerCase();
  return ({ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml" } as Record<string, string>)[e] ?? "application/octet-stream";
}

function toDataUrl(bytes: Uint8Array, mime: string): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${mime};base64,${btoa(s)}`;
}

/** Import a Notion "Markdown & CSV" or "HTML" export (one zip, or one part of a split export). */
export function importNotionFiles(files: Record<string, Uint8Array>, into: Workspace = emptyWorkspace()): { workspace: Workspace; report: ImportReport } {
  const report: ImportReport = { pages: 0, databases: 0, images: 0, skipped: [] };
  let ws = into;
  const paths = Object.keys(files).filter((p) => !p.endsWith("/") && !p.startsWith("__MACOSX/")).sort();
  // Nested zips (Notion wraps large exports) are flattened first.
  for (const p of paths) {
    if (p.toLowerCase().endsWith(".zip")) {
      const inner = unzipSync(files[p]!);
      return importNotionFiles({ ...Object.fromEntries(Object.entries(files).filter(([k]) => k !== p)), ...inner }, into);
    }
  }
  const pageFiles = paths.filter((p) => /\.(md|html)$/i.test(p));
  const csvFiles = paths.filter((p) => /\.csv$/i.test(p));
  // A page file "dir/Title id.md" owns folder "dir/Title id/".
  const idForPath = new Map<string, string>();
  const folderOwner = new Map<string, string>();
  for (const p of pageFiles) {
    const base = p.replace(/\.(md|html)$/i, "");
    const { id } = splitBase(base.split("/").pop()!);
    const pid = id ? dashedId(id) : uuid();
    idForPath.set(p, pid);
    folderOwner.set(base + "/", pid);
  }
  const parentOf = (p: string): string | null => {
    const dir = p.slice(0, p.lastIndexOf("/") + 1);
    return folderOwner.get(dir) ?? null;
  };
  const resolveAsset = (pagePath: string, href: string): Uint8Array | null => {
    if (/^[a-z]+:/i.test(href)) return null;
    let rel: string;
    try { rel = decodeURIComponent(href); } catch { rel = href; }
    const dir = pagePath.slice(0, pagePath.lastIndexOf("/") + 1);
    const parts = (dir + rel).split("/");
    const out: string[] = [];
    for (const s of parts) { if (s === "..") out.pop(); else if (s !== ".") out.push(s); }
    return files[out.join("/")] ?? null;
  };
  // Databases first so pages can link to them.
  const dbByCsv = new Map<string, Database>();
  const csvBases = new Map<string, string>();
  for (const p of csvFiles) {
    const base = p.replace(/\.csv$/i, "");
    const { all } = splitBase(base.split("/").pop()!);
    const key = all ? base.replace(/_all$/, "") : base;
    // Prefer the _all variant: it contains every row.
    if (!csvBases.has(key) || all) csvBases.set(key, p);
  }
  for (const [key, p] of csvBases) {
    const { title, id } = splitBase(key.split("/").pop()!);
    const db = fromNotionCsv(title, strFromU8(files[p]!));
    if (id) db.id = dashedId(id);
    ws = { ...ws, databases: { ...ws.databases, [db.id]: db } };
    dbByCsv.set(key, db);
    report.databases++;
  }
  // Pages in path order so parents exist before children.
  const ordered = [...pageFiles].sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));
  for (const p of ordered) {
    const src = strFromU8(files[p]!);
    const isHtml = /\.html$/i.test(p);
    let title: string;
    let blocks: BlockInput[];
    let icon: string | undefined;
    let properties: Record<string, string> = {};
    if (isHtml) ({ title, blocks, icon } = parseExportHtml(src));
    else ({ title, blocks, properties } = parseExportPage(src));
    if (!title) title = splitBase(p.split("/").pop()!.replace(/\.(md|html)$/i, "")).title;
    const fix = (list: BlockInput[]): BlockInput[] => list.flatMap((b): BlockInput[] => {
      if (b.type === "image" && b.props?.url) {
        const bytes = resolveAsset(p, b.props.url);
        if (bytes) { report.images++; return [{ ...b, props: { ...b.props, url: toDataUrl(bytes, mimeOf(b.props.url)) } }]; }
      }
      // A lone link to a CSV becomes a database block.
      const only = b.type === "paragraph" && b.text?.length === 1 ? b.text[0] : undefined;
      const link = only?.marks?.link;
      if (link && /\.csv$/i.test(decodeURIComponent(link))) {
        const dir = p.slice(0, p.lastIndexOf("/") + 1);
        const key = (dir + decodeURIComponent(link)).replace(/\.csv$/i, "").replace(/_all$/, "");
        const db = dbByCsv.get(key);
        if (db) return [{ type: "database", text: [{ text: db.title }], props: { databaseId: db.id } }];
      }
      // Links to child pages are shown by the sidebar; drop them from the body.
      if (link && /\.(md|html)$/i.test(decodeURIComponent(link)) && !/^[a-z]+:/i.test(link)) return [];
      return [b.children ? { ...b, children: fix(b.children) } : b];
    });
    blocks = fix(blocks);
    if (Object.keys(properties).length) blocks.unshift({ type: "callout", text: [{ text: Object.entries(properties).map(([k, v]) => `${k}: ${v}`).join("\n") }], props: { icon: "\u{1F5C2}\uFE0F" } });
    const id = idForPath.get(p)!;
    const doc = buildDoc(title, blocks, id);
    if (icon) doc.blocks[doc.rootId]!.props.icon = icon;
    ws = addPage(ws, doc, parentOf(p));
    report.pages++;
  }
  for (const p of paths) if (!/\.(md|html|csv|png|jpe?g|gif|webp|svg)$/i.test(p)) report.skipped.push(p);
  return { workspace: ws, report };
}

export function importNotionZip(zip: Uint8Array, into?: Workspace): { workspace: Workspace; report: ImportReport } {
  return importNotionFiles(unzipSync(zip), into);
}
