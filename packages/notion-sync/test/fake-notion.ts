import type { NotionApi } from "../src/sync.js";

type Json = Record<string, unknown>;

/**
 * In memory stand-in for the parts of the Notion API we use. It enforces the
 * documented limits (100 children per append, cursor pagination) so the sync
 * code is tested against them.
 */
export class FakeNotion implements NotionApi {
  pagesById = new Map<string, Json>();
  children = new Map<string, Json[]>();
  calls: { method: string; id: string; size?: number }[] = [];
  pageSize = 100;
  failNext429 = 0;
  private n = 0;
  private byId = new Map<string, Json>();

  constructor(fixture?: { page: Json; children: Record<string, Json[]> }) {
    if (fixture) {
      this.pagesById.set(String(fixture.page.id), fixture.page);
      for (const [k, v] of Object.entries(fixture.children)) this.children.set(k, v);
    }
  }

  private id(): string { this.n++; return `f0000000-0000-4000-8000-${this.n.toString().padStart(12, "0")}`; }
  private gate() { if (this.failNext429 > 0) { this.failNext429--; throw Object.assign(new Error("rate limited"), { code: "rate_limited", status: 429 }); } }

  private store(parent: string, items: Json[]): Json[] {
    const out: Json[] = [];
    for (const raw of items) {
      const type = String(raw.type);
      const body = { ...(raw[type] as Json) };
      const nested = body.children as Json[] | undefined;
      delete body.children;
      const id = this.id();
      const block: Json = { object: "block", id, type, [type]: body, has_children: Boolean(nested?.length) };
      out.push(block);
      this.byId.set(id, block);
      const parentBlock = this.byId.get(parent);
      if (parentBlock) parentBlock.has_children = true;
      if (nested?.length) this.store(id, nested);
      this.children.set(parent, [...(this.children.get(parent) ?? []), block]);
    }
    return out;
  }

  private depth(items: Json[], d = 0): number {
    return Math.max(d, ...items.map((i) => { const k = (i[String(i.type)] as Json)?.children as Json[] | undefined; return k ? this.depth(k, d + 1) : d; }));
  }

  pages = {
    retrieve: async ({ page_id }: { page_id: string }) => {
      this.gate(); this.calls.push({ method: "pages.retrieve", id: page_id });
      const p = this.pagesById.get(page_id);
      if (!p) throw Object.assign(new Error("not found"), { code: "object_not_found", status: 404 });
      return p;
    },
    create: async (args: { parent: { page_id: string }; properties: Json; icon?: unknown }) => {
      this.gate(); this.calls.push({ method: "pages.create", id: args.parent.page_id });
      const id = this.id();
      const title = (args.properties.title as { title: unknown[] }).title;
      const page = { object: "page", id, properties: { title: { id: "title", type: "title", title } }, ...(args.icon ? { icon: args.icon } : {}) };
      this.pagesById.set(id, page);
      this.children.set(args.parent.page_id, [...(this.children.get(args.parent.page_id) ?? []), { object: "block", id, type: "child_page", child_page: { title: "" }, has_children: true }]);
      return page;
    },
  };

  blocks = {
    children: {
      list: async ({ block_id, start_cursor, page_size }: { block_id: string; start_cursor?: string; page_size?: number }) => {
        this.gate(); this.calls.push({ method: "blocks.children.list", id: block_id });
        const all = this.children.get(block_id) ?? [];
        const size = Math.min(page_size ?? 100, this.pageSize);
        const start = start_cursor ? all.findIndex((b) => b.id === start_cursor) : 0;
        const results = all.slice(start, start + size);
        const next = all[start + size];
        return { object: "list", results, has_more: Boolean(next), next_cursor: next ? String(next.id) : null };
      },
      append: async ({ block_id, children }: { block_id: string; children: unknown[] }) => {
        this.gate(); this.calls.push({ method: "blocks.children.append", id: block_id, size: children.length });
        if (children.length > 100) throw Object.assign(new Error("body.children.length should be ≤ 100"), { code: "validation_error", status: 400 });
        if (this.depth(children as Json[]) > 2) throw Object.assign(new Error("nesting too deep"), { code: "validation_error", status: 400 });
        return { object: "list", results: this.store(block_id, children as Json[]) };
      },
    },
  };
}
