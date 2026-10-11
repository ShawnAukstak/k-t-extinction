# Paleontology: who lived where at 66 Ma, and where to get the data

> Research pass 1, 2026-10-11. Compiled from a web-research agent that live-tested the PBDB and other APIs. Not yet independently re-verified line by line.
>
> **Verification legend:** **[V]** = page fetched / API called and read · **[S]** = from a search-result snippet, not opened · **[U]** = background knowledge, unverified this session · **(computed)** = we computed it from a live PBDB pull.

## 1. Paleobiology Database (PBDB) — the primary occurrence source

**Base URL:** `https://paleobiodb.org/data1.2/` [V]. GET only. Output format by suffix: `.json` (compact field names), `.csv`/`.tsv`/`.txt` (long names), `.ris`. `vocab=pbdb` gives long names in JSON. **CORS is enabled** (`Access-Control-Allow-Origin: *`, verified in headers) so the browser could call it directly — though we should pre-bake, not hit it live.

**License:** CC BY 4.0 (since Dec 2013) [S/V]. **Rate limits:** none documented; a 20k-record pull took < 5 s. **Bulk:** the classic download generator (`https://paleobiodb.org/classic/displayDownloadGenerator`) builds API URLs and lets logged-in users store a DOI-able archive; `all_records` returns the whole DB (>1 M records, >100 MB).

### Endpoints ([V] `occs_doc.html`)
`occs/list`, `occs/single`, `occs/geosum` (geographic clusters), `occs/taxa` (taxonomic hierarchy of a result set), `occs/diversity`, `occs/quickdiv`, `occs/prevalence`, `occs/strata`, `occs/refs`; `colls/list`, `colls/summary` (clustered points, `level=1..3`); `taxa/list`; `specs/list` (specimen measurements); `intervals/list`.

### Key parameters ([V] `occs/list_doc.html`)
- `base_name=Dinosauria` (taxon + subtaxa; `^` excludes: `Dinosauria^Aves`), `taxon_name`
- `interval=Maastrichtian` or `min_ma`/`max_ma` + `timerule=overlap|contain|major`
- `cc=US,CA`, `lngmin/lngmax/latmin/latmax`, `loc=<WKT>`
- **`pgm=gplates|scotese|seton`** — paleogeographic model for paleocoordinates (default gplates), `pgs=early|mid|late`
- `show=` blocks: `coords`, `loc` (country `cc2`, state `stp`), **`paleoloc` (`pln` paleolng, `pla` paleolat, `gpl` plate id)**, `strat` (formation `sfm`, group `sgr`, member `smb`), `class`, `lith`, `abund`

### Tested example URLs (all returned 200)
```
https://paleobiodb.org/data1.2/occs/list.json?base_name=Dinosauria&interval=Maastrichtian&show=paleoloc,coords,class,strat,loc&limit=20000
  → 4,209 records; 4,207 with paleolat/lng (computed)
https://paleobiodb.org/data1.2/occs/list.json?base_name=Dinosauria&max_ma=69&min_ma=66&timerule=overlap&show=loc,strat&limit=20000
  → 5,065 records
https://paleobiodb.org/data1.2/occs/taxa.json?base_name=Dinosauria&interval=Maastrichtian&rank=genus
  → 320 genus-level taxa with occurrence counts (noc)
https://paleobiodb.org/data1.2/colls/summary.json?base_name=Dinosauria&interval=Maastrichtian&level=2
https://paleobiodb.org/data1.2/occs/list.csv?base_name=Tyrannosaurus&show=paleoloc,loc,strat
https://paleobiodb.org/data1.2/specs/list.json?base_name=Tyrannosaurus&show=class
  → femur/tibia lengths from Erickson 2004 are in there
```

### Gotchas found while testing
- `cc`/state only appear with `show=loc` (field `cc2`).
- `Dinosauria` includes **ootaxa** (Megaloolithus = 296 Maastrichtian occurrences — the single most "abundant" taxon), **ichnotaxa** (Hadrosauropodus) and **tooth taxa** (Richardoestesia 129, Paronychodon 65). Filter these out for a body-fossil census.
- `interval=Maastrichtian` is the 72.2–66.0 Ma bin; "latest Maastrichtian" cannot be isolated by interval name — use `min_ma/max_ma` or filter by formation (`sfm`).
- Other Maastrichtian counts for scale (computed): all taxa 63,991; Plantae 6,150; Mammalia 1,226; Mosasauridae 327; Pterosauria 73; Danian Mammalia 2,308.

### Sampling bias (quantified, computed from the live pull)
Of 4,209 Maastrichtian Dinosauria occurrences: **US 38.4 %, North America 45.1 %, Hell Creek Fm alone 18.2 % (767)**. Then Lance 320, Nemegt 319, Lameta 168, Conques/Tremp 150, Horseshoe Canyon 138, Allen 138, Ferris 121, Maevarano 109. Literature: Dean, Chiarenza & Maidment 2020 (the apparent 68–66 Ma N. American "decline" tracks Western Interior Seaway retreat and outcrop area) [S]; Chiarenza et al. 2019 [S].

**Implication for the sim:** use PBDB for *presence and geography*; use censuses (§8) for *relative abundance*; never use raw occurrence counts as abundance.

## 2. Other databases

| Source | Verdict |
|---|---|
| **GBIF** [V] | Mirrors PBDB as dataset `bb5b30b4-827e-4d5e-a86a-825d65cb6583` (DOI 10.15468/jfqhiu). Records have `basisOfRecord=MATERIAL_CITATION` (not `FOSSIL_SPECIMEN`), no paleocoordinates, no formation age; per-record license field says CC BY-NC despite dataset-level CC BY (inconsistency — rely on PBDB's own CC BY). Secondary source only. |
| **Neotoma** [V] | Quaternary only. Not applicable. |
| **Fossilworks** [V] | Retired ~2022, redirects to PBDB. |
| **dinosaurpictures.org / Dinosaur Database** | Built on PBDB; no public API found [S/U]. Third-party wrappers (`dinofyi` on PyPI, "Dinosaurs API" at oanor.com) exist but are unvetted — don't build on them. |
| **Benson et al. 2014, PLOS Biology** [V] | 441 taxa body masses (Campione & Evans limb-circumference method). **CC0.** The mass table is supplement **s011** (not s001): `https://journals.plos.org/plosbiology/article/file?type=supplementary&id=10.1371/journal.pbio.1001853.s011` (1.25 MB legacy .xls; includes T. rex, Triceratops, Edmontosaurus, Ankylosaurus, Alamosaurus, Pachycephalosaurus, Thescelosaurus, Struthiomimus, Leptoceratops…). |
| **Benson et al. 2018, Palaeontology** [V] | Updated masses. Dryad doi:10.5061/dryad.1t3r4, **CC0**. "Dataset S1.zip" (398 KB). Download via web page (API needs token). |
| **Campione & Evans 2012** | The scaling equation source (BMC Biology, DOI 10.1186/1741-7007-10-60). Coefficients from memory [U]: log10 BM(g) = 2.749·log10(C_humerus+C_femur, mm) − 1.104. |
| **Dean et al. 2020** [S] | Formation-binned Late Cretaceous N. American dinosaur data, Dryad doi:10.5061/dryad.tmpg4f4vg, CC0. |

## 3. Latest Maastrichtian faunas by region

**Timeframe calibration.** K-Pg boundary 66.0 Ma; Sprain et al. 2018 give 66.052 ± 0.008 Ma, Renne et al. 2013 give 66.043 ± 0.011 Ma (figures [U], DOIs verified). Hell Creek Fm ≈ 68–66 Ma; its bird fauna lies in chron C29r, within ~300 kyr of the boundary (Longrich et al. 2011 [V]).

**Which faunas are actually *latest* Maastrichtian (secure):** Hell Creek / Lance / Frenchman / Scollard / Denver; Tremp Group (C29r); Ouled Abdoun (Morocco); Maastricht type area; López de Bertodano (Antarctica); upper Maevarano (Madagascar); Nanxiong (China); Lameta/intertrappeans (India). **Older by 1–6 Myr** (use only with a caveat or not at all): Hațeg, Nemegt, Chorrillo, Allen, Kamuysaurus (Japan), Prince Creek (Alaska), Snow Hill Island.

### Regional fauna table

| Region | Formation(s) & age | Key dinosaurs (adult size / mass) | Other notable vertebrates | Abundance evidence | Refs |
|---|---|---|---|---|---|
| **W. North America, northern** | Hell Creek (MT/ND/SD), Lance (WY), Frenchman (SK), Scollard lower mb (AB), Ferris (WY) — all latest Maastrichtian; K-Pg at/just above top [V] | *Tyrannosaurus rex* 12–13 m, 5.4–9.2 t (Sue 8.4–9.2 t, Scotty 8.9 t) [V]; *Triceratops horridus* (lower HC) / *T. prorsus* (upper) 8–9 m, 6–10 t [V]; *Edmontosaurus annectens* 11–12 m, mean 5.6 t, rare giants > 7 t [V]; *Ankylosaurus* 6–8 m, 4.8–8 t, rare, possibly upland [V]; *Pachycephalosaurus* 4.5 m, 370–450 kg (Stygimoloch/Dracorex synonymy contested) [V]; *Thescelosaurus* 3–4 m, ~200–350 kg [U]; *Leptoceratops* ~2 m [U]; *Ornithomimus/Struthiomimus* ~150 kg [U]; *Anzu wyliei* ~3 m, 200–300 kg [U]; *Acheroraptor* ~3 m [U]; *Dakotaraptor* 5–5.5 m but validity unresolved (holotype includes a turtle furcula) [S]; *Torosaurus* (synonymy with Triceratops contested; Mallon 2022 supports validity) [V]; tooth taxa Richardoestesia, Paronychodon, Pectinodon, troodontids [V] | Birds: 17 spp. (Enantiornithes, Hesperornithes, Ichthyornithes…), none definitively crown [V]; mammals: ~10 multituberculates, 11 metatherians incl. *Didelphodon vorax* 5.2 kg semi-aquatic [V], eutherians (Cimolestes, Gypsonictops, Protungulatum) [U]; crocs *Borealosuchus*, *Brachychampsa*; *Champsosaurus*; turtles (Basilemys, Compsemys, trionychids); lizards incl. *Obamadon*; salamanders, frogs; freshwater rays (*Myledaphus*), gar, bowfin [V/S]; azhdarchid vertebra (5–5.5 m span), possibly *Quetzalcoatlus* [S] | **Horner et al. 2011 census** (n≈180 skeletons): **Triceratops 73 (40 %), Tyrannosaurus 44 (24 %), Edmontosaurus 36 (20 %), Thescelosaurus 15 (8 %), Ornithomimus 9 (5 %), Pachycephalosaurus 2 (1 %), Ankylosaurus 2 (1 %)**; upper HC Triceratops 69 %; assemblages dominated by subadults [V]. PBDB HC occurrences: Triceratops 65, Tyrannosaurus 49, Edmontosaurus 33, Thescelosaurus 29, Pachycephalosaurus 19 (computed) | Horner, Goodwin & Myhrvold 2011 [V]; Longrich 2011 [V]; Wilson 2013 |
| **W. North America, southern** | Denver (CO), North Horn (UT), Javelina/Black Peaks (TX; youngest Alamosaurus ~27 m below K-Pg), Ojo Alamo/Naashoibito (NM, 66.9–66.4 Ma) [V] | *Alamosaurus sanjuanensis* ~26 m, 30–35 t typical, up to 70–80 t claimed [V]; *Torosaurus utahensis*, *Utetitan*, *T. rex*, *Bravoceratops* [S/V]; *Quetzalcoatlus northropi* 10–11 m wingspan, 200–250 kg [V] | Hadrosaurs, troodontids, turtles, crocs [V] | No formal census; the "Alamosaurus fauna" is distinct from the northern Triceratops fauna [V] | Lehman 2021 [S] |
| **South America** | Allen (Río Negro; late Campanian–early Maast.), Marília/Serra da Galga (Brazil; Maast.), Lago Colhué Huapi (upper part near K-Pg), Chorrillo (Santa Cruz; mostly older), El Molino (Bolivia) [V/S] | Titanosaurs (Rocasaurus, Aeolosaurus; *Nullotitan* ~25 m?), abelisaurids (*Kurupi*), megaraptorid *Maip*, hadrosaurs (*Bonapartesaurus*), ankylosaurs, *Isasicursor* ~4 m [S/V] | Baurusuchid/peirosaurid crocs, pleurodire turtles, madtsoiid snakes [V] | No censuses; PBDB Allen 138, Chorrillo 44, Marília 28 (computed) | Novas 2019 [S] |
| **Europe — Hațeg (Romania)** | Mostly late Campanian–early Maast. (~72 Ma); some mid/late Maast.; island ~80,000 km² [V/S] | Dwarfs: *Magyarosaurus* ~6 m, ~900 kg; *Telmatosaurus* ~5 m; *Zalmoxes* 2–4.5 m [U]; *Struthiosaurus*; *Paludititan*; *Balaur* [V]; *Hatzegopteryx* 10–12 m span, 180–250 kg, probable apex predator [V] | Kogaionid multituberculates, *Allodaposuchus*, *Kallokibotion* [V] | — | Benton et al. 2010 [S]; Csiki-Sava 2016 |
| **Europe — Pyrenees (Tremp Group)** | Tremp Fm / Conquès, Lower Red Garumnian; dinosaurs abundant through C29r, disappear abruptly at its top [V/S] | Lambeosaurines *Arenysaurus*, *Blasisaurus*, *Pararhabdodon*, *Adynomosaurus*, *Calvarius*; *Rhabdodon*; saltasaurid *Abditosaurus*; nodosaurid; abelisauroid *Tamarro* — the **last European dinosaurs** [V/S] | *Allodaposuchus*, *Arenysuchus*; *Polysternon*; *Megaloolithus siruguei* nesting grounds (clutches to 28 eggs; Basturs 6,000 m²) [V] | ~30 tracksites, mostly hadrosaur [S] | Canudo 2013; Fondevilla 2019 |
| **Europe — Maastricht type area (NL/BE)** | Maastricht Fm (~70–66 Ma; Meerssen Mb reaches the boundary) [V] | Marine: *Mosasaurus hoffmanni* (11–12 m per modern skull scaling; 17–18 m per older 1:10 ratio; ~10 t) [V]; *Prognathodon* 5–12 m; *Plioplatecarpus*; *Carinodens*; elasmosaurids; dinosaurs rare [V] | ***Asteriornis maastrichtensis*** 66.7–66.8 Ma, ~395 g, stem galloanserine (Field 2020) [V]; *Janavis*; *Maastrichtidelphys* [V] | — | Field 2020 |
| **Europe — France** | Marnes Rouges Inférieures (Aude), Provence red beds; Vitrolles latest Maast. [U] | *Rhabdodon*, *Ampelosaurus*, *Variraptor*, *Tarascosaurus*; Megaloolithus nesting grounds [U] | — | — | — |
| **Asia — Mongolia (Nemegt)** | No absolute dates; U-Pb on Tarbosaurus teeth 66.7 ± 2.5 Ma; probably mostly early–mid Maast.; MAT ~7.6 °C [V] | *Tarbosaurus* ~10–12 m, 4–5 t [U], *Saurolophus angustirostris* ~12 m [U], *Deinocheirus* ~11 m, 6 t [U], *Therizinosaurus*, *Gallimimus*, *Nemegtosaurus*, *Opisthocoelicaudia*, *Tarchia*, *Prenocephale*, *Nemegtomaia* (nesting) [V] | Hesperornithines, *Paralligator*, *Buginbaatar* [V] | PBDB Nemegt 319 (computed) | — |
| **Asia — China (Nanxiong)** | ~66.7 ± 0.3 Ma, overlain by Paleocene Shanghu; Ganzhou oviraptorid egg beds (> 200 nests) [V/S] | *Qianzhousaurus* (6–9 m [U]), oviraptorids *Banji, Corythoraptor, Ganzhousaurus, Huanansaurus, Tongtianlong*…; *Nanshiungosaurus*; *Gannansaurus* [V] | Nanhsiungchelyid turtles, *Jiangxisuchus*, lizards; eggs *Macroolithus* [V] | PBDB Pingling 55 (computed) | — |
| **Asia — India** | Lameta (infratrappean, Maast.) + intertrappean beds; dinosaurs persist through early Deccan phases with reduced diversity [V/S] | Titanosaurs *Isisaurus* ~18 m [U], *Jainosaurus*; abelisaurids *Rajasaurus* ~6.5 m [U], *Indosuchus*, *Rahiolisaurus*; giant *Megaloolithus* nesting sites [V] | *Sanajeh* (egg-eating snake), dyrosaurid crocs, bothremydid turtles [V] | PBDB Lameta 168 (computed) | Prasad & Sahni 2014 [S] |
| **Asia — Japan** | *Kamuysaurus* is **early** Maastrichtian (72.1–70.6 Ma) [V] | — | — | — | Kobayashi 2019 [V] |
| **Africa — Madagascar** | Maevarano Fm; upper part late Maast. (overlying marine reversal ~65.8 Ma) [V] | *Majungasaurus* 6–7 m; *Masiakasaurus* ~2 m [U]; *Rahonavis*; *Rapetosaurus* ~15 m [U]; *Vahiny* [V] | *Simosuchus*, *Mahajangasuchus*, giant frog *Beelzebufo*, gondwanatheres *Vintana*, *Adalatherium*, *Madtsoia* [V] | PBDB Maevarano 109 (computed) | — |
| **Africa — Morocco** | Ouled Abdoun phosphates, Couche III, late Maast. (~66–67 Ma) [S/V] | *Chenanisaurus barbaricus* 7–8 m; *Ajnabia odysseus* (small lambeosaurine); *Minqaria*, *Taleta*; *Phosphatotitan* [V] | **≥ 15 mosasaur spp.** (*Thalassotitan*, *Mosasaurus beaugei* 8–10 m, *Prognathodon currii*, *Globidens*, *Xenodens*…); elasmosaur *Zarafasaura*; sea turtles *Ocepechelon*, *Alienochelys*; sharks; **7 pterosaur spp. in 3 families** (nyctosaurids, azhdarchids *Phosphatodraco*, *Tethydraco*) — the most diverse latest-Cretaceous pterosaur fauna, arguing for abrupt pterosaur extinction [V] | — | Longrich 2017/2018/2021 [V] |
| **Antarctica** | López de Bertodano Fm (Seymour Is., ~70–65.5 Ma, paleolat ~62°S; K-Pg with iridium anomaly and a fish-kill layer) [V] | Hadrosaur remains, parankylosaur, megaraptoran-like maxilla [V] | Mosasaurs (*Kaikaifilu*, *Mosasaurus*), elasmosaurs (*Aristonectes*, *Morturneria*), birds *Vegavis iaai*, *Polarornis*, *Conflicto*; ammonites to the boundary; *Nothofagus*-podocarp forest, MAT 7–10 °C [V] | — | — |
| **Australia / NZ** | Essentially no latest-Maastrichtian dinosaur body fossils [U]; NZ K-Pg sections key for the fern spike (Vajda 2001) [V] | — | NZ mosasaurs, elasmosaurs [U] | — | Vajda 2001 |
| **High Arctic (context only)** | Prince Creek Fm, Alaska: paleolat ~80°N, ~120 days darkness, MAT ~5 °C; beds now dated late Campanian–~70 Ma (not latest Maast.) [V] | *Pachyrhinosaurus perotorum*, *Nanuqsaurus*, *Edmontosaurus* cf. *regalis*, large troodontids [V] | Multituberculates, *Unnuakomys* [V] | — | — |

### Marine summary
Mosasaurs (global; *M. hoffmanni* to the last 2.3 Myr; *Mosasaurus* to Antarctica) and elasmosaurid plesiosaurs persist to the boundary and go extinct [V]. Ammonites present up to the boundary clay (Turkmenistan, NJ, Denmark); a handful of claimed earliest-Danian survivors (Stevns Klint; Gulf Coast *Eubaculites*) — Landman's group treats short survival as possible [V]. Inoceramids crashed in the mid-Maastrichtian (~70 Ma); rudists declined through the Maastrichtian but persisted to < 66.8 Ma on Tethyan platforms [S]. Sharks: ~7 of 41 neoselachian families lost; batoids hit hardest; > 90 % of teleost families survived [V].

### Flying
Azhdarchids (Quetzalcoatlus, Hatzegopteryx, Phosphatodraco, Arambourgiania), nyctosaurids, probably pteranodontids all present in the late Maastrichtian [V]. Birds: enantiornithines, hesperornithines, ichthyornithines to within 300 kyr of the boundary in N. America, none crossing except an ornithurine [V]; crown birds (*Asteriornis*, *Vegavis*) already present [V].

### Mammals at 66 Ma (NE Montana)
Multituberculates most diverse and abundant; metatherians second (11 spp.); eutherians few; *Didelphodon* (5.2 kg) the largest. Across the boundary: **all 11 Hell Creek metatherians absent above it; ~half of 10 multituberculates lost; eutherians survive and radiate** [V]. *Purgatorius* (stem primate) in the earliest Paleocene Tullock Mb (Wilson Mantilla et al. 2021 [V DOI]; the "~105–139 kyr post-boundary" figure is [U]).

## 4. Extinction selectivity

| Group | Outcome | Reference |
|---|---|---|
| Non-avian dinosaurs | 100 %; "Paleocene dinosaurs" are reworked | [V] |
| Pterosaurs | 100 %; diverse until the end (Morocco) → abrupt, not gradual | Longrich 2018 [V] |
| Birds | Archaic clades 100 %; crown birds survive; Field 2018: arboreal lineages lost with global forest collapse, survivors ground-dwelling | Longrich 2011 [V]; Field 2018 [V DOI] |
| Squamates | **83 % species-level** extinction in N. America; ~10 Myr recovery | Longrich 2012 [S] |
| Mammals | Metatherians ~100 % (N. Am.), multituberculates ~50 %, eutherians survive | Wilson 2013 |
| Turtles | 18/24 lineages (75 %) cross, "virtually without perturbation" | Holroyd 2014 [S] |
| Crocodyliforms | ~50 % survive; no large forms | [V] |
| Amphibians | Near-zero extinction in Montana | [V] |
| Choristoderes | Survive to Miocene | [V] |
| Freshwater vs terrestrial | Detritus-based freshwater food webs buffered (Sheehan & Fastovsky 1992); Archibald & Bryant 1990: only 35/107 Hell Creek vertebrate spp. in Tullock | [V DOI]; [S] |
| Thermal-pulse refugia | Robertson et al. 2004: hours-long IR pulse from re-entering ejecta; survival required water, burrows (~10 cm soil), tree holes | [S] |
| Marine | Mosasaurs, plesiosaurs, ammonites, belemnites, rudists extinct; calcareous nannoplankton and low-latitude planktonic forams devastated; ~98 % of colonial tropical corals; brachiopods mostly survive | [V] |

### Was dinosaur diversity already declining? (the debate — present both)
- **Yes:** Sakamoto, Benton & Venditti 2016 PNAS (phylogenetic speciation/extinction model: net diversification negative for tens of Myr) [S]; Condamine et al. 2021 Nat Comms (six families, decline from ~76 Ma tied to cooling and herbivore turnover) [S].
- **No / artefact:** Chiarenza et al. 2019 Nat Comms (habitat shrank only where modern outcrop exists) [S]; Bonsor et al. 2020 RSOS (re-ran the models: no decline; result hinges on sampling assumptions) [S]; Brusatte et al. 2015 Biol Rev (no global decline; N. American large-herbivore restructuring is real) [V]; Dean et al. 2020 (regional dip tracks seaway retreat and sampling) [S]; a 2024 Cambridge Prisms review: phylodynamic models "do not provide conclusive evidence" either way [S].
- **Consensus-ish:** regional N. American large-herbivore richness fell in the Maastrichtian; a global decline is model-dependent; the extinction itself was abrupt.

## 5. Recovery

- **Fern spike:** Tschudy et al. 1984 (Raton Basin) [U DOI]; Vajda et al. 2001 Science (NZ: global deforestation; NZ shows abundance shifts but little species extinction vs. high N. American extinction) [V]; Vajda & Bercovici 2014 global template [V]. Newer work argues the Cyathidites spores are schizaeaceous soil-bank survivors [S].
- **Hell Creek → Fort Union (Tullock Mb) flora:** Hell Creek megaflora ~302 morphotypes, 92 % angiosperms; riparian forest with *Platanus*-relatives, *Dryophyllum*, *Sabalites* palms, taxodioid/araucarian/cupressaceous conifers, *Ginkgo*; MAT ~11 °C [V]. Johnson 2002: "high species-level extinction effectively terminates this flora"; Nichols: ~30 % palynofloral loss [S]; Wilf & Johnson 2004: N. Dakota megafloral extinction ~57 % [V DOI, % U]. Paleocene Tullock floras low-diversity. Grass pollen (*Graminidites*) present in the Maastrichtian Scollard [V].
- **Crater:** Lowery et al. 2018 Nature — IODP 364 peak-ring core: life back within years, high-productivity ecosystem in < 30 kyr; proximity didn't delay recovery [S].
- **Mammals (Corral Bluffs, CO):** Lyson et al. 2019 Science [V DOI]. Press-reported numbers: survivors ≤ ~500 g; ~6 kg by +100 kyr; 25–30 kg (*Carsioptychus*) by +300 kyr; ~50 kg (*Taeniolabis*, *Eoconodon*) by +700 kyr; ferns → palms over the first ~200–300 kyr; legumes with the ~700 kyr warming [S]. Companion chronology Fuentes et al. 2019 (Western Interior lost 57–78 % of plant diversity) [V]. Hell Creek-region mammal recovery ~320 kyr–1 Myr, spatially heterogeneous (Claytor 2023) [S].
- **Tropics:** Carvalho et al. 2021 Science — Colombia: Maastrichtian forests open-canopy with conifers; **45 % plant diversity loss, ~6 Myr recovery**; Paleocene forests closed-canopy angiosperm = origin of modern Neotropical rainforest structure [S].

## 6. Plants at 66 Ma by latitude

| Setting | Vegetation | Climate |
|---|---|---|
| Mid-latitude Laramidia (45–55°N paleolat; Hell Creek, Frenchman, Scollard) | Angiosperm-dominated warm-temperate to subtropical forest: palms (*Sabalites*), Platanaceae, Lauraceae, Magnoliales, *Dryophyllum*; conifers *Metasequoia*-type, *Glyptostrobus*, araucarians; *Ginkgo*; ferns [V] | MAT ~11–14 °C, ~190 cm/yr precipitation [V]; fire-succession sequences in Frenchman [V] |
| Tropics (Colombia) | Open-canopy conifer-bearing forest; not yet closed multistratal rainforest [S] | — |
| Polar south (Seymour Is., ~62°S) | *Nothofagus*-dominated rainforest with Podocarpaceae, Araucariaceae, Proteaceae; trend to deciduousness [V] | MAT 7–10 °C |
| Polar north (Alaska, ~80°N; slightly older) | *Parataxodium*-type deciduous-conifer forest [V] | MAT ~5 °C; 120 days dark |
| Mongolia (Nemegt) | Araucarian-dominated with ginkgos, angiosperms, reeds/sedges, bald cypress; monsoonal, Okavango-like [V] | MAT ~7.6 °C |
| Grasses | Prasad et al. 2005 Science — ≥ 5 extant Poaceae subclades as phytoliths in Indian titanosaur coprolites. **Grasses existed; grasslands did not.** [S] | — |

## 7. Visual / 3D assets (open-licensed)

| Source | What | API / format | License | Notes |
|---|---|---|---|---|
| **PhyloPic v2** [V] | Silhouettes with taxonomy | REST; must pass `build` (currently 558): `https://api.phylopic.org/images?build=558&filter_name=tyrannosaurus%20rex&page=0&embed_items=true`; `autocomplete?build=558&query=`. Returns SVG + PNG rasters 512–1536 px; per-image `license` href | **Per image** (CC0, CC BY 3.0/4.0, BY-SA, BY-NC…) | Coverage (computed): T. rex 10 (CC0 available), Triceratops horridus 7 (CC0), Edmontosaurus annectens 2 (CC0), Ankylosaurus 1 (CC0), Pachycephalosaurus 1 (BY-SA), Thescelosaurus 1 (BY-SA), Anzu 2 (CC0), Struthiomimus 1 (CC0), Alamosaurus 2 (CC0), Quetzalcoatlus northropi 4 (BY), Mosasaurus hoffmanni 1 (BY-NC only), Telmatosaurus 1 (CC0), Vegavis 2, Asteriornis 1 (BY-SA), Champsosaurus 3 (CC0), Purgatorius 1 (BY). **Gaps:** Saurolophus angustirostris, Chenanisaurus, Hatzegopteryx, Magyarosaurus, Didelphodon, Borealosuchus, Mesodma, Cimolestes. Use full binomials in `filter_name`. |
| **Smithsonian 3D** [S] | Nation's T. rex (200+ bones), Triceratops "Hatcher" | glTF/OBJ; Voyager viewer | **Per object**; open-access objects CC0, but the T. rex forelimb page says non-commercial only — check each object | The **Smithsonian Sketchfab account** has "Triceratops Horridus Marsh" under **CC0**, 74k vertices, downloadable: uid `e9c507f179ed4455aac3b208c9e6c973` [V]. No CC0 T. rex found there. |
| **Sketchfab** [V] | Community + museum models | Search API, no key: `https://api.sketchfab.com/v3/search?type=models&q=triceratops&downloadable=true&sort_by=-likeCount`; download needs OAuth | Per model | Verified: "Animated triceratops skeleton" CC0, 29k tris, rigged, derived from the Smithsonian scan (`06cb55f941d94dc8b95ac46f92d89e7c`); "Tyrannosaurus Rex skeleton" (rigsters) CC BY 125k v; "Edmontosaurus Skull" (Laserdesign) CC BY ~1 M v; "Pterosaur_Quetzalcoatlus" (seirogan) CC BY 100k v; WitmerLab CT skulls (BY-NC). **No curated, peer-checked "scientifically accurate" set exists**; most life models are hobbyist/Jurassic-Park-derived (shrink-wrapped, pronated hands). Museum *skeleton scans* are the reliable tier. |
| **Zenodo** [V] | "[1k] Triceratops Horridus" low-poly glb (Oxford scan, 1k faces) | glb | CC BY-NC-SA 2.0 | Good LOD reference, but NC. `https://zenodo.org/records/10338664` |
| **MorphoSource** [S] | CT/surface scans | web + REST; click-through agreement | Per dataset; NC by default | Research-only unless record says otherwise. |
| **Scott Hartman skeletals** [S/U] | The standard for proportions | PNG via PhyloPic / skeletaldrawing.com | CC BY-NC-SA 3.0 on PhyloPic | Use as *reference* for proportions, not for redistribution; contact for commercial use. |
| **Wikimedia Commons** [V] | Life restorations, size charts | files | CC BY-SA mostly | WikiProject Dinosaurs image review flags "Inaccurate paleoart" — **filter against that category**; this is the closest thing to a curated accuracy signal. |
| **Scan the World**, **DigiMorph** [U] | Museum cast photogrammetry; CT stacks | STL/OBJ | typically NC | — |
| **Procedural / low-poly** | Build from Hartman proportions + PhyloPic silhouettes (SVG → extruded/lathed), or rig the CC0 Smithsonian Triceratops | — | — | A silhouette-based 2.5-D "paper-doll" herd is the cheapest path that stays accurate. |

**Accuracy caveats to encode in any model brief:** no shrink-wrapping (soft tissue, no visible fenestrae); *T. rex* integument — Bell et al. 2017 Biol Lett: skin impressions from neck, abdomen, pelvis, tail are scaly; any feathering restricted to the dorsum (critics note feathers aren't excluded) [S]; *Triceratops* skin: large basement scales to 90 mm with scattered conical feature scales [V]; *Edmontosaurus* "Dakota" mummy preserves scalation [V]; theropod hands semi-supinated, not pronated; oviraptorosaurs/ornithomimids feathered.

## 8. Behaviour / ecology for plausible herds

- **Relative abundance** (Hell Creek, Horner 2011 [V]): Triceratops ≈ 40 %, T. rex ≈ 24 % (unusually high predator:prey ratio — interpreted as broad diet/scavenging), Edmontosaurus ≈ 20 %, Ankylosaurus and Pachycephalosaurus ≈ 1 % each. Small theropods known almost only from teeth.
- **Absolute abundance:** Marshall et al. 2021 Science [V DOI] — Damuth's-law Monte Carlo: ~**20,000 adult *T. rex* alive at any time** (95 % CI 1,300–328,000), ~**1 per 100 km²**, ~2.5 billion over ~2.4 Myr. Scale herbivores with Damuth (density ∝ mass^−0.75) from the census ratios.
- **Herding evidence:** ceratopsid mega-bonebeds (Hilda, Alberta — *Centrosaurus* herds "high hundreds to low thousands", storm-killed; **Campanian**) [S]; the only Triceratops-dominated bonebed holds **three juveniles** (Mathews et al. 2009 [V DOI]) and most adult finds are solitary → **model Triceratops as solitary / small groups, juveniles grouped**. *Edmontosaurus annectens* known from several bonebeds (Ruth Mason quarry) → **large herds plausible** [V]. Maastrichtian nesting grounds: titanosaur *Megaloolithus* fields (Tremp) and Ganzhou oviraptorid nests [V]; hadrosaur nesting colonies (*Maiasaura*) are Campanian [U]. Tyrannosaurid group sites (*Albertosaurus* Dry Island; *Teratophoneus* Rainbows & Unicorns) are both Campanian — **no T. rex group site** [V].
- **Speeds:** Sellers et al. 2017 PeerJ — adult *T. rex* limited to walking, top ~**7.7 m/s ≈ 28 km/h** [V]; Hutchinson & Garcia 2002 [V]; *Edmontosaurus* modelled up to ~45 km/h [V]; hadrosaur trackway walking speeds ~3–8 km/h [U].
- **Growth / lifespan:** Erickson et al. 2004 Nature — *T. rex* max growth ~2.1 kg/day, adult size by ~20, max ~28 yr; Sue 27–33 yr [V/S]. Populations mostly subadults [V].
- **Home ranges:** no direct data; derive from Damuth density + modern large-carnivore scaling [U].

## 9. Key uncertainties to surface in the UI

1. Absolute abundances rest on one census (NE Montana) plus one Damuth-law estimate with a 250× confidence interval.
2. Only a subset of famous faunas is actually *latest* Maastrichtian (see §3). Nemegt and Hațeg in particular are 1–6 Myr too old; if shown, label them as "older fauna, shown for context" or omit.
3. Taxonomic validity debates affect the roster: Torosaurus, Nanotyrannus, Stygimoloch/Dracorex, Dakotaraptor/Acheroraptor.
4. The pre-impact "decline" is model- and sampling-dependent.
5. Asset licensing is per-object everywhere; the only large CC0 pools are PhyloPic (subset), Smithsonian open-access objects, and the Benson mass tables.

## 10. Data & asset source catalog (for `data/catalog.yaml`)

| Name | What | Format | License | URL | Status |
|---|---|---|---|---|---|
| PBDB data service 1.2 | occurrences, collections, taxa, specimens, intervals, GPlates paleocoords | REST JSON/CSV | CC BY 4.0 | https://paleobiodb.org/data1.2/ | [V] live-tested |
| PBDB download generator | bulk, DOI-able archives | web → API | CC BY 4.0 | https://paleobiodb.org/classic/displayDownloadGenerator | [V] |
| GBIF (PBDB mirror) | same, no paleocoords | REST | CC BY 4.0 (dataset) | https://www.gbif.org/dataset/bb5b30b4-827e-4d5e-a86a-825d65cb6583 | [V] secondary |
| Benson 2014 masses | 441 taxa | .xls (s011) | CC0 | https://journals.plos.org/plosbiology/article/file?type=supplementary&id=10.1371/journal.pbio.1001853.s011 | [V] |
| Benson 2018 masses | updated | Dryad zip | CC0 | https://datadryad.org/dataset/doi:10.5061/dryad.1t3r4 | [V] |
| Dean 2020 N. Am. data | formation-binned | Dryad | CC0 | https://datadryad.org/dataset/doi:10.5061/dryad.tmpg4f4vg | [S] |
| PhyloPic | silhouettes | REST + SVG/PNG | per image | https://api.phylopic.org | [V] |
| Sketchfab | 3D models | search API; OAuth download | per model | https://api.sketchfab.com/v3/search | [V] |
| Smithsonian 3D | museum scans | glTF/OBJ | per object | https://3d.si.edu | [S] |
| Smithsonian Triceratops (Sketchfab) | skeleton | downloadable | CC0 | uid `e9c507f179ed4455aac3b208c9e6c973` | [V] |
| Wikimedia Commons + image review | restorations | files | CC BY-SA etc. | https://en.wikipedia.org/wiki/Wikipedia:WikiProject_Dinosaurs/Image_review | [V] |

## Bibliography (DOIs resolved via CrossRef unless noted)

Archibald & Bryant 1990 GSA SP 247 — 10.1130/spe247-p549 · Bell et al. 2017 Biol Lett — 10.1098/rsbl.2017.0092 · Benson et al. 2014 PLOS Biol — 10.1371/journal.pbio.1001853 · Benson et al. 2018 Palaeontology — 10.1111/pala.12329 · Benton et al. 2010 PPP (Hațeg) — PMC2889090 · Bonsor et al. 2020 RSOS — 10.1098/rsos.201195 · Brusatte et al. 2015 Biol Rev — 10.1111/brv.12128 · Campione & Evans 2012 BMC Biol — 10.1186/1741-7007-10-60 · Canudo et al. 2013 PLoS ONE — 10.1371/journal.pone.0072579 · Carvalho et al. 2021 Science — 10.1126/science.abf1969 · Chiarenza et al. 2019 Nat Comms — 10.1038/s41467-019-08997-2 · Condamine et al. 2021 Nat Comms — 10.1038/s41467-021-23754-0 · Csiki-Sava et al. 2016 Cret Res — 10.1016/j.cretres.2015.09.003 · Currie & Eberth 2010 CJES — 10.1139/e10-072 · Dean, Chiarenza & Maidment 2020 Palaeontology — 10.1111/pala.12492 · Erickson et al. 2004 Nature — 10.1038/nature02699 · Field et al. 2018 Curr Biol — 10.1016/j.cub.2018.04.062 · Field et al. 2020 Nature — 10.1038/s41586-020-2096-0 · Fondevilla et al. 2019 ESR — 10.1016/j.earscirev.2019.01.007 · Fuentes et al. 2019 Rocky Mtn Geol — 10.24872/rmgjournal.54.2.133 · Holroyd et al. 2014 GSA SP 503 — 10.1130/2014.2503(11) · Horner, Goodwin & Myhrvold 2011 PLoS ONE — 10.1371/journal.pone.0016574 · Hutchinson & Garcia 2002 Nature — 10.1038/416349b · Johnson 2002 GSA SP 361:329 · Kobayashi et al. 2019 Sci Rep — PMC6728324 · Longrich, Tokaryk & Field 2011 PNAS — 10.1073/pnas.1110395108 · Longrich, Bhullar & Gauthier 2012 PNAS — 10.1073/pnas.1211526110 · Longrich et al. 2017 Cret Res — 10.1016/j.cretres.2017.03.021 · Longrich et al. 2018 PLOS Biol — 10.1371/journal.pbio.2001663 · Longrich et al. 2021 Cret Res — 10.1016/j.cretres.2020.104678 · Lowery et al. 2018 Nature — 10.1038/s41586-018-0163-6 · Lyson et al. 2019 Science — 10.1126/science.aay2268 · Marshall et al. 2021 Science — 10.1126/science.abc8300 · Mathews et al. 2009 JVP — 10.1080/02724634.2009.10010382 · Nichols & Johnson 2008 *Plants and the K-T Boundary* — 10.1017/cbo9780511535536 · Prasad et al. 2005 Science 310:1177 · Renne et al. 2013 Science — 10.1126/science.1230492 · Robertson et al. 2004 GSA Bull 116:760 · Sakamoto, Benton & Venditti 2016 PNAS — 10.1073/pnas.1521478113 · Sellers & Manning 2007 Proc B — 10.1098/rspb.2007.0846 · Sellers et al. 2017 PeerJ — PMC5518979 · Sheehan & Fastovsky 1992 Geology — 10.1130/0091-7613(1992)020<0556:MEOLDV>2.3.CO;2 · Sprain et al. 2018 GSA Bull — 10.1130/B31890.1 · Titus et al. 2021 PeerJ — 10.7717/peerj.11013 · Tschudy et al. 1984 Science 225:1030 [U] · Vajda et al. 2001 Science — 10.1126/science.1064706 · Vajda & Bercovici 2014 GPC — 10.1016/j.gloplacha.2014.07.014 · Wilf & Johnson 2004 Paleobiology — 10.1666/0094-8373(2004)030<0347:LPEATE>2.0.CO;2 · Wilson 2013 Paleobiology — 10.1666/12041 · Wilson Mantilla et al. 2021 RSOS — 10.1098/rsos.210050.
