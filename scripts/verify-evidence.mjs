// Checks that evidence/records.json is well formed and that every committed
// fixture listed in evidence/fixtures.sha256 still matches its recorded hash.
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";

const fail = (m) => { console.error("evidence: " + m); process.exitCode = 1; };
const hex = /^[0-9a-f]{64}$/;
const rec = JSON.parse(readFileSync("evidence/records.json", "utf8"));
if (rec.schema !== "blockwise.evidence/v1") fail("unexpected schema " + rec.schema);
for (const a of rec.artifacts) if (!hex.test(a.sha256)) fail("bad artifact hash for " + a.name);
for (const r of rec.runs) {
  if (!hex.test(r.output_sha256)) fail("bad output hash for " + r.name);
  if (!/^ev_[0-9a-f]{64}$/.test(r.evidence_id)) fail("bad evidence id for " + r.name);
}
let checked = 0;
if (existsSync("evidence/fixtures.sha256")) {
  for (const line of readFileSync("evidence/fixtures.sha256", "utf8").split("\n")) {
    if (!line.trim()) continue;
    const m = line.match(/^([0-9a-f]{64}) [ *](.+)$/);
    if (!m) { fail("bad manifest line " + line); continue; }
    const [, hash, file] = m;
    const got = createHash("sha256").update(readFileSync(file)).digest("hex");
    if (got !== hash) fail(`${file} hash ${got} != ${hash}`); else checked++;
  }
}
console.log(`evidence: ${rec.artifacts.length} artifacts, ${rec.runs.length} REA runs, ${checked} fixture hashes ok`);
