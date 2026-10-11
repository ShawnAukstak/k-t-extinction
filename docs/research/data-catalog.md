# Data catalog (consolidated)

> Every downloadable dataset identified across the four research reports, with licence status. This is the human-readable precursor to `data/catalog.yaml`. Verification: **[V]** URL/licence verified this session (fetched, downloaded, or HTTP-checked) · **[S]** seen in a search snippet · **[U]** unverified.
>
> **Licence policy:** only **CC0 / CC BY / public domain / US-Gov** datasets go into the shipped app. GPL *services* may be called over HTTP (not linked in). "No licence stated" = ask before shipping or re-derive from a licensed source.

## A. Paleogeography — globe base layers

| # | Dataset | What | Format / res | Licence | URL | Status | Role |
|---|---|---|---|---|---|---|---|
| A1 | **PALEOMAP PaleoDEMs** (Scotese & Wright 2018) | Paleo-topo+bathy, 5 Myr steps; use `Map16_PALEOMAP_6min_KT_Boundary_65Ma.nc` (26 MB) | NetCDF-4/HDF5; **0.1°** (also 1°); 40 m vertical | **CC BY 4.0** | https://zenodo.org/records/5460860 (0.1° zip 207 MB) | [V] downloaded | **Primary terrain source** |
| A2 | **PaleoCoastlines v7** (Kocsis & Scotese 2021) | True paleo-shorelines (CS) and continental margins (CM) at 5 Myr steps; `65Ma_CS_v7.shp` | Shapefile + GPML; PNG 3600×1800 | **CC BY 4.0** | https://zenodo.org/records/7828387 (17.5 MB) / https://zenodo.org/records/7994000 (v7.3) | [V] downloaded | Land/sea mask, shoreline vectors |
| A3 | **Dutkiewicz et al. 2019 paleobathymetry** | Ocean-floor depth incl. LIPs and sediment, 0–120 Ma at 1 Myr; `paleobathymetry_66.nc` (7 MB) | NetCDF-4; 0.1° | **CC BY 4.0** (License.txt) | https://www.earthbyte.org/webdav/ftp/Data_Collections/Dutkiewicz_etal_2019_Geology/paleobathymetry_grids/ | [V] listing + licence | Cleanest licensed 66 Ma ocean depth |
| A4 | Wright et al. 2020 paleobathymetry (Müller 2019 model) | `paleobathymetry_66.nc` (6.4 MB) + sediment thickness, LIP heights | NetCDF | not stated | https://www.earthbyte.org/webdav/ftp/Data_Collections/Wright_etal_2020_ESR/Grids/ | [V] listing | Alternative to A3 |
| A5 | PALEOMAP PaleoAtlas for GPlates v3 (Scotese 2016) | Pre-rendered maps; `Map16a KT Boundary_066.jpg` 3600×1800 | JPEG equirect + .rot/.gpml | Inside the CC BY 4.0 Zenodo record but **no licence file in zip**; has modern political boundaries drawn on | https://www.earthbyte.org/webdav/ftp/earthbyte/Scotese_PaleoAtlas_v3.zip (58 MB) | [V] downloaded | Quick-fallback texture / reference only; prefer re-rendering from A1 |
| A6 | PALEOMAP PaleoAtlases (PDF) | 17 PDF atlases incl. Late Cretaceous maps and the Atlas of PaleoClimatic Zones | PDF | CC BY 4.0 (License.txt) | https://www.earthbyte.org/webdav/ftp/Data_Collections/Scotese_Wright_2018_PaleoDEM/PALEOMAP_PaleoAtlases.zip (113 MB) | [V] downloaded | Legend/reference for climate belts |
| A7 | **GPlates Web Service** | REST: reconstruct coastlines, polygons, points for any age/model; e.g. `/reconstruct/reconstruct_points/?points=-89.5,21.4&time=66&model=MULLER2019` | GeoJSON, PNG | Service GPL-2.0; model data CC BY 4.0 | https://gws.gplates.org/ ; docs https://gwsdoc.gplates.org/ ; self-host `docker run -p 18000:80 gplates/gws` | [V] tested | POI reconstruction; present-day-outline overlay |
| A8 | Müller et al. 2019 plate model v3.0 | Rotations, coastlines, static polygons, topologies | .rot/.gpmlz/shp (85.7 MB) | CC BY 4.0 | https://zenodo.org/records/11601026 | [V] | Only if we run pyGPlates offline |
| A9 | Merdith et al. 2021 / Müller et al. 2022 1 Ga models | Alternative plate models | GPlates files | CC BY 4.0 | https://zenodo.org/records/13635864 / https://zenodo.org/records/10910449 | [V] | Not needed |
| A10 | Cao et al. 2017 paleogeography | Environment polygons (landmass, mountains, ice, shallow marine); nearest slices 76 and 53 Ma — **no 66 Ma** | Shapefile, GeoTIFF | not stated | https://www.earthbyte.org/webdav/ftp/Data_Collections/Cao_etal_2017_BG_Supplement.zip (94 MB) | [V] downloaded | Mountain-belt mask (coarse) |
| A11 | Müller et al. 2016 age grids | Oceanic crust age, `agegrid_66.nc` | NetCDF ~26 MB | not stated | https://www.earthbyte.org/webdav/ftp/Data_Collections/Muller_etal_2016_AREPS/ | [V] description | Input for ridge rendering if wanted |
| — | **Deep Time Maps (Blakey)** | Paleogeographic art | — | **Paid; "cannot be posted online"** | https://deeptimemaps.com/ | [V] | **Do not use.** Visual reference only |

## B. Climate and vegetation at 66 Ma

| # | Dataset | What | Format / res | Licence | URL | Status | Role |
|---|---|---|---|---|---|---|---|
| B1 | **BRIDGE HadCM3L run `texyn`** (Valdes, Scotese & Lunt 2021) — 66.0 Ma, 576 ppm | Annual/seasonal climatologies (`texyna.pcclann.nc` 4.3 MB), monthly, ocean, **BIOME4 (`texyn_biome4out.nc` 1.7 MB)**, vegetation fractions | NetCDF; 3.75°×2.5° | Paper CC BY 4.0; **data terms not stated** — cite Valdes 2021, contact if shipping | https://www.paleo.bristol.ac.uk/ummodel/data/texyn/standard_new_html/texyn.html (dir listings 403; direct file URLs work) | [V] HEAD-checked | Temperature/precip/sea-ice overlays; **biome raster** |
| B2 | PhanDA HadCM3L priors (Judd et al.) | Same 109 simulations repackaged (tas, tos, so, pr) | NetCDF zips (to 11.4 GB) | CC BY 4.0 | https://zenodo.org/record/8237751 | [V] | Licensed bulk alternative to B1 |
| B3 | Scotese et al. 2021 GMST grids | Proxy-adjusted surface temperature, 100 intervals (Maastrichtian = 70 Ma, GMST 21.1 °C) | NetCDF 1°, CSV | CC BY 4.0 | https://zenodo.org/records/5718392 | [V] | Temperature overlay |
| B4 | Pohl et al. 2022 Köppen–Geiger classes | FOAM runs every 20 Myr — **60 and 80 Ma only** | NetCDF + CSV; 2.8°×1.4° | CC BY 4.0 | https://zenodo.org/records/6620748 | [V] | Climate-zone raster (interpolate) |
| B5 | CenCO2PIP 2023 CO₂ compilation | Vetted paleo-CO₂ 66–0 Ma | Spreadsheets (NOAA NCEI) | — | DOI 10.1126/science.adi5177 | [V] PDF | Context number only |
| B6 | Chaboureau et al. 2014 FOAM-LPJ biomes | 70 Ma biome simulation | Figures only, no grid | — | https://pmc.ncbi.nlm.nih.gov/articles/PMC4191762/ | [V] | Reference |

## C. Impact physics and aftermath — model outputs to bake

| # | Dataset | What | Format / size | Licence | URL | Status | Role |
|---|---|---|---|---|---|---|---|
| C1 | **Collins, Melosh & Marcus 2005** equations | Earth Impact Effects Program scaling laws | PDF | Paper (equations are facts) | https://impact.ese.ic.ac.uk/static/effects.pdf ; open PDF https://spiral.imperial.ac.uk/bitstreams/8065368c-096c-4787-aab7-cbaf1a7d7277/download | [V] | **Local-effects calculator** — reference impl. in `scripts/eiep_reference.py` |
| C2 | **Range et al. 2022 global tsunami** | MOST max output (73.6 MB), hourly MOM6 SSH (~7 GB), **1/10° pre-impact bathymetry (61.6 MB)**, SI videos; total ~27.75 GB | NetCDF | **CC0** | https://doi.org/10.7910/DVN/GWOFIO (Harvard Dataverse) | [V] DOI-level | **Tsunami arrival-time / max-height rasters** + 66 Ma bathymetry |
| C3 | **Artemieva & Morgan 2020 dust cloud** | Density fields at 300/600/1200/3600 s | 13.7 MB | **CC BY 4.0** | https://zenodo.org/records/3677534 (DOI 10.5281/zenodo.3677535) | [V] | Ejecta-cloud animation keyframes |
| C4 | **Tabor et al. 2020 impact-winter CESM** | Control + 20-yr transient soot / SO₂ / dust: TS, TREFHT, FSDS (darkness proxy), precip… | NetCDF .gz; control 6.7 MB, scenarios ~134 MB each | **CC BY 4.0** | https://doi.pangaea.de/10.1594/PANGAEA.909529 ; files https://hs.pangaea.de/model/Tabor-etal_2019/ | [V] | **Post-impact temperature / darkness time series and rasters** |
| C5 | Collins et al. 2020 iSALE3D runs | 8 runs (angle × velocity), 5 timesteps (`.npz` pressure/temp/density/tracers), plotting scripts; ~10 GB; Supplementary Movies | npz | Zenodo (CC BY, paper CC BY) | https://zenodo.org/record/3667832 | [V] | Crater-formation cross-sections 0–300 s |
| C6 | Brugger et al. 2017 CLIMBER-3α | Global T, sea-ice 0–1000 yr | — | PIK doi:10.5880/PIK.2021.002 | https://doi.org/10.5880/PIK.2021.002 | [V] readme | Long-tail climate curve |
| C7 | Senel et al. 2023 GCM output | Fine-dust scenario | — | OSF | https://osf.io/2cdqg/ (DOI 10.17605/OSF.IO/2CDQG) | [V] | Alternative darkness scenario |
| C8 | Bardeen et al. 2017 WACCM output | Soot scenarios | — | UCAR Data Commons | https://data.ucar.edu | [S] | Alternative |
| C9 | Chiarenza et al. 2020 scenarios | Habitat suitability, dimming/Deccan runs | Figshare | check | DOIs 10.6084/m9.figshare.11908179… | [V] | Habitat overlay |
| C10 | IODP Expedition 364 Proceedings | Core logs, lithology | web | IODP | https://publications.iodp.org/proceedings/364/ | [U] | Crater-fill visual |

## D. Paleontology — who lived where

| # | Dataset | What | Format | Licence | URL | Status | Role |
|---|---|---|---|---|---|---|---|
| D1 | **PBDB data service 1.2** | Occurrences/collections/taxa/specimens with GPlates paleocoords; `?base_name=Dinosauria&interval=Maastrichtian&show=paleoloc,coords,class,strat,loc` → 4,209 records | REST JSON/CSV; CORS on | **CC BY 4.0** | https://paleobiodb.org/data1.2/ | [V] live-tested | **Presence & geography of taxa** (not abundance) |
| D2 | **Benson et al. 2014** body masses | 441 taxa | .xls (supplement **s011**) | **CC0** | https://journals.plos.org/plosbiology/article/file?type=supplementary&id=10.1371/journal.pbio.1001853.s011 | [V] downloaded | Species cards: mass |
| D3 | **Benson et al. 2018** body masses | Updated | Dryad zip | **CC0** | https://datadryad.org/dataset/doi:10.5061/dryad.1t3r4 | [V] | Species cards: mass |
| D4 | Dean et al. 2020 N. Am. Late K data | Formation-binned occurrences | Dryad | CC0 | https://datadryad.org/dataset/doi:10.5061/dryad.tmpg4f4vg | [S] | Bias correction |
| D5 | Horner, Goodwin & Myhrvold 2011 census | Hell Creek relative abundance (in paper) | PLoS ONE table | CC BY | DOI 10.1371/journal.pone.0016574 | [V] | **Herd composition at Hell Creek** |
| D6 | Marshall et al. 2021 | T. rex density (~1 per 100 km²) | paper | — | DOI 10.1126/science.abc8300 | [V] | Population scaling |
| D7 | GBIF mirror of PBDB | No paleocoords | REST | CC BY 4.0 (dataset) | https://www.gbif.org/dataset/bb5b30b4-827e-4d5e-a86a-825d65cb6583 | [V] | Secondary only |

## E. Visual assets

| # | Source | What | Licence | URL | Status | Role |
|---|---|---|---|---|---|---|
| E1 | **PhyloPic v2 API** | Silhouettes (CC0 subset for T. rex, Triceratops, Edmontosaurus, Ankylosaurus, Anzu, Struthiomimus, Alamosaurus, Telmatosaurus, Champsosaurus…) | per image | https://api.phylopic.org (`?build=558&filter_name=…`) | [V] | UI icons, 2.5-D "paper-doll" herds |
| E2 | **Smithsonian Triceratops** (Sketchfab, Smithsonian account) | Skeleton scan, 74k v, uid `e9c507f179ed4455aac3b208c9e6c973` | **CC0** | Sketchfab | [V] | Proportion reference / hero model |
| E3 | Sketchfab search API | Museum skeleton scans (CC BY / CC0); community life models (mostly inaccurate) | per model | https://api.sketchfab.com/v3/search | [V] | Case-by-case |
| E4 | Smithsonian 3D (3d.si.edu) | Nation's T. rex etc. | per object (some NC) | https://3d.si.edu | [S] | Check each |
| E5 | Quaternius "Animated LowPoly Dinosaurs" | Rigged low-poly T. rex, Triceratops, etc. with clips | **CC0** | https://quaternius.itch.io/animated-lowpoly-dinosaurs | [V] | **Herd-pipeline prototyping** (not accurate) |
| E6 | Wikimedia Commons (+ WikiProject Dinosaurs image review) | Restorations; "Inaccurate paleoart" category as a negative filter | CC BY-SA mostly | https://en.wikipedia.org/wiki/Wikipedia:WikiProject_Dinosaurs/Image_review | [V] | Reference |
| E7 | Scott Hartman skeletals | Proportion reference | CC BY-NC-SA (PhyloPic) | skeletaldrawing.com | [S/U] | Reference only |
| E8 | NASA Blue Marble / ETOPO 2022 / GEBCO / Natural Earth | Modern Earth | NASA / US-Gov / PD | see `paleogeography.md` | [V] | "Today" comparison globe, cloud layer |

## F. Known gaps

1. **No scientifically accurate, openly licensed, rigged 3D dinosaur models exist.** Museum skeleton scans (CC0/CC BY) + Hartman proportions are the honest basis; life models would have to be commissioned or built. See `docs/plan/open-questions.md`.
2. PaleoDEM nearest slice is 65 Ma. BRIDGE run is 66 Ma. Pohl Köppen is 60/80 Ma. Minor inconsistency; document.
3. No published global air-blast model for Chicxulub — EIEP scaling only (±2–5 ×).
4. Thermal pulse: no gridded output found; would be derived from Morgan 2013's qualitative asymmetry + Goldin & Melosh 2009 numbers.
5. Range 2022 is ~28 GB; preprocessing is a one-off desktop job.
6. Licence for BRIDGE data files not stated — email Valdes before shipping derived rasters, or use B2 (CC BY 4.0) instead.
