import { describe, expect, it } from "vitest";
import { childPages, getBlock, normalize, pageTitle, toInput, type Span, type Workspace } from "@blockwise/core";
import { unzipSync, zipSync } from "fflate";
import { exportZip } from "../src/export.js";
import { importNotionZip } from "../src/import.js";
import { readTree } from "./helpers.js";

/** Markdown has no syntax for colours, so those are compared without them. */
const dropColors = (v: unknown): unknown => JSON.parse(JSON.stringify(v, (k, x) => {
  if (k === "color") return undefined;
  if ((k === "text" || k === "caption") && Array.isArray(x)) return normalize(x.map((s: Span) => ({ ...s, marks: { ...s.marks, color: undefined } })));
  return x;
}));

function snapshot(ws: Workspace) {
  const walk = (parent: string | null): unknown[] => childPages(ws, parent).map((id) => {
    const d = ws.pages[id]!;
    return { id, title: pageTitle(ws, id), blocks: getBlock(d, d.rootId).children.map((c) => toInput(d, c, false)), children: walk(id) };
  });
  return { pages: walk(null), databases: Object.values(ws.databases).map((d) => JSON.parse(JSON.stringify(d, (k, v) => (k === "id" && typeof v === "string" && v.length === 36 ? undefined : v)))) };
}

describe("export then import is lossless", () => {
  for (const source of ["markdown-csv", "html"]) {
    for (const format of ["markdown", "html"] as const) {
      it(`${source} fixture through ${format}`, () => {
        const first = importNotionZip(zipSync(readTree(source))).workspace;
        const zip = exportZip(first, format);
        const second = importNotionZip(zip).workspace;
        if (format === "markdown") expect(dropColors(snapshot(second))).toEqual(dropColors(snapshot(first)));
        else expect(snapshot(second)).toEqual(snapshot(first));
      });
    }
  }
  it("writes Notion style paths", () => {
    const ws = importNotionZip(zipSync(readTree("markdown-csv"))).workspace;
    expect(Object.keys(unzipSync(exportZip(ws, "markdown"))).sort()).toEqual([
      "Team Wiki 1e2f3a4b5c6d4e7f8a9b0c1d2e3f4a5b.md",
      "Team Wiki 1e2f3a4b5c6d4e7f8a9b0c1d2e3f4a5b/Onboarding 2b3c4d5e6f7a48b9c0d1e2f3a4b5c6d7.md",
      "Team Wiki 1e2f3a4b5c6d4e7f8a9b0c1d2e3f4a5b/Tasks 9a8b7c6d5e4f40312a1b2c3d4e5f6a7b.csv",
      "Team Wiki 1e2f3a4b5c6d4e7f8a9b0c1d2e3f4a5b/Tasks 9a8b7c6d5e4f40312a1b2c3d4e5f6a7b_all.csv",
      "Team Wiki 1e2f3a4b5c6d4e7f8a9b0c1d2e3f4a5b/image.png",
    ]);
  });
  it("produces reproducible zips", () => {
    const ws = importNotionZip(zipSync(readTree("markdown-csv"))).workspace;
    expect(exportZip(ws, "markdown")).toEqual(exportZip(ws, "markdown"));
  });
});
