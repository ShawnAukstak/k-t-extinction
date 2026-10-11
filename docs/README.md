# Docs

Research and planning for the K-Pg (K-T) extinction simulator. Start with the vision, then the feasibility verdict, then the plan and the decision log.

| Page | What |
|---|---|
| [`00-vision.md`](00-vision.md) | What we're making and why — the original brain-dump, lightly structured |
| [`01-feasibility.md`](01-feasibility.md) | Verdict: feasible, phased; what's hard; what the research changed |
| [`plan/roadmap.md`](plan/roadmap.md) | Phases 0–6, each ending in something runnable |
| [`plan/open-questions.md`](plan/open-questions.md) | The questions that gated the build, with your answers |
| [`plan/decisions.md`](plan/decisions.md) | **Decision log**: what we chose, why, and when to revisit |

## research/ — the science

| Page | What |
|---|---|
| [`research/impact-event.md`](research/impact-event.md) | Impactor (size, speed, angle, direction), site, date/season, Deccan consensus, reusable model outputs, constrained-vs-contested |
| [`research/timeline.md`](research/timeline.md) | Sequence of effects with timing, magnitude, extent, sources; consolidated table |
| [`research/paleogeography.md`](research/paleogeography.md) | The world at 66 Ma: plates, sea level, seaway, climate numbers, biomes; how paleo-globes are painted |
| [`research/paleontology.md`](research/paleontology.md) | Who lived where (regional fauna tables), PBDB API, abundance/behaviour data, extinction selectivity, recovery, 3D asset sources |
| [`research/points-of-interest.md`](research/points-of-interest.md) | Candidate localities with coordinates and why they matter |
| [`research/data-catalog.md`](research/data-catalog.md) | Every downloadable dataset with licence — precursor to `data/catalog.yaml` |

## tech/ — how to build it

| Page | What |
|---|---|
| [`tech/stack-options.md`](tech/stack-options.md) | Engines compared (measured bundle sizes), globe rendering, effects, crowds, UX libs, backend, pipeline, ranked architectures, risks |
| [`tech/prior-art.md`](tech/prior-art.md) | What exists, what it's built on, virality lessons |
| [`tech/ux-timeline-camera-sharing.md`](tech/ux-timeline-camera-sharing.md) | Non-linear timeline model, camera modes, deep-link format, discoveries, load budget |

## Curated data

`data/curated/` holds the hand-edited files the app reads: `timeline.yaml` (events), `dem-corrections.yaml` (cited fixes to the terrain), and `sources.yaml` (93-entry bibliography, every DOI checked against Crossref on 2026-10-11). Research pages cite by author-year; the app cites by the keys in `sources.yaml`.

## Conventions

- **Verification tags** in research pages: `[V]` verified from the source this session · `[S]` from a search snippet · `[U]` unverified / from memory · `[W]/[M]/[C]` well-constrained / model-dependent / contested. Anything tagged `[U]` must be checked against the paper before it's hard-coded.
- Research pages are written to be *the* source of truth for numbers in the app. If a number changes, change it here first.
- Date of research pass 1: **2026-10-11**. Library versions and free-tier limits in `tech/` are as of that date.
