# Devpost submission: TasteToContent

Copy each block into the matching Devpost field.

---

## Project name

TasteToContent

## Elevator pitch (max 200 characters)

Describe your audience. Qloo maps what they love, and an agent turns it into a short-form video plan and brand shortlist where every idea cites the Qloo signal behind it.

## Try it out (links)

- https://tastetocontent.onrender.com
- https://github.com/DavilikOwO/tastecontent

## Built with

qloo, qloo-mcp, claude, anthropic-api, node.js, express, javascript, html, css, docker, render

---

## About the project (paste everything below into the main description box)

### Inspiration

Small creators know *who* watches them, but not *what to make* for those people or which brands to pitch. The usual advice ("follow trends", "post consistently") ignores the one thing a creator actually has: an audience with a taste. Qloo knows how cultural tastes connect across music, film, TV, brands, podcasts and places. We wanted to turn that into a content plan a creator can shoot this week, and make every suggestion traceable back to the data.

### What it does

1. **Describe the audience** in plain words, add up to five things they love (artists, films, shows, brands) and, optionally, where they are.
2. **Confirm what you meant.** When Qloo reports that a name matches several entities (`needs_input`), the agent stops and asks. "Polaroid" can be the brand, a 2019 horror film, a video game or a bar; the option that fits the description is pre-selected, and "none of these" leaves it out. Nothing is built on a guess.
3. **Watch the agent work.** Progress streams live, one line per Qloo call.
4. **Taste map.** Music, TV, film, brands, podcasts and, when a location is given, places that Qloo associates with that audience, ranked by affinity, with "mostly via X" showing which of your references drives each result (Qloo explainability).
5. **The plan.** Three content pillars and 6–8 video ideas, each with a 2-second hook, a native short-form format, an effort level, three shot-by-shot beats and a caption, plus brands worth pitching. The strongest ideas deliberately cross two categories (a film's look plus a local place, a brand plus a music scene).
6. **Receipts.** Every pillar, video and brand carries evidence chips; hover or tap one to see the Qloo entity behind it. Ideas that cite no Qloo evidence, and brands Qloo did not return, are removed before the creator sees them.
7. **Take it with you.** Copy the whole plan as Markdown in one click.
8. **How it was built.** A trace of every Qloo call and every choice the creator made: tool, purpose, status, result count and time.

Plans can be written in English or Spanish.

### What makes it Qloo-powered

Qloo is not a garnish here: it is the only source of taste claims. The language model reads the description and writes the plan, but it may only cite numbered Qloo evidence, and the backend checks every citation.

| Step | Qloo MCP tool | Why |
| --- | --- | --- |
| Resolve references | `qloo_describe` | Turns "Phoebe Bridgers" into a Qloo entity ID; ambiguity goes back to the creator |
| Resolve moods and styles | `qloo_find_tags` | Turns "vintage fashion" into a Qloo tag URN instead of a guess |
| Taste map | `qloo_recommend` (artist, tv_show, movie, brand, podcast, place) | One combined profile of entities + tags + age/gender + location, with explainability |
| Shared concepts | `qloo_entity_tags` | Concepts that jointly describe the references, used for aesthetic pillars |

### Request to result (real run on the live demo)

**Input:** *"Women 20–28 in Barcelona into indie music, A24 films, vintage fashion and film photography."* References: *Phoebe Bridgers, Lady Bird, Polaroid*. Location: *Barcelona*.

1. **Interpret.** Claude extracts the demographic `women 20-28`, the location `Barcelona`, concepts (`indie music`, `A24 films`, `vintage fashion`) and one extra reference it inferred from the text (`A24`, as a brand).
2. **Resolve.** `qloo_describe` matches each reference. "Polaroid" is ambiguous, so the creator confirms *Polaroid (brand)*. Musicians that exist twice (as artist and as person) are collapsed so the creator only chooses between genuinely different things. `qloo_find_tags` resolves the concepts to `urn:tag:music:qloo:indie`, `urn:tag:keyword:media:minimalist_movie` and `urn:tag:style:qloo:vintage`.
3. **Map.** `qloo_recommend` runs once per category with the four entity IDs, the three tags, `demographic: women 20-28` and `signal_location: Barcelona`. A few of the results:
   - Music: Whitney, Molly Burch, Cherry Glazerr
   - Film: Portrait of a Lady on Fire, Pain and Glory, The French Dispatch
   - Places (Barcelona): Bocca Restaurant & Club, Gatsby, Little Beach House Barcelona
   - Brands: Crap Eyewear, Arizona Vintage, UNIF, Witchsy
4. **Evidence.** 46 numbered items (E1…E46) from 13 Qloo calls.
5. **Write and validate.** Claude writes the plan through a strict JSON schema; the backend drops anything uncited. One of the resulting videos:
   - **"Film still or my Tuesday?"** Hook: *"I shot my commute like a Wes Anderson frame."* Before-and-after, low effort: an ordinary street snap, re-shot symmetrical and pastel, then both side by side with film grain.
   - Evidence: **E15** *The French Dispatch* (film), **E39** *Photography* and **E40** *Breathtakingly Cinematic* (Qloo concepts).

### How we built it

- **Backend:** Node.js 22 and Express 5. The server talks to Qloo through the official harness (`@qloo/qloo-harness`) running as a local MCP server over stdio. The browser never talks to Qloo, and no key ever reaches the client.
- **Agent pipeline:** interpret → resolve (with a human-in-the-loop pause) → map → write → validate. Every step streams to the page as NDJSON.
- **Language model:** Claude (`claude-sonnet-5-5`) with structured outputs (JSON Schema), so both the reading of the audience and the plan arrive as validated objects. If the model fails, the plan is written from templates and the page says so.
- **Hosting:** a Docker image on Render, defined in `render.yaml`, so anyone can redeploy it with their own keys.
- **Guardrails for a public demo:** a per-visitor and daily limit on finished plans, a small cache, at most two Qloo calls at a time, and automatic retry with backoff when Qloo answers 429.

### Challenges we ran into

- **Real Qloo responses differ from the obvious shape.** Ambiguous matches come back as `needs_input` with candidates under `resolution.issues`; recommendations are `urn:entity` with the real kind in `subtype`; musicians exist as both artist and person; some names are also towns; age and gender only apply together with a location. We probed the live API, saved raw responses (without credentials) and rebuilt the parser and the offline sample data around those real shapes.
- **Don't let the model decide what the creator meant.** A reference like "Barbie" or "Polaroid" means different things to different audiences. The model's reading only pre-selects an option; the creator always has the last word.
- **Rate limits under a burst of calls.** The first public run hit 429s on three categories at once. The agent now limits concurrency, retries with jitter, tells the creator when a category is still missing and does not cache an incomplete plan.

### Accomplishments that we're proud of

- Every idea on screen can be traced to a Qloo entity or tag, and the trace shows exactly which calls produced it.
- The disambiguation step makes the agent honest: it asks instead of guessing.
- It is a complete product, not an API demo: input, live progress, taste map, plan, evidence, export.

### What we learned

Taste data is most useful when it is shown as evidence for a decision, not as a list of results. Constraining the model to cite numbered evidence, and enforcing that in code, made the output both more creative (cross-category ideas) and more trustworthy.

### What's next

- Saving plans and comparing two audiences side by side (`qloo_compare_audiences`).
- Using `qloo_where_popular` to suggest where to film for a given audience.
- A weekly "what to post" digest per audience.

### Responsible data handling

- No personal data is sent to Qloo: inputs are group-level descriptions and public cultural references.
- Results are shown as group-level affinities, never as predictions about a person or about how a video will perform.
- The plan suggests styles and references, not the use of copyrighted songs or clips.
- Keys live only in server environment variables and are never sent to the browser or written to logs.

### Known limitations (what the result does not establish)

- Qloo describes cultural taste, not platform trends: the plan says what this audience is likely to relate to, not what will go viral.
- Affinity scores from separate calls are not directly comparable, so bars are scaled within each category.
- Qloo uses age and gender only together with a location; without one the app leaves them out and says so.
- The public demo runs on a free plan: after 15 minutes without visitors the first request can take about a minute while the server wakes up. It is also limited to 6 finished plans per visitor per hour.

### Testing instructions

No login is needed. Open https://tastetocontent.onrender.com (allow up to a minute on the first visit), click **Fill in an example** or describe any audience, add a few references and a city, and press **Build my plan**. Try the reference "Polaroid" to see the disambiguation step. To run it yourself, follow the README: Node.js 22.19+, the Qloo harness, a Qloo hackathon key and, optionally, an Anthropic key (without one the plan is written from templates).
