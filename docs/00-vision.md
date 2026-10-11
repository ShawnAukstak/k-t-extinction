# Vision

> Status: initial brain-dump, captured 2026-10-11. Not a spec. Everything here is up for revision.

## One-liner

A free, shareable website where you can navigate a 3D Earth as it was 66 million years ago, watch the Chicxulub asteroid arrive and hit, and follow the consequences — from the first seconds to the recovery of life — at any scale from orbit down to individual dinosaur herds.

## What it is

- **A simulator / explorable documentary**, not a game. The payoff is *seeing* an event that is usually described in text and still images.
- **Scientifically honest.** Trajectory, landing site, timing, physical effects, geography, flora and fauna should track the best published science. Where the science is uncertain or contested, the app should say so rather than pick a dramatic answer.
- **Discoverable.** The scale is enormous (whole planet × years × down to a single animal) and full of real details — Tanis, the Hell Creek floodplain, the Western Interior Seaway, Hațeg Island, the mosasaurs in the Tethys, the ejecta re-entering over India. Users should be able to stumble onto these and share what they found.
- **Free, on the open web, loads immediately.** No install, no account needed to explore. Shared on social; success is "other people find this interesting."

## Core interactions

### Timeline
- A timeline bar across the bottom with date and (near impact) time-of-day / elapsed time.
- **Non-linear time.** Years or millennia per second far from impact; slowing to seconds-per-second (or slower) around entry and impact; then speeding back up through hours → days → years → millennia of aftermath. The user can adjust playback speed and pause.
- Scrub to any moment.

### Camera
- **Scripted / cinematic** mode: a curated camera that follows the asteroid in, watches the impact, rides the effects out across the globe.
- **Fixed** viewpoints: e.g. "stand at Tanis", "orbit above the Yucatán", "look down on Hell Creek".
- **Free roam**: pause (or not) and fly anywhere, zoom from orbit down to ground level.

### Scale and detail
- From space the globe shows paleogeography, ocean, atmosphere, the expanding effects.
- Zooming in progressively loads detail: terrain, vegetation biomes, then individual dinosaur groups (pods, herds, nesting colonies) at known fossil-bearing locations, behaving plausibly.
- Detail is lazy-loaded; the first paint must be fast.

### Sharing and community
- **Deep links** encode timestamp + camera pose (+ speed, mode). Any view is a URL. Shares should render a snapshot preview (Open Graph image).
- **Discoveries index**: on load, show the "main event" plus an index of interesting moments/views. Super simple: anyone can submit a link + caption; anyone can upvote. No accounts if we can get away with it.

## Non-goals (for now)
- Not a general-purpose deep-time globe (that exists — see prior art). Scope is the K-Pg event and its immediate context.
- Not a physics engine. Effects are driven by published models and scaling laws, pre-baked where that is cheaper and more accurate than real-time simulation.
- Not monetised. Personal-brand / for-fun project.

## Guiding principles
1. **Data first.** The hard, slow part is assembling and organising accurate source data. Do that before committing to rendering tech.
2. **Cite everything.** Every number the app shows should trace to a source in `docs/research/`.
3. **Degrade gracefully.** The globe + timeline + main cinematic must work on a phone. Herds and ground-level detail are progressive enhancements.
4. **Ship something small early.** The cinematic impact sequence on a correct 66 Ma globe is already shareable. Herds, free roam and the discoveries index can follow.
