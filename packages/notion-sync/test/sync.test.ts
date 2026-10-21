import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildDoc, getBlock, plain, text, toInput, type BlockInput } from "@blockwise/core";
import { parsePageId, pullPage, pushPage, throttled } from "../src/sync.js";
import { createNotionApi } from "../src/client.js";
import { FakeNotion } from "./fake-notion.js";

const fixture = JSON.parse(readFileSync(new URL("../fixtures/api-page.json", import.meta.url), "utf8"));
const PAGE = "11111111-2222-4333-8444-555555555555";
const fast = { minIntervalMs: 0, sleep: async () => {} };
const body = (d: ReturnType<typeof buildDoc>) => getBlock(d, d.rootId).children.map((c) => toInput(d, c, false));

describe("pull", () => {
  it("reads a page with nested blocks, tables, mentions and child pages", async () => {
    const { doc, childPages } = await pullPage(new FakeNotion(fixture), PAGE);
    expect(plain(getBlock(doc, doc.rootId).text)).toBe("Sync demo");
    expect(getBlock(doc, doc.rootId).props.icon).toBe("\u{1F4D3}");
    expect(childPages).toEqual([{ id: "b0000000-0000-4000-8000-000000000009", title: "Nested page" }]);
    const b = body(doc);
    expect(b.map((x) => x.type)).toEqual(["heading_1", "paragraph", "bulleted_list_item", "to_do", "callout", "code", "equation", "table", "divider", "paragraph"]);
    expect(b[1]!.text).toEqual([{ text: "Pulled with the " }, { text: "official API", marks: { bold: true } }, { text: ", see " }, { text: "docs", marks: { link: "https://developers.notion.com" } }]);
    expect(b[2]!.children).toEqual([{ type: "bulleted_list_item", text: text("child item", { italic: true }) }]);
    expect(b[4]).toEqual({ type: "callout", text: text("Heads up"), props: { icon: "\u26a0\ufe0f", color: "yellow_background" } });
    expect(b[7]!.children?.[1]?.props?.cells).toEqual([text("a"), text("1", { code: true })]);
    expect(b[9]!.text).toEqual([{ text: "x", equation: "x" }, { text: " and " }, { text: "\u2023", mention: { kind: "date", start: "2026-10-21" } }]);
  });
  it("follows pagination cursors", async () => {
    const api = new FakeNotion(fixture);
    api.pageSize = 3;
    const { doc } = await pullPage(api, PAGE);
    expect(body(doc)).toHaveLength(10);
    expect(api.calls.filter((c) => c.method === "blocks.children.list" && c.id === PAGE)).toHaveLength(4);
  });
});

describe("push", () => {
  it("creates a page whose content pulls back identically", async () => {
    const source = await pullPage(new FakeNotion(fixture), PAGE);
    const api = new FakeNotion();
    api.pagesById.set("parent", { id: "parent" });
    const { pageId } = await pushPage(api, source.doc, "parent");
    const again = await pullPage(api, pageId);
    expect(body(again.doc)).toEqual(body(source.doc));
    expect(plain(getBlock(again.doc, again.doc.rootId).text)).toBe("Sync demo");
  });
  it("splits more than 100 blocks into several appends and nests deep trees", async () => {
    let deep: BlockInput = { type: "bulleted_list_item", text: text("level 5") };
    for (let i = 4; i >= 1; i--) deep = { type: "bulleted_list_item", text: text("level " + i), children: [deep] };
    const many: BlockInput[] = Array.from({ length: 230 }, (_, i) => ({ type: "paragraph", text: text("p" + i) }));
    const doc = buildDoc("Big", [...many, deep, { type: "column_list", children: [
      { type: "column", children: [{ type: "toggle", text: text("t"), children: [{ type: "paragraph", text: text("inside") }] }] },
      { type: "column", children: [{ type: "paragraph", text: text("right") }] },
    ] }]);
    const api = new FakeNotion();
    const { pageId, blocks } = await pushPage(api, doc, "parent");
    expect(api.calls.filter((c) => c.method === "blocks.children.append" && c.id === pageId).map((c) => c.size)).toEqual([100, 100, 32]);
    expect(blocks).toBe(230 + 5 + 1 + 2 + 2 + 1);
    expect(body((await pullPage(api, pageId)).doc)).toEqual(body(doc));
  });
  it("replaces local images with a note because the API only takes external URLs", async () => {
    const api = new FakeNotion();
    const { pageId } = await pushPage(api, buildDoc("Img", [{ type: "image", props: { url: "data:image/png;base64,AAAA" } }]), "parent");
    expect(plain(body((await pullPage(api, pageId)).doc)[0]!.text ?? [])).toMatch(/only external URLs/);
  });
});

describe("transport", () => {
  it("retries rate limited calls", async () => {
    const api = new FakeNotion(fixture);
    api.failNext429 = 2;
    const { doc } = await pullPage(throttled(api, fast), PAGE);
    expect(body(doc)).toHaveLength(10);
  });
  it("gives up after the retry budget", async () => {
    const api = new FakeNotion(fixture);
    api.failNext429 = 10;
    await expect(pullPage(throttled(api, { ...fast, maxRetries: 2 }), PAGE)).rejects.toMatchObject({ code: "rate_limited" });
  });
  it("parses page ids from URLs", () => {
    expect(parsePageId("https://www.notion.so/acme/Sync-demo-11111111222243338444555555555555?pvs=4")).toBe(PAGE);
    expect(parsePageId(PAGE)).toBe(PAGE);
    expect(parsePageId("nope")).toBeNull();
  });
  it("works through the official client with a mocked fetch", async () => {
    const seen: string[] = [];
    const fakeFetch = async (url: string | URL, init?: { method?: string; headers?: Record<string, string> }) => {
      const u = new URL(String(url));
      seen.push(`${init?.method ?? "GET"} ${u.pathname}`);
      expect(init?.headers?.authorization ?? init?.headers?.Authorization).toBe("Bearer test-token-not-real");
      const m = u.pathname.match(/^\/v1\/blocks\/([^/]+)\/children$/);
      const json = u.pathname === `/v1/pages/${PAGE}` ? fixture.page : m ? { object: "list", results: fixture.children[m[1]!] ?? [], has_more: false, next_cursor: null } : { object: "error", status: 404, code: "object_not_found", message: "nf" };
      return new Response(JSON.stringify(json), { status: json.object === "error" ? 404 : 200, headers: { "content-type": "application/json" } });
    };
    const { Client } = await import("@notionhq/client");
    const api = new Client({ auth: "test-token-not-real", fetch: fakeFetch as never }) as never;
    const { doc } = await pullPage(api, PAGE);
    expect(body(doc)).toHaveLength(10);
    expect(seen[0]).toBe(`GET /v1/pages/${PAGE}`);
    expect(typeof createNotionApi).toBe("function");
  });
});
