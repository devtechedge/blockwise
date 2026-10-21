# Manual paste check

The automated tests prove that Blockwise writes and reads the clipboard payload described in `docs/specs/clipboard.md`, byte for byte, against fixtures built from the traced schema. They cannot prove that the Notion apps accept a payload we produce, because that needs a signed in Notion session. This check takes about five minutes.

You need a Notion account (a free one is fine) and a desktop browser or the Notion desktop app.

## Blockwise to Notion

1. Open https://blockwise-cyan.vercel.app and stay on the Welcome page.
2. Click in the "Every block type" heading, press `Esc` to select that block, then hold `Shift` and press `ArrowDown` until the code block is selected.
3. Press `Ctrl+C` (or `Cmd+C`).
4. In Notion, open an empty page, click in the body and press `Ctrl+V`.
5. Record the result in the table below. Expected best case: headings, lists, to-dos, toggle, quote, callout and code arrive as native blocks with colors and inline marks. If Notion ignores the block payload it falls back to our `text/html` flavour: structure should still be right but colors may be lost.

## Notion to Blockwise

1. In Notion, select a few blocks (a heading, a nested bulleted list, a to-do and a code block) with the block handle, and copy.
2. In Blockwise, create a new page, click the first line and paste.
3. Expected: the same block types and nesting. Open the browser console and run `copy(JSON.stringify([...(await navigator.clipboard.read())].map(i=>i.types)))` if you want to record which flavours Notion offered.

## Record

| Direction | App and version | Result | Notes |
| --- | --- | --- | --- |
| Blockwise to Notion | Notion web, signed in, 2026-10-22 | Partial | First Ctrl+V did nothing; Ctrl+Shift+V pasted. Heading 2, nested bullets, numbered list, quote and a TypeScript code block arrived as native blocks. Bold, italic, underline, strike, inline code, link and equation survived. Yellow highlight was lost. The toggle became a bulleted item with a child. An extra empty text block appeared above. Callout and to-dos were not in the range. |
| Notion to Blockwise | Notion web, signed in, 2026-10-22 | Pass with one gap | 9 blocks pasted through the Notion block data path: to-do, heading, paragraph rich text, nested bullet, numbered list, quote, code. The toggle came back as a bullet, likely because the Notion source was the bullet created by the paste above. Pasting into the page title flattened everything into the title. |

## Fixes after the 2026-10-22 run (need a re-run to confirm)

- Blockwise no longer writes Notion's private block MIME on copy. The plain Ctrl+V no-op points to Notion accepting the key and then dropping a payload from a workspace it does not know, which also stops it from falling back to HTML. The payload now travels under `application/x-blockwise-blocks-v3` for Blockwise to Blockwise pastes, so Notion should read the HTML flavour on a normal Ctrl+V.
- The clipboard HTML writes a toggle as a bare `<details><summary>` instead of Notion's export shape `<ul class="toggle"><li><details>`, which Notion's paste parser read as a list item.
- Text and background colors are written as inline `color` and `background-color` styles, since a paste has no stylesheet for the `highlight-*` classes. Blockwise also reads inline style colors and `<mark>` from other apps.
- Pasting several blocks into the page title now inserts them at the top of the body.
- The extra empty block is not in any flavour Blockwise writes (a regression test checks this). It is most likely Notion keeping the empty line the paste started on.

Re-run: copy the Welcome page from "Every block type" through the callout and the to-dos, press plain Ctrl+V in Notion, and check the toggle, the yellow highlight and the callout.

If you want to keep a real capture as a fixture, save the clipboard flavours as JSON under `packages/notion-format/fixtures/clipboard/` with a `live-` prefix, append `sha256sum <file>` output to `evidence/fixtures.sha256`, and run `node scripts/verify-evidence.mjs`. Remove any workspace or user ids you do not want to publish first.
