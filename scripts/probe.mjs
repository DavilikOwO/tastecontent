// Run after your Qloo key is set up: `npm run probe`
// Saves raw Qloo responses and one full pipeline run to probe-output/, so the parsing can be
// checked against real data. The files contain no credentials.
import fs from "node:fs/promises";
import { createQloo } from "../lib/qloo.mjs";
import { createLLM } from "../lib/llm.mjs";
import { buildPlan } from "../lib/pipeline.mjs";

try {
  process.loadEnvFile(".env");
} catch {}

const qloo = createQloo();
if (qloo.mode !== "live") {
  console.error("QLOO_MOCK=1 is set. Unset it to probe the real API.");
  process.exit(1);
}

await fs.rm("probe-output", { recursive: true, force: true });
await fs.mkdir("probe-output", { recursive: true });
let n = 0;
const save = async (tool, args, envelope) => {
  n += 1;
  const file = `probe-output/${String(n).padStart(2, "0")}-${tool}.json`;
  await fs.writeFile(file, JSON.stringify({ tool, args, envelope }, null, 2));
  console.log(`${tool}: ${envelope.status} (${envelope.result_count ?? envelope.results?.length ?? 0} results) -> ${file}`);
  return envelope;
};
const call = async (tool, args) => save(tool, args, await qloo.call(tool, args));

try {
  console.log("Qloo ready:", await qloo.readiness());

  // 1. Resolve the seeds the way the app does, then reuse their IDs.
  const artist = await call("qloo_describe", { entity: "Phoebe Bridgers" });
  const film = await call("qloo_describe", { entity: "Lady Bird", type: "movie" });
  const idOf = (env) =>
    env.interpretation?.entity?.entityId ??
    env.results?.[0]?.entity_id ??
    env.resolution?.issues?.[0]?.candidates?.find((c) => c.type === "urn:entity:artist")?.id ??
    env.resolution?.issues?.[0]?.candidates?.[0]?.id;
  const ids = [idOf(artist), idOf(film)].filter(Boolean);
  console.log("Seed IDs:", ids);

  const tags = await call("qloo_find_tags", { query: "vintage fashion", limit: 3 });
  const tagId = tags.results?.[0]?.id;

  // 2. Recommendations with real IDs, in the combinations the app uses.
  await call("qloo_recommend", { target_type: "tv_show", signals: ids, limit: 5, explain: true });
  await call("qloo_recommend", { target_type: "brand", signals: ids, demographic: "women 20-28", signal_location: "Barcelona", limit: 5, explain: true });
  if (tagId) {
    await call("qloo_recommend", { target_type: "movie", signals: ids, signal_tags: [tagId], signal_tags_operator: "union", limit: 5, explain: true });
  }
  await call("qloo_recommend", { target_type: "place", signals: ids, signal_location: "Barcelona", filter_location: "Barcelona", limit: 5, explain: true });
  await call("qloo_entity_tags", { entities: ids, limit: 5 });

  // 3. One full run of the app's pipeline, as the website would do it.
  const llm = createLLM();
  console.log(`Full run (model: ${llm.mode})...`);
  const result = await buildPlan(
    {
      audience: "Women 20-28 in Barcelona into indie music, A24 films, vintage fashion and film photography.",
      references: ["Phoebe Bridgers", "Lady Bird", "Polaroid"],
      location: "Barcelona",
      language: "en",
      autoResolve: true,
    },
    { qloo, llm },
  );
  await fs.writeFile("probe-output/pipeline.json", JSON.stringify(result, null, 2));
  console.log(
    `pipeline: ok=${result.ok} evidence=${result.evidence?.length ?? 0} videos=${result.plan?.videos?.length ?? 0} -> probe-output/pipeline.json`,
  );
  for (const w of result.warnings ?? []) console.log(`  warning: ${w}`);
} finally {
  await qloo.close();
}
