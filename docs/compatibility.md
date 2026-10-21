# Compatibility matrix

What Blockwise reads and writes for each Notion surface, and how each cell is verified. "Tested" means a Vitest or Playwright test runs in CI. "Fixture" means the test input is a hand built or schema generated file whose SHA-256 is pinned in `evidence/fixtures.sha256`; none are live captures from a signed in Notion account.

Legend: ✅ implemented and round trips, 🟡 partial (see notes), ➖ not supported. The package tests cover the main path for each column; not every cell has its own dedicated test.

## Block types

| Block | Clipboard v3 out | Clipboard v3 in | HTML clipboard | Markdown export | Markdown import | HTML export | HTML import | API push | API pull |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Paragraph | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Heading 1 to 3 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Bulleted and numbered list, nested | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| To-do | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Toggle | ✅ | ✅ | 🟡 fixed after live run | 🟡 `<details>` | 🟡 `<details>` | ✅ | ✅ | ✅ | ✅ |
| Quote | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Callout with icon and color | ✅ | ✅ | 🟡 block color lost, untested live | 🟡 color lost | 🟡 | ✅ | ✅ | ✅ | ✅ |
| Code with language | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Divider | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Block equation | ✅ | ✅ | 🟡 as text | ✅ `$$` | ✅ | ✅ | ✅ | ✅ | ✅ |
| Image (URL or embedded file) | ✅ URL | ✅ URL | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 external URLs only | ✅ |
| Simple table with header row and column | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Columns | ✅ | ✅ | 🟡 flattened | 🟡 flattened | ➖ | ✅ | ✅ | ✅ | ✅ |
| Sub page link | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 as link | ✅ |
| Database (table view) | ➖ | ➖ | ➖ | ✅ CSV | ✅ CSV | ✅ table | ✅ | ➖ | ➖ |

## Inline formatting

Bold, italic, underline, strikethrough, inline code, links and text or background colors round trip through the block payload (annotation codes `b i _ s c a h`), HTML and the API. Markdown keeps everything except underline and color. Inline equations use code `e` with the U+204D placeholder on the clipboard and `$...$` in Markdown. Mentions (code `d`, U+2023 placeholder) are preserved on the clipboard and shown as plain text elsewhere.

## Live paste check (Notion web, 2026-10-22)

| Direction | Verified live | Fixed after, needs re-run |
| --- | --- | --- |
| Blockwise to Notion | Heading, nested bullets, numbered list, quote, code with language, bold, italic, underline, strike, inline code, link, inline equation (through the HTML flavour) | Toggle, background highlight, plain Ctrl+V (Notion's private MIME no longer written) |
| Notion to Blockwise | To-do, heading, rich text paragraph, nested bullet, numbered list, quote, code (through Notion's block payload) | Toggle (reader keeps toggle and children, regression tested), multi block paste into the title |

Callouts and to-dos from Blockwise to Notion have not been checked live yet. Clipboard v3 columns above describe Blockwise reading Notion's payload; Blockwise writes the same schema under its own MIME.

## Database property types

Title, text, number, select, multi select, date (including Notion's `October 21, 2026` and ranges), checkbox and URL import from and export to Notion CSV with type inference. Formulas, relations, rollups, people and files import as text.

## Test results (2026-10-22)

| Package | Tests |
| --- | --- |
| @blockwise/core | 26 |
| @blockwise/notion-format | 41 |
| @blockwise/database | 10 |
| @blockwise/interop | 11 |
| @blockwise/notion-sync (mocked API only) | 9 |
| @blockwise/web unit | 3 |
| @blockwise/web Playwright | 12 |

All pass in CI. Open item: a live re-run of the paste check for toggles, highlights and callouts.
