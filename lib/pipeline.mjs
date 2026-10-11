// The TasteToContent agent pipeline.
//
//   1. interpret  The model turns the free-text audience into Qloo signals
//                 (skipped when the client sends back an interpretation it already has)
//   2. resolve    qloo_describe / qloo_find_tags turn words into Qloo IDs.
//                 Ambiguous references stop the run and go back to the user to choose.
//   3. map        qloo_recommend across categories + qloo_entity_tags for shared concepts
//   4. write      The model writes pillars, videos and brand angles that must cite the evidence
//   5. validate   Every citation is checked; uncited ideas and unknown brands are dropped
//
// Every Qloo call is recorded in `trace` and streamed through `onEvent` as it happens.
import { MockLLM, SEED_TYPES } from "./llm.mjs";

const TASTE_TARGETS = [
  { type: "artist", label: "Music" },
  { type: "tv_show", label: "TV" },
  { type: "movie", label: "Film" },
  { type: "brand", label: "Brands" },
  { type: "podcast", label: "Podcasts" },
];
const PER_CATEGORY = 6;
const MAX_SEEDS = 5;
const MAX_CONCEPTS = 3;
const SEED_TYPE_SET = new Set(SEED_TYPES);
const EFFORTS = new Set(["low", "medium", "high"]);

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? Number(v.toFixed(3)) : null);
const str = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const lower = (s) => String(s).trim().toLowerCase();
/** "urn:entity:tv_show" -> "tv_show" */
const kindOf = (type) => lower(String(type ?? "").split(":").at(-1));
const shortError = (error) => String(error?.message ?? error).replace(/\s+/g, " ").slice(0, 140);

function asList(results) {
  if (Array.isArray(results)) return results;
  if (results && typeof results === "object") {
    for (const key of ["entities", "items", "tags", "results", "candidates"]) {
      if (Array.isArray(results[key])) return results[key];
    }
    return [results];
  }
  return [];
}

function normaliseItem(r) {
  const base = r?.selected ?? r?.entity ?? r;
  return {
    qlooId: base?.entity_id ?? base?.entityId ?? base?.id ?? base?.tag_id ?? base?.tagId ?? base?.urn ?? null,
    name: base?.name ?? base?.input ?? null,
    type: base?.type ?? base?.subtype ?? null,
    affinity: num(base?.affinity ?? base?.query?.affinity ?? base?.score),
    popularity: num(base?.popularity),
    description: str(base?.description ?? base?.properties?.short_description ?? base?.properties?.description, 160),
    year: base?.release_year ?? base?.properties?.release_year ?? null,
    tags: asList(base?.tags)
      .map((t) => (typeof t === "string" ? t : t?.name))
      .filter(Boolean)
      .slice(0, 5),
  };
}

/** Every candidate a describe/find result offers, whatever shape the envelope uses. */
function candidatesOf(env) {
  const out = [];
  for (const r of asList(env?.results)) {
    if (Array.isArray(r?.candidates)) out.push(...r.candidates);
    else out.push(r);
  }
  const seen = new Set();
  return out
    .map(normaliseItem)
    .filter((c) => c.qlooId && c.name && !seen.has(c.qlooId) && seen.add(c.qlooId));
}

/** Accepts model output or an interpretation sent back by the client; returns a safe copy. */
export function sanitizeInterpretation(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    demographic: str(raw.demographic, 80),
    seeds: (Array.isArray(raw.seeds) ? raw.seeds : [])
      .map((s) => ({ name: str(s?.name, 100), type: SEED_TYPE_SET.has(s?.type) ? s.type : null }))
      .filter((s) => s.name)
      .slice(0, MAX_SEEDS),
    concepts: (Array.isArray(raw.concepts) ? raw.concepts : [])
      .map((c) => str(c, 60))
      .filter(Boolean)
      .slice(0, 4),
    location: str(raw.location, 80),
  };
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function buildPlan(input, { qloo, llm, onEvent }) {
  const emit = typeof onEvent === "function" ? onEvent : () => {};
  const audience = String(input.audience ?? "").trim();
  const references = (input.references ?? []).map((s) => String(s).trim()).filter(Boolean).slice(0, MAX_SEEDS);
  const language = input.language === "es" ? "es" : "en";
  const userLocation = str(input.location, 80);
  const confirmed = new Map(Object.entries(input.confirmed ?? {}).map(([k, v]) => [lower(k), v]));
  const skip = new Set((input.skip ?? []).map(lower));
  const autoResolve = input.autoResolve === true;
  const trace = [];
  const warnings = [];
  const templateLLM = new MockLLM();
  let writer = llm.mode;

  const record = (entry) => {
    const full = { n: trace.length + 1, ...entry };
    trace.push(full);
    emit({ type: "call", call: full });
  };

  const qcall = async (tool, args, purpose) => {
    const started = Date.now();
    let env;
    try {
      env = await qloo.call(tool, args);
    } catch (error) {
      env = { status: "error", summary: shortError(error), results: [], error: { code: "TRANSPORT", retryable: false } };
    }
    record({
      tool,
      purpose,
      args,
      status: env.status,
      summary: env.summary ?? "",
      resultCount: env.result_count ?? asList(env.results).length,
      ms: env.execution?.duration_ms ?? Date.now() - started,
      correlationId: env.execution?.correlation_id ?? null,
      endpoint: env.provenance?.endpoint ?? null,
      error: env.error ? { code: env.error.code, recovery: env.error.recovery ?? null } : null,
    });
    return env;
  };

  // 1. Interpret ----------------------------------------------------------------
  emit({ type: "stage", stage: "interpret" });
  let interpretation = sanitizeInterpretation(input.interpretation);
  if (!interpretation) {
    let raw;
    try {
      raw = await llm.interpretAudience({ audience, references });
    } catch (error) {
      if (llm.mode !== "live") throw error;
      warnings.push(`The AI could not read the description (${shortError(error)}), so a simpler reader was used.`);
      raw = await templateLLM.interpretAudience({ audience, references });
    }
    interpretation = sanitizeInterpretation(raw) ?? { demographic: null, seeds: [], concepts: [], location: null };
  }
  const location = userLocation ?? interpretation.location ?? null;

  // The creator's own references come first. For those, the model's type is only a guess:
  // Qloo is asked without it, and the guess is used to pre-select an option if Qloo is unsure.
  const typeFor = new Map(interpretation.seeds.filter((s) => s.type).map((s) => [lower(s.name), s.type]));
  const seen = new Set();
  const seeds = [
    ...references.map((name) => ({ name, type: typeFor.get(lower(name)) ?? null, fromUser: true })),
    ...interpretation.seeds.map((s) => ({ ...s, fromUser: false })),
  ]
    .filter((s) => s.name && !skip.has(lower(s.name)) && !seen.has(lower(s.name)) && seen.add(lower(s.name)))
    .slice(0, MAX_SEEDS);
  const concepts = interpretation.concepts.slice(0, MAX_CONCEPTS);

  // 2. Resolve ------------------------------------------------------------------
  emit({ type: "stage", stage: "resolve" });
  const ambiguous = [];
  const resolvedSeeds = (
    await mapLimit(seeds, 3, async (seed) => {
      const chosen = confirmed.get(lower(seed.name));
      if (chosen) {
        const kind = String(chosen.type ?? "").split(":").at(-1).replaceAll("_", " ");
        record({
          tool: "your choice",
          purpose: `You picked ${chosen.name}${kind ? ` (${kind})` : ""} for "${seed.name}"`,
          args: {},
          status: "ok",
          resultCount: 1,
          ms: 0,
        });
        return { input: seed.name, qlooId: chosen.id, name: chosen.name, type: chosen.type ?? null, affinity: null, popularity: null, tags: [] };
      }
      const guess = seed.type; // the model's reading of the description, may be null
      const args = { entity: seed.name };
      if (guess && !seed.fromUser) args.type = guess;
      const env = await qcall("qloo_describe", args, `Match "${seed.name}"`);
      const candidates = candidatesOf(env);

      const ask = (options, suggested) => {
        const shown = options.slice(0, 5);
        if (suggested && !shown.some((c) => c.qlooId === suggested.qlooId)) shown[shown.length - 1] = suggested;
        if (autoResolve) {
          const pick = suggested ?? shown[0];
          warnings.push(`"${seed.name}" could mean several things; used ${pick.name}.`);
          return { input: seed.name, ...pick, ambiguous: true };
        }
        ambiguous.push({ input: seed.name, candidates: shown, suggested: suggested?.qlooId ?? null });
        return null;
      };

      if (["ok", "partial", "degraded"].includes(env.status) && candidates[0]) {
        const match = candidates[0];
        // Qloo is sure, but about a different kind of thing than the description suggests:
        // look for the other reading and let the creator decide.
        if (seed.fromUser && guess && match.type && kindOf(match.type) !== guess) {
          const alt = candidatesOf(
            await qcall("qloo_describe", { entity: seed.name, type: guess }, `Check "${seed.name}" as a ${guess.replaceAll("_", " ")}`),
          )[0];
          if (alt && alt.qlooId !== match.qlooId) return ask([alt, match], alt);
        }
        return { input: seed.name, ...match };
      }
      if (env.status === "needs_input" && candidates.length) {
        if (candidates.length === 1) return { input: seed.name, ...candidates[0] };
        const suggested = guess ? candidates.find((c) => kindOf(c.type) === guess) : null;
        return ask(candidates, suggested);
      }
      warnings.push(`Qloo could not match "${seed.name}", so it was left out.`);
      return null;
    })
  ).filter(Boolean);

  if (ambiguous.length) {
    return { ok: false, needsConfirmation: true, ambiguous, interpretation, warnings, trace };
  }

  const resolvedTags = (
    await mapLimit(concepts, 3, async (concept) => {
      const env = await qcall("qloo_find_tags", { query: concept, limit: 3 }, `Find the tag for "${concept}"`);
      const first = candidatesOf(env)[0];
      if (!first || env.status === "error" || env.status === "empty") {
        warnings.push(`No Qloo tag found for "${concept}".`);
        return null;
      }
      return { input: concept, ...first };
    })
  ).filter(Boolean);

  if (!resolvedSeeds.length && !resolvedTags.length && !interpretation.demographic) {
    return {
      ok: false,
      message:
        language === "es"
          ? "No hay suficientes señales. Añade 2 o 3 referencias concretas (artistas, series, marcas) que le gusten a tu audiencia."
          : "Not enough to go on. Add 2 or 3 concrete references (artists, shows, brands) your audience likes.",
      interpretation,
      warnings,
      trace,
    };
  }

  // 3. Taste map ----------------------------------------------------------------
  emit({ type: "stage", stage: "map" });
  const signalIds = resolvedSeeds.map((s) => s.qlooId);
  const tagIds = resolvedTags.map((t) => t.qlooId);
  const baseSignals = {};
  if (signalIds.length) baseSignals.signals = signalIds;
  if (tagIds.length) {
    baseSignals.signal_tags = tagIds;
    baseSignals.signal_tags_operator = "union";
  }
  if (interpretation.demographic) baseSignals.demographic = interpretation.demographic;
  if (location) baseSignals.signal_location = location;

  const targets = [...TASTE_TARGETS];
  if (location) targets.push({ type: "place", label: "Places", filter_location: location });

  const seedIds = new Set(signalIds);
  const categories = await mapLimit(targets, 3, async (target) => {
    const args = { target_type: target.type, ...baseSignals, limit: PER_CATEGORY, explain: true };
    if (target.filter_location) args.filter_location = target.filter_location;
    const env = await qcall("qloo_recommend", args, `${target.label} this audience leans towards`);
    const items = candidatesOf(env).filter((i) => !seedIds.has(i.qlooId));
    return { type: target.type, label: target.label, status: env.status, items };
  });

  let audienceConcepts = [];
  if (signalIds.length) {
    const env = await qcall("qloo_entity_tags", { entities: signalIds, limit: 8 }, "Concepts your references share");
    audienceConcepts = candidatesOf(env);
  }

  const evidence = [];
  for (const cat of categories) {
    for (const item of cat.items) {
      evidence.push({ id: `E${evidence.length + 1}`, category: cat.type, label: cat.label, ...item });
    }
  }
  for (const c of [...audienceConcepts, ...resolvedTags]) {
    if (evidence.some((e) => e.category === "concept" && lower(e.name) === lower(c.name))) continue;
    evidence.push({ id: `E${evidence.length + 1}`, category: "concept", label: "Concepts", ...c });
  }

  if (!evidence.length) {
    return {
      ok: false,
      message:
        language === "es"
          ? "Qloo no devolvió afinidades para estas señales. Prueba con referencias más conocidas."
          : "Qloo returned no affinities for these signals. Try better-known references.",
      interpretation,
      warnings,
      trace,
    };
  }

  // 4. Write --------------------------------------------------------------------
  emit({ type: "stage", stage: "write" });
  const writeArgs = { audience, interpretation: { ...interpretation, location }, evidence, language };
  let rawPlan;
  try {
    rawPlan = await llm.writePlan(writeArgs);
  } catch (error) {
    if (llm.mode !== "live") throw error;
    warnings.push(`The AI writer failed (${shortError(error)}), so this plan was written from templates.`);
    rawPlan = await templateLLM.writePlan(writeArgs);
    writer = "mock";
  }

  // 5. Validate citations ---------------------------------------------------------
  const ids = new Set(evidence.map((e) => e.id));
  const brandByName = new Map(evidence.filter((e) => e.category === "brand").map((e) => [lower(e.name), e]));
  const cite = (list) => [...new Set((Array.isArray(list) ? list : []).filter((id) => ids.has(id)))];
  let dropped = 0;
  const keepCited = (arr) =>
    (Array.isArray(arr) ? arr : [])
      .map((x) => ({ ...x, evidence: cite(x?.evidence) }))
      .filter((x) => (x.evidence.length ? true : (dropped++, false)));

  const plan = {
    summary: str(rawPlan?.summary, 600) ?? "",
    pillars: keepCited(rawPlan?.pillars).map((p) => ({
      title: str(p.title, 120) ?? "",
      description: str(p.description, 400) ?? "",
      evidence: p.evidence,
    })),
    videos: keepCited(rawPlan?.videos).map((v) => ({
      title: str(v.title, 160) ?? "",
      hook: str(v.hook, 160) ?? "",
      format: str(v.format, 60),
      pillar: str(v.pillar, 120),
      effort: EFFORTS.has(v.effort) ? v.effort : null,
      beats: (Array.isArray(v.beats) ? v.beats : []).map((b) => str(b, 200)).filter(Boolean).slice(0, 4),
      caption: str(v.caption, 220),
      why: str(v.why, 300) ?? "",
      evidence: v.evidence,
    })),
    brands: keepCited(rawPlan?.brands)
      .filter((b) => brandByName.has(lower(b.name ?? "")))
      .map((b) => ({ name: brandByName.get(lower(b.name)).name, angle: str(b.angle, 300) ?? "", evidence: b.evidence })),
    limits: str(rawPlan?.limits, 400) ?? "",
  };
  if (dropped) warnings.push(`${dropped} idea(s) were removed because they did not cite Qloo evidence.`);

  return {
    ok: true,
    language,
    writer,
    interpretation: { ...interpretation, location },
    resolved: { seeds: resolvedSeeds, tags: resolvedTags },
    tasteMap: categories,
    concepts: audienceConcepts,
    evidence,
    plan,
    warnings,
    trace,
  };
}
