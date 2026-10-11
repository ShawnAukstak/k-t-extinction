# Docs

Research and planning for the K-Pg (K-T) extinction simulator. **Nothing is built yet.** Start with the vision, then the feasibility verdict, then the plan.

| Page | What |
|---|---|
| [`00-vision.md`](00-vision.md) | What we're making and why — the original brain-dump, lightly structured |
| [`01-feasibility.md`](01-feasibility.md) | Verdict: feasible, phased; what's hard; what the research changed |
| [`plan/roadmap.md`](plan/roadmap.md) | Phases 0–6, each ending in something runnable |
| [`plan/open-questions.md`](plan/open-questions.md) | Decisions that are yours, with recommendations |

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

## Conventions

- **Verification tags** in research pages: `[V]` verified from the source this session · `[S]` from a search snippet · `[U]` unverified / from memory · `[W]/[M]/[C]` well-constrained / model-dependent / contested. Anything tagged `[U]` must be checked against the paper before it's hard-coded.
- Research pages are written to be *the* source of truth for numbers in the app. If a number changes, change it here first.
- Date of research pass 1: **2026-10-11**. Library versions and free-tier limits in `tech/` are as of that date.
