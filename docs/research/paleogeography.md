# Paleogeography, climate and environment at 66 Ma

> Research pass 1, 2026-10-11. Compiled from a web-research agent that **downloaded and inspected** the main datasets (PaleoDEM, PaleoAtlas rasters, PaleoCoastlines, GWS API calls, BRIDGE climate files). Companion dataset catalog: `data-catalog.md`. Points of interest: `points-of-interest.md`.
>
> **Verification legend:** **[V]** = page fetched / file downloaded and inspected / API tested · **[S]** = search snippet only · **[U]** = prior knowledge, unverified this session · **[computed]** = we computed it.

## 1. The world at 66 Ma — what the globe should show

### 1.1 Plate configuration
- Continents are recognisably modern but shifted. Using the Müller et al. 2019 model via the GPlates Web Service at 66 Ma: **Chicxulub → ~22.0°N, 74.5°W** (modern 21.4°N, 89.5°W); **Tanis → ~48.7°N, 81.3°W**; **Deccan → ~20.6°S, 50.6°E**; **Seymour Island → ~65°S** [V, computed]. The PALEOMAP model gives Deccan ~23.4°S, 56.8°E — **different plate models differ by several degrees** (different reference frames). *Keep rasters and point reconstructions on one model.*
- **North Atlantic:** central and South Atlantic are open; **Greenland is still attached to both North America and Europe.** Labrador Sea spreading begins ~63–61 Ma; Greenland–Europe breakup only at ~56–54 Ma [V]. **Europe is an archipelago of flooded shelves** [V, inspected raster].
- **Tethys:** a broad Neotethys/Mediterranean seaway separates Africa+Arabia from Eurasia; Arabia, North Africa (Trans-Saharan seaway) and much of Europe are under shallow epicontinental seas [V].
- **India** is an isolated island continent at ~20–25°S (model-dependent), drifting north fast; India–Eurasia collision not until ~55–50 Ma [V]. **Deccan Traps** erupting ~66.3–65.6 Ma, centred ~18.85°N, 73.72°E today [V].
- **Australia is still joined to Antarctica** (only a narrow shallow gulf between them in Scotese's raster); full Tasmanian Gateway opening is Eocene–Oligocene [U]. Zealandia has already rifted away [U].
- **Caribbean:** the Caribbean plate sat well west of its present position; sites now on it (Beloc, Cuba) reconstruct far from their modern positions, and Moncada falls outside any plate polygon in MULLER2019 [V, computed]. Treat Caribbean POI placement as model-dependent.

### 1.2 Sea level
- The latest Cretaceous was a long-term highstand that was **falling**: "sea levels fell in the final Cretaceous stage more than at any other Mesozoic time" [V]. Short-term eustatic magnitudes modest (median ~12 m) but Santonian–Maastrichtian among the higher (> 40 m) intervals [V, EGU2020].
- Absolute values differ wildly between curves: Haq 2014 puts the Maastrichtian ~100–150 m above present [U]; Miller 2005 ~50–70 m [U]. Scotese & Wright 2018 state Haq is "too high" and Miller "too low" [V, PaleoDEM report].
- **Recommendation:** use the PaleoDEM 65 Ma sea level (0 m contour) as baseline; optionally expose a ±50 m slider.

### 1.3 Western Interior Seaway, Hell Creek, Laramide
- The seaway lasted ~100–66 Ma; its terminal retreat is recorded by the Fox Hills Sandstone (shorelines regressed > 1,300 km). In its final phase it "divided across the Dakotas and retreated south towards the Gulf" [V]. Scotese's 66 Ma raster shows the interior essentially closed, with a shallow lobe reaching north from the Gulf into the Great Plains [V, inspected]. The Cannonball Sea is a *Paleocene* re-advance [S]. **Net: at 66.0 Ma show a shrunken shallow remnant east of the Hell Creek coastal plain, not a through-going seaway.**
- **Hell Creek Formation** (~68–66 Ma): low-lying coastal plain on the western margin of the remnant seaway; east-flowing rivers, deltas, swampy floodplains; warm, humid, seasonal; MAT ~11–12 °C (leaf physiognomy — but crocodilians and palms imply frost-free winters; estimates vary) [V]. Flora ~90 % angiosperms, ~5 % conifers, ~4 % ferns [V].
- **Tanis** (46.0218°N, 103.7910°W per Wikipedia): a river point bar close to the seaway's western shore, ~3,050 km from Chicxulub [V].
- **Laramide orogeny:** began ~80–70 Ma; Rockies/Black Hills rising at 66 Ma but summits and basin floors much closer to sea level than today [V]. **Render the Rockies as a modest, young range.**

### 1.4 Yucatán / Gulf of Mexico target
- Crater centre 21.4°N, 89.5°W (see `impact-event.md` for precise values). Target: marine carbonate platform with ~3 km of Jurassic–Cretaceous sediments — dolomite 35–40 %, limestone 25–30 %, **anhydrite 25–30 %** — over ~35 km continental crust [V].
- **Water depth:** shelf sloped from ~100 m (W) to > 1,200 m (NE); ~650 m at the crater centre (Gulick et al. 2008) — ~6.5 × more water vapour injected than the old "flat shelf < 100 m" picture [V].
- Regional Gulf: carbonate environments over ~96 % of the basin, deep-water chalks in the centre, steep shoreline-to-basin gradients in Mexico [S].

### 1.5 Climate numbers

| Quantity | Value | Source |
|---|---|---|
| Global mean 2 m air temp, 66 Ma, HadCM3L, 576 ppm CO₂ (run `texyn`) | **21.5 °C** (land 19.6, ocean 22.3; DJF 20.0, JJA 23.2); precip 3.27 mm/day | [V] BRIDGE |
| Scotese et al. 2021 proxy-adjusted GMST, Maastrichtian (70 Ma map) | **21.1 °C** | [V] |
| Chiarenza et al. 2020 HadCM3L control, 560 ppm | 18.96 °C | [V] |
| Benthic-δ¹⁸O-derived GMST (Westerhold 2020 via CenCO2PIP) at 60–66 Ma | ~23–24 °C | [V, read from figure] |
| Maastrichtian model ensemble (1–6 × CO₂) | 18.1–23.6 °C | [S] |
| Tropical SST (TEX86, N. Atlantic ~35°N paleolat) | 28–31 °C | [S] Linnert 2014 |
| Maastricht type area (clumped isotopes) | 20.4 ± 3.8 °C; warming at ~66.4 Ma = Late Maastrichtian Warming Event (Deccan-linked) | [S] |
| pCO₂ at 66 Ma | CenCO2PIP: early Paleocene mean **650–850 ppm**; models use 560–576 ppm | [V] Hönisch 2023 |
| Polar ice | None persistent; "cool greenhouse"; ephemeral Antarctic ice debated | [V/U] |
| Latitudinal gradient | Reduced vs modern; polar amplification | [S] |

**Recommended defaults:** GMST ~21–23 °C, pCO₂ ~600–800 ppm, no ice caps, tropical SST ~29–30 °C, polar SST ~10–15 °C, strong seasonality on continental interiors (land DJF–JJA swing ~11 K).

### 1.6 Vegetation / biomes
- Angiosperms dominate lowland floras; conifers (Araucariaceae, Cupressaceae, taxodioids, Pinaceae at mid/high latitudes), cycads, ginkgos and ferns persist [V]. Grasses existed; grasslands did not [U]. High-latitude deciduous conifer/broadleaf forests with no permanent ice [U]. (Detail by latitude in `paleontology.md` §6.)
- Chaboureau et al. 2014 (FOAM-LPJ, 70 Ma): Maastrichtian among the wettest simulations; desert area ~4 %; among angiosperm-rich fossil sites: tropical 26 %, temperate 63 %, cold 10.5 %, desert 0 % [V].
- Scotese's "Atlas of PaleoClimatic Zones" uses 5 belts — Tropical Everwet, Subtropical Arid, Warm Temperate, Cool Temperate, Cold Polar — plus a "Boreal Tropical" belt at 45–60° during hothouses [V, PDF].
- **Gridded biome output you can actually download:** BIOME4 run on the HadCM3L 66 Ma climate (`texyn_biome4out.nc`, 1.7 MB) [V, HTTP 200].

### 1.7 How existing paleo-globes are "painted"
- **Scotese's method** (PaleoDEM report pp. 4–6) [V]: start from modern topo/bathy, rotate cells to paleo-positions, edit as 8-bit greyscale (±10,000 m → 0–255, 40 m steps) using lithofacies/tectonic constraints, "unsubside" ocean floor with an age–depth curve, then colour by elevation: deep ocean dark blue; ridges blue; shelves light blue; coastal lowlands dark green; inland lowlands green; plateaus tan; mountains brown; peaks white.
- **Ancient Earth** [V]: client-side WebGL globe, Scotese PaleoAtlas JPGs as textures, 26 time slices incl. 66 Ma, clouds not time-adjusted, locations "accurate to ~100 km". The 2015 code is **MIT on GitHub** (`typpo/ancient-earth`) but used older NAU/Blakey textures; the live site uses Scotese.

## 2. Suggested data stack for the globe

1. **Terrain:** `Map16_PALEOMAP_6min_KT_Boundary_65Ma.nc` (0.1°, CC BY 4.0) → hypsometric tint + hillshade → 3600×1800 or 7200×3600 equirectangular; optionally swap the ocean for Dutkiewicz 2019 `paleobathymetry_66.nc` (0.1°, CC BY 4.0). Quick fallback: `Map16a KT Boundary_066.jpg` as-is (has modern political boundaries baked in — prefer re-rendering).
2. **Land/sea mask & shorelines:** PaleoCoastlines `65Ma_CS_v7.shp` (true paleo-shorelines, CC BY 4.0). GWS "coastlines" are *present-day* outlines rotated back — use only as a faint "where today's coasts were" layer.
3. **Climate overlays:** BRIDGE `texyna.pcclann.nc` (temperature, precip, sea ice) and `texyn_biome4out.nc` (BIOME4 classes), regridded; Pohl 2022 Köppen (60/80 Ma) as an alternative.
4. **Impact aftermath:** Tabor 2020 soot/SO₂/dust transient fields (see `impact-event.md` §6).
5. **POIs:** modern coordinates in `points-of-interest.md`, rotated with GWS `reconstruct_points` using the *same model* as the raster (PALEOMAP model for Scotese rasters; MULLER2019 for EarthByte grids).

## 3. Gotchas

- **Nearest PaleoDEM slice is 65 Ma, not 66** (5 Myr steps). Fine for our purposes; document it.
- **Model-frame mismatch:** PALEOMAP vs MULLER2019 place the same point several degrees apart at 66 Ma.
- **Licensing:** GPlates / pyGPlates / GPlately / GWS are **GPL-2.0** — call the public or a self-hosted GWS over HTTP rather than linking pyGPlates into app code. Deep Time Maps (Blakey) are paid and "cannot be posted online". PALEOMAP PaleoAtlas JPGs are inside the CC BY 4.0 Zenodo record, but the zip itself has no licence file; cite Scotese 2016.
- **File format:** the 0.1° PaleoDEM NetCDF is HDF5-based — use netCDF4/xarray/GDAL, not a NetCDF-3 reader.
- Scotese describes the DEMs as a "first draft" with known topographic errors.
- Not verified this session: Haq 2014 absolute values; Tabor 2020 model grid; licences for Wright 2020 and Cao 2017 grids (EarthByte data are usually CC BY 4.0 but those folders lack a licence file).

## 4. Bibliography (V = opened this session)

Cao et al. 2017 *Biogeosciences* 14:5425 [V] · Chaboureau et al. 2014 *PNAS* 111:14066 [V] · Chiarenza et al. 2020 *PNAS* 117:17084 [V] · Davies et al. 2020; Ray et al. 2019 (Cretaceous eustasy) [V via EGU2020] · Dutkiewicz et al. 2019 *Geology* doi:10.1130/G45424.1 [V] · Gulick et al. 2008 *Nat. Geosci.* 1:131 [V via UT news] · Haq 2014 *Global Planet. Change* 113:44 [values U] · Hönisch et al. (CenCO2PIP) 2023 *Science* 382 eadi5177 [V] · Judd et al. 2024 *Science* 385 eadk3705 [V] · Kocsis & Scotese 2021 *Earth-Sci. Rev.* doi:10.1016/j.earscirev.2020.103463 [V] · Linnert et al. 2014 *Nat. Commun.* 5:4194 [S] · Merdith et al. 2021 *Earth-Sci. Rev.* 214:103477 [V] · Miller et al. 2005 *Science* 310:1293 [U] · Molina et al. 2006 *Episodes* 29:263 (El Kef GSSP) [V] · Müller et al. 2016 *AREPS* 44 [V] · Müller et al. 2019 *Tectonics* 38:1884 [V] · Müller et al. 2022 *Solid Earth* 13:1127 [V] · Ormö et al. 2021 *EPSL* [S] · Pohl et al. 2022 *Data in Brief* 43:108424 [V] · Scotese 2016 PALEOMAP PaleoAtlas for GPlates [V] · Scotese & Wright 2018 PaleoDEMs [V] · Scotese, Song, Mills & van der Meer 2021 *Earth-Sci. Rev.* 215:103503 [V] · Sewall et al. 2007 *Clim. Past* 3:647 [V] · Tabor et al. 2020 *GRL* 47 [V record] · Valdes, Scotese & Lunt 2021 *Clim. Past* 17:1483 [V] · Wright et al. 2020 *Earth-Sci. Rev.* doi:10.1016/j.earscirev.2020.103293 [V] · Boucot, Xu & Scotese 2013 SEPM CSP 11 [S].
