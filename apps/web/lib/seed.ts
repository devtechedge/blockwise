import { addPage, buildDoc, emptyWorkspace, text, type BlockInput, type Workspace } from "@blockwise/core";
import { addProperty, addRow, createDatabase } from "@blockwise/database";

const t = text;

export function seedWorkspace(): Workspace {
  let ws = emptyWorkspace();
  const welcome: BlockInput[] = [
    { type: "callout", text: [{ text: "Blockwise is a local first block editor. Everything you type stays in this browser (IndexedDB). Copy blocks into Notion, paste Notion blocks here, or import a Notion export zip." }], props: { icon: "\u{1F44B}", color: "blue_background" } },
    { type: "heading_2", text: t("Try it") },
    { type: "to_do", text: [{ text: "Type " }, { text: "/", marks: { code: true } }, { text: " in an empty line to open the block menu" }], props: { checked: false } },
    { type: "to_do", text: [{ text: "Start a line with " }, { text: "# ", marks: { code: true } }, { text: ", " }, { text: "- ", marks: { code: true } }, { text: ", " }, { text: "[] ", marks: { code: true } }, { text: " or " }, { text: "> ", marks: { code: true } }, { text: " for Markdown shortcuts" }], props: { checked: false } },
    { type: "to_do", text: [{ text: "Select text to " }, { text: "format", marks: { bold: true } }, { text: " it, or press " }, { text: "Ctrl+B", marks: { code: true } }, { text: " and " }, { text: "Ctrl+I", marks: { code: true } }], props: { checked: false } },
    { type: "to_do", text: [{ text: "Press " }, { text: "Esc", marks: { code: true } }, { text: " to select blocks, then " }, { text: "Ctrl+C", marks: { code: true } }, { text: " and paste into a Notion page" }], props: { checked: false } },
    { type: "to_do", text: t("Drag the handle on the left of a block to move it"), props: { checked: true } },
    { type: "heading_2", text: t("Every block type") },
    { type: "paragraph", text: [{ text: "Rich text: " }, { text: "bold", marks: { bold: true } }, { text: ", " }, { text: "italic", marks: { italic: true } }, { text: ", " }, { text: "underline", marks: { underline: true } }, { text: ", " }, { text: "strike", marks: { strike: true } }, { text: ", " }, { text: "code", marks: { code: true } }, { text: ", " }, { text: "colour", marks: { color: "orange" } }, { text: ", " }, { text: "highlight", marks: { color: "yellow_background" } }, { text: ", " }, { text: "a link", marks: { link: "https://github.com/devtechedge/blockwise" } }, { text: " and an equation " }, { text: "e^{i\\pi}+1=0", equation: "e^{i\\pi}+1=0" }, { text: "." }] },
    { type: "paragraph", text: t("Block color: this whole block has a blue background. Click the handle on its left, choose Color, and pick another."), props: { color: "blue_background" } },
    { type: "bulleted_list_item", text: t("Bulleted list"), children: [{ type: "bulleted_list_item", text: t("Nested with Tab") }] },
    { type: "numbered_list_item", text: t("Numbered list") },
    { type: "numbered_list_item", text: t("Keeps counting") },
    { type: "toggle", text: t("Toggle"), children: [{ type: "paragraph", text: t("Hidden until opened.") }] },
    { type: "quote", text: t("Quotes look like this.") },
    { type: "code", text: t("import { encodeClipboard } from \"@blockwise/notion-format\";\n\nconst data = encodeClipboard(doc, selectedIds);"), props: { language: "typescript" } },
    { type: "divider" },
    { type: "equation", props: { expression: "\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}" } },
    { type: "table", props: { width: 3, hasColumnHeader: true, hasRowHeader: false }, children: [
      { type: "table_row", props: { cells: [t("Format"), t("Read"), t("Write")] } },
      { type: "table_row", props: { cells: [t("Notion clipboard"), t("yes"), t("yes")] } },
      { type: "table_row", props: { cells: [t("Markdown and CSV zip"), t("yes"), t("yes")] } },
      { type: "table_row", props: { cells: [t("HTML zip"), t("yes"), t("yes")] } },
    ] },
    { type: "column_list", children: [
      { type: "column", props: { ratio: 0.5 }, children: [{ type: "heading_3", text: t("Left column") }, { type: "paragraph", text: t("Columns map to Notion column lists.") }] },
      { type: "column", props: { ratio: 0.5 }, children: [{ type: "heading_3", text: t("Right column") }, { type: "paragraph", text: t("They survive copy and export.") }] },
    ] },
  ];
  ws = addPage(ws, buildDoc("Welcome to Blockwise", welcome));
  const welcomeId = ws.order[""]![0]!;
  ws.pages[welcomeId]!.blocks[welcomeId]!.props.icon = "\u{1F9F1}";

  let db = createDatabase("Roadmap");
  db = addProperty(db, "Status", "select");
  db = addProperty(db, "Tags", "multi_select");
  db = addProperty(db, "Points", "number");
  db = addProperty(db, "Due", "date");
  db = addProperty(db, "Done", "checkbox");
  const [, status, tags, points, due, done] = db.properties.map((p) => p.id);
  db = addRow(db, { title: "Clipboard bridge", [status!]: "Done", [tags!]: ["interop"], [points!]: 5, [due!]: { start: "2026-10-21" }, [done!]: true });
  db = addRow(db, { title: "Export import", [status!]: "Done", [tags!]: ["interop", "files"], [points!]: 3, [due!]: { start: "2026-10-21" }, [done!]: true });
  db = addRow(db, { title: "Realtime collaboration", [status!]: "Later", [tags!]: ["sync"], [points!]: 8, [done!]: false });
  ws = { ...ws, databases: { ...ws.databases, [db.id]: db } };
  ws = addPage(ws, buildDoc("Roadmap", [
    { type: "paragraph", text: t("A simple database. Add properties, filter, sort, and import or export Notion CSV.") },
    { type: "database", text: t("Roadmap"), props: { databaseId: db.id } },
  ]), welcomeId);
  ws = addPage(ws, buildDoc("Moving content to and from Notion", [
    { type: "heading_2", text: t("Copy to Notion") },
    { type: "numbered_list_item", text: t("Press Esc to select the block you are in, Shift+Up or Down to extend.") },
    { type: "numbered_list_item", text: t("Press Ctrl+C (Cmd+C on a Mac).") },
    { type: "numbered_list_item", text: t("Paste into Notion. Structure comes across through HTML; Chromium apps also get Notion's own block format.") },
    { type: "heading_2", text: t("Copy from Notion") },
    { type: "paragraph", text: t("Select blocks in Notion, copy, and paste into any line here.") },
    { type: "heading_2", text: t("Files") },
    { type: "paragraph", text: t("In Notion use Export with Markdown & CSV or HTML, then Import in the sidebar here. Export from here gives the same layout back.") },
  ]), welcomeId);
  return ws;
}
