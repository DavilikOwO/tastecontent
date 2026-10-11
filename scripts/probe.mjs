// Run once after your Qloo key arrives: `npm run probe`
// Saves the raw Qloo responses to probe-output/ so the result parsing can be checked
// against real data. The files contain no credentials.
import fs from "node:fs/promises";
import { createQloo } from "../lib/qloo.mjs";

try {
  process.loadEnvFile(".env");
} catch {}

const qloo = createQloo();
if (qloo.mode !== "live") {
  console.error("QLOO_MOCK=1 is set. Unset it to probe the real API.");
  process.exit(1);
}

const calls = [
  ["qloo_describe", { entity: "Phoebe Bridgers", type: "artist" }],
  // Without a type, to see how Qloo reports an ambiguous name.
  ["qloo_describe", { entity: "Barbie" }],
  ["qloo_describe", { entity: "Rosalía" }],
  ["qloo_find_tags", { query: "indie folk", limit: 3 }],
  ["qloo_recommend", { target_type: "tv_show", signals: ["Phoebe Bridgers"], limit: 5, explain: true }],
  ["qloo_recommend", { target_type: "brand", signals: ["Phoebe Bridgers"], demographic: "women 18-24", limit: 5, explain: true }],
  ["qloo_entity_tags", { entities: ["Phoebe Bridgers"], limit: 5 }],
];

await fs.mkdir("probe-output", { recursive: true });
try {
  console.log("Qloo ready:", await qloo.readiness());
  for (const [i, [tool, args]] of calls.entries()) {
    const env = await qloo.call(tool, args);
    const file = `probe-output/${i + 1}-${tool}.json`;
    await fs.writeFile(file, JSON.stringify({ tool, args, envelope: env }, null, 2));
    console.log(`${tool}: ${env.status} (${env.result_count ?? "?"} results) -> ${file}`);
  }
} finally {
  await qloo.close();
}
