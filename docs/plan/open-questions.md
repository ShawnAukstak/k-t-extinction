# Open questions

> Decisions that are yours to make, roughly in the order they block work. A recommendation is given where the research supports one.

## Blocking Phase 0 (data)

1. **Where do large files live?** Raw datasets total ~30 GB (mostly Range 2022). Options: (a) outside the repo on disk, re-fetched from `catalog.yaml` — *recommended for now*; (b) Git LFS; (c) a Cloudflare R2 bucket from day one (free egress, 10 GB free). Processed app assets will eventually need (c).
Perhaps we just start with outside repo, perhaps gitignore on disk? for now? and we can later upload to a cloud storage solution.. or if github has easy/cheap solution.. but not in git history.

2. **Which plate model is canonical?** PALEOMAP (matches the Scotese DEM and rasters) vs MULLER2019 (matches EarthByte bathymetry; what GWS defaults to for PBDB). They disagree by several degrees. *Recommendation: PALEOMAP, because the terrain comes from Scotese; reconstruct POIs and PBDB occurrences with `pgm=scotese` / `model=PALEOMAP`.*
I trust your recs here. you can always change as you work on things for better result.

3. **Species-card format**: YAML vs JSON-with-schema. *Recommendation: YAML for hand editing, validated by a tiny schema script.*
Ok, sounds good.

4. **Licence for the repo and curated data.** Code MIT? Curated data CC BY 4.0 (required anyway by upstream CC BY sources)? 
We don't plan on monetizing it, and might just open source it on github honestly.. but keeping it private initiating, but keep that in mind.. if we're required to have a specific license by source, e.g. not monetize, that set that up properly please..


## Blocking Phase 1 (engine)

5. **three.js vs Babylon.js 9.** three.js: smallest bundle, biggest ecosystem, but we write the globe LOD/precision. Babylon: 3× the bundle, but GeospatialCamera + floating origin + orbital atmosphere are first-party. *Recommendation: spike three.js first; fall back to Babylon if the quadtree spike is painful.* Cesium is only worth it if you value its terrain pipeline over everything else.
Whatever you think is best, again, can change later when you get closer into problem, and run experiemtns, threejs was just a suggestion, and may need interesting tech like voxels, etc, as I imagine it's complicated rendering an derendering detail on crazy zoom.

6. **Vanilla TypeScript vs React (R3F).** The app is one canvas and a few panels. *Recommendation: vanilla TS + Vite; add Preact for the UI if it grows. R3F v10's WebGPU support is still alpha.*
Whiever you prefer.. no strong opinion on technical stack.

7. **Mobile priority.** Is "works on a phone" a launch requirement or a nice-to-have? It drives the memory budget and whether herds are in scope at all on mobile. *Recommendation: launch requirement for globe + timeline + cinematic; desktop-only for ground-level herds initially.*
Yes, this must work on phone too.. we can render things differently for mobile/desktop, and the tech/plan is literally planet earth so animal/plants, etc only pop-in, render on far zoom.

8. **Hosting account.** Cloudflare (recommended, free tier fits) — do you have an account / domain in mind?
Well, I use render.com typically.. this is a future concern once we have it running locally honestly.. I wouldn't worry about domain right now either, we can sort this out if it turns out to be a decne tproduct.


## Blocking Phase 3–5 (look and feel)

9. **Time of day at impact.** Unconstrained by evidence. Pick for drama (dawn over the Gulf? midday for max visibility?) and label it. 
Yeh, pick whichever makes most sense, we can even make up a time.. is it best at sunset, dawn, midday? best visibility is good.. (also we want this app to be factial accuraute, so we can use tooltip references for things like this, when things are fact or not.. so we could say exact time is unknown, picked X time for best view.. and other cases include links/details of references wiki style)

10. **What do the dinosaurs look like?** The honest options: (a) **stylised low-poly with correct proportions** from Hartman/skeleton-scan references — fast, clearly "representative", cheap on mobile; (b) **commission** a handful of accurate rigged models (cost, time); (c) **build from CC0 skeleton scans** (Smithsonian Triceratops) — accurate but slow. *Recommendation: (a) for launch, (b)/(c) for hero species later.* Also: feathers — T. rex scaly per Bell 2017; ornithomimids/oviraptorosaurs feathered.
The truth is, we might most accurate to current science.. again, we can use simple low-poly placeholders to start with.. and mark the detailed versions for later.

11. **How many POIs with life?** *Recommendation: start with Hell Creek (the census fauna), Tanis (the "hours after" story), the Yucatán platform/sea (mosasaurs), and one Southern Hemisphere site (Seymour Island or Madagascar).*
For sure, but long term.. we want life everywhere, to the point where you can see shockwaves ripping through dinosaurs in north america... eventually they'll need simple animations, which may mean sitting in place, grazing, or roaming slightly.

12. **Show older faunas (Nemegt, Hațeg) with a "context" label, or omit?** *Recommendation: omit at launch.*
well.. I mean, I don't know what this means, but we do want some fauna/vegitation, so it's realistic.. but we can awlays add later, and like before, placeholders for the rendering.. and I assume here is a comrpmise for performance.


## Product

13. **Name and domain.**
14. **The hook.** "What happened *here*, minute by minute?" (click your spot on the 66 Ma globe) vs "watch the main event". *Recommendation: both — main event on load, click-anywhere as the share driver.*
15. **Audio?** Not researched. A rumble/silence design would help the cinematic; adds asset weight.
16. **Discoveries moderation.** Who removes junk? A simple admin token is enough for a side project.
17. **Contact scientists?** Several datasets have no stated licence (BRIDGE climate files, PaleoAtlas JPGs). Emailing Valdes / Scotese is cheap and they tend to be generous. Also worth asking Range/Arbic about the tsunami hourly output.
Audio makes sense, can look into it.. domain again later, we can for name we can put literally what it is..K-T Extinction Event simulator or sometihng.


## Already decided by the research (revisit only if you disagree)

- Bake published model outputs; don't run physics in the browser.
- Canonical sim time = seconds since impact, float64; display "66.04 Ma", season spring, time-of-day labelled as a choice.
- No Rust/WASM engine; no Unity/Unreal/Godot web export.
- No Deep Time Maps, no Cesium ion, nothing with an NC licence in the shipped app.
- Deccan shown as an active feature, not as the cause.
