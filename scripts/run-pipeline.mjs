// Run the whole pipeline from the terminal: `npm run test:pipeline`
import { createQloo, MockQloo } from "../lib/qloo.mjs";
import { createLLM } from "../lib/llm.mjs";
import { buildPlan } from "../lib/pipeline.mjs";

try {
  process.loadEnvFile(".env");
} catch {}

let qloo = createQloo();
if (qloo.mode === "live" && !(await qloo.readiness().catch(() => false))) {
  await qloo.close();
  qloo = new MockQloo();
}
const llm = createLLM();
console.log(`Qloo: ${qloo.mode} · Model: ${llm.mode}`);

const result = await buildPlan(
  {
    audience: "Women 20-28 in Barcelona who love indie music, A24 films, vintage fashion and film photography.",
    references: ["Phoebe Bridgers", "Lady Bird", "Polaroid"],
    language: process.argv[2] === "es" ? "es" : "en",
    autoResolve: true, // in the terminal there is nobody to ask, so take the top match
  },
  {
    qloo,
    llm,
    onEvent: (e) => {
      if (e.type === "stage") console.log(`-- ${e.stage}`);
      if (e.type === "call") console.log(`   ${e.call.tool}: ${e.call.purpose} -> ${e.call.status} (${e.call.resultCount})`);
    },
  },
);
await qloo.close();

if (!result.ok) {
  console.log("Not OK:", result.message, result.warnings);
  process.exit(1);
}
console.log("Seeds:", result.resolved.seeds.map((s) => s.name).join(", "));
console.log("Evidence items:", result.evidence.length, "· Qloo calls:", result.trace.length);
console.log("Pillars:", result.plan.pillars.map((p) => p.title));
console.log("Writer:", result.writer);
console.log("Videos:", result.plan.videos.length, "· Brands:", result.plan.brands.map((b) => b.name));
for (const v of result.plan.videos) console.log(`  - [${v.effort}] ${v.title} | ${v.hook} | ${v.evidence.join(",")}`);
console.log("Warnings:", result.warnings);
