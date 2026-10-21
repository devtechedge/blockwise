# Evidence

This folder records what was observed in Notion's shipped software and public web assets, and how. It contains hashes, REA result summaries and short findings written in our own words. It does not contain Notion source code, binaries or assets.

## What was analysed

| Artifact | Where it came from |
| --- | --- |
| Notion desktop 7.40.0 Windows installer | `desktop-release.notion-static.com`, downloaded 21 Oct 2026 |
| `app.asar` from that installer | NSIS payload `app-64.7z`, then `@electron/asar extract` |
| Three public web editor chunks | `www.notion.so/_assets/...`, fetched 21 Oct 2026 without logging in |

Every artifact's SHA-256 is in [`records.json`](records.json).

## REA runs

All runs used `rea-agents` 6.7.0 on Linux x64 with Node 22.20.0.

1. `rea analyze-javascript-application` on the desktop tab preload directory.
2. `rea analyze-javascript-application` on the three web editor chunks.
3. `rea trace-application-feature` with four string seeds: `__electronApi`, `notion:clipboard:write`, `text/_notion-blocks-v3-production` and `notionvc`.

For each run `records.json` stores the Evidence ID REA returned, the SHA-256 and size of the complete JSON output, and the summary, statistics, coverage and limitations fields. The complete outputs are 50 MB or more and embed slices of the analysed code, so they stay off the repository. Re-running the commands in [`../scripts/capture-evidence.sh`](../scripts/capture-evidence.sh) against the same artifacts reproduces the same Evidence IDs.

## Findings in short

- In desktop 7.40.0 the editor's copy path is the standard DOM `copy` event. The `notion:clipboard:write` IPC channel documented for 7.6.1 in REA's own Notion showcase is gone from both the preload and the main bundle (the trace for that seed returns `no-match`, and a plain text search agrees). The preload still exposes `__electronApi` (5 context bridge APIs, 232 members) and uses `navigator.clipboard` only for copying plain text and images.
- On copy the web editor writes up to four private MIME types next to `text/plain` and `text/html`. The block one is `text/_notion-blocks-v3-production`. Its value is `JSON.stringify` of `{ blocks: [{ blockId, blockSubtree }], action, wasContiguousSelection }`, where `blockSubtree` is a record map in version 3 form.
- On Android only, the HTML gets a trailing `<!-- notionvc: UUID -->` comment and the private MIME values are kept in local storage under `VirtualClipboard:production`. A paste restores them only when the UUID in the HTML matches.
- On paste the editor reads the private types first, then HTML, then plain text. A `copy` payload is duplicated into the target page; a `cut` payload tries to move the original blocks.
- REA's string seed traces for the MIME name and `notionvc` returned `no-match` because string literals that are not route, API or channel nodes are not graph entities. Those facts come from reading the code at the character offsets listed in the SPEC files, which is the same method REA's showcase used.

Feature level details, quirks and unknowns are in `docs/specs/`.
