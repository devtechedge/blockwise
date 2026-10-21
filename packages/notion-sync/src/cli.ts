#!/usr/bin/env node
/**
 * blockwise-sync pull <page-url-or-id> [out.md]
 * blockwise-sync push <file.md> <parent-page-url-or-id>
 * Reads the token from NOTION_TOKEN. Nothing is written anywhere except the output file.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { buildDoc, getBlock, plain, toInput } from "@blockwise/core";
import { createNotionApi } from "./client.js";
import { parsePageId, pullPage, pushPage, throttled } from "./sync.js";

async function main(argv: string[]): Promise<number> {
  const [cmd, a, b] = argv;
  const token = process.env.NOTION_TOKEN;
  if (!cmd || !a || !token) {
    console.error("usage: NOTION_TOKEN=... blockwise-sync pull <page> [out.json] | push <doc.json> <parent-page>");
    return 2;
  }
  const api = throttled(createNotionApi(token));
  if (cmd === "pull") {
    const id = parsePageId(a);
    if (!id) { console.error("not a page id or URL: " + a); return 2; }
    const { doc, childPages } = await pullPage(api, id);
    const json = JSON.stringify({ title: plain(getBlock(doc, doc.rootId).text), blocks: getBlock(doc, doc.rootId).children.map((c) => toInput(doc, c, false)), childPages }, null, 2);
    if (b) writeFileSync(b, json + "\n"); else console.log(json);
    return 0;
  }
  if (cmd === "push" && b) {
    const parent = parsePageId(b);
    if (!parent) { console.error("not a page id or URL: " + b); return 2; }
    const src = JSON.parse(readFileSync(a, "utf8")) as { title: string; blocks: never[] };
    const res = await pushPage(api, buildDoc(src.title, src.blocks), parent);
    console.log(`created page ${res.pageId} with ${res.blocks} blocks`);
    return 0;
  }
  console.error("unknown command " + cmd);
  return 2;
}

main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error(String(e?.message ?? e)); process.exit(1); });
