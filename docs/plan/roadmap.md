# Rough plan

> Phases, not dates. Each phase ends with something runnable or shareable. Decisions are in `decisions.md`.
>
> **Status (2026-10-11):** Phase 0 core data fetched and processed; Phase 1 (globe) and Phase 2 (timeline + baked effects + "what happened here?") done and tested locally (unit + Playwright on desktop Chromium, Pixel 7, iPhone 15 WebKit). Phase 3 (cinematic) in progress. Not deployed (local only, D8).

## Phase 0 — Data foundation *(the big initial task)* — **core done**

Goal: every number and surface the app will show exists as a cited, licensed, processed file.

- **0.1 Catalog.** Turn `docs/research/data-catalog.md` into `data/catalog.yaml` (name, URL, licence, citation, checksum, fetch date). Write `scripts/fetch.py` that downloads `raw/` from the catalog.
- **0.2 Fetch.** PaleoDEM 0.1° (207 MB), PaleoCoastlines, Dutkiewicz bathymetry, BRIDGE `texyn` climatology + BIOME4, PBDB Maastrichtian pull (Dinosauria, Mammalia, Mosasauridae, Pterosauria, Plantae), Benson 2014/2018 masses, Tabor 2020 (~400 MB), Artemieva & Morgan 2020 (14 MB), Range 2022 (start with `MOST_max_output.nc` 74 MB + bathymetry 62 MB; the 7 GB hourly SSH only if we want animated fronts), Collins 2020 movies.
- **0.3 Curated files (hand-written, committed).**
  - `curated/timeline.yaml` — every row of `research/timeline.md` §10 as `{t_seconds, label, magnitude, extent, confidence, sources[]}`.
  - `curated/points-of-interest.yaml` — from `research/points-of-interest.md`, with modern coords, plate-model-reconstructed coords, and a "what to show here" note.
  - `curated/species/*.yaml` — species cards for the latest-Maastrichtian roster: name, formation, mass (Benson), length, group size & behaviour notes (Horner census, bonebed evidence), speed, integument, PhyloPic id, confidence notes.
  - `curated/caveats.yaml` — the contested items, phrased for the UI.
- **0.4 Processing scripts (Python, one-off, outputs gitignored).**
  - DEM → equirectangular height (16-bit) + hypsometric colour + land/sea mask, at 2k/4k/8k; later a tile pyramid.
  - BIOME4 + climate → biome and temperature rasters.
  - Range 2022 → tsunami arrival-time and max-height rasters (equirect, 8/16-bit).
  - Artemieva 2020 → dust density keyframes (4 timesteps) → simple global opacity curve + direction.
  - Tabor 2020 → global time series (temperature, insolation) and a few monthly rasters for years 0–20.
  - PBDB → per-POI species lists with paleocoords (same plate model as the DEM).
  - EIEP equations → TypeScript port + test vectors from `scripts/eiep_reference.py`.
- **0.5 Verify.** Check every `[U]`-tagged number in `docs/research/` against its paper. Record outcomes in the docs.

Exit: a `data/processed/` tree that a renderer can load, and docs with no unverified numbers in the "well-constrained" column.

## Phase 1 — Globe spike *(decide the engine)* — **done** (three.js WebGLRenderer, D5)

Goal: a 66 Ma globe you can orbit on a phone, loading in ≤ 2.5 s, with a shareable URL.

- three.js WebGPURenderer (WebGL2 fallback), 2k/4k equirect textures from Phase 0, `@takram/three-atmosphere` or the `webgpu_tsl_earth` approach, `camera-controls`, hash-encoded camera state.
- Measure: first-interactive time on 4G, memory on an iPhone, fps.
- Try the cubesphere-quadtree LOD with the 8k height map; if it's a slog, prototype the same in Babylon.js 9 (GeospatialCamera + Large World + Atmosphere addon) for comparison.
- **Decision gate:** three.js vs Babylon; vanilla TS vs React.

Exit: a deployed URL (deferred: local only for now, D8).

## Phase 2 — Timeline + baked global effects *(shareable MVP)* — **done**

Goal: scrub from T−1 h to T+20 yr and watch the planet respond.

- Piecewise non-linear scrubber with event markers from `timeline.yaml`.
- Angular-distance shaders: airblast ring, tsunami front (from Range rasters), ejecta re-entry glow (from Kring & Durda schedule + Artemieva fields), dust/soot opacity, temperature tint, vegetation die-off keyed to insolation.
- Click anywhere → "what happened here" panel (EIEP TS port + tsunami raster lookup).
- Sources panel: every effect links its paper.

Exit: the first thing worth posting.

## Phase 3 — Cinematic

Goal: the main event on first load.

- Asteroid approach (scripted, from the NE at 60°), entry (~6 s), fireball (raymarched volume, mobile budget), crater formation (keyed to Collins 2020 timesteps), ejecta curtain (particles), camera path authored with GSAP + a dev-time keyframe panel.
- Season: boreal spring. Time of day: a choice — label it.

Exit: launch candidate.

## Phase 4 — Local detail

- Terrain LOD to ground level with procedural detail below 11 km; biome-driven ground textures and vegetation impostors.
- Fixed-camera presets at POIs (Tanis, Hell Creek, Yucatán platform, Tremp, Seymour, Deccan, antipode).
- Free-roam at ground level.

## Phase 5 — Life

- Herd pipeline: glTF → VAT → InstancedMesh with LOD/impostors; measured on device.
- 3–6 POIs with curated species lists, group sizes and behaviours from the species cards; densities from Damuth scaling.
- Die-off and recovery over the timeline (fern spike, mammal radiation at Corral Bluffs).
- Model-accuracy decision (see open questions) determines what the animals look like.

## Phase 6 — Discoveries

- Worker + D1 + Turnstile; submit/vote; client-captured OG image to R2; `/d/:id` share pages with injected meta tags; landing-page index.

## Ongoing

- Accuracy review of anything on screen; keep `docs/research/` as the single source of truth.
- Version pinning for three.js; device testing on each release.
