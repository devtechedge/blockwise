# SPEC: Clipboard bridge

Status: implemented in `packages/notion-format/src/clipboard`.

## Sources

| Source | SHA-256 | Anchor |
| --- | --- | --- |
| Web chunk `9073-319c74553d1d495c.js` | `a8d9903d...c942de` | MIME constants near character 29149, virtual clipboard key near 29804, copy writer near 49260, paste reader near 30120 |
| Web chunk `11906-2b10cc89fc0f0830.js` | `b0271a07...e3e15c` | `notionvc` marker helpers near 671, `notionblock` marker near 856 |
| Desktop `tab_browser_view/preload.js` (7.40.0) | `0a658e38...dc02405` | `navigator.clipboard` helpers for text and image only |
| REA runs | see `evidence/records.json` | `web-editor`, `preload`, four traces |

Full hashes are in `evidence/records.json`.

## Behaviour observed

### Copy

1. The editor handles the DOM `copy` and `cut` events and calls `preventDefault()`.
2. For every private payload it writes `JSON.stringify(codec.toJson(data))` under its MIME key.
3. It writes `text/plain` (Markdown flavoured text when the selection is blocks) and `text/html`.
4. On Android only, it appends `<!-- notionvc: UUID -->` to the HTML and saves all private payloads in local storage under `VirtualClipboard:production` as `{ id, mimeTypes }`.

Private MIME keys, in the order the editor reads them:

| Key | Contents |
| --- | --- |
| `text/_notion-blocks-v3-production` | Block selection |
| `text/_notion-text-production` | Inline text selection |
| `text/_notion-multi-text-production` | Multi block text selection |
| `text/_notion-page-source-production` | Source page pointer |

### Block selection payload

```json
{
  "blocks": [
    { "blockId": "<uuid>", "blockSubtree": { "__version__": 3, "block": { "<uuid>": { "spaceId": "<uuid>", "value": { "value": { "id": "<uuid>", "type": "text", "properties": { "title": [["Hello"]] } }, "role": "editor" } } } } }
  ],
  "action": "copy",
  "wasContiguousSelection": true
}
```

- `blockSubtree` is a record map in version 3 form: `table -> id -> { spaceId, value: { value: record, role } }`. The reader in the app bundle walks `recordMap[table][id].value.value`.
- Each top level block carries its whole subtree (children listed in `content`).
- `action` is `copy` or `cut`. On `cut`, entries may also carry `sourceNav`.
- Optional flag `wasSelectionFromSnapshot` marks copies taken from page history.

### Paste

1. If a virtual clipboard entry exists and the HTML marker UUID matches its `id`, the private payloads are restored from it. Otherwise only the real clipboard is used.
2. `text/plain` (with U+2028 turned into newlines), `text/uri-list`, `text/html` and `slack/texty` are read.
3. HTML is kept only when it has rich formatting or both HTML and text are WordPress block markup.
4. The private payloads are parsed with `JSON.parse` inside `try`; a parse error silently drops that payload.
5. A `copy` payload is duplicated into the page. A `cut` payload moves the original blocks when they still exist in the same space.

## Rich text ("title" arrays)

A text property is an array of segments `[text, annotations?]`. Annotations are arrays whose first item is a one or two letter code:

| Code | Meaning | Extra items |
| --- | --- | --- |
| `b` `i` `s` `c` `_` | bold, italic, strike, code, underline | none |
| `a` | link | URL |
| `h` | colour | e.g. `red`, `blue_background` |
| `e` | inline equation | TeX source |
| `p` | page mention | page id |
| `u` | user mention | user id |
| `d` | date mention | date object |

Mentions use the text `‣` (U+2023) as their placeholder. The codes come from an enum in web chunk `49844-fbc73543b2978e32.js`.

## What Blockwise does

- Copy writes `application/x-blockwise-blocks-v3` (the same v3 selection payload: synthesised record map, fresh UUIDs, neutral `spaceId` and `role`), `text/html` and `text/plain` (Markdown). Writing the payload under `text/_notion-blocks-v3-production` is opt in (`notionPayload`), because a live check on 2026-10-22 showed Notion's web app swallowing a plain Ctrl+V with it.
- The clipboard HTML differs from the export dialect in a few places, each matched to what Notion's HTML paste parser reads (evidence/README.md, "Paste parser evidence"):
  - A toggle is a bare `<details><summary>`. Notion's paste reads `<ul class="toggle"><li><details>` as a bulleted item.
  - A text or background color is `<mark class="highlight-<color>" data-notion-highlight="<notion color>" style="...">`. Notion reads only the `data-notion-highlight` attribute, whose value is the plain name (`orange`) for a text color and the `_background` name (`yellow_background`) for a highlight; the class serves Notion's export CSS and the inline style serves other apps.
  - A block color is `data-notion-highlight` on the block element, next to the `block-color-*` class.
  - An inline equation is `<span class="notion-text-equation-token" data-notion-inline-equation="<tex>" data-tex="<tex>" contenteditable="false"><tex></span>`. Notion takes the TeX from the attribute; a bare token falls back to plain text, which is what the first live run showed.
- Notion's internal palette names green `teal` (`teal`, `teal_background`). Blockwise writes `teal` in the block payload and in `data-notion-highlight`, and reads `teal` back as green.
- Paste prefers `text/_notion-blocks-v3-production`, then `application/x-blockwise-blocks-v3`, then `text/html` (classes, inline styles and `<mark>` map to the nearest Notion color), then `text/plain`.
- Serialisation is deterministic so fixtures can be compared byte for byte.

## Quirks

- Private MIME types are only shared between Chromium based apps (desktop app, Chrome, Edge). Firefox and Safari do not expose them across origins, so the HTML path matters.
- The REA trace on the MIME string returns `no-match`: string literals are not graph nodes in REA 6.7.0. The facts above come from reading the bundle at the anchors.
- Desktop 7.6.1 routed rich clipboard writes over the `notion:clipboard:write` IPC channel. 7.40.0 no longer has that channel.

## Unknowns

- Whether Notion accepts a synthesised block payload whose `spaceId` it does not know. The paste code takes the space from the page source first, so it may work, but this needs the manual check in `docs/manual-paste-check.md`. Our HTML fallback covers the case where it does not.
- The meaning of `role` in pasted records; we write `"editor"`.
- Exact `text/plain` produced by Notion for nested lists (indent width). We accept 2 and 4 spaces and tabs.
