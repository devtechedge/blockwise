import { describe, expect, it } from "vitest";
import { childPages, getBlock, pageTitle, plain, toInput, type BlockInput, type Workspace } from "@blockwise/core";
import type { Database } from "@blockwise/database";
import { zipSync } from "fflate";
import { importNotionFiles, importNotionZip } from "../src/import.js";
import { readTree } from "./helpers.js";

const body = (ws: Workspace, id: string): BlockInput[] => { const d = ws.pages[id]!; return getBlock(d, d.rootId).children.map((c) => toInput(d, c, false)); };
const types = (bs: BlockInput[]) => bs.map((b) => b.type);

describe("import Markdown & CSV export", () => {
  const { workspace: ws, report } = importNotionZip(zipSync(readTree("markdown-csv")));
  const [wiki] = childPages(ws, null);

  it("builds the page tree from file and folder names", () => {
    expect(report).toEqual({ pages: 2, databases: 1, images: 1, skipped: [] });
    expect(wiki).toBe("1e2f3a4b-5c6d-4e7f-8a9b-0c1d2e3f4a5b");
    expect(pageTitle(ws, wiki!)).toBe("Team Wiki");
    expect(childPages(ws, wiki!).map((c) => pageTitle(ws, c))).toEqual(["Onboarding"]);
  });
  it("parses every block type", () => {
    expect(types(body(ws, wiki!))).toEqual([
      "paragraph", "heading_2", "bulleted_list_item", "bulleted_list_item", "numbered_list_item", "numbered_list_item",
      "to_do", "to_do", "callout", "quote", "code", "divider", "table", "image", "database",
    ]);
    const b = body(ws, wiki!);
    expect(b[0]!.text).toEqual([{ text: "Welcome to the " }, { text: "team wiki", marks: { bold: true } }, { text: ". Start with the " }, { text: "onboarding guide", marks: { link: "https://example.com/onboarding" } }, { text: "." }]);
    expect(b[2]!.children?.[0]?.text).toEqual([{ text: "Keep it under " }, { text: "15 minutes", marks: { italic: true } }]);
    expect(b[10]).toEqual({ type: "code", text: [{ text: 'def greet(name):\n    return f"Hello, {name}"' }], props: { language: "python" } });
    expect(b[13]!.props?.url).toMatch(/^data:image\/png;base64,iVBOR/);
  });
  it("reads the database from the _all CSV", () => {
    const db = Object.values(ws.databases)[0] as Database;
    expect(db.title).toBe("Tasks");
    expect(db.rows).toHaveLength(4);
    expect(db.properties.map((p) => p.type)).toEqual(["title", "select", "multi_select", "number", "date", "checkbox"]);
  });
  it("keeps page properties as a callout", () => {
    const [onboarding] = childPages(ws, wiki!);
    const b = body(ws, onboarding!);
    expect(b[0]).toEqual({ type: "callout", text: [{ text: "Owner: Ada\nStatus: Ready" }], props: { icon: "\u{1F5C2}\uFE0F" } });
    expect(types(b.slice(1))).toEqual(["paragraph", "to_do", "to_do"]);
  });
});

describe("import HTML export", () => {
  const { workspace: ws, report } = importNotionFiles(readTree("html"));
  const [page] = childPages(ws, null);
  it("parses the page, icon and blocks", () => {
    expect(report.pages).toBe(1);
    expect(report.images).toBe(1);
    expect(pageTitle(ws, page!)).toBe("Recipes");
    expect(getBlock(ws.pages[page!]!, page!).props.icon).toBe("\u{1F373}");
    const b = body(ws, page!);
    expect(types(b)).toEqual(["heading_2", "paragraph", "bulleted_list_item", "bulleted_list_item", "numbered_list_item", "numbered_list_item", "to_do", "to_do", "toggle", "callout", "quote", "code", "divider", "table", "image", "paragraph"]);
    expect(b[3]!.children?.[0]?.text).toEqual([{ text: "room temperature" }]);
    expect(b[6]!.props?.checked).toBe(true);
    expect(b[7]!.props?.checked).toBe(false);
    expect(b[9]).toEqual({ type: "callout", text: [{ text: "Hot pan!" }], props: { icon: "\u26a0\ufe0f", color: "gray_background" } });
    expect(b[11]).toEqual({ type: "code", text: [{ text: "const stack = pancakes.map(p => p * 2);" }], props: { language: "javascript" } });
    expect(b[13]!.children?.[1]?.props?.cells?.map(plain)).toEqual(["Flour", "200"]);
    expect(b[15]!.text).toEqual([{ text: "Do not", marks: { color: "red" } }, { text: " skip the salt." }]);
  });
});
