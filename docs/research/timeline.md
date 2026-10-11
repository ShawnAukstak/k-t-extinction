# Timeline of effects

> Research pass 1, 2026-10-11. The sequence of physical and biological consequences of the Chicxulub impact, with timing, magnitude, extent and source. This is the raw material for `data/curated/timeline.yaml` and the timeline UI. Parameters of the impactor and site are in `impact-event.md`.
>
> **Confidence tags:** **[W]** well-constrained · **[M]** model-dependent but converging · **[C]** contested · **[U]** unsourced / from memory.
>
> Distances are from the crater centre. T = 0 is first contact. "EIEP" = Collins, Melosh & Marcus 2005 scaling equations (see `scripts/eiep_reference.py`).

## 1. Entry, fireball, crater (seconds → minutes) [W/M]

- **Atmospheric traverse:** ~6 s at 20 km/s and 60°; ~10 s at 12 km/s. Negligible deceleration or ablation for a > 1 km body. *(Derived; EIEP's entry model is for < 1 km impactors.)*
- **Shock and vapour:** peak pressures > 100 GPa, vapour > 10,000 K. The fireball becomes visible once it cools to the air transparency temperature ~2000–3000 K.
- **Fireball radius at max radiation** (EIEP eq. 32, R = 0.002 E^⅓): **~135 km (3e23 J) – 185 km (7.6e23 J) – 236 km (1.65e24 J)**; time to max ~7–13 s. Earth's curvature hides the fireball beyond **~1500 km** — direct fireball radiation is regional, not global.
- **Transient cavity** (80–100 km wide, ~30 km deep) complete within **~10–30 s** (Gulick 2013 "within 10 s"; Collins 2020 Fig. 2b at 20 s).
- **Central uplift** > 10 km above the pre-impact surface by **~3 min** (Collins 2020 Fig. 2c, T = 180 s).
- **Peak ring** forms as the over-heightened uplift collapses outward over the slumped rim by **~5 min** (Collins 2020 Fig. 2d, T = 300 s). Peak ring capped by ~40 m melt + suevite "within tens of minutes" (Gulick 2019).
- **Resurge:** ocean floods the crater through the NE embayment **30–60 min** after impact; resurge crests the peak ring; settling and seiches over hours build an 80 m fining-upward suevite at ~130 m/day (Gulick 2019).

## 2. Ejecta curtain, plume, re-entry, global layer [M]

- Several thousand Gt of asteroid + target ejected at > 5 km/s; most-shocked material > 11 km/s (escape) (Morgan 2022).
- **Ballistic re-entry times vs distance** (EIEP eq. 49–52, validated re-implementation): 200 km → 3.4 min; 500 km → 5.6 min; 1000 km → 8.2 min; 3000 km → 17 min; 5000 km → 26 min; 10,000 km → 61 min. Tanis (3050 km): spherules begin **~15 min**, bulk within 1–2 h (DePalma 2019) — consistent.
- **Re-accretion schedule of high-energy ejecta** (Kring & Durda 2002): ~12 % escapes; ~25 % re-enters within 2 h, ~55 % within 8 h, ~85 % within 72 h; re-entry is pulsed and concentrated near the crater and at the **antipode** (then India / Indian Ocean).
- **Non-ballistic transport:** ballistic models can't carry shocked quartz globally; the ejecta curtain interacts with the atmosphere to form a dust cloud moving at a few km/s (Artemieva & Morgan 2009, 2020). The cloud **encircles Earth within 4–5 h** (Morgan 2022); target-derived black carbon "circulated the globe within a few hours" (Lyons 2020).
- **Observed ejecta thickness vs distance** (Schulte 2010, > 350 sites): < 500 km: > 100 m breccia in crater, 1 to > 80 m in Central America/Mexico · 500–1000 km: cm- to m-thick spherule-rich beds · 1000–5000 km: 2–10 cm spherule layer + 0.2–0.5 cm PGE-rich layer · > 5000 km: 2–5 mm red clay. EIEP ballistic scaling (12 km case): 48 m @ 200 km, 3 m @ 500 km, 0.4 m @ 1000 km, 1.4 cm @ 3000 km, 3 mm @ 5000 km — same order as observed to ~5000 km; beyond ~10,000 km use the dust-cloud picture.
- **Deposition duration:** hours to days for spherules/coarse dust; fine-dust settling of the clay layer takes months to years [M]. Fern spike begins "days to months" after deposition (Schulte 2010).

## 3. Thermal pulse and wildfires [C — genuinely contested]

| Model | Peak ground flux | Duration | Extent | Source |
|---|---|---|---|---|
| Re-entering ejecta, no shielding | 50–150 × solar | 1 to several hours | global | Melosh et al. 1990 |
| "Broil" hypothesis | ~10 kW/m² sustained [U] | hours | global → firestorm | Robertson et al. 2004; 2013 |
| With spherule self-shielding | peak 5–15 kW/m²; > solar for only ~30 min; > 5 kW/m² for minutes | minutes | insufficient for widespread fires | Goldin & Melosh 2009 |
| 3D trajectory + angle | enough to ignite vegetation **downrange within several thousand km**; uprange too weak | — | regional / asymmetric | Morgan, Artemieva & Goldin 2013 |
| Lab ignition tests | dry litter ignites; live fuels mostly don't | — | region-dependent | Belcher et al. 2015 |
| Charcoal record | K-Pg layers have 4–8 × *less* charcoal than background (Belcher 2003/2005) vs. rate-corrected "excess" (Robertson 2013) | — | — | both |
| Soot origin | 750–2500 Tg black carbon came from ejected *target* organics; wildfires "delayed and protracted" | — | — | Lyons et al. 2020 |

**Consensus reading** (Schulte 2010; Morgan 2022; Tabor 2020): a strong but brief thermal pulse, below woody-biomass ignition over most of the globe; regional fires downrange (SW of the crater — the Pacific) and delayed fires elsewhere; **global firestorm not supported.** Don't render the whole planet burning.

## 4. Seismic and seiche [M]

- **Magnitude:** EIEP Gutenberg–Richter → Mw **9.5 (1e23 J) – 10.4 (1.65e24 J)**. DePalma 2019 assumes Mw 10–11.5; Bermúdez et al. 2026 infer 9.4–11.3 from seismites and shaking lasting weeks–months [C]. Schulte 2010: "> 11". Antipodal focusing modelled by Meschede, Myhrvold & Tromp 2011 (numbers not retrieved).
- **Arrival times at 3050 km (Tanis):** P ~6 min, S ~10 min, Rayleigh ~13 min (DePalma 2019). EIEP surface-wave arrival T = r / 5 km/s.
- **Effective magnitude vs distance** (M = 10): ~8.8 @ 50 km, 7.9 @ 200 km, 6.4 @ 500 km, ~5.1 @ 1000 km, ~4.2 @ 3000 km, ~3.4 @ 10,000 km.
- **Seiche:** seismically triggered surge at Tanis **~13 min – 2 h** after impact, runup ≥ 10 m, fish with spherules in gills; modelled seiche amplitudes in enclosed water bodies worldwide 10–100 m (DePalma 2019). A marine tsunami could not reach Tanis in < 18 h — the Tanis surge is seismic, not the tsunami.

## 5. Tsunami [M]

- **Range et al. 2022** (AGU Advances): hydrocode (first 10 min) → shallow-water propagation (NOAA MOST + GFDL MOM6) on 66 Ma bathymetry. Energy up to 30,000 × the 2004 Indian Ocean tsunami. **Timeline: 1 h** waves leave the Gulf into the N. Atlantic; **4 h** through the Central American Seaway into the Pacific; **24 h** crossed most of the Pacific and Atlantic, entering the Indian Ocean from both sides; **48 h** significant waves at most coastlines. Open-ocean amplitudes **> 100 m in the Gulf**, **> 10 m** approaching N. Atlantic and S. American Pacific coasts. Near-bed flow > 20 cm/s scours the seafloor > 10,000 km away (matches K-Pg hiatuses, e.g. NZ). Initial displacement: ~4.5 km transient wall at 2.5 min, ~1.5 km ring wave at 10 min ~220 km out [U — press release; verify in paper §2]. Landslide- and earthquake-generated waves **not** included.
- **Crater record:** rim-wave tsunami reached the far side of the Gulf **2–3 h** after impact; reflected wave back in the crater **within a day**, leaving a bed with charcoal (Gulick 2019).
- **Field evidence:** Brazos River TX tsunami sandstones (Vellekoop 2014); buried **megaripples ~16 m high, ~600 m wavelength** under Louisiana, pointing back to Chicxulub (Kinsland 2021 [M]); Gulf-wide platform collapse (Schulte 2010; Snedden 2024).

## 6. Air blast [C — EIEP only]

EIEP surface-burst scaling (valid to ~10⁴ Mt; "probably overestimates by 2–5 ×" at this energy). For E = 4.8e23 J — overpressure / wind: **1200 bar / 8.9 km/s @ 50 km; 250 bar / 4 km/s @ 100 km; 52 bar / 1.8 km/s @ 200 km; 6.6 bar / 600 m/s @ 500 km; 1.5 bar / 230 m/s @ 1000 km; 0.4 bar / 80 m/s @ 2000 km; 0.19 bar / 40 m/s @ 3000 km; 0.08 bar / 19 m/s @ 5000 km.** Arrival at sound speed: 10 min @ 200 km, 50 min @ 1000 km, 2.5 h @ 3000 km, 8.4 h @ 10,000 km. Damage thresholds: 0.07 bar glass; 0.27 bar wood-frame collapse / "90 % of trees down" above ~62 m/s; 2.7 bar steel-frame collapse. Treat as order-of-magnitude.

## 7. Volatiles: sulfur, CO₂, water, dust, soot [C for amounts]

| Species | Estimates | Source |
|---|---|---|
| Sulfur | **325 ± 130 Gt S** (SOVA hydrocode, > 25 km altitude) — Artemieva, Morgan & Exp. 364 2017 · 100–500 Gt (Schulte 2010) · 100 Gt (Pierazzo 1998; used by Brugger 2017) · **67 ± 39 Gt S** from S-isotope mass balance — ~5 × lower, "milder impact winter" (Rodiouchkina 2025). H₂SO₄ aerosol scavenged to surface within days (Ohno 2014). A steep 45–60° impact is the *worst case* for S/CO₂ release (Collins 2020). | |
| CO₂ | 425 ± 160 Gt (Artemieva 2017); Henehan 2019 infer surface pCO₂ ~900 → ~1600 ppm; long-term warming 1–2.6 °C after 1000 yr (Brugger). | |
| Water vapour | > 200 Gt to the stratosphere (Pope 1997). | |
| Dust | **Senel 2023**: measured size distribution at a N. Dakota section has a much larger fine (0.8–8 µm) fraction than assumed; stays aloft ~15 yr, cools up to 15 °C, alone shuts down photosynthesis ~2 yr. | |
| Soot | 15,000 Tg fine soot (Bardeen 2017); 500–2600 Tg (Kaiho 2016); 750–2500 Tg black carbon from target organics (Lyons 2020). | |

## 8. Climate, darkness, acid, ocean [M for sign; C for magnitude/duration]

| Effect | Value | Source |
|---|---|---|
| Darkness / photosynthesis | Light < 1 % of normal for most of 2 yr; photosynthesis inhibited **1–2 yr** (Bardeen 2017) · ~2 yr from fine dust alone (Senel 2023) · ~6 months sulfate-only (Pope 1997) · 50–90 % light reduction 1 month–2 yr (Kaiho 2016) | |
| Global mean cooling | **−26/27 °C** (sulfate, min in year 3; Brugger 2017) · −16 °C global (continents −28, oceans −11) (Bardeen 2017) · land −6 to −18 °C for 2–5 yr (Kaiho) · up to −15 °C (Senel) · proxy: Brazos SST −2 to −7 °C from ~30 °C within months–decades (Vellekoop 2014) | |
| Sub-freezing duration | Global mean below 0 °C for **3 yr** (Brugger, 2.1-yr aerosol residence) to 7–16 yr (longer residence); freezing at mid-latitudes 3–4 yr (Bardeen) | |
| Recovery | Insolation back after 6/10/20 yr; temperature > 30 yr (Brugger); ocean still −3 °C at year 15 (Bardeen) | |
| Review verdict | "Dark and cold for about a decade"; **unresolved whether the impact winter lasted many months or more than a decade** (Morgan et al. 2022) | |
| Ozone / UV | Column ozone ~20 % in years 1–7; high UV after the soot clears; normal by year 8 (Bardeen 2017) | |
| Precipitation | Land −45 to −85 % for 2–5 yr; tropical land −75 to −94 % (Kaiho 2016) | |
| Acid rain | H₂SO₄ within days (Ohno 2014); decade-long sulfate reservoir (Pope 1997) | |
| Ocean acidification | Surface pH drop **~0.25 within ≤ 1000 yr**, rebound/overshoot within 40 kyr, baseline after ~80 kyr more; ~50 % cut in export production (Henehan 2019). Counterpoint: Tyrrell 2015 — acidification "most probably not the cause" of calcifier extinction. | |
| Ocean mixing | Surface cooling drives mixed layers to 1–3 km; cold "bubble" persists ~1000 yr at depth (Brugger 2017) | |

## 9. Recovery [W]

- Carbon-cycle disruption < 5 kyr; depauperate mammal fauna ≤ 20 kyr (Renne 2013).
- Fern spike ~1 kyr (≤ 71 kyr); earliest Cenozoic mammals ~185 kyr (Clyde 2016). Global fern spike incl. NZ (Vajda 2001).
- Crater: benthic burrowers within ~6 yr; thriving ecosystem by **~30 kyr**; other Gulf/N. Atlantic sites up to **300 kyr** (Lowery 2018).
- Export inefficiency / reduced δ¹³C gradient > 1 Myr (Henehan 2019).
- Terrestrial (Corral Bluffs, CO): mammal richness × 2 by 100 kyr; body mass × 3 and plant richness up by 300 kyr; legumes and ~50 kg mammals by 700 kyr (Lyson 2019).
- Tropical forests: 45 % plant diversity loss, ~6 Myr recovery (Carvalho 2021 — see `paleontology.md`).

## 10. Consolidated timeline table

| Time after impact | Event | Magnitude | Spatial extent | Source |
|---|---|---|---|---|
| −10 to 0 s | atmospheric traverse | ~6 s @ 20 km/s | — | derived; EIEP |
| 0 s | contact; shock > 100 GPa, vapour > 10⁴ K | E ≈ 3–8e23 J | — | Collins 2005/2020 |
| ~7–13 s | fireball at max radiation | R ≈ 135–240 km | visible to ~1500 km | EIEP |
| 10–30 s | transient cavity complete | 80–100 km wide, ~30 km deep | — | Gulick 2013, 2019; Collins 2020 |
| 10 s – 35 min | seismic surface waves (5 km/s) | Mw ~9.5–10.4 (scaling) to 10–11.5 (field); M_eff ~8 @ 200 km, ~5 @ 1000 km, ~4 @ 3000 km | global; antipodal focusing | EIEP; DePalma 2019; Bermúdez 2026 |
| 2.5 min | air blast at 50 km | ≥ 1 kbar, winds km/s | — | EIEP |
| ~2.5–10 min | initial water wall / rim wave | ~4.5 km transient; ~1.5 km ring wave at ~220 km [U] | Gulf of Mexico | Range 2022 (press) |
| ~3 min | central uplift > 10 km high | — | — | Collins 2020 |
| 3.4–8 min | ballistic ejecta lands at 200–1000 km | m to ~48 m thick | proximal | EIEP; Schulte 2010 |
| ~5 min | peak ring formed; crater essentially final | 180–200 km | — | Collins 2020; Gulick 2019 |
| 6 / 10 / 13 min | P / S / Rayleigh arrivals at 3050 km (Tanis) | — | — | DePalma 2019 |
| 10 min | air blast at 200 km | ~50 bar, ~1.8 km/s (order of mag.) | — | EIEP |
| 13 min – 2 h | seismic seiche surge at Tanis | ≥ 10 m runup; 10–100 m modelled globally | inland water bodies | DePalma 2019 |
| ~15 min – 2 h | spherule fallout at 3000 km; shocked quartz 38 min – 2 h | 2–10 cm layer at 1000–5000 km | intermediate | DePalma 2019; Schulte 2010 |
| minutes – ~1 h | peak thermal pulse from re-entering ejecta | 5–15 kW/m² (shielded) vs 50–150 × solar (unshielded) | global but asymmetric; ignition downrange | Goldin & Melosh 2009; Melosh 1990; Morgan 2013 |
| 17–61 min | ballistic ejecta at 3000–10,000 km | mm–cm | distal | EIEP eq. 49 |
| tens of min | peak ring buried by ~40 m melt + suevite | — | crater | Gulick 2019 |
| 30–60 min | ocean resurge floods crater | 10 m suevite on peak ring | crater | Gulick 2019 |
| 50 min | air blast at 1000 km | ~1.5 bar, ~230 m/s | — | EIEP |
| 1 h | tsunami leaves Gulf into N. Atlantic | > 100 m in Gulf | — | Range 2022 |
| 2 h | 25 % of high-energy ejecta re-accreted | pulsed atmospheric heating | global | Kring & Durda 2002 |
| 2–3 h | rim-wave tsunami at far side of Gulf | — | Gulf coasts (Brazos, Louisiana megaripples) | Gulick 2019; Vellekoop 2014; Kinsland 2021 |
| 2.5 h | air blast at 3000 km | ~0.2 bar, ~40 m/s | — | EIEP |
| 4 h | tsunami into Pacific via Central American Seaway | — | — | Range 2022 |
| 4–5 h | ejecta/dust/soot cloud encircles Earth | several 10³ Gt | global | Morgan 2022; Artemieva & Morgan 2020; Lyons 2020 |
| hours | seiches + settling in crater → 80 m suevite | 130 m/day | crater | Gulick 2019 |
| 8 h | 55 % of high-energy ejecta re-accreted | — | — | Kring & Durda 2002 |
| ≥ 18 h | earliest marine tsunami could reach Tanis | — | — | DePalma 2019 |
| 24 h | tsunami across Pacific & Atlantic, into Indian Ocean; reflected wave back in crater | > 10 m deep-ocean | global | Range 2022; Gulick 2019 |
| 48 h | significant tsunami at most coastlines; seafloor scoured | > 10,000 km | global | Range 2022 |
| days | 85 % ejecta re-accreted (72 h); H₂SO₄ rains out; distal 2–5 mm layer forms | — | global | Kring & Durda; Ohno 2014; Schulte 2010 |
| days – months | delayed/protracted wildfires; fern spike begins | — | regional → widespread | Lyons 2020; Morgan 2013; Schulte 2010 |
| weeks – months (– years) | continued seismicity / seismites | — | Colombia, Mexico | Bermúdez 2026 [C] |
| months – 2 yr | darkness: light < 1 %; photosynthesis halted | ~1–2 yr | global | Bardeen 2017; Senel 2023 |
| months – decades | SST −2 to −7 °C (proxy) | — | Gulf of Mexico | Vellekoop 2014 |
| 1–3 yr | peak global cooling | −16 to −27 °C global; land to −28/−32 °C | worst over continents / high lat. | Bardeen 2017; Brugger 2017 |
| 3–16 yr | sub-freezing global mean; ozone 20 % (yr 1–7); dust aloft 15 yr | — | global | Brugger; Bardeen; Senel |
| ~6 yr | first benthic burrowers in crater | — | crater | Lowery 2018 |
| 6–30+ yr | insolation and temperature recover | ocean still −3 °C at 15 yr | global | Brugger; Bardeen |
| 10²–10³ yr | surface pH −0.25; CO₂ warming +1–2.6 °C by 1000 yr | — | global ocean | Henehan 2019; Brugger 2017 |
| < 5 kyr | carbon-cycle disruption ends | — | global | Renne 2013 |
| ~1 kyr (≤ 71 kyr) | fern spike ends | — | Denver Basin | Clyde 2016 |
| 20 kyr | low-diversity mammal fauna ends | — | Williston Basin | Renne 2013 |
| 30 kyr | thriving crater ecosystem | — | crater | Lowery 2018 |
| 40 kyr | pH overshoot; +80 kyr baseline | ΔpH ≈ 0.5 | global | Henehan 2019 |
| 100 / 300 / 700 kyr | mammal richness × 2 / body mass × 3 / legumes & large mammals | — | Colorado | Lyson 2019 |
| 185 kyr | earliest Cenozoic mammals, Denver Basin | — | — | Clyde 2016 |
| 300 kyr | marine recovery elsewhere in Gulf / N. Atlantic | — | — | Lowery 2018 |
| > 1 Myr | deep-sea carbon export inefficiency persists | — | global | Henehan 2019 |
| ~6 Myr | tropical forest diversity recovered | — | Colombia | Carvalho 2021 |
| +0.65 Myr | Boltysh impact (unrelated) | 24 km crater | Ukraine | Pickersgill 2021 |

## 11. Implications for the timeline UI

- The event has natural "acts" that map onto the segmented scrubber in `docs/tech/ux-timeline-camera-sharing.md`: **approach → entry/impact (0–5 min) → first hours (ejecta, seismic, tsunami, re-entry glow) → first days (dust encircles, acid rain, fires) → first years (darkness, freeze) → decades (recovery of light/temperature) → millennia (biotic recovery)**.
- The most visually dramatic global effects (ejecta cloud encircling in 4–5 h; tsunami reaching all coasts in 48 h; darkness over 1–2 yr) are all **model outputs that are downloadable** — see `impact-event.md` §6. They should be baked, not simulated.
- Several effects are **directional**: ejecta and thermal pulse concentrate downrange (SW) and at the antipode; seismic focusing at the antipode. The antipode of 21.3°N 89.5°W at 66 Ma is in the Indian Ocean / near India — worth a POI.
- Every row in the contested sections (§3, §7, §8) should carry a visible "range / contested" marker in the app.
