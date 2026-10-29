#!/usr/bin/env node
// What the reviewer found (call_reviews), with the conversation, for fixing the phrasebook/code.
//   node scripts/reviews.mjs          open reviews with issues (not marked fixed)
//   node scripts/reviews.mjs 12       BV-12 with its full transcript
//   node scripts/reviews.mjs fixed 12 13   mark as fixed once the fix is deployed
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BACKEND = join(dirname(fileURLToPath(import.meta.url)), "../backend");
const sql = (q) => JSON.parse(execFileSync("npx", ["wrangler", "d1", "execute", "barber-voice-agent", "--remote", "--json", "--command", q], { cwd: BACKEND, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }))[0].results;
const [cmd, ...rest] = process.argv.slice(2);
const ids = (cmd === "fixed" ? rest : cmd ? [cmd] : []).map((x) => Number(String(x).replace(/\D/g, ""))).filter(Boolean);

if (cmd === "fixed") {
  sql(`UPDATE call_reviews SET fixed = 1 WHERE id IN (${ids.join(",")})`);
  console.log("marked fixed:", ids.map((i) => `BV-${i}`).join(", "));
} else {
  const rows = ids.length
    ? sql(`SELECT * FROM call_reviews WHERE id = ${ids[0]}`)
    : sql("SELECT * FROM call_reviews WHERE fixed = 0 AND verdict IN ('minor', 'serious', 'error') ORDER BY id");
  for (const r of rows) {
    console.log(`\n=== BV-${r.id}  ${r.verdict}  ${r.call_id}  ${r.created_at}  $${(r.cost_usd ?? 0).toFixed(4)}${r.fixed ? "  (fixed)" : ""}`);
    for (const i of JSON.parse(r.issues)) console.log(`- [${i.severity ?? "?"}/${i.type ?? "?"}] «${i.quote ?? ""}»\n    ✗ ${i.problem ?? ""}\n    ✓ ${i.fix ?? ""}`);
    if (ids.length) {
      console.log("\n--- conversation");
      for (const l of sql(`SELECT role, text FROM realtime_log WHERE call_id = '${r.call_id.replace(/'/g, "")}' AND role IN ('user','agent','event') ORDER BY id`)) console.log(`${l.role.padEnd(5)} ${(l.text ?? "").slice(0, 300)}`);
    }
  }
  if (!rows.length) console.log("nothing open");
}
