# Spec: databases and Notion CSV

Source of truth: CSV files produced by Notion's "Export, Markdown & CSV" option, as described in Notion's public help pages, reproduced by hand in `packages/interop/fixtures/exports/markdown-csv`.

- The first column is the title. Notion writes a second `<name>_all.csv` for full exports; the importer prefers the plain file and ignores `_all` duplicates.
- Dates use `Month D, YYYY` with an optional time and `→` for ranges. The importer accepts that and ISO dates; the exporter writes Notion's form.
- Types are inferred per column: checkbox (`Yes`/`No`), number, date, URL, multi select (comma separated with repeats across rows), select (few distinct values), otherwise text.
- Filters: equals, does not equal, contains, does not contain, is empty, is not empty, greater or less than, before and after, combined with all or any. Sorts are stable and multi key.
