# Architecture

```
packages/core          block tree, rich text, ops with inverses, undo history, commands, workspace, IndexedDB storage
packages/notion-format clipboard v3 record maps, Markdown and HTML in Notion's export dialects
packages/database      typed properties, CSV, filter and sort, Notion CSV date and type inference
packages/interop       whole workspace export and import as Notion style zip archives (fflate)
packages/notion-sync   optional push and pull through the official API (@notionhq/client), plus a CLI
apps/web               Next.js editor UI, the only package with React
```

Every package except `apps/web` is framework free TypeScript and runs in Node and the browser.

## Document model

A `Doc` is a flat map of blocks keyed by id plus a root id. Each block has a type, rich text, props and an ordered child list. Every edit is an `Op` (insert, remove, update, move) with an exact inverse, so undo is replaying inverses. Typing in the same block within 800 ms merges into one undo step.

## Clipboard

On copy the editor writes four flavours: `text/plain`, `text/html`, `text/_notion-blocks-v3-production` and `text/_notion-text-production`. On paste it prefers the Notion block payload, then HTML, then Markdown like plain text. See `specs/clipboard.md` for the schema and how it was derived.

## Storage and sync

The workspace autosaves to IndexedDB 400 ms after the last change and on page hide. Nothing leaves the browser unless you export or use the sync dialog. The sync dialog forwards requests through `/api/notion/*`, a pass-through limited to page and block endpoints, because the Notion API does not allow browser calls. The token is held in component memory only.

## Not done

Realtime collaboration (handoff milestone 9) is not implemented. The op log is designed so a CRDT layer such as Yjs can be added at the store boundary later.
