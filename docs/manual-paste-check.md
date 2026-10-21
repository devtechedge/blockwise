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
| Blockwise to Notion | | | |
| Notion to Blockwise | | | |

If you want to keep a real capture as a fixture, save the clipboard flavours as JSON under `packages/notion-format/fixtures/clipboard/` with a `live-` prefix, append `sha256sum <file>` output to `evidence/fixtures.sha256`, and run `node scripts/verify-evidence.mjs`. Remove any workspace or user ids you do not want to publish first.
