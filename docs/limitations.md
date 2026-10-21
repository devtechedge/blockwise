# Limitations

- The clipboard fixtures are generated from the schema traced in Notion's public web bundle, not captured from a live account. A live check on 2026-10-22 showed Notion's web app ignores a Blockwise payload under its private MIME, so Blockwise now sends Notion HTML and keeps the block payload for its own pastes. Toggle and highlight fixes from that run still need a live re-run.
- Blockwise to Notion loses block level colors (for example a colored callout background); only inline text and highlight colors are carried.
- Only the table view of databases is implemented. Board, calendar, gallery and timeline views are not.
- Synced blocks, embeds, bookmarks, files, audio, video, breadcrumbs and table of contents blocks are imported as plain text or links.
- Formula, relation and rollup properties import as text and are not computed.
- API push uploads images only when they are external URLs. Embedded data URLs are skipped with a note.
- No realtime collaboration, comments, permissions or accounts. Data lives in one browser profile.
- The internal clipboard format can change in any Notion release. `scripts/capture-evidence.sh` re-runs the analysis against a pinned build.
