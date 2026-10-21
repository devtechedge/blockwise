import type { BlockInput, Doc, Workspace } from "@blockwise/core";
import { childPages, getBlock, pageTitle, plain, toInput } from "@blockwise/core";
import { toNotionCsv, type Database } from "@blockwise/database";
import { pageToHtml, pageToMarkdown } from "@blockwise/notion-format";
import { strToU8, zipSync, type Zippable } from "fflate";
import { encodePath, exportBase } from "./paths.js";

export type ExportFormat = "markdown" | "html";

function dataUrlToBytes(url: string): { bytes: Uint8Array; ext: string } | null {
  const m = url.match(/^data:([a-z]+\/([a-z0-9.+-]+));base64,(.*)$/i);
  if (!m) return null;
  const bin = atob(m[3]!);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, ext: m[2] === "jpeg" ? "jpg" : m[2]!.replace("svg+xml", "svg") };
}

/** Build the file map for a Notion style export. Paths are POSIX, relative to the zip root. */
export function exportFiles(ws: Workspace, format: ExportFormat, roots: string[] = childPages(ws, null)): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  const ext = format === "markdown" ? "md" : "html";

  const writePage = (id: string, dir: string) => {
    const doc = ws.pages[id] as Doc;
    const title = pageTitle(ws, id);
    const base = exportBase(title, id);
    const folder = dir + base + "/";
    let imageCount = 0;
    const imagePath = (url: string) => {
      const data = dataUrlToBytes(url);
      if (!data) return url;
      imageCount++;
      const name = `image${imageCount === 1 ? "" : " " + imageCount}.${data.ext}`;
      files[folder + name] = data.bytes;
      return encodePath(base + "/" + name);
    };
    const blocks: BlockInput[] = getBlock(doc, doc.rootId).children.map((c) => toInput(doc, c, true));
    // Database blocks become CSV files plus a link, like Notion's export.
    const rewrite = (list: BlockInput[]): BlockInput[] => list.map((b) => {
      if (b.type === "database" && b.props?.databaseId) {
        const db = ws.databases[b.props.databaseId] as Database | undefined;
        if (db) {
          const dbBase = exportBase(db.title, db.id);
          const csv = toNotionCsv(db);
          files[folder + dbBase + ".csv"] = strToU8(csv);
          files[folder + dbBase + "_all.csv"] = strToU8(csv);
          return { type: "paragraph", text: [{ text: db.title, marks: { link: encodePath(base + "/" + dbBase + ".csv") } }] };
        }
      }
      return b.children ? { ...b, children: rewrite(b.children) } : b;
    });
    const body = rewrite(blocks);
    for (const child of childPages(ws, id)) body.push({ type: "paragraph", text: [{ text: pageTitle(ws, child), marks: { link: encodePath(base + "/" + exportBase(pageTitle(ws, child), child) + "." + ext) } }] });
    const icon = getBlock(doc, doc.rootId).props.icon;
    const content = format === "markdown"
      ? pageToMarkdown(title, body, {}, { imagePath, detailsToggles: true })
      : pageToHtml(title, body, { imagePath, id, ...(icon ? { icon } : {}) });
    files[dir + base + "." + ext] = strToU8(content);
    for (const child of childPages(ws, id)) writePage(child, folder);
  };
  for (const r of roots) writePage(r, "");
  void plain;
  return files;
}

export function exportZip(ws: Workspace, format: ExportFormat, roots?: string[]): Uint8Array {
  const files = exportFiles(ws, format, roots);
  const z: Zippable = {};
  // Fixed timestamp keeps zips reproducible.
  for (const [p, bytes] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) z[p] = [bytes, { mtime: new Date("2026-01-01T00:00:00Z") }];
  return zipSync(z, { level: 6 });
}
