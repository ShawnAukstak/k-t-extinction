# Open questions

> The questions that gated the build, roughly in the order they blocked work, with the recommendation the research supported and the answer. The resulting decisions are in `decisions.md`.

## Blocking Phase 0 (data)

1. **Where do large files live?** Raw datasets total ~30 GB (mostly Range 2022). Options: (a) outside the repo on disk, re-fetched from `catalog.yaml` — *recommended for now*; (b) Git LFS; (c) a Cloudflare R2 bucket from day one (free egress, 10 GB free). Processed app assets will eventually need (c).
**Answer:** outside the repo (gitignored) for now, cloud storage later; never in git history. (Deploys now fetch the processed data from a GitHub release.)

2. **Which plate model is canonical?** PALEOMAP (matches the Scotese DEM and rasters) vs MULLER2019 (matches EarthByte bathymetry; what GWS defaults to for PBDB). They disagree by several degrees. *Recommendation: PALEOMAP, because the terrain comes from Scotese; reconstruct POIs and PBDB occurrences with `pgm=scotese` / `model=PALEOMAP`.*
**Answer:** follow the recommendation; revisit if results call for it.

3. **Species-card format**: YAML vs JSON-with-schema. *Recommendation: YAML for hand editing, validated by a tiny schema script.*
**Answer:** agreed.

4. **Licence for the repo and curated data.** Code MIT? Curated data CC BY 4.0 (required anyway by upstream CC BY sources)? 
**Answer:** no monetisation planned; the repo may be open-sourced later. Choose licences that respect every upstream source's terms (D4).


## Blocking Phase 1 (engine)

5. **three.js vs Babylon.js 9.** three.js: smallest bundle, biggest ecosystem, but we write the globe LOD/precision. Babylon: 3× the bundle, but GeospatialCamera + floating origin + orbital atmosphere are first-party. *Recommendation: spike three.js first; fall back to Babylon if the quadtree spike is painful.* Cesium is only worth it if you value its terrain pipeline over everything else.
**Answer:** follow the recommendation and experiment; extreme zoom may need unusual techniques.

6. **Vanilla TypeScript vs React (R3F).** The app is one canvas and a few panels. *Recommendation: vanilla TS + Vite; add Preact for the UI if it grows. R3F v10's WebGPU support is still alpha.*
**Answer:** no preference; follow the recommendation.

7. **Mobile priority.** Is "works on a phone" a launch requirement or a nice-to-have? It drives the memory budget and whether herds are in scope at all on mobile. *Recommendation: launch requirement for globe + timeline + cinematic; desktop-only for ground-level herds initially.*
**Answer:** phones are a launch requirement. Mobile and desktop can render differently; plants and animals only appear when zoomed in.

8. **Hosting account.** Cloudflare (recommended, free tier fits), or an existing account; and a domain?
**Answer:** Render, once it runs locally; no domain for now (D8).


## Blocking Phase 3–5 (look and feel)

9. **Time of day at impact.** Unconstrained by evidence. Pick for drama (dawn over the Gulf? midday for max visibility?) and label it. 
**Answer:** pick for visibility and label it as a choice. Generally, mark what is known versus chosen, with linked references.

10. **What do the dinosaurs look like?** The honest options: (a) **stylised low-poly with correct proportions** from Hartman/skeleton-scan references — fast, clearly "representative", cheap on mobile; (b) **commission** a handful of accurate rigged models (cost, time); (c) **build from CC0 skeleton scans** (Smithsonian Triceratops) — accurate but slow. *Recommendation: (a) for launch, (b)/(c) for hero species later.* Also: feathers — T. rex scaly per Bell 2017; ornithomimids/oviraptorosaurs feathered.
**Answer:** as accurate to current science as possible; low-poly placeholders first, detailed models later.

11. **How many POIs with life?** *Recommendation: start with Hell Creek (the census fauna), Tanis (the "hours after" story), the Yucatán platform/sea (mosasaurs), and one Southern Hemisphere site (Seymour Island or Madagascar).*
**Answer:** start with these; long term, life everywhere (blast waves reaching herds across North America), with simple animations (resting, grazing, roaming).

12. **Show older faunas (Nemegt, Hațeg) with a "context" label, or omit?** *Recommendation: omit at launch.*
**Answer:** omit them at launch, but show enough fauna and vegetation everywhere to look realistic, with placeholders where needed.


## Product

13. **Name and domain.**
14. **The hook.** "What happened *here*, minute by minute?" (click your spot on the 66 Ma globe) vs "watch the main event". *Recommendation: both — main event on load, click-anywhere as the share driver.*
15. **Audio?** Not researched. A rumble/silence design would help the cinematic; adds asset weight.
16. **Discoveries moderation.** Who removes junk? A simple admin token is enough for a side project.
17. **Contact scientists?** Several datasets have no stated licence (BRIDGE climate files, PaleoAtlas JPGs). Emailing Valdes / Scotese is cheap and they tend to be generous. Also worth asking Range/Arbic about the tsunami hourly output.
**Answer:** audio yes. Name it for what it is ("K–T Extinction Simulator"); domain later.


## Already decided by the research

- Bake published model outputs; don't run physics in the browser.
- Canonical sim time = seconds since impact, float64; display "66.04 Ma", season spring, time-of-day labelled as a choice.
- No Rust/WASM engine; no Unity/Unreal/Godot web export.
- No Deep Time Maps, no Cesium ion, nothing with an NC licence in the shipped app.
- Deccan shown as an active feature, not as the cause.
