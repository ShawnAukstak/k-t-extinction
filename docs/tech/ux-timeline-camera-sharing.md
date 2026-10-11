# UX notes: timeline, camera, deep links

> Design thinking derived from `docs/00-vision.md`. Independent of engine choice. Event timings referenced here are placeholders until `docs/research/timeline.md` is finalised.

## 1. Non-linear timeline

The event spans ~14 orders of magnitude of time: the asteroid's approach (years/months), atmospheric entry (seconds), crater formation (minutes), regional devastation (hours), global effects (days–years), climate recovery (decades–millennia), biotic recovery (hundreds of thousands of years). A single linear scrubber can't show that. Two workable models:

### Option A — Piecewise-linear "segments" (recommended)
The timeline is a list of named segments, each with its own time scale. The scrubber bar is divided proportionally by *screen width we want to give each segment*, not by real duration.

| Segment (example)          | Sim time covered     | Default playback rate | Bar width |
|----------------------------|----------------------|-----------------------|-----------|
| Approach                   | T−30 d … T−60 s      | ~1 day / s            | 10 %      |
| Entry & impact             | T−60 s … T+10 min    | real-time → 10× slow  | 25 %      |
| First hours                | T+10 min … T+24 h    | ~2 min / s            | 20 %      |
| First year                 | T+1 d … T+1 yr       | ~1 wk / s             | 15 %      |
| Impact winter              | T+1 yr … T+30 yr     | ~1 yr / s             | 10 %      |
| Recovery                   | T+30 yr … T+1 Myr    | log scale             | 20 %      |

- Scrubbing is linear *within* a segment. Playback rate per segment is a default the user can multiply (0.1×…100×).
- Segment boundaries are labelled; the readout shows an appropriate unit for the segment (`T−3d 04:12:08`, `T+00:00:47.3`, `T+6 h`, `T+14 months`, `T+180 kyr`).
- Easy to reason about, easy to encode in a URL (segment id + fraction, or just absolute seconds since impact as a float64).

### Option B — Continuous log-ish warp
A single monotonic mapping `screen_x → sim_time` using a symmetric log / "sinh" warp around T=0. Elegant but harder for users to predict, and labelling is awkward. Keep as a possible visual overlay (a "zoom lens" on the bar), not the primary model.

### Time representation
- Canonical internal time: **seconds relative to impact**, as a 64-bit float. T=0 is the moment of first contact with the surface. Negative = before. Range needed: ~ −1e8 s (3 years approach) … +3e13 s (1 Myr) — well within float64 precision.
- Absolute calendar: there is no defensible day/month/year; the literature constrains the *season* (boreal spring/early summer per Tanis fish bone/otolith evidence — see research) and the *age* (~66.04 Ma). Display "66,043,000 years ago (±11,000)" as context, and avoid inventing a calendar date.
- Time of day at impact: unconstrained by evidence. Treat as a free visual parameter; document that it's a choice.

### Playback controls
- Play/pause, speed multiplier, "jump to next event" (marker list), and a hover tooltip on markers (events from `data/curated/timeline.yaml`).
- Keyboard: space, ←/→ step, shift for larger steps, `[`/`]` previous/next event.

## 2. Camera modes

| Mode        | Behaviour                                                                 | Notes |
|-------------|---------------------------------------------------------------------------|-------|
| Cinematic   | Keyframed camera path tied to sim time; user can't orbit, can scrub       | The default "main event" on first load. Authored with an animation tool (see stack notes). |
| Fixed       | Camera locked to a named frame (geographic point + heading/pitch/distance) while time runs | "Stand at Tanis", "Orbit Yucatán". Can be user-created from any free-roam pose. |
| Free roam   | Orbit / fly; time can run or be paused                                    | Standard orbit controls near the globe; first-person-ish fly at ground level. |

- Switching modes must never lose the current time.
- Frames of reference: a camera pose is stored as `(lat, lon, altitude_m, heading, pitch, roll)` relative to the paleo-globe, plus an optional "track" target (e.g. `asteroid`) for cinematic follow-cams. Storing geographic pose rather than Cartesian keeps URLs readable and engine-independent.

## 3. Deep links

Goal: every view is a URL; URLs are short enough for social; parsing is forgiving.

Proposed hash format (hash, not query, so static hosting needs no server-side routing and the CDN cache isn't fragmented):

```
https://<site>/#t=47.3&c=21.3,-89.5,350000,0,-60&m=free&s=1
```

| Key | Meaning | Default |
|-----|---------|---------|
| `t` | sim time, seconds since impact (float; `e` notation allowed) | 0 |
| `c` | camera `lat,lon,alt_m,heading,pitch[,roll]` | main cinematic |
| `m` | mode `cine|fixed|free` | `cine` |
| `s` | playback speed multiplier | 1 |
| `p` | paused `1` | playing |
| `k` | id of a curated camera preset / cinematic track (overrides `c`) | — |
| `v` | schema version | 1 |

- A short-link service (`/d/<id>`) can wrap this for the discoveries index and for OG image generation; the hash form is the canonical, server-free representation.
- OG preview: when a discovery is submitted, render a screenshot server-side (headless browser on a worker) or client-side at submit time (canvas → PNG upload). Client-side at submit is cheaper and avoids running WebGL on a server.

## 4. Discoveries index

- Minimum viable: a list of `{id, url_hash, caption, created_at, votes}` rows; one `POST` to submit; one `POST` to upvote; `GET` list sorted by votes/recency.
- Abuse control without accounts: rate-limit per IP, a bot check on submit (e.g. Turnstile), one vote per (IP, id) per day, moderation flag. Accept that it's imperfect.
- The landing view shows the main cinematic plus a sidebar/overlay of top discoveries. Clicking one applies its hash state.

## 5. First-load experience (budget targets)

| Milestone | Target |
|-----------|--------|
| HTML + critical JS/CSS | < 300 KB compressed |
| First globe on screen (low-res) | < 2 s on 4G |
| Cinematic playable | < 5 s |
| Ground-level detail at a POI | streamed on demand; never blocks |

These are aspirations to validate in the tech feasibility doc; the point is that the choice of engine and asset format is constrained by them.
