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

function findEntity(name) {
  const needle = name.toLowerCase();
  for (const [type, items] of Object.entries(CATALOG)) {
    const hit = items.find(([n]) => n.toLowerCase() === needle || n.toLowerCase().includes(needle));
    if (hit) return { type, name: hit[0], tags: hit[1] };
  }
  return null;
}

export function mockQlooCall(tool, args) {
  switch (tool) {
    case "qloo_describe": {
      const found = findEntity(args.entity);
      const type = found?.type ?? args.type ?? "artist";
      const name = found?.name ?? args.entity;
      return envelope("describe", [
        { id: mockId(type, name), name, type: `urn:entity:${type}`, popularity: 0.9 },
      ], `Resolved "${args.entity}" as ${name}.`);
    }
    case "qloo_find_tags": {
      const q = args.query.toLowerCase();
      const best = TAG_POOL.find((t) => q.includes(t) || t.includes(q)) ?? q;
      return envelope("find_tags", [
        { id: `urn:tag:keyword:mock:${slug(best)}`, name: best, type: "urn:tag:keyword:mock" },
        { id: `urn:tag:genre:mock:${slug(best)}`, name: `${best} (genre)`, type: "urn:tag:genre:mock" },
      ], `Found tags for "${args.query}".`);
    }
    case "qloo_recommend": {
      const pool = CATALOG[args.target_type] ?? [];
      const text = words(args);
      const seed = hash(text + args.target_type);
      const scored = pool
        .filter(([name]) => !text.includes(name.toLowerCase()))
        .map(([name, tags], i) => {
          const overlap = tags.filter((t) => text.includes(t)).length;
          const jitter = ((seed >>> (i % 24)) % 100) / 1000;
          return { name, tags, score: Math.min(0.99, 0.55 + overlap * 0.12 + jitter) };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, args.limit ?? 10);
      return envelope(
        "recommend",
        scored.map((s, i) => ({
          entity_id: mockId(args.target_type, s.name),
          name: s.name,
          type: `urn:entity:${args.target_type}`,
          rank: i + 1,
          affinity: Number(s.score.toFixed(2)),
          popularity: Number((0.6 + ((seed >>> i) % 40) / 100).toFixed(2)),
          tags: s.tags.map((t) => ({ name: t })),
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
      return envelope(
        "entity_tags",
        picked.map((t, i) => ({ id: `urn:tag:keyword:mock:${slug(t)}`, name: t, rank: i + 1 })),
        "Concepts that characterise the seed entities.",
      );
    }
    case "qloo_where_popular": {
      return envelope("where_popular", [
        { name: "Barcelona", affinity: 0.82 },
        { name: "Madrid", affinity: 0.77 },
        { name: "Valencia", affinity: 0.64 },
      ], `Where ${args.entity} is popular within ${args.within}.`);
    }
    default:
      return envelope(tool.replace(/^qloo_/, ""), [], "This sample tool returns no data.");
  }
}
