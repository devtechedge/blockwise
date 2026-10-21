# Limitations

- The clipboard fixtures are generated from the schema traced in Notion's public web bundle, not captured from a live account. A live check on 2026-10-22 showed Notion's web app ignores a Blockwise payload under its private MIME, so Blockwise now sends Notion HTML and keeps the block payload for its own pastes. A second run confirmed toggles and plain Ctrl+V; highlight and inline equation fixes from it still need a live re-run.
- Markdown (the `text/plain` copy flavour and the Markdown export) has no syntax for colors, so block and text colors are dropped there, as in Notion's own Markdown export. HTML export keeps them as `block-color-*` classes and the API sync keeps them in the `color` field.
- Callout background colors are not sent through HTML yet (Notion reads them from a separate `data-notion-callout-background` attribute that has not been mapped).
- Only the table view of databases is implemented. Board, calendar, gallery and timeline views are not.
- Synced blocks, embeds, bookmarks, files, audio, video, breadcrumbs and table of contents blocks are imported as plain text or links.
- Formula, relation and rollup properties import as text and are not computed.
- API push uploads images only when they are external URLs. Embedded data URLs are skipped with a note.
- No realtime collaboration, comments, permissions or accounts. Data lives in one browser profile.
- The internal clipboard format can change in any Notion release. `scripts/capture-evidence.sh` re-runs the analysis against a pinned build.
