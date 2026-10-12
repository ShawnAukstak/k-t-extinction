# Feasibility assessment

> Synthesis of research pass 1 (2026-10-11). Read `00-vision.md` first. Detailed evidence is in `research/` and `tech/`; this page is the verdict.

## Bottom line

**Feasible for a solo developer, as a phased project — provided the first deliverable is the globe + timeline + baked global effects, and "individual dinosaur herds at ground level" is treated as a later, scoped-down enhancement.**

Three things make this *more* feasible than it first looks:

1. **The data exists and is openly licensed.** A CC BY 4.0 0.1° paleo-DEM at 65 Ma, CC BY paleo-shorelines, a CC0 global tsunami model output with its own 66 Ma bathymetry, CC BY dust-cloud density fields, CC BY impact-winter climate fields, a CC BY occurrence database with paleo-coordinates, and CC0 body-mass tables. Nobody has stitched them together.
2. **The science is mostly settled where it matters for a visual.** Site, size, trajectory, crater chronology to 5 min, ejecta re-entry, seismic arrival, tsunami propagation to 48 h, darkness duration to within a factor of ~2, season — all constrained. The contested parts (wildfire extent, exact cooling, winter duration) are *ranges*, and ranges can be shown.
3. **Nobody has built this.** The two viral precedents (Ancient Earth, Asteroid Launcher) each did half of it with pre-rendered data and a single hook. There is no interactive Chicxulub-specific web app. Demand is demonstrated (tens of millions of views on the "minute by minute" documentaries).

And three things that make it *harder* than it looks:

1. **Ground-level fidelity has no data below ~11 km.** The DEM is 0.1°. Everything finer is procedural. Fine for a cinematic, honest only if labelled.
2. **There are no scientifically accurate, openly licensed, rigged 3D dinosaurs.** Museum skeleton scans exist (CC0), hobbyist life models are inaccurate, Hartman skeletals are NC. "Accurate herds" means commissioning or building models, or accepting stylised silhouettes/low-poly.
3. **Mobile Safari is a hard ceiling with no warning light.** iOS kills heavy-WebGL tabs silently (open WebKit bug). The herd path has no verified mobile benchmark. Budgets must be enforced per device.

## Feature-by-feature

| Feature (from the vision) | Verdict | Risk | Why |
|---|---|---|---|
| 3D globe at 66 Ma, orbit/zoom from space | **Yes** | Medium | Data: PaleoDEM + PaleoCoastlines + Dutkiewicz bathymetry (all CC BY). Engineering: three.js has no globe LOD — we write a cubesphere quadtree (~1–2k lines) or bake 3D Tiles. Precision via world-scaling + reversed depth. |
| Timeline, non-linear, scrub/play/speed | **Yes** | Low | Pure UI. Piecewise scale; events from `research/timeline.md`. |
| Asteroid approach, entry, impact, crater formation | **Yes** | Medium | Parameters known (12–14 km, 20 km/s, 60° from NE). Collins 2020 hydrocode outputs/movies give the 0–300 s crater sequence. Fireball = raymarched volume with a mobile step budget. Artistic effort is the cost, not science. |
| Global effects: ejecta cloud, tsunami, re-entry glow, darkness, cooling | **Yes** | Low–Med | **Bake, don't simulate.** Range 2022 (tsunami, CC0), Artemieva & Morgan 2020 (dust, CC BY), Tabor 2020 (temperature/darkness, CC BY) → small rasters + time series; rendered with angular-distance shaders. One-off ~30 GB preprocessing. |
| "What happened here" at any point | **Yes** | Low | Collins 2005 equations, reimplemented (reference impl. validated). Distance-dependent blast, thermal, seismic, ejecta, arrival times. |
| Accurate to real timelines | **Yes, with ranges** | Low | See `research/impact-event.md` §7 for constrained vs contested. UI must show uncertainty. |
| Zoom to ground: terrain, vegetation | **Partly** | Medium–High | Procedural below 11 km, biome-driven (BIOME4 raster). Honest if labelled "representative". |
| Individual dinosaur pods/herds, accurate | **Scoped down** | **High** | *Where/what/how many* is answerable (PBDB + Horner 2011 census + Marshall 2021 density + Benson masses). *What they look like* is the gap (no accurate open models). *Performance:* hundreds of VAT-animated instances on phones, not thousands; unmeasured. Recommend: 3–6 curated POIs, not global coverage; stylised-but-proportioned models; expand later. |
| Deep links with timestamp + camera | **Yes** | Low | Hash-encoded state; ~24 bytes. |
| Discoveries index + upvotes, no accounts | **Yes** | Low | Cloudflare Workers + D1 + Turnstile, free tier. OG snapshots captured client-side. |
| Loads immediately, mobile | **Yes if disciplined** | Medium | three.js WebGPU path ~175 KB br; first interactive ≤ 2 MB total is achievable. Everything else streams. |
| Free hosting | **Yes** | Low | Cloudflare Workers Static Assets + R2 (free egress). Hard stops, no surprise bills. |

## The big risks, ranked

1. **Scope creep toward "every herd everywhere".** Mitigation: curated POIs; ship the globe+timeline first.
2. **Mobile memory kills.** Mitigation: device-class budgets, measure on a real iPhone in the first spike.
3. **Dinosaur asset accuracy vs availability.** Mitigation: decide early between (a) stylised silhouettes/low-poly with correct proportions, (b) commissioning, (c) building from skeleton scans. See open questions.
4. **Globe LOD + precision engineering** is the largest single build item in three.js. Mitigation: a 1–2 week spike before committing; Babylon.js 9 is the escape hatch (its GeospatialCamera + floating origin + atmosphere are first-party).
5. **Data preprocessing is real work before anything looks right.** Mitigation: it's Phase 0 and it's scriptable; do it once on a desktop.
6. **three.js API churn** every ~2 months. Mitigation: pin versions per milestone.
7. **Licence edge cases** (BRIDGE climate files have no stated terms; PaleoAtlas JPGs have no licence file). Mitigation: use CC BY/CC0 alternatives listed in `research/data-catalog.md`, or email.

## What the research changed about the plan

- **Confirmed**: the dominant initial task is assembling and organising data. Everything downstream depends on it, and it's the least glamorous. It's Phase 0.
- **Bake, don't simulate** is the single most important technical decision. Real-time physics in the browser is neither necessary nor more accurate than the published models.
- **"Minute by minute" is the hook**, not "see a herd". The viral precedents and the documentary view counts both say so. Herds are the long tail.
- **three.js over Rust/WASM.** Bevy/wgpu would mean building an engine; Godot/Unity/Unreal web exports are too heavy or WebGL2-only. three.js (WebGPU with automatic WebGL2 fallback) is the pragmatic choice; Babylon.js 9 is a serious alternative if we'd rather not write the globe scaffolding.
- **Time of day at impact is unconstrained** by any evidence; season is boreal spring. The app should say so.
- **Several famous faunas are too old** to show at 66 Ma without a caveat (Nemegt, Hațeg). The secure latest-Maastrichtian faunas: Hell Creek/Lance/Frenchman/Scollard/Denver, Tremp, Ouled Abdoun, Maastricht, López de Bertodano, upper Maevarano, Nanxiong, Lameta.
