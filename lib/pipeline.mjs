// The TasteToContent agent pipeline.
//
//   1. interpret   LLM turns the free-text audience into Qloo signals (demographic, seeds, concepts, place)
//   2. resolve     qloo_describe / qloo_find_tags turn words into Qloo IDs (with warnings when ambiguous)
//   3. taste map   qloo_recommend across categories + qloo_entity_tags for shared concepts
//   4. plan        LLM writes pillars, videos and brand angles that must cite the Qloo evidence
//   5. validate    every citation is checked against the evidence list; uncited ideas are dropped
//
// Each Qloo call is recorded in `trace` so the UI can show where every idea came from.

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

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? Number(v.toFixed(3)) : null);

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
    tags: asList(base?.tags)
      .map((t) => (typeof t === "string" ? t : t?.name))
      .filter(Boolean)
      .slice(0, 5),
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

export async function buildPlan(input, { qloo, llm }) {
  const audience = String(input.audience ?? "").trim();
  const references = (input.references ?? []).map((s) => String(s).trim()).filter(Boolean).slice(0, MAX_SEEDS);
  const language = input.language === "es" ? "es" : "en";
  const userLocation = String(input.location ?? "").trim() || null;
  const trace = [];
  const warnings = [];

  const qcall = async (tool, args, purpose) => {
    const started = Date.now();
    let env;
    try {
      env = await qloo.call(tool, args);
    } catch (error) {
      env = { status: "error", summary: error.message, results: [], error: { code: "TRANSPORT", retryable: false } };
    }
    trace.push({
      n: trace.length + 1,
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
  const interpretation = await llm.interpretAudience({ audience, references });
  const location = userLocation ?? interpretation.location ?? null;
  const seedsIn = [
    ...references.map((name) => ({ name, type: null })),
    ...(interpretation.seeds ?? []),
  ];
  const seenSeed = new Set();
  const seeds = seedsIn
    .filter((s) => s?.name && !seenSeed.has(s.name.toLowerCase()) && seenSeed.add(s.name.toLowerCase()))
    .slice(0, MAX_SEEDS);
  const concepts = (interpretation.concepts ?? []).slice(0, MAX_CONCEPTS);

  // 2. Resolve ------------------------------------------------------------------
  const resolvedSeeds = (
    await mapLimit(seeds, 3, async (seed) => {
      const args = { entity: seed.name };
      if (seed.type) args.type = seed.type;
      const env = await qcall("qloo_describe", args, `Resolve "${seed.name}"`);
      const first = asList(env.results)[0];
      if (env.status === "ok" || env.status === "partial" || env.status === "degraded") {
        const item = normaliseItem(first);
        return item.qlooId ? { input: seed.name, ...item } : null;
      }
      if (env.status === "needs_input" && first) {
        const item = normaliseItem(first);
        warnings.push(`"${seed.name}" was ambiguous; used ${item.name}. Check it is the one you meant.`);
        return item.qlooId ? { input: seed.name, ...item, ambiguous: true } : null;
      }
      warnings.push(`Qloo could not match "${seed.name}" (${env.status}).`);
      return null;
    })
  ).filter(Boolean);

  const resolvedTags = (
    await mapLimit(concepts, 3, async (concept) => {
      const env = await qcall("qloo_find_tags", { query: concept, limit: 3 }, `Find tag for "${concept}"`);
      const first = asList(env.results)[0];
      if (!first || env.status === "error" || env.status === "empty") {
        warnings.push(`No Qloo tag found for "${concept}".`);
        return null;
      }
      const item = normaliseItem(first);
      return item.qlooId ? { input: concept, ...item } : null;
    })
  ).filter(Boolean);

  if (!resolvedSeeds.length && !resolvedTags.length && !interpretation.demographic) {
    return {
      ok: false,
      message:
        language === "es"
          ? "No hay suficientes señales. Añade 2 o 3 referencias concretas (artistas, series, marcas) que le gusten a tu audiencia."
          : "Not enough signals. Add 2 or 3 concrete references (artists, shows, brands) your audience likes.",
      interpretation,
      warnings,
      trace,
    };
  }

  // 3. Taste map ----------------------------------------------------------------
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

  const categories = await mapLimit(targets, 3, async (target) => {
    const args = { target_type: target.type, ...baseSignals, limit: PER_CATEGORY, explain: true };
    if (target.filter_location) args.filter_location = target.filter_location;
    const env = await qcall("qloo_recommend", args, `${target.label} this audience leans towards`);
    const seedIds = new Set(signalIds);
    const items = asList(env.results)
      .map(normaliseItem)
      .filter((i) => i.name && !seedIds.has(i.qlooId));
    return { type: target.type, label: target.label, status: env.status, items };
  });

  let audienceConcepts = [];
  if (signalIds.length) {
    const env = await qcall("qloo_entity_tags", { entities: signalIds, limit: 8 }, "Concepts the seed references share");
    audienceConcepts = asList(env.results).map(normaliseItem).filter((i) => i.name);
  }

  // Evidence list with stable ids the plan must cite.
  const evidence = [];
  for (const cat of categories) {
    for (const item of cat.items) {
      evidence.push({ id: `E${evidence.length + 1}`, category: cat.type, label: cat.label, ...item });
    }
  }
  for (const c of [...audienceConcepts, ...resolvedTags]) {
    if (evidence.some((e) => e.category === "concept" && e.name.toLowerCase() === c.name.toLowerCase())) continue;
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

  // 4. Plan ---------------------------------------------------------------------
  const rawPlan = await llm.writePlan({ audience, interpretation, evidence, language });

  // 5. Validate citations ---------------------------------------------------------
  const ids = new Set(evidence.map((e) => e.id));
  const brandNames = new Set(evidence.filter((e) => e.category === "brand").map((e) => e.name.toLowerCase()));
  const cite = (list) => [...new Set((list ?? []).filter((id) => ids.has(id)))];
  let dropped = 0;
  const keepCited = (arr) =>
    (arr ?? [])
      .map((x) => ({ ...x, evidence: cite(x.evidence) }))
      .filter((x) => (x.evidence.length ? true : (dropped++, false)));

  const plan = {
    summary: rawPlan.summary ?? "",
    pillars: keepCited(rawPlan.pillars),
    videos: keepCited(rawPlan.videos),
    brands: keepCited(rawPlan.brands).filter((b) => brandNames.has(String(b.name).toLowerCase())),
    limits: rawPlan.limits ?? "",
  };
  if (dropped) warnings.push(`${dropped} idea(s) were removed because they did not cite Qloo evidence.`);

  return {
    ok: true,
    language,
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
