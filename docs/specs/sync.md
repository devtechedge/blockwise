# Spec: optional Notion API sync

Source of truth: the public Notion API reference (version header `2022-06-28`) and the `@notionhq/client` 5.x types. No private endpoints.

## Behaviour

- Pull: `pages.retrieve` for the title and icon, then `blocks.children.list` recursively with pagination (`has_more`, `next_cursor`). Child pages are returned as links and the web app pulls up to 20 of them.
- Push: `pages.create` under a parent page, then `blocks.children.append` in batches of at most 100 children and at most two levels of nesting per request. Deeper children are appended in later calls against the returned block ids. Tables and column lists are sent together with their rows and columns because the API requires it.
- Rate limit: requests go through a throttle of three per second, and 429 responses are retried after `Retry-After`.

## Security

- The token comes from `NOTION_TOKEN` (CLI) or a password field (web) and is never written to disk, local storage or logs.
- The web proxy only forwards `v1/pages` and `v1/blocks` paths and needs a bearer token on every request.

## Verification

All tests run against `packages/notion-sync/test/fake-notion.ts`, an in-memory fake that enforces the 100 child and two level limits, and against the hand written `fixtures/api-page.json`. No test talks to the real API.
