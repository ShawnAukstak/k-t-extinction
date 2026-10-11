# The impact event: impactor, site, date

> Research pass 1, 2026-10-11. Compiled from a web-research agent that read primary papers / open-access PDFs / abstracts. Companion to `timeline.md` (sequence of effects) and `sources.md` (bibliography).
>
> **Confidence tags:** **[W]** well-constrained (independent primary sources agree) · **[M]** model-dependent but converging · **[C]** contested / order-of-magnitude disagreement · **[U]** unsourced or from memory — verify before hard-coding.

## 1. Impactor

| Quantity | Best estimate | Range / notes | Tag | Source |
|---|---|---|---|---|
| Diameter | **~12–14 km** (at ~20 km/s) | 10 ± 4 km from Ir mass balance (Alvarez 1980); Schulte 2010 "~10 km". Hydrocode fits are velocity-dependent: Collins 2020 needed a **17 km** sphere at 12 km/s (60°) to make the observed crater; π-scaling (D ∝ L^0.78 v^0.44) implies ~13 km at 20 km/s. Impact Earth's template uses 14 km. | [M] | Alvarez 1980; Schulte 2010; Collins et al. 2020 |
| Composition | **Carbonaceous (C-type) asteroid, CM-chondrite-like, formed beyond Jupiter; comet ruled out** | Fossil meteorite fragment in Pacific K-Pg clay (Kyte 1998); Cr isotopes (Trinquier 2006); **Ru isotopes (Fischer-Gödde 2024)**. Desch et al. 2021 rebutted the comet hypothesis. | [W] | Fischer-Gödde et al. 2024 Science 385:752 |
| Density | ~2600 kg/m³ assumed | Collins 2020 used 2630; asteroid bulk porosity unknown (could be ~1200–2000 like Bennu/Ryugu [U]) | [C] | Collins 2020 Methods |
| Velocity | **~20 km/s nominal** | Not measurable from geology. Collins 2020 ran 12 and 20 km/s ("close to Earth's mean asteroid impact speed"); Impact Earth default 17 km/s. | [C] | Collins 2020; Collins 2005 |
| Impact angle | **45–60° to horizontal** (60° best fit at 12 km/s; possibly 45° at 20 km/s) | < 30° ruled out; the earlier 20–30°-from-SE claim (Schultz & D'Hondt 1996) is rejected. | [M] | Collins et al. 2020 |
| Azimuth | **Approached from the NE, travelling toward the SW** (downrange = SW) | From offsets: mantle-uplift centre uprange (NE) of crater centre, peak-ring centre downrange (SW). | [M] | Collins 2020 |
| Mass | ~2.5–4 × 10¹⁵ kg | 12 km @ 2650 → 2.4e15; 14 km → 3.8e15; 17 km → 6.8e15 | [M] | derived |
| Kinetic energy | **~3–8 × 10²³ J ≈ 0.7–2 × 10⁸ Mt TNT** | Literature 1e23 J (Morgan 2022) to 0.7–3.4e24 J (Pope 1997). Collins 2020 17 km / 12 km/s = 4.9e23 J. | [M] | Collins 2005, 2020; Morgan 2022 |
| Fragmentation / binary | **No evidence.** Single crater; global ejecta symmetry consistent with one steep impactor. Boltysh (Ukraine) is ~0.65 Myr *after* K-Pg (Pickersgill 2021). Nadir crater (offshore Guinea, ~9 km) is "~66 ± 1 Ma" — too loose; its authors say probably unrelated. | [W] / [C] Nadir | Pickersgill 2021; Nicholson 2022, 2024 |

**For the app:** nominal impactor 12–14 km, 20 km/s, 60° from the NE heading SW. Show ranges in an "about the numbers" panel.

## 2. Site

| Quantity | Value | Tag | Source |
|---|---|---|---|
| Crater centre (modern coords) | **21.29°N, 89.53°W** (geometric centre of rim from gravity gradient + cenote ring); Morgan 2016 used 21.30°N, 89.54°W. Central gravity high 21.24°N 89.58°W; max mantle uplift 21.38°N 89.52°W (NE of centre). | [W] | Collins 2020 (citing Hildebrand 1995, 1998); Morgan 2016 |
| Crater centre at 66 Ma (paleo-coords) | **lon −74.55, lat 21.92** per GPlates Web Service, MULLER2019 model (verified by the tech-research agent, see `docs/tech/prior-art.md`). Differs by model — record which one we use. | [M] | GWS |
| Rim-to-rim diameter | **~180–200 km** multi-ring basin; inner rim at 70–85 km radius; outer ring faults to 70–130 km radius (Sharpton's 300 km "outer ring" is not consensus) | [W] | Gulick 2013; Morgan 2016; Hildebrand 1991 |
| Peak ring | **~80–90 km diameter**, relief ~400 m; drilled at 45.6 km radius; rocks are shocked (10–35 GPa) granitic basement uplifted from **8–12 km depth**, moved > 20 km during collapse | [W] | Morgan 2016; Collins 2020 |
| Transient cavity | ~80–100 km diameter, ~25–35 km deep | [M] | Gulick 2013, 2019; Schulte 2010; Collins 2020 |
| Central uplift / melt | Central structural uplift > 10 km; Moho uplifted 1–2 km; coherent melt sheet < 3 km thick; melt volume ~4,000–10,000 km³ | [M] | Gulick 2013; Collins 2005 |
| Present state | Crater buried under ~1 km of Cenozoic sediment; impactites from 617 mbsf at M0077A | [W] | Gulick 2019; Morgan 2016 |
| Target rocks | **~3 km Mesozoic carbonate platform with 30–50 % evaporites (anhydrite/gypsum) over ~33 km granitic crust** | [W] | Morgan 2016; Collins 2020; Gulick 2019 |
| Pre-impact water depth | **Asymmetric: ~100 m on the W/SW shelf, > 1200 m to the NE, ~650 m near centre; up to ~2 km in the NE embayment.** "Shallow sea" is only true on one side. | [M] | Gulick et al. 2008 *Nat. Geosci.* 1:131 [V, Crossref]; Gulick 2019 |
| IODP-ICDP Exp. 364 | Hole M0077A, **21.45°N, 89.95°W**, ~30 km NW of Progreso, water depth 19.8 m, cored 505.7–1334.7 mbsf, April–May 2016 | [W] | Morgan 2016; IODP Proc. 364 |

## 3. Date, season, time of day

| Item | Value | Tag | Source |
|---|---|---|---|
| Absolute age (⁴⁰Ar/³⁹Ar) | **K-Pg boundary 66.043 ± 0.011 (analytical) / ± 0.043 (full) Ma**; impact and extinction synchronous within 32 kyr | [W] | Renne et al. 2013 Science 339:684 |
| Hell Creek recalibration | 66.052 ± 0.008/0.043 Ma [U exact] | [W] | Sprain et al. 2018 |
| U-Pb (Denver Basin) | 66.021 ± 0.024/0.039/0.081 Ma | [W] | Clyde et al. 2016 |
| **Best value for the UI** | **66.04 ± 0.05 Ma** (inter-lab spread is within systematic error) | [W] | synthesis |
| Season | **Boreal spring (austral autumn)** from growth-line histology and δ¹³C of sturgeon/paddlefish killed by the Tanis seiche. DePalma 2021 reached "spring/summer" but its raw data were never released and Manchester found research misconduct (poor practice, not fabrication); **During 2022 stands independently.** | [M] | During et al. 2022 Nature 603:91; During, Voeten, van der Lubbe & Ahlberg 2024 *PeerJ* 12:e18519 |
| Time of day | **No published constraint exists.** Choose for visual effect and label as unconstrained. | — | absence confirmed |

## 4. Deccan Traps — current consensus

- ~500,000 km³ erupted in chron C29r, episodically; main phase ~700–800 kyr across the boundary (Hull 2020; Schoene 2021).
- U-Pb (Schoene 2019): four pulses, one beginning tens of kyr *before* impact. Ar-Ar (Sprain 2019): > 90 % of volume in < 1 Myr, ~75 % *after* the boundary. Re-analysis of both groups' data (Schoene, Eddy, Keller & Samperton 2021, *Geochronology* 3:181): **neither dataset supports an impact-triggered eruption increase.**
- Hull 2020: major Deccan outgassing began and ended before the impact; only the impact coincides with the extinction. Chiarenza 2020: impact winter alone eliminates dinosaur habitat; Deccan alone does not.
- **Consensus: the impact caused the extinction; Deccan was a background stressor and post-extinction modulator.** A minority (Keller group) still argues for volcanism. The app should show Deccan as an ongoing feature of the 66 Ma globe (India, ~20°S), not as the cause.

## 5. Foundational papers

- **Alvarez, Alvarez, Asaro & Michel 1980**, Science 208:1095 — Ir anomaly; asteroid 10 ± 4 km; darkness mechanism.
- **Hildebrand et al. 1991**, Geology 19:867 — identification of the buried ~180 km Yucatán structure as the crater.
- **Schulte et al. 2010**, Science 327:1214 (41 authors) — consensus: single Chicxulub ejecta layer worldwide coincident with extinction; Deccan rejected as trigger.
- **Morgan et al. 2016**, Science 354:878 — Exp. 364 peak-ring drilling.
- **Gulick et al. 2019**, PNAS 116:19342 — "The first day of the Cenozoic": crater-fill chronology.
- **Collins et al. 2020**, Nat. Commun. 11:1480 — trajectory (angle, direction) from 3D hydrocode.
- **Chiarenza et al. 2020**, PNAS; **Hull et al. 2020**, Science — impact, not Deccan.
- **Morgan, Bralower, Brugger & Wünnemann 2022**, Nat. Rev. Earth Environ. 3:338 — current authoritative review.

## 6. Reusable models, datasets, code

| Resource | What | Reusability |
|---|---|---|
| **Collins, Melosh & Marcus 2005**, MAPS 40:817 — open PDF: `https://spiral.imperial.ac.uk/bitstreams/8065368c-096c-4787-aab7-cbaf1a7d7277/download` | Every equation of the Earth Impact Effects Program with constants (energy, transient crater, final crater, melt, fireball, thermal, seismic, ejecta thickness & flight time, air blast, wind, arrival times). No tsunami module. | **Fully reimplementable.** A Python reference implementation validated against the paper's Table 6 lives at `scripts/eiep_reference.py`. Notes: eq. 41c's printed constant "6.399" is inconsistent with the paper's Fig. 5 — 3.399 reproduces it; ejecta-thickness and blast at Chicxulub scale differ from the paper's own table by up to ~2× (undocumented program details) — treat as ±2×. |
| Impact Earth web tool (`impact.ese.ic.ac.uk/ImpactEarth/ImpactEffects`) | Live calculator; airblast updated per Collins et al. 2017 MAPS. | Copyright Imperial; **no source or licence** — reimplement from the paper. |
| **Collins et al. 2020 dataset**, Zenodo 10.5281/zenodo.3667832 | iSALE3D inputs for 8 runs (90/60/45/30° × 12/20 km/s), output at 5 timesteps (`.npz`: pressure, temperature, density, tracers), plotting scripts; ~10 GB; Supplementary Movies 1–4. | Directly usable to render crater-formation cross-sections at 0–300 s. |
| **Artemieva & Morgan 2020**, Zenodo 10.5281/zenodo.3677535, CC BY 4.0, 13.7 MB | Dust-cloud density fields at 300/600/1200/3600 s. | Ejecta-cloud animation keyframes. |
| **Range et al. 2022** tsunami | **Harvard Dataverse, CC0, ~27.75 GB — DOI 10.7910/DVN/GWOFIO** (verified by the tech agent: `MOST_max_output.nc` 73.6 MB, hourly MOM6 SSH ~7 GB, pre-impact bathymetry 61.6 MB, SI videos). *The impact agent did not find this; the tech agent's DOI-level verification wins.* | Tsunami arrival-time/amplitude keyframes **and** a 66 Ma bathymetry. |
| **Tabor et al. 2020** climate, PANGAEA 10.1594/PANGAEA.909529, CC BY 4.0 | Monthly surface temperature / shortwave for control + soot/SO₂/dust CESM runs. | Gridded "years after" temperature and darkness. |
| Bardeen 2017 output | UCAR Data Commons | Soot/darkness climate fields. |
| Brugger 2017 data, PIK doi:10.5880/PIK.2021.002 | CLIMBER-3α output, 0–1000 yr | Global T / sea-ice time series. |
| Senel 2023 GCM output, OSF 10.17605/OSF.IO/2CDQG (CC BY 4.0 per the registry) | Fine-dust scenario. | — |
| IODP Expedition 364 Proceedings | Core logs, lithology with depths. | Crater-fill stratigraphy visual. |

## 7. Well-constrained vs contested — for the UI's "about the numbers" panel

**Well-constrained:** age (66.04 ± 0.05 Ma); crater location, size, peak-ring structure, target lithology (drilled); C-type asteroid; steep 45–60° trajectory from the NE; crater-formation chronology to ~5 min; resurge/tsunami-return chronology to ~1 day; ejecta thickness classes vs distance; seismic/seiche arrival minutes at ~3000 km; tsunami propagation timeline (1 h / 4 h / 24 h / 48 h); boreal-spring season; rapid life recovery in the crater; impact (not Deccan) as the trigger.

**Model-dependent, show ranges:** impactor diameter/velocity/energy (10–17 km; 12–20 km/s; 1e23–2e24 J); transient-cavity dimensions; tsunami initial amplitude and regional heights; air blast at any distance (×2–5); earthquake magnitude (9.5–11.5) and shaking duration.

**Contested:** thermal-pulse intensity and global wildfires; sulfur release (67 ± 39 vs 325 ± 130 Gt S) and hence cooling magnitude; dominant darkening agent (soot vs fine dust vs sulfate); impact-winter duration (months vs > decade); ocean acidification as a kill mechanism; Deccan tempo.

**Unavailable:** time of day; impactor density/porosity; direct observational constraints on air blast.

## 8. Items flagged [U] by the researcher — verify against the papers before hard-coding
Sprain 2018 exact age; Range 2022 hydrocode inputs and the "4.5 km wall / 1.5 km ring wave at 220 km" figures (press-release derived); Robertson 2004 flux numbers; Kring 2007 blast numbers; Meschede 2011 antipodal magnitudes; Kinsland 2021 exact megaripple dimensions.
