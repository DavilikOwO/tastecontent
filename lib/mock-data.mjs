// SAMPLE DATA ONLY. Used when no Qloo key is configured so the app can be built and
// demoed end to end. Names are real cultural entities, but every affinity number here
// is made up and is NOT a Qloo result. The UI labels this mode clearly.

const CATALOG = {
  artist: [
    ["Phoebe Bridgers", ["indie", "sad", "folk", "film"]],
    ["Rosalía", ["pop", "flamenco", "fashion", "spain"]],
    ["Bad Bunny", ["reggaeton", "latin", "fashion"]],
    ["Clairo", ["indie", "bedroom pop", "vintage"]],
    ["Mitski", ["indie", "sad", "film"]],
    ["The Marías", ["indie", "dreamy", "vintage", "latin"]],
    ["Fred again..", ["electronic", "fitness", "gym"]],
    ["Tame Impala", ["psychedelic", "indie", "vintage"]],
    ["NewJeans", ["k-pop", "fashion", "y2k"]],
    ["Hans Zimmer", ["film", "score", "gaming"]],
    ["Bizarrap", ["latin", "rap", "gaming"]],
    ["Lana Del Rey", ["vintage", "film", "fashion"]],
  ],
  tv_show: [
    ["The Bear", ["food", "cooking", "drama"]],
    ["Fleabag", ["comedy", "film", "indie"]],
    ["Euphoria", ["fashion", "y2k", "drama"]],
    ["Normal People", ["indie", "sad", "romance"]],
    ["Arcane", ["gaming", "animation"]],
    ["Squid Game", ["k-drama", "thriller"]],
    ["Las chicas del cable", ["spain", "vintage", "drama"]],
    ["Chef's Table", ["food", "cooking", "documentary"]],
    ["Queer Eye", ["fashion", "lifestyle", "wellness"]],
    ["Severance", ["office", "thriller", "film"]],
  ],
  movie: [
    ["Everything Everywhere All at Once", ["film", "a24", "indie"]],
    ["Lady Bird", ["indie", "film", "coming of age"]],
    ["Past Lives", ["indie", "romance", "film"]],
    ["Aftersun", ["indie", "sad", "film", "vintage"]],
    ["Ratatouille", ["food", "cooking", "animation"]],
    ["The Grand Budapest Hotel", ["film", "vintage", "aesthetic"]],
    ["Rocky", ["fitness", "gym", "sport"]],
    ["Spider-Man: Across the Spider-Verse", ["animation", "gaming"]],
    ["Perfect Days", ["indie", "slow living", "film"]],
    ["Barbie", ["fashion", "pop", "comedy"]],
  ],
  brand: [
    ["Polaroid", ["vintage", "film", "photography"]],
    ["Vinted", ["vintage", "fashion", "second hand"]],
    ["Patagonia", ["outdoor", "wellness"]],
    ["Glossier", ["beauty", "fashion"]],
    ["Fujifilm", ["photography", "film", "vintage"]],
    ["Gymshark", ["fitness", "gym"]],
    ["Nintendo", ["gaming"]],
    ["Le Creuset", ["food", "cooking"]],
    ["Muji", ["slow living", "minimal"]],
    ["Levi's", ["vintage", "fashion"]],
    ["Bershka", ["fashion", "spain", "y2k"]],
    ["Spotify", ["music", "indie", "pop"]],
    ["Barbie", ["fashion", "pop", "toys"]],
  ],
  podcast: [
    ["Song Exploder", ["music", "indie"]],
    ["The Rest Is History", ["history", "documentary"]],
    ["Estirando el chicle", ["comedy", "spain"]],
    ["Huberman Lab", ["fitness", "wellness"]],
    ["You're Wrong About", ["pop culture", "film"]],
    ["La Ruina", ["comedy", "spain"]],
  ],
  place: [
    ["Mercat de Sant Antoni", ["food", "vintage", "spain"]],
    ["Filmoteca de Catalunya", ["film", "indie", "spain"]],
    ["Razzmatazz", ["music", "indie", "spain"]],
    ["Cines Verdi", ["film", "indie", "spain"]],
    ["Holala! Plaza", ["vintage", "fashion", "spain"]],
  ],
  videogame: [
    ["Stardew Valley", ["cozy", "gaming", "indie"]],
    ["Hades", ["gaming", "indie"]],
    ["The Legend of Zelda: Tears of the Kingdom", ["gaming"]],
    ["Celeste", ["gaming", "indie"]],
  ],
};

const TAG_POOL = [
  "indie", "film", "vintage", "fashion", "sad", "romance", "coming of age", "photography",
  "slow living", "cozy", "food", "cooking", "fitness", "gaming", "pop", "latin", "spain",
  "aesthetic", "y2k", "wellness", "comedy", "documentary",
];

function hash(text) {
  let h = 2166136261;
  for (const ch of text) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const slug = (s) => s.toLowerCase().normalize("NFKD").replace(/[^\w]+/g, "_").replace(/^_|_$/g, "");
const mockId = (type, name) => `mock-${type}-${slug(name)}`;

function words(args) {
  const parts = [
    ...(args.signals ?? []),
    ...(args.signal_tags ?? []),
    ...(args.include_tags ?? []),
    args.demographic ?? "",
    args.signal_location ?? "",
  ];
  return parts
    .join(" ")
    .toLowerCase()
    .replace(/urn:tag:[^:]+:[^:]+:/g, "")
    .replace(/mock-[a-z_]+-/g, "")
    .replace(/_/g, " ");
}

function envelope(operation, results, summary, extra = {}) {
  return {
    schema_version: "1.0-preview.1",
    operation,
    status: results.length ? "ok" : "empty",
    summary: `[SAMPLE DATA] ${summary}`,
    results,
    result_count: results.length,
    warnings: ["Sample data: not a Qloo result."],
    execution: { transport: "mcp", transport_name: "mock", correlation_id: `mock-${Date.now()}`, duration_ms: 120 },
    ...extra,
  };
}

/** Same shape as a real `needs_input`: no results, the choices live in resolution.issues. */
function needsInput(operation, summary, issues = []) {
  return {
    schema_version: "1.0-preview.1",
    operation,
    status: "needs_input",
    summary: `[SAMPLE DATA] ${summary}`,
    resolution: { issues },
    results: [],
    execution: { transport: "mcp", transport_name: "mock", correlation_id: `mock-${Date.now()}`, duration_ms: 5 },
  };
}

// Entities that only exist for name matching, mirroring what real Qloo returns:
// musicians also appear as a "person", and some names are also towns ("locality").
const RESOLVE_ONLY = [
  ["person", "Phoebe Bridgers"],
  ["person", "Rosalía"],
  ["locality", "Rosalía"],
  ["person", "Barbie"],
  ["artist", "Barbie"],
];

// Short descriptions so the "which one did you mean?" step has something to show.
const DESCRIPTIONS = {
  "movie:Barbie": ["Barbie (2023), directed by Greta Gerwig.", 2023],
  "brand:Barbie": ["Fashion doll brand by Mattel.", null],
  "artist:Barbie": ["Fictional character and cultural icon, known as a fashion doll.", null],
  "person:Barbie": ["Japanese comedian.", null],
  "person:Phoebe Bridgers": ["American musician (born 1994).", null],
  "person:Rosalía": ["Spanish singer (born 1992).", null],
};

function findEntity(name, type) {
  const needle = name.toLowerCase();
  for (const [t, items] of Object.entries(CATALOG)) {
    if (type && t !== type) continue;
    const hit = items.find(([n]) => n.toLowerCase() === needle || n.toLowerCase().includes(needle));
    if (hit) return { type: t, name: hit[0], tags: hit[1] };
  }
  return null;
}

function findExact(name, type) {
  const needle = name.toLowerCase();
  const all = [
    ...Object.entries(CATALOG).flatMap(([t, items]) => items.map(([n]) => [t, n])),
    ...RESOLVE_ONLY,
  ];
  return all.filter(([t, n]) => (!type || t === type) && n.toLowerCase() === needle).map(([t, n]) => ({ type: t, name: n }));
}

function candidate({ type, name }) {
  const [description, year] = DESCRIPTIONS[`${type}:${name}`] ?? [null, null];
  return {
    id: mockId(type, name),
    name,
    type: `urn:entity:${type}`,
    popularity: 0.9,
    ...(description ? { description } : {}),
    ...(year ? { release_year: year } : {}),
  };
}

export function mockQlooCall(tool, args) {
  switch (tool) {
    case "qloo_describe": {
      const exact = findExact(args.entity, args.type);
      if (exact.length > 1) {
        return needsInput("describe", "Choose the intended Qloo entity.", [
          { input: args.entity, kind: "ambiguous", input_kind: "entity", field: "entity", candidates: exact.map(candidate) },
        ]);
      }
      const found = exact[0] ?? findEntity(args.entity, args.type);
      const type = found?.type ?? args.type ?? "artist";
      const name = found?.name ?? args.entity;
      const c = candidate({ type, name });
      // Like real Qloo: the result itself has no type; it is reported in `interpretation`.
      return envelope(
        "describe",
        [{ entity_id: c.id, name, popularity: c.popularity, properties: c.description ? { short_description: c.description } : {} }],
        `Resolved "${args.entity}" as ${name}.`,
        {
          interpretation: { entity: { input: args.entity, entityId: c.id, name, type: c.type, match: "exact" } },
          resolution: { outcomes: [{ input: args.entity, status: "resolved", match: "exact", selected: c }] },
        },
      );
    }
    case "qloo_find_tags": {
      const q = args.query.toLowerCase();
      const best = TAG_POOL.find((t) => q.includes(t) || t.includes(q)) ?? q;
      return envelope("find_tags", [
        { id: `urn:tag:genre:qloo:${slug(best)}`, name: best, type: "urn:tag:genre:qloo", popularity: 0.99 },
        { id: `urn:tag:keyword:qloo:${slug(best)}`, name: `${best} (keyword)`, type: "urn:tag:keyword:qloo", popularity: 0.97 },
      ], `Found tags for "${args.query}".`);
    }
    case "qloo_recommend": {
      if (args.demographic && !args.signal_location) {
        return needsInput("recommend", "Demographic Qloo signals require signal_location so the audience geography is explicit.");
      }
      const pool = CATALOG[args.target_type] ?? [];
      const text = words(args);
      const seed = hash(text + args.target_type);
      const scored = pool
        .filter(([name]) => !text.includes(name.toLowerCase()))
        .map(([name, tags], i) => {
          const overlap = tags.filter((t) => text.includes(t)).length;
          const jitter = ((seed >>> (i % 24)) % 100) / 1000;
          return { name, score: Math.min(0.99, 0.55 + overlap * 0.12 + jitter) };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, args.limit ?? 10);
      // Same fields as the real compacted entity: no tags, affinity at the top level.
      return envelope(
        "recommend",
        scored.map((s, i) => ({
          entity_id: mockId(args.target_type, s.name),
          name: s.name,
          // Like real Qloo: generic type, the real kind in subtype.
          type: "urn:entity",
          subtype: `urn:entity:${args.target_type}`,
          popularity: Number((0.6 + ((seed >>> i) % 40) / 100).toFixed(2)),
          affinity: Number(s.score.toFixed(2)),
          explainability: {
            "signal.interests.entities": (args.signals ?? []).map((id, j, all) => ({
              entity_id: id,
              score: Number(((1 / all.length) + (j === (i % all.length) ? 0.08 : -0.08 / Math.max(1, all.length - 1))).toFixed(3)),
            })),
          },
        })),
        `Recommended ${args.target_type} entities for the taste profile.`,
      );
    }
    case "qloo_entity_tags": {
      const text = words({ signals: args.entities });
      const seed = hash(text);
      const picked = [...TAG_POOL]
        .sort((a, b) => ((hash(a) ^ seed) % 97) - ((hash(b) ^ seed) % 97))
        .slice(0, args.limit ?? 8);
      // Real Qloo mixes in restaurant/hotel attributes here; the app must filter them out.
      const placeNoise = [
        { id: "urn:tag:specialty_dish:place:baked_eggs", name: "Baked Eggs", type: "urn:tag:specialty_dish:place", popularity: 0.85, affinity: 1 },
        { id: "urn:tag:credit_card:place:discover", name: "Discover", type: "urn:tag:credit_card:place", popularity: 1, affinity: 1 },
      ];
      return envelope(
        "entity_tags",
        [...placeNoise, ...picked.map((t, i) => ({
          id: `urn:tag:keyword:qloo:${slug(t)}`,
          name: t,
          type: "urn:tag:keyword:qloo",
          popularity: 0.9,
          affinity: Number((0.95 - i * 0.05).toFixed(2)),
        }))],
        "Concepts that characterise the seed entities.",
      );
    }
    case "qloo_where_popular": {
      return envelope("where_popular", [
        { name: "Barcelona", query: { affinity: 0.82 } },
        { name: "Madrid", query: { affinity: 0.77 } },
        { name: "Valencia", query: { affinity: 0.64 } },
      ], `Where ${args.entity} is popular within ${args.within}.`);
    }
    default:
      return envelope(tool.replace(/^qloo_/, ""), [], "This sample tool returns no data.");
  }
}
