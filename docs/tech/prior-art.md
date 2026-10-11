# Prior art

> What already exists, what it's built on, and what to take from it. `[V]` = verified 2026-10-11 (page source, bundle strings, docs, or API); `[U]` = unverified.

**Headline finding: there is no interactive, Chicxulub-specific web app.** The pieces exist separately — paleo-globes, impact calculators, cinematic documentaries — but nobody has combined "accurate 66 Ma globe + scrubbable impact timeline + shareable views". The niche is open.

| Project | Tech | Open source? | Reuse / lesson |
|---|---|---|---|
| **Ancient Earth** (dinosaurpictures.org/ancient-earth, Ian Webster) | three.js r110 from a CDN; one Scotese JPEG per time step wrapped on a sphere + a cloud texture; Node API `/api/geo-reconstruct/<mya>` backed by GPlates `[V page source]`; data credit "C.R. Scotese, PALEOMAP Project" | **Partly** — the 2015 version is MIT on GitHub (`typpo/ancient-earth`, "entirely client side") but used older NAU/Blakey textures; the live site's code and Scotese textures are not in the repo `[V]` | A *textured sphere + pre-rendered rasters + "where was my city?" hook* went viral (CNN, ScienceAlert, HN). You don't need terrain LOD to get attention; you need one personal hook. |
| **Neal.fun Asteroid Launcher** | Nuxt 2 / Vue static site; Apple MapKit JS map + canvas blast rings; three.js asteroid preview `[V loaded in browser]`; credits Collins & Rumpf, links the EIEP `effects.pdf` and NASA GPW population | No | ~2 months solo (1 month studying the physics per a VICE interview). Sliders + click-a-city + instant numbers. **2D was enough.** |
| **Earth Impact Effects Program** (Imperial, Collins/Melosh/Marcus) | Server-side form; equations PDF public `[V]` https://impact.ese.ic.ac.uk/ImpactEarth/ImpactEffects | Equations yes, code no | Port the equations client-side for distance-dependent local effects. Purdue's hosted copy now redirects to Purdue's homepage `[V]`. |
| **NASA Eyes** (Solar System / Asteroids / Earth) | three.js inside JPL's in-house "Pioneer" engine `[V bundle strings]`; timeline scrubber; no download | No | Sets the UX bar: scrub time, fly camera, instant web. |
| **HHMI BioInteractive EarthViewer** | **Cesium 1.14** + Highcharts + dragdealer slider; web port by Pelican Mapping `[V page source, Cesium blog]` | Free, not OSS | Globe + stacked climate graphs on one slider — a good pattern for showing temperature/darkness alongside the view. |
| **GPlates Web Portal / GPlates Web Service** | Portal uses **CesiumJS** `[V]`; GWS (GPL-2.0, Django/pyGPlates) returns reconstructed coastlines/polygons/points for any age; e.g. **Chicxulub at 66 Ma → lon −74.55, lat 21.92 (MULLER2019 model)** `[V]` | GWS yes | Fetch paleo-coastlines directly; cite the plate model used. |
| **Google Earth Web / Earth Studio** | C++ → Wasm, WebGL2 `[V web.dev case study]`; Studio is Chrome-only | No | Camera-path cinematics; no paleo mode. |
| Solar System Scope | Unity WebGL `[V]` | No | Heavy; avoid. |
| Universe Sandbox | Unity desktop `[V FAQ]` | No | Spectacle reference only. |
| ChronoZoom | .NET, Apache-2.0, retired by MSR `[V]` | Yes (dead) | Nothing to reuse. |
| cambecc/earth | SVG + canvas particles, MIT, 6.6k★ `[V]` | Yes | Projection / particle-overlay patterns. |
| **Collins et al. 2020** iSALE-3D movies (*Nat. Commun.*, CC BY) `[V]` | — | Media only | Reference footage for the crater-formation sequence (angle, peak-ring collapse). |
| **Range et al. 2022** tsunami SI videos (Dataverse, CC0) `[V]` | — | Data + media | Keyframe source for the global tsunami (see `stack-options.md` §3). |
| Documentaries | Discovery "Large Asteroid Impact Simulation" **64.8 M views**; Kurzgesagt "The Day the Dinosaurs Died – Minute by Minute" **23.1 M views** `[V YouTube API]`; BBC/NOVA Tanis documentary (2022) | — | **Demand is proven.** People want the minute-by-minute. |

## Virality lessons (from the two solo precedents)

1. One personal hook ("where was my city?", "launch an asteroid at my town") — ours is probably **"what happened *here*, minute by minute?"** (click anywhere on the globe → local timeline of effects).
2. Instant result, no login, sliders not menus.
3. Credited science; links to the papers.
4. Share-ready URL with a preview image.
5. Both used **precomputed data, not live simulation**.
6. Both were solo and shipped one thing first.
