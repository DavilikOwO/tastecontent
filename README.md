# TasteToContent

Turn what your audience loves into what you post next.

Small creators know *who* watches them, but not what to make for them or which brands to pitch. TasteToContent takes a plain description of an audience, maps that audience's cultural taste with **Qloo**, and writes a short-form video plan in which **every idea cites the Qloo signal it comes from**.

## What it does

1. **Describe the audience** in plain words, plus up to 5 things they love (artists, shows, films, brands) and optionally where they are.
2. **Confirm ambiguous references**: when Qloo reports that a name matches more than one entity (`needs_input`), the agent stops and asks which one you meant, or lets you leave it out, before building anything on a guess.
3. **Watch the agent work**: progress streams live, showing each Qloo call as it happens.
4. **Taste map**: music, TV, film, brands, podcasts (and places, when a location is given) that Qloo associates with that audience, ranked by relative affinity.
5. **Plan**: 3 content pillars and 6–8 video ideas, each with a 2-second hook, a native short-form format, an effort level, three shot-by-shot beats and a caption, plus brands to pitch. The best ideas deliberately cross two categories (a film and a brand, an artist and a place).
6. **Receipts**: each pillar, video and brand carries evidence chips. Hover or click one to see the Qloo entity it is based on. Ideas that cannot cite Qloo evidence, and brands Qloo did not return, are removed before they reach the user.
7. **Take it with you**: copy the whole plan as Markdown in one click.
8. **How it was built**: a trace of every Qloo call and every choice you made (tool, purpose, status, result count, time).

## Qloo tools used and why

| Step | Qloo MCP tool | Why it fits |
| --- | --- | --- |
| Resolve references | `qloo_describe` | Turns "Phoebe Bridgers" into a Qloo entity ID; ambiguous matches are flagged |
| Resolve moods and styles | `qloo_find_tags` | Turns "vintage fashion" into a Qloo tag URN instead of guessing |
| Taste map | `qloo_recommend` (artist, tv_show, movie, brand, podcast, place) | One combined profile of entities + tags + demographic + location |
| Shared concepts | `qloo_entity_tags` | Concepts that jointly characterise the references, used for aesthetic pillars |

The language model only interprets the description and writes the plan, through forced tool calls so its output is always structured. All taste claims come from Qloo results, and the backend validates every citation. If the model call fails, the app still returns a plan written from templates and says so.

## Request to result (example)

Input: *"Women 20–28 in Barcelona into indie music, A24 films, vintage fashion and film photography"*, references *Phoebe Bridgers, Lady Bird, Polaroid*.

1. The model extracts: demographic `women 20-28`, concepts `indie`, `vintage`, `fashion`, location `Barcelona`.
2. `qloo_describe` resolves the three references to Qloo IDs (asking the user if any is ambiguous); `qloo_find_tags` resolves each concept to a tag URN.
3. `qloo_recommend` runs once per category with `signals` (IDs), `signal_tags`, `demographic` and `signal_location`.
4. Results become numbered evidence (E1, E2…). The plan must cite those IDs; uncited ideas are dropped.

## Run it locally

Requirements: Node.js 22.19+, the Qloo harness, a Qloo hackathon key, and (optionally) an Anthropic API key.

```sh
npm install --global @qloo/qloo-harness
export QLOO_BASE_URL=https://hackathon.api.qloo.com
export QLOO_TRUSTED_BASE_URL=https://hackathon.api.qloo.com
qloo setup --qloo          # enter your key; it stays in the harness config
qloo setup --status        # expect "Qloo data: ready"

npm install
cp .env.example .env       # add ANTHROPIC_API_KEY (optional)
npm start                  # http://localhost:3000
```

Without a Qloo key the app runs on clearly labelled **sample data** (try the reference "Barbie" to see the ambiguity step). Without a model key it writes the plan from templates. Useful commands:

- `npm run probe` saves raw Qloo responses to `probe-output/` (no credentials) to check parsing.
- `npm run test:pipeline` runs the whole pipeline from the terminal.

## Deploy

Qloo's harness must run next to the backend, so use a container host (not serverless). The included `Dockerfile` installs the harness, and `render.yaml` deploys it on Render's free plan (New > Blueprint). Set `QLOO_API_KEY` and `ANTHROPIC_API_KEY` as secrets in the host's dashboard. The browser never talks to Qloo directly and no key is ever sent to the client.

The public demo is rate-limited (`RATE_LIMIT_PER_HOUR`, default 6 finished plans per visitor; `DAILY_PLAN_LIMIT`, default 150). Cached plans and disambiguation steps do not count. On the free plan the service sleeps after 15 minutes without traffic, so the first request can take about a minute.

## Responsible data handling

- No personal data is sent to Qloo: inputs are group-level descriptions and public cultural references.
- Results are presented as group-level affinities, never as predictions about a person or a video's performance.
- The plan suggests styles and references, not the use of copyrighted songs or clips.
- A small in-memory cache avoids repeating identical Qloo calls.

## Known limitations

- Qloo describes cultural taste, not TikTok trends: the plan says what this audience is likely to relate to, not what will go viral.
- The creator's own references are matched without assuming a type. The model's reading of the description (for example "Barbie" as a film) only pre-selects an option; the creator is asked whenever Qloo reports ambiguity or returns a different kind of entity than the description suggests. References the model adds on its own are matched within the type it inferred.
- Musicians often exist in Qloo both as an "artist" and as a "person", and some names are also towns. The app collapses those twins and drops towns before asking, so the creator only chooses between genuinely different things.
- Qloo uses age and gender only together with a location. Without one, the app leaves them out and says so.
- Affinity scores from separate calls are not directly comparable, so bars are scaled within each category.

## Licence

MIT
