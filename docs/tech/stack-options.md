# Tech stack feasibility (as of 2026-10-11)

> Research pass 1. AI-assisted: fetched docs/registries and **measured bundle sizes locally with esbuild**. Not a decision — see `docs/plan/` for that.
>
> **Legend:** `[V]` = verified from a fetched page / registry query / local measurement on 2026-10-11 · `[U]` = unverified or inferred.

## TL;DR

- **Realistic for a solo dev needing fast load:** three.js (first), Babylon.js 9 (close second), CesiumJS (only if we accept the weight and WebGL-only).
- **Not realistic:** Bevy/wgpu, Godot, Unity, Unreal — bundle size, WebGL2-only web exports, or missing globe tooling.
- **WebGPU is usable now but only with a WebGL2 fallback.** three.js gives the fallback for free.
- **Bake, don't simulate.** Published tsunami/dust/climate model outputs are downloadable (CC0/CC BY); the only thing worth computing live is the cheap distance-dependent local-effects scaling (Collins, Melosh & Marcus 2005).
- **Open niche:** no interactive Chicxulub-specific web app exists (see `prior-art.md`).

## 1. Rendering engine options

### three.js (+ optional React Three Fiber)
- **Version:** `three@0.186.1` (r186), 2026-09-24, MIT. Release every ~2 months `[V]`.
- **WebGPURenderer:** JSDoc calls it "the new alternative of `WebGLRenderer`"; it tries WebGPU and **falls back to WebGL2 automatically**; `forceWebGL` option exists; "experimental" no longer appears in the docs `[V]`. r184 made `compileAsync()` non-blocking and sped TSL compile 3×; r186 removed top-level side effects for tree-shaking `[V]`.
- **TSL** (node shader language) compiles to WGSL or GLSL `[V]`. The examples directory has **234 `webgpu_*` examples** incl. `webgpu_tsl_earth` (day/night, clouds, fresnel atmosphere), `webgpu_compute_particles` (200k), `webgpu_compute_birds` (8,192), `webgpu_volume_cloud`, `webgpu_skinning_instancing(_individual)`, `webgpu_ocean`, `webgpu_sky` `[V]`.
- **Bundle (measured, minified ESM):** minimal WebGL scene = **540 KB raw / 135 KB gzip / 112 KB brotli**; same via `three/webgpu` + node material = **791 KB / 216 KB gzip / 175 KB brotli** `[V]`.
- **iOS:** five WebGPURenderer-on-iOS issues found, all closed (fixed r175–r184) `[V]`. Usable but recent; keep `forceWebGL` as a kill-switch.
- **R3F:** `@react-three/fiber@9.8.1`; **v10 alphas** add first-class WebGPURenderer `[V]`. Optional — vanilla TS is fine for this app.
- **Pros:** smallest bundle; largest ecosystem for exactly what we need (3D Tiles loader, atmosphere, instancing libs, VAT tooling, particles); the precedent apps (Ancient Earth, NASA Eyes) are three.js. **Cons:** no built-in floating origin / planetary precision; no globe LOD; API churn each release.

### Babylon.js
- **Version:** `@babylonjs/core@9.30.0` (2026-10-08), Apache-2.0 `[V]`.
- **WebGPU:** status page says "the WebGPU implementation is complete" (gaps: point sizes, WebXR, triangle fan) `[V]`. No automatic fallback — you choose `WebGPUEngine` vs `Engine` at startup `[V]`.
- **9.0 features directly relevant `[V]`:** **Large World Rendering** (floating origin + 64-bit CPU matrices via `useLargeWorldRendering`); **GeospatialCamera** (orbits a sphere at origin, map-style drag/zoom/tilt, `flyToAsync`; sphere only, no ellipsoid); **3D Tiles** via NASA-AMMOS 3DTilesRendererJS; **Physically Based Atmosphere addon** (sky + aerial perspective + **orbital views**, WebGPU and WebGL2); clustered lighting, Frame Graph, Node Particle Editor.
- **Bundle (measured):** minimal WebGL = **2.17 MB / 507 KB gzip / 376 KB brotli**; WebGPU = **2.44 MB / 573 KB gz / 427 KB br** `[V]`.
- **Pros:** the geospatial primitives we'd otherwise hand-roll are first-party and maintained by Microsoft. **Cons:** 3–4× the bundle; smaller third-party ecosystem for crowds/VAT.

### CesiumJS
- **Version:** `cesium@1.146.0` (2026-10-01), Apache-2.0. "Free for commercial and non-commercial use"; **Cesium ion is optional** `[V]`. 1.144 added a `Controller` framework for custom camera controllers `[V]`.
- **WebGPU:** none; roadmap issue open since 2017, last maintainer statement (Oct 2024): no concrete plans `[V]`.
- **Paleo-terrain:** `CesiumTerrainProvider` (quantized-mesh), `UrlTemplateImageryProvider`, `CustomHeightmapTerrainProvider` (procedural callback) are standard; custom `Ellipsoid` radii supported — for 66 Ma Earth keep WGS84 and swap terrain + imagery `[V]`.
- **Timeline widget:** JulianDate-based, linear only `[V]` — our non-linear scrubber would be custom anyway.
- **Bundle (measured):** minimal `Viewer` = **4.24 MB / 1.13 MB gzip / 873 KB brotli** + `Workers` (1.1 MB) + `Assets` (4.6 MB) `[V]`.
- **Pros:** globe streaming, LOD, precision (RTE), log depth, CZML, widgets all solved; proven for paleo-globes (HHMI EarthViewer, GPlates Portal). **Cons:** 5–8× the initial JS, WebGL-only, and custom VFX / instanced herds fight the engine.

### MapLibre GL JS / deck.gl
- MapLibre 6.13 has globe projection (since 5.0, Jan 2025), custom WebGL layers on globe, terrain; 285 KB gz + 144 KB worker `[V]`. WebGL only. No 3D entity/camera system.
- deck.gl 9.4 `GlobeView` is **experimental** (poor precision above zoom 12, no TerrainLayer) `[V]`.
- Fit: fine for a 2D-ish data globe; wrong tool for space-to-ground cinematic 3D.

### Rust/WASM and game engines
- **Bevy 0.20** (2026-10-08): no mesh shaders on web, no multithreading on wasm, two builds for WebGL2 vs WebGPU `[V/U]`; wasm size ~10 MB+ uncompressed `[U]`.
- **wgpu v30:** WebGPU first-class, WebGL2 best-effort `[V]`. Fine as a library, but we'd be building an engine.
- **Godot 4.7 web export:** WebGL2 only (Compatibility renderer); docs warn about Safari `[V]`.
- **Unity 6.3:** WebGPU experimental; tens of MB builds `[V/U]`. **Unreal:** no HTML5 export since 4.24 `[U]`.
- **PlayCanvas 2.23:** MIT, WebGPU beta with fallback, no globe primitives; editor is a product `[V]`. **Needle Engine:** three.js fork, proprietary licensing `[V/U]`.

### WebGPU browser reality (Oct 2026)
- caniuse: **87.8 % global usage** (85.8 % full + 2.0 % partial) `[V]`.
- Chrome/Edge 113+; **Safari 26 enabled by default on macOS/iOS/iPadOS** (Sep 2025); Firefox Windows 141, macOS 145–147; **Linux Firefox nightly-only; Android Firefox behind a flag** `[V]`.
- **Conclusion:** WebGPU-first is fine *only* with automatic WebGL2 fallback.

### Comparison

| Engine | WebGPU | Bundle (gzip, minimal scene, measured) | Mobile Safari | Globe / LOD / precision | Effort | Fit (1–5) |
|---|---|---|---|---|---|---|
| **three.js r186** | Yes, auto WebGL2 fallback | 135 KB (WebGL) / 216 KB (WebGPU) | Good; iOS WebGPU bugs fixed r175–r184 | None built in; 3DTilesRendererJS + three-geospatial atmosphere; `reversedDepthBuffer` / log depth; no floating origin | Medium–High (we own the globe LOD) | **5** |
| **Babylon.js 9.30** | "Complete"; manual engine choice | 507 KB / 573 KB | Good `[U]` | GeospatialCamera, Large World floating origin, PBR Atmosphere addon, 3D Tiles | Medium | **4** |
| **CesiumJS 1.146** | No (no plans) | 1.13 MB + workers + assets | Works, heavy `[U]` | Best-in-class terrain/imagery/3D Tiles/CZML; RTE precision | Low (globe) / High (VFX, herds) | **3** |
| MapLibre GL 6 globe | No | 285 KB + 144 KB worker | Excellent | Globe projection, custom layers; no 3D entity system | Very high for cinematic | 2 |
| deck.gl 9.4 GlobeView | No | — | OK | Experimental | High | 1 |
| PlayCanvas 2.23 | Beta + fallback | — | Good `[U]` | None | High | 2 |
| Bevy 0.20 / wgpu | First-class; WebGL2 best-effort | ~10 MB+ wasm `[U]` | Single-thread wasm | None | Very high | 1 |
| Godot 4.7 | No (WebGL2 only) | `[U]` | Safari warnings | None | Very high | 1 |
| Unity 6.3 | Experimental | tens of MB `[U]` | Heavy | None | High | 1 |
| Unreal | n/a | n/a | n/a | n/a | n/a | 0 |

## 2. Globe rendering techniques

- **Source DEM:** PALEOMAP PaleoDEMs (Scotese & Wright 2018), Zenodo, **CC BY 4.0**: 1° set (9.3 MB) and **0.1° netCDF set (207 MB)**, 540–0 Ma at **5 Myr steps — nearest slices are 65 and 70 Ma, not 66** `[V]` https://zenodo.org/records/5460860. 0.1° ≈ 11 km at the equator; everything finer must be synthesised (GPU noise octaves). Companion **PaleoCoastlines v7.3** shapefiles, CC BY 4.0 `[V]` https://zenodo.org/records/7994000. **GPlates Web Service** returns 66 Ma coastlines as GeoJSON on demand (`/reconstruct/coastlines/?time=66&model=PALEOMAP`, ~1.1 MB) `[V]` https://gws.gplates.org/swagger-ui/.
- **Tile formats:** quantized-mesh-1.0 (Cesium's gzipped binary terrain) `[V]`; 3D Tiles 1.1 uses glTF tile content with implicit tiling `[V]`. **3DTilesRendererJS ships a `QuantizedMeshPlugin`**, so Cesium-format terrain is consumable in three.js/Babylon without Cesium `[V]`.
- **DEM → tiles tools:** cesium-terrain-builder (heightmap only on master, last push 2023; quantized-mesh via a docker fork); `alcesium-terrain-maker` (PyPI, Jun 2026, GeoTIFF → quantized-mesh; no license stated) `[V]`. Expect to write a small Python pipeline.
- **Precision at planetary scale:** Cesium uses GPU RTE (`EncodedCartesian3`) `[V]`. three.js has **no floating origin**; r186 offers `logarithmicDepthBuffer` (disables early-Z; forum report ~65→35 fps in a foliage scene) and **`reversedDepthBuffer`** (faster, needs `EXT_clip_control`) `[V]`. **Practical pattern:** scale the world (Earth radius = 1–10 units), keep the camera near the origin, reversed depth where available, log depth fallback. Babylon's Large World Rendering gives the floating origin built in.
- **Key OSS projects (stars as of 2026-10-11) `[V]`:**
  - **takram/three-geospatial** — 1,732★, MIT; `@takram/three-atmosphere@0.19.1`, `three-clouds@0.7.6`. Bruneton precomputed scattering + Hillaire multi-scattering; **WebGPU: atmosphere "Done", clouds "WIP"**. Measured clouds perf: iPhone 13 Low 36–53 fps; iPad Pro M4 High 43–55 fps. **Maintenance risk:** funded development concluded March 2025, though releases continued into 2026; the npm package is 37 MB unpacked — precompute LUTs offline and ship a subset.
  - **NASA-AMMOS/3DTilesRendererJS** — 2,485★, Apache-2.0, `3d-tiles-renderer@0.5.3`; three.js/Babylon/R3F; plugins incl. QuantizedMesh; `GlobeControls`; open issue #1380 for WebGPURenderer plugin support.
  - **globe.gl / three-globe** — textured sphere + slippy tiles; **no terrain geometry/LOD**.
  - No widely adopted cubesphere-quadtree library for three.js exists (PlanetTech 75★); expect to write our own (~1–2k lines).
  - three.js examples: `webgpu_tsl_earth`, `webgpu_ocean`, `webgpu_sky`, `webgpu_volume_cloud`.
- **Textures/geometry:** `KTX2Loader` transcodes Basis Universal to the device's native format (ETC1S for colour, UASTC for normal/height) `[V]`; KTX-Software 4.4.2 stable `[V]`. glTF-Transform: Draco ~95 % reduction above 1 MB but decoder WASM may outweigh savings below; Meshopt "considerably faster" to decode `[V]`.

**Takeaway:** build the globe as a cubesphere/quadtree (or a 3D Tiles 1.1 pyramid via QuantizedMeshPlugin) from the 0.1° PaleoDEM, synthesise sub-10 km detail on the GPU, use three-geospatial for atmosphere, solve precision with world scaling + reversed depth.

## 3. Simulating the effects — bake, don't simulate

- **GPU particles:** WebGL `GPUComputationRenderer` (ping-pong float textures); WebGPU/TSL compute: 200k particles / 8,192 boids in the examples `[V]`. `three.quarks@0.17.1` (MIT) CPU-batched particles `[V]`. Babylon `GPUParticleSystem` default 50k `[V]`.
- **Shallow-water / tsunami in browser:** **Celeris-WebGPU** (MIT, Boussinesq/NLSW in WGSL, nearshore Cartesian grid) `[V]`; **BROWNI/NAMI** (linear SWE on spherical coords — closest fit to a globe — but **archived May 2024**) `[V]`. No GeoClaw/easyWave browser ports found. → Don't run tsunami physics live.
- **Shockwave on sphere:** proven pattern — fragment shader driven by angular distance from the impact point (`acos(dot(n, impactDir))`) `[V]` (three.js forum + fiddle). Drive tsunami front and airblast from **baked arrival-time rasters**.
- **Volumetric fireball/plume:** three.js volume examples use a 128³ `Data3DTexture`, 100 raymarch steps `[V]`; budget steps aggressively on mobile; fall back to billboarded sprite sheets.
- **Published physics/outputs to bake `[V]`:**
  - **Collins, Melosh & Marcus 2005**, *MAPS* 40:817, DOI 10.1111/j.1945-5100.2005.tb00157.x; equations PDF https://impact.ese.ic.ac.uk/static/effects.pdf; live calculator https://impact.ese.ic.ac.uk/ImpactEarth/ImpactEffects. **No open-source JS port found** — port the few hundred lines ourselves.
  - **Range et al. 2022** (global Chicxulub tsunami), *AGU Advances*, DOI 10.1029/2021AV000627; **Harvard Dataverse, CC0, ~27.75 GB** incl. `MOST_max_output.nc` (73.6 MB), hourly MOM6 SSH (~7 GB), pre-impact bathymetry (61.6 MB), SI videos — https://doi.org/10.7910/DVN/GWOFIO. **This is the tsunami keyframe source *and* a 66 Ma bathymetry.**
  - **Artemieva & Morgan 2020** (global K-Pg dust cloud), *GRL*, DOI 10.1029/2019GL086562; Zenodo 10.5281/zenodo.3677535, CC BY 4.0, 13.7 MB density fields at 300/600/1200/3600 s.
  - **Tabor et al. 2020** (climate), *GRL*, DOI 10.1029/2019GL085572; **PANGAEA 10.1594/PANGAEA.909529, CC BY 4.0**, monthly surface temp / shortwave (darkness proxy) for control + soot/SO₂/dust runs.
  - Bardeen et al. 2017 *PNAS* (soot/darkness) — paper only. Brugger et al. 2017 *GRL* (≥ 26 °C cooling, ~30 yr recovery). Senel et al. 2023 *Nat. Geosci.* — GCM output at OSF 10.17605/OSF.IO/2CDQG. Chiarenza et al. 2020 *PNAS*.

**Recommendation:** real-time only for cheap, distance-dependent local effects (Collins 2005 evaluated per camera/POI); everything global (tsunami front, dust optical depth, temperature, insolation) pre-processed offline into small rasters/time-series (tens of KB – few MB) and interpolated by the scrubber.

## 4. Crowds / herds

- **three.js core has no skinned instancing** (InstancedMesh has `morphTexture`/`setMorphAt` only) `[V]`. Shipped paths: `webgl_instancing_morph` (1,024 animated horses via per-instance morph phase); `webgpu_skinning_instancing_individual` (**WebGPU-only**) `[V]`. `BatchedMesh` in core since r159 `[V]`.
- **Libraries:** `@three.ez/instanced-mesh` (MIT, 452★, active): skinning, per-instance LOD, BVH culling, "Skinning 3k instances" demo `[V]`. **VAT (vertex animation textures):** Blender extension "Vertex Animation Toolkit" v1.0.12 (GPL-3.0, Blender 4.2+), exports EXR/PNG for WebGL2/WebGPU; "three.js is the tested engine" `[V]`.
- **LOD / impostors:** `THREE.LOD`; `agargaro/octahedral-impostor` (MIT, wip; 200k trees demo); `sweriko/Horde` (MIT, octahedral-impostor crowds on WebGPU/TSL) `[V]`.
- **Rough numbers (forum-sourced):** plain `SkinnedMesh` drops below 60 fps at ~200 on a 2015 laptop; instanced/VAT approaches reach 500–2,000 at 60 fps on desktop `[V]`. **No verified mobile-Safari skinned-instancing benchmark exists** — plan for a few hundred on-screen animated instances via VAT plus impostors beyond, and measure on a real phone.
- **Assets:** Quaternius "Animated LowPoly Dinosaurs" — **CC0**, T. rex / Triceratops / Velociraptor etc. with idle/walk/run clips `[V]` https://quaternius.itch.io/animated-lowpoly-dinosaurs. Useful for prototyping the herd pipeline; **not scientifically accurate** (see `docs/research/paleontology.md` §7 for the accuracy problem).

## 5. Timeline / UX libraries

| Library | Status `[V]` | Verdict |
|---|---|---|
| **camera-controls** | 3.1.2, MIT, 2.4k★; smooth-damped transitions, promise-returning `setLookAt`, `fitToBox` | **Use** for free-roam + `await`-chained cinematic moves |
| **GSAP** | 3.15.0; "100 % free for all users" since the Webflow acquisition | **Use** for keyframed camera/uniform timelines (`timeline.progress()` driven by the scrubber) |
| **d3-scale** | `scaleSymlog`, polylinear multi-stop domains | **Use** for the piecewise time scale |
| **theatre.js** | `@theatre/core` 0.7.2, **last published May 2024**; studio is **AGPL**; dev moved to a private repo | Dev-time authoring only, or skip |
| **@macrostrat/timescale** | 3.3.1, MIT, React | Nice geologic strip for the deep-time ends |
| Cesium Timeline | JulianDate, linear only | Only if on Cesium |
| vis-timeline | Date-based | Wrong abstraction |
| **nuqs** | 2.10, MIT | Fine for simple params; for camera pose pack binary (`Float32Array` of t, lat, lon, alt, yaw, pitch, mode → ~24 bytes base64url) |
| leva / tweakpane | current | Dev-time tuning |

## 6. Backend for discoveries / upvotes (free tiers, official pages, 2026-10-11 `[V]`)

- **Cloudflare (recommended):** Workers Free 100k req/day, 10 ms CPU; **Static Assets** 20k files × 25 MiB, unlimited free requests; **R2** 10 GB, **free egress** (use a custom domain + Cache Everything, not r2.dev); **D1** 5 M reads / 100k writes per day, 5 GB; KV only 1k writes/day (unsuitable for votes); **Turnstile** free, unlimited; WAF rate limiting 1 free rule. New projects belong on Workers + Static Assets (not Pages).
- **Supabase Free:** 500 MB DB, 5 GB egress, **paused after 1 week idle** — bad for a project that gets sporadic viral traffic.
- **Vercel Hobby:** **non-commercial only**, 100 GB; **Neon Free** 1 GB. **Firebase Spark:** no Cloud Functions. **Netlify Free:** credit-capped (~15 GB/mo). **GitHub Pages:** 1 GB site, 100 GB/mo soft — too small for tile pyramids.
- **Abuse prevention:** Turnstile on create + first vote; unique key on `hash(daily_salt + ip + ua + discovery_id)` (Plausible's documented pattern); honeypots.
- **OG images for deep links:** route `/d/:id` through a Worker, inject `og:*` via HTMLRewriter from a D1 lookup. **Don't** render on the Worker (10 ms CPU cap); capture the canvas client-side at save time (1200×630 JPEG ≈ 150 KB) and upload to R2 through a Turnstile-gated Worker.

## 7. Asset pipeline and budgets

- **Blender 4.5 glTF exporter:** Draco, quantization, WebP, animation baking; **no KTX2** `[V]`. **gltfpack 1.3** (`-cc` meshopt, `-tc` KTX2 needs native build, `-si` simplify, `-mi` instancing) and **glTF-Transform 4.5.1** CLI (`optimize --compress meshopt --texture-compress ktx2 --simplify`) `[V]`.
- **LOD:** `MSFT_lod` not implemented in three.js GLTFLoader `[V]`; generate LODs with simplify and switch in-app.
- **iOS limits:** max 2D texture 16,384 px, 3D texture 2,048 px `[V]`; **WebKit bug 300782 (open): heavy-WebGL pages get killed by memory pressure and reload in a loop with no JS-visible warning and no documented budget** `[V]`. Enforce per-device texture/tile budgets.
- **Hosting large tile sets:** R2 behind a custom domain (free egress); Workers 25 MiB per file.

## 8. Recommended architectures (ranked)

### #1 — three.js r186 WebGPURenderer (auto WebGL2 fallback) + TSL, vanilla TypeScript + Vite, Cloudflare free tier — *recommended*
- **Globe:** own cubesphere quadtree (~1–2k lines) or 3D Tiles 1.1 pyramid baked from the 0.1° PaleoDEM via QuantizedMeshPlugin/3DTilesRendererJS; GPU-noise detail below 10 km; KTX2 tiles on R2. Earth radius ≈ 1 unit, camera near origin, `reversedDepthBuffer` with log-depth fallback.
- **Atmosphere/clouds/ocean:** `@takram/three-atmosphere`; TSL ocean; cloud texture layer (volumetric only on desktop).
- **Effects:** Collins 2005 ported to TS; baked rasters from Range 2022 (tsunami), Artemieva & Morgan 2020 (dust), Tabor 2020 (darkness/temperature); angular-distance ring shaders; TSL compute particles with `GPUComputationRenderer` fallback; 128³ raymarched fireball with a step budget.
- **Herds:** glTF → VAT → InstancedMesh with per-instance phase; `@three.ez/instanced-mesh` LOD; impostors beyond ~1 km.
- **Timeline/camera:** custom piecewise time scale (d3-scale helpers), GSAP timelines scrubbed by `progress()`, `camera-controls`.
- **Sharing:** base64url-packed hash state; Worker + D1 + Turnstile for discoveries; client-captured JPEG to R2 for OG; `/d/:id` with HTMLRewriter-injected meta.
- **Trade-off:** we write the globe LOD and precision handling; in exchange the smallest bundle (~216 KB gz engine) and the richest effects/crowd ecosystem.

### #2 — Babylon.js 9.30 + GeospatialCamera + Large World Rendering + Atmosphere addon + 3DTilesRendererJS
- First-party floating origin, globe camera, orbital atmosphere, GPU particles. WebGPU "complete".
- Trade-off: ~500–575 KB gz minimal (3–4× three.js), fewer crowd/VAT libs, manual WebGPU/WebGL choice. **Choose if we'd rather not build the geospatial scaffolding.**

### #3 — CesiumJS 1.146 with self-hosted quantized-mesh PaleoDEM terrain + custom imagery + CZML
- Terrain streaming, precision, time-dynamic data solved; proven for paleo-globes.
- Trade-off: ~1.1 MB gz JS + workers/assets before first paint, WebGL-only forever, linear timeline widget, and every custom effect fights the engine. **Only if "accurate globe" matters far more than "cinematic VFX".**

## 9. Load-time budget (stack #1, 4G mobile)

| Phase | Payload (compressed) | Target |
|---|---|---|
| HTML + CSS + UI shell | ~30 KB | first paint < 1 s |
| three.js WebGPU path + app + camera-controls + GSAP + d3-scale | ~350–400 KB | parse + GPU init < 1.5 s |
| L0 globe: 1–2k equirect colour (KTX2) + 1k height/normal | ~0.5–1.5 MB | interactive globe ≤ 2.5 s |
| Atmosphere LUTs, clouds, L1–L2 tiles, dinosaurs (VAT + glTF ~2–5 MB) | streamed on demand | within ~5–10 s of use |
| Full detail at a POI | ≤ 30–50 MB textures resident on mobile | avoid silent iOS tab kills |
| **Total initial transfer** | **≤ 1.5 MB** | — |

## 10. Risks

1. **WebGPU on iOS is new** (Safari 26, Sep 2025); three.js iOS WebGPU fixes landed as recently as r183–r184. Ship WebGL2 as the tested baseline; WebGPU as progressive enhancement.
2. **iOS memory kills with no signal** (WebKit 300782) — the biggest UX risk for "zoom to ground with herds". Enforce budgets per device class.
3. **three.js API churn every ~2 months** — pin versions.
4. **No built-in planetary precision in three.js** — mitigated by world scaling + reversed depth; Babylon is the escape hatch.
5. **Skinned instancing on mobile has no verified benchmark** — prototype the VAT herd path on a real iPhone before promising "individual animals".
6. **Data licensing:** PaleoDEM/PaleoCoastlines CC BY 4.0, Range 2022 CC0, Artemieva CC BY, Tabor CC BY — fine. **PALEOMAP PaleoAtlas rasters have no stated license; Deep Time Maps are paid and "cannot be posted online"** — render our own globe textures from licensed data.
7. **Preprocessing effort:** the Range 2022 archive is ~28 GB; budget a one-off desktop pass.
8. **Free-tier edges:** Workers 100k req/day, 10 ms CPU; Supabase idle-pauses; Vercel Hobby non-commercial.
9. **theatre.js is stale and AGPL** — don't depend on it for the cinematic pipeline.
10. **Scope for a solo dev:** both viral precedents shipped a single hook first. Suggested order: globe + non-linear scrubber + baked global effects + deep links (MVP) → cinematic camera → herds → discoveries index.
