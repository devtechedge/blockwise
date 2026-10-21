# SPEC: Notion exports (Markdown and CSV zip, HTML zip)

Status: implemented in `packages/notion-format/src/export`.

## Sources

- Web chunk `exportJsxRenderer-94ed7e495b8f5b69.js` (HTML export renderer, client side), fetched 21 Oct 2026. Element choices below were read from its block renderer table.
- Web chunk `57614-13ac76aba4285bb3.js` (Markdown parser, contains the `<aside>` callout rule).
- Public Notion help pages on export.

## Archive layout

- Each page becomes `Title <32 hex id>.md` (or `.html`).
- A page's subpages live in a folder named like the page file without the extension.
- A database becomes `Name <id>.csv` plus `Name <id>_all.csv` (all rows, newer exports) and a folder of row pages.
- Attachments sit next to the page that uses them, linked by relative, URL encoded paths.
- Large workspaces are split into several zips (`Export-<uuid>-Part-1.zip`). Blockwise imports each part separately.

## Markdown rules

| Block | Markdown |
| --- | --- |
| Page title | `# Title` on the first line |
| Heading 1, 2, 3 | `#`, `##`, `###` (shifted one level down when the title takes `#`) |
| Paragraph | text, blank line after |
| Bulleted, numbered | `- item`, `1. item`, children indented 4 spaces |
| To-do | `- [ ] item`, `- [x] item` |
| Toggle | `- item` with indented children (newer exports use `<details><summary>`) |
| Quote | `> text` |
| Callout | `<aside>` block, icon on its first line, closed with `</aside>` |
| Code | fenced with the language name |
| Divider | `---` |
| Image | `![caption](relative/path.png)` |
| Table | GitHub style pipe table |
| Equation | `$$` block |
| Database properties on a row page | `Key: value` lines after the title |

Inline: `**bold**`, `*italic*`, `~~strike~~`, `` `code` ``, `[text](url)`, `$equation$`. Underline and colour have no Markdown form and are dropped.

## HTML rules

| Block | Element |
| --- | --- |
| Page | `<article class="page sans">`, `<header>` with `<h1 class="page-title">`, `<div class="page-body">` |
| Paragraph | `<p>` |
| Headings | `<h1>`, `<h2>`, `<h3>` |
| Bulleted | `<ul class="bulleted-list"><li>` |
| Numbered | `<ol class="numbered-list" start="N"><li>` |
| To-do | `<ul class="to-do-list"><li>` with `<input type="checkbox" class="checkbox checkbox-on|checkbox-off" disabled>` then `<span class="to-do-children-checked|unchecked">` |
| Toggle | `<ul class="toggle"><li><details open=""><summary>` and children in `<div class="indented">` |
| Quote | `<blockquote>` |
| Callout | `<aside>` (older exports used `<figure class="callout">`) |
| Code | `<pre class="code"><code class="language-x">` |
| Divider | `<hr/>` |
| Image | `<figure class="image"><a><img src></a><figcaption>` |
| Table | `<table class="simple-table">` with `simple-table-header` cells |
| Columns | `<div class="column-list"><div class="column">` |

Annotations: `<strong>`, `<em>`, `<del>`, `<code>`, underline as `<span style="border-bottom:0.05em solid">`, colour as `<mark class="highlight-red">`, links as `<a href>`.

## Quirks

- IDs in file names are the block id without dashes.
- Each child list item becomes its own `<ul>`/`<ol>` element in HTML export; consecutive lists are not merged.
- CSV dates are rendered text such as `October 21, 2026`, not ISO strings. Checkboxes are `Yes` / `No`. Multi-select values are joined with `, `.
- Files start with a UTF-8 byte order mark in CSV exports.

## Unknowns

- Exact export output for synced blocks, linked databases and AI blocks. Blockwise imports them as plain paragraphs.
