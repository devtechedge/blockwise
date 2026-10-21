# Limitations

- The clipboard fixtures are generated from the schema traced in Notion's public web bundle, not captured from a live account. Whether Notion accepts a Blockwise payload is unverified until someone runs `manual-paste-check.md`. If it does not, Notion still receives clean HTML.
- Only the table view of databases is implemented. Board, calendar, gallery and timeline views are not.
- Synced blocks, embeds, bookmarks, files, audio, video, breadcrumbs and table of contents blocks are imported as plain text or links.
- Formula, relation and rollup properties import as text and are not computed.
- API push uploads images only when they are external URLs. Embedded data URLs are skipped with a note.
- No realtime collaboration, comments, permissions or accounts. Data lives in one browser profile.
- The internal clipboard format can change in any Notion release. `scripts/capture-evidence.sh` re-runs the analysis against a pinned build.
