import type { BlockInput, Doc } from "@blockwise/core";
import { buildDoc, getBlock, plain, toInput } from "@blockwise/core";
import { fromApiBlock, toApiBlock, type ApiBlock } from "./blocks.js";
import { fromApiRichText, toApiRichText, type ApiRichText } from "./rich-text.js";

/**
 * The slice of @notionhq/client we use. Tests pass a fake built from recorded
 * fixtures; the app passes a real Client created with the user's own token.
 */
export interface NotionApi {
  pages: {
    retrieve(args: { page_id: string }): Promise<unknown>;
    create(args: { parent: { page_id: string }; properties: Record<string, unknown>; icon?: unknown }): Promise<unknown>;
  };
  blocks: {
    children: {
      list(args: { block_id: string; start_cursor?: string; page_size?: number }): Promise<unknown>;
      append(args: { block_id: string; children: unknown[] }): Promise<unknown>;
    };
  };
}

export interface SyncOptions {
  /** Minimum delay between requests. Notion allows about three requests per second. */
  minIntervalMs?: number;
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
}

interface ListResponse { results: ApiBlock[]; has_more: boolean; next_cursor: string | null }

const APPEND_LIMIT = 100;

/** Wrap every call with spacing and retry on HTTP 429 / rate_limited. */
export function throttled(api: NotionApi, opts: SyncOptions = {}): NotionApi {
  const min = opts.minIntervalMs ?? 340;
  const retries = opts.maxRetries ?? 5;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let last = 0;
  const call = async <T>(fn: () => Promise<T>): Promise<T> => {
    for (let attempt = 0; ; attempt++) {
      const wait = last + min - Date.now();
      if (wait > 0) await sleep(wait);
      last = Date.now();
      try { return await fn(); } catch (e) {
        const err = e as { code?: string; status?: number; headers?: Record<string, string> };
        if ((err.code === "rate_limited" || err.status === 429) && attempt < retries) { await sleep(1000 * 2 ** attempt); continue; }
        throw e;
      }
    }
  };
  return {
    pages: { retrieve: (a) => call(() => api.pages.retrieve(a)), create: (a) => call(() => api.pages.create(a)) },
    blocks: { children: { list: (a) => call(() => api.blocks.children.list(a)), append: (a) => call(() => api.blocks.children.append(a)) } },
  };
}

export async function listAll(api: NotionApi, blockId: string): Promise<ApiBlock[]> {
  const out: ApiBlock[] = [];
  let cursor: string | undefined;
  do {
    const res = (await api.blocks.children.list({ block_id: blockId, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) })) as ListResponse;
    out.push(...res.results);
    cursor = res.has_more && res.next_cursor ? res.next_cursor : undefined;
  } while (cursor);
  return out;
}

async function pullChildren(api: NotionApi, blockId: string, childPages: { id: string; title: string }[]): Promise<BlockInput[]> {
  const out: BlockInput[] = [];
  for (const b of await listAll(api, blockId)) {
    if (b.type === "child_page") { childPages.push({ id: b.id, title: String((b.child_page as { title?: string })?.title ?? "") }); continue; }
    const kids = b.has_children ? await pullChildren(api, b.id, childPages) : [];
    const input = fromApiBlock(b, kids);
    if (input) out.push(input);
  }
  return out;
}

export function titleOfPage(page: unknown): string {
  const props = ((page as { properties?: Record<string, { type?: string; title?: ApiRichText[] }> }).properties) ?? {};
  for (const p of Object.values(props)) if (p.type === "title" || Array.isArray(p.title)) return plain(fromApiRichText(p.title));
  return "Untitled";
}

export interface PulledPage { doc: Doc; childPages: { id: string; title: string }[] }

/** Read a page and all nested blocks. The doc root id is the Notion page id. */
export async function pullPage(api: NotionApi, pageId: string): Promise<PulledPage> {
  const page = await api.pages.retrieve({ page_id: pageId });
  const childPages: { id: string; title: string }[] = [];
  const blocks = await pullChildren(api, pageId, childPages);
  const doc = buildDoc(titleOfPage(page), blocks, (page as { id?: string }).id ?? pageId);
  const icon = (page as { icon?: { type?: string; emoji?: string } }).icon;
  if (icon?.type === "emoji" && icon.emoji) doc.blocks[doc.rootId]!.props.icon = icon.emoji;
  return { doc, childPages };
}

/** Blocks whose children must be sent in the same request that creates them. */
function withRequiredChildren(b: BlockInput): Record<string, unknown> | null {
  const api = toApiBlock(b);
  if (!api) return null;
  if (b.type === "table") {
    (api.table as Record<string, unknown>).children = (b.children ?? []).map(toApiBlock).filter(Boolean);
  }
  if (b.type === "column_list") {
    (api.column_list as Record<string, unknown>).children = (b.children ?? []).map((col) => ({
      type: "column",
      column: { children: (col.children?.length ? col.children : [{ type: "paragraph" as const }]).map(toApiBlock).filter(Boolean) },
    }));
  }
  return api;
}

async function appendTree(api: NotionApi, parentId: string, blocks: BlockInput[]): Promise<number> {
  let count = 0;
  const sendable = blocks.map((b) => [b, withRequiredChildren(b)] as const).filter(([, a]) => a !== null);
  for (let i = 0; i < sendable.length; i += APPEND_LIMIT) {
    const chunk = sendable.slice(i, i + APPEND_LIMIT);
    const res = (await api.blocks.children.append({ block_id: parentId, children: chunk.map(([, a]) => a) })) as { results: ApiBlock[] };
    count += chunk.length;
    for (let j = 0; j < chunk.length; j++) {
      const [b] = chunk[j]!;
      const created = res.results[j];
      if (!created || !b.children?.length) continue;
      if (b.type === "table") { count += b.children.length; continue; }
      if (b.type === "column_list") {
        // Columns were created with their first level; deeper levels are appended now.
        const cols = await listAll(api, created.id);
        for (let c = 0; c < cols.length; c++) {
          const colBlocks = b.children[c]?.children ?? [];
          count += colBlocks.length + 1;
          if (!colBlocks.some((x) => x.children?.length)) continue;
          const made = await listAll(api, cols[c]!.id);
          for (let k = 0; k < colBlocks.length; k++) if (colBlocks[k]!.children?.length && made[k]) count += await appendTree(api, made[k]!.id, colBlocks[k]!.children!);
        }
        continue;
      }
      count += await appendTree(api, created.id, b.children);
    }
  }
  return count;
}

/** Create a new page under `parentPageId` with the doc's content. Returns the new page id. */
export async function pushPage(api: NotionApi, doc: Doc, parentPageId: string): Promise<{ pageId: string; blocks: number }> {
  const root = getBlock(doc, doc.rootId);
  const page = (await api.pages.create({
    parent: { page_id: parentPageId },
    properties: { title: { title: toApiRichText(root.text) } },
    ...(root.props.icon ? { icon: { type: "emoji", emoji: root.props.icon } } : {}),
  })) as { id: string };
  const blocks = root.children.map((c) => toInput(doc, c, false));
  const n = await appendTree(api, page.id, blocks);
  return { pageId: page.id, blocks: n };
}

/** Accepts a page URL or id and returns the dashed id. */
export function parsePageId(input: string): string | null {
  const m = input.replace(/-/g, "").match(/([0-9a-f]{32})(?:\?|$|#)/i) ?? input.replace(/-/g, "").match(/([0-9a-f]{32})/i);
  if (!m) return null;
  const h = m[1]!.toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
