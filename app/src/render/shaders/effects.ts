/**
 * Impact effects evaluated per fragment on the globe, by angular distance from the crater and time.
 * Inputs come from ImpactEffects (src/effects/impact-effects.ts): an analytic table (row 0) from the
 * Collins et al. 2005 scaling laws and dust-cloud column profiles (rows 1…) from Artemieva & Morgan 2020.
 *
 * Distances in km, times in seconds since impact.
 */
export const effectsChunk = /* glsl */ `
uniform sampler2D uFxTable;
uniform float uFxRows;
uniform vec3 uImpactDir;
uniform vec3 uImpactEast;      // local frame at the crater (for the NE resurge gap)
uniform vec3 uImpactNorth;
uniform float uT;
uniform vec3 uDust;            // rowA, rowB, blend
uniform float uDustOn;
uniform vec4 uCrater;          // x final rim radius, y peak-ring radius, z transient radius, w fireball radius (km)
uniform float uDeepAzimuth;    // radians, direction the shelf deepens (the resurge comes from there)
uniform float uOverlay;
uniform sampler2D uTsunami;     // R arrival (h), G log10 max height (m); equirect, row 0 = 90°N
uniform float uTsunamiOn;

float fxRow(float r) { return (r + 0.5) / uFxRows; }

float fxHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float fxNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(fxHash(i), fxHash(i + vec3(1, 0, 0)), f.x), mix(fxHash(i + vec3(0, 1, 0)), fxHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(fxHash(i + vec3(0, 0, 1)), fxHash(i + vec3(1, 0, 1)), f.x), mix(fxHash(i + vec3(0, 1, 1)), fxHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}

// Azimuth around the crater (radians, clockwise from north).
float fxAzimuth(vec3 n) {
  vec3 local = n - uImpactDir * dot(n, uImpactDir);
  return atan(dot(local, uImpactEast), dot(local, uImpactNorth));
}

// Accurate at small angles (acos loses precision within a few km of the crater).
float fxAngle(vec3 n) { return atan(length(cross(n, uImpactDir)), dot(n, uImpactDir)); }

vec4 fxEjecta(float ang) { return texture2D(uFxTable, vec2(ang / PI, fxRow(0.0))); }

float fxDustLog(float ang) {
  float a = texture2D(uFxTable, vec2(ang / PI, fxRow(uDust.x))).r;
  float b = texture2D(uFxTable, vec2(ang / PI, fxRow(uDust.y))).r;
  return mix(a, b, uDust.z);
}

// Crater radius over time: transient cavity in ~30 s, collapse to the final rim by ~5 min (Collins 2020).
float fxCraterRadius(float t) {
  if (t <= 0.0) return 0.0;
  float transient = uCrater.z * (1.0 - exp(-t / 8.0));
  float collapse = smoothstep(30.0, 300.0, t);
  return mix(transient, uCrater.x, collapse);
}

// Modify the surface before lighting: crater, ejecta blanket, flooding.
void fxSurface(float rKm, float ang, vec3 n, inout vec3 albedo, inout float water, inout vec3 nrm) {
  if (uT <= 0.0) return;
  float rc = fxCraterRadius(uT);
  // Ejecta blanket: appears once the ballistic ejecta have landed here.
  vec4 ej = fxEjecta(ang);
  float arrived = smoothstep(-0.02, 0.02, log(max(uT, 1e-3)) / 2.302585 - ej.r);
  // Only a thick blanket changes how the ground looks from orbit: 10 cm … 10 m (thin distal layers
  // are real but invisible at this scale).
  float thick = smoothstep(-1.0, 1.0, ej.g);
  float blanket = arrived * thick * step(rc * 0.98, rKm);
  vec3 ejectaColour = mix(vec3(0.20, 0.18, 0.155), vec3(0.34, 0.31, 0.27), smoothstep(0.0, 2.0, ej.g));
  albedo = mix(albedo, ejectaColour, blanket * (1.0 - 0.55 * water));
  // Over the sea the fallout makes the water milky.
  albedo = mix(albedo, vec3(0.20, 0.20, 0.17), blanket * water * 0.6);

  // The crater itself.
  if (rKm < rc * 1.15) {
    float x = rKm / max(rc, 1.0);
    float rim = exp(-pow((x - 1.0) / 0.07, 2.0));
    float peak = smoothstep(150.0, 300.0, uT) * exp(-pow((rKm - uCrater.y) / 6.0, 2.0));
    vec3 floorC = vec3(0.10, 0.09, 0.085);
    vec3 c = mix(floorC, vec3(0.55, 0.50, 0.44), max(rim, peak * 0.8));
    float inside = 1.0 - smoothstep(1.0, 1.12, x);
    albedo = mix(albedo, c, inside);
    // Relief cue for the rim and peak ring.
    vec3 radial = normalize(n - uImpactDir * dot(n, uImpactDir) + 1e-6);
    float slope = (rim * sign(1.0 - x) * 0.35 + peak * 0.25 * sign(uCrater.y - rKm)) * inside;
    nrm = normalize(nrm + radial * slope);
    // Dry until the ocean floods back in through the north-eastern gap, 30–60 min after impact (Gulick 2019).
    vec3 local = n - uImpactDir * dot(n, uImpactDir);
    float az = atan(dot(local, uImpactEast), dot(local, uImpactNorth));
    float fromGap = 0.5 + 0.5 * cos(az - uDeepAzimuth);       // 1 on the deep side
    float flood = smoothstep(1800.0, 3600.0, uT + 1200.0 * fromGap);
    water = mix(water * (1.0 - inside), 1.0, flood * inside);
  }
}

// Light emitted by the impact: fireball, hot crater, and re-entering ejecta.
vec3 fxEmission(float rKm, float ang) {
  if (uT <= 0.0) return vec3(0.0);
  vec3 e = vec3(0.0);
  // Fireball: a blinding disc that reaches the radius of maximum radiation in ~R/v seconds
  // (EIEP eq. 32–33), then expands as a plume at a few km/s while cooling from white to dull red.
  float rf = uCrater.w * (1.0 - exp(-uT / 3.0)) + 3.0 * max(0.0, uT - 8.0);
  float core = 1.0 - smoothstep(0.75 * rf, rf, rKm);
  float halo = exp(-pow(rKm / (rf * 1.6), 2.0));
  float bright = 40.0 * exp(-uT / 6.0) + 4.0 * exp(-uT / 45.0) + 0.6 * exp(-uT / 300.0);
  float cool = smoothstep(0.0, 150.0, uT);
  vec3 tint = mix(vec3(1.0, 0.95, 0.88), vec3(1.0, 0.38, 0.10), cool);
  e += tint * bright * (core + 0.25 * halo);
  // Incandescent melt in the crater floor, fading over hours.
  float rc = fxCraterRadius(uT);
  if (rKm < rc) e += vec3(1.0, 0.35, 0.08) * 1.6 * exp(-uT / 2400.0) * (1.0 - smoothstep(0.6, 1.0, rKm / rc));
  // Re-entry: a bright band where the ballistic ejecta are arriving now, and a fading glow behind it.
  vec4 ej = fxEjecta(ang);
  float lt = log(max(uT, 1e-3)) / 2.302585;
  float d = lt - ej.r;                                     // > 0: already arrived (log10 seconds)
  float speed = clamp((rKm - 300.0) / 6000.0, 0.0, 1.0);   // farther = faster re-entry = hotter
  float front = exp(-pow(d / 0.008, 2.0));
  float behind = step(0.0, d) * exp(-d / 0.25);
  e += vec3(1.0, 0.42, 0.12) * (2.0 * front + 0.35 * behind) * speed * step(800.0, rKm);
  return e;
}

float fxDustTau(float ang, vec3 n) {
  if (uDustOn < 0.5 || uT <= 0.0) return 0.0;
  float col = pow(10.0, fxDustLog(ang));                  // kg/m²
  // Radial ejecta streaks and turbulent patches, drifting outward with time (visual structure only;
  // the column density itself comes from the model).
  float az = fxAzimuth(n);
  float rays = fxNoise(vec3(az * 9.0, 0.0, 0.0)) * 0.6 + fxNoise(vec3(az * 23.0, 1.7, 0.0)) * 0.4;
  vec3 drift = uImpactDir * (uT * 1e-5);
  float puffs = fxNoise(n * 9.0 + drift) * 0.5 + fxNoise(n * 27.0 - drift) * 0.3 + fxNoise(n * 81.0) * 0.2;
  float structure = mix(puffs, rays, 0.45 * smoothstep(0.02, 0.3, ang)) * 1.7;
  return 0.012 * col * structure;                          // visual extinction coefficient, m²/kg
}

vec2 fxEquirect(vec3 n) {
  float lat = asin(clamp(n.y, -1.0, 1.0));
  float lon = atan(n.x, n.z);
  return vec2(lon / (2.0 * PI) + 0.5, 0.5 - lat / PI);
}

// Tsunami: a bright crest line where the front is now, and churned, paler water behind it,
// both scaled by the modelled maximum height. Returns (crest, wake, log10 height, arrived).
vec4 fxTsunami(vec3 n) {
  if (uTsunamiOn < 0.5 || uT <= 0.0) return vec4(0.0);
  vec2 s = textureLod(uTsunami, fxEquirect(n), 0.0).rg;
  float dt = uT - s.r * 3600.0;
  float width = clamp(0.03 * uT, 90.0, 2400.0);
  float crest = exp(-pow(dt / width, 2.0));
  float wake = step(0.0, dt) * exp(-dt / (6.0 * 3600.0));
  float amp = smoothstep(-1.0, 2.3, s.g);                   // 0.1 m … 200 m
  return vec4(crest * amp, wake * amp, s.g, step(0.0, dt));
}

// Thin rings for the science overlay: air blast, seismic surface waves, ballistic ejecta front.
vec3 fxOverlay(float rKm, float ang, float pxKm) {
  if (uOverlay < 0.5 || uT <= 0.0) return vec3(0.0);
  vec3 o = vec3(0.0);
  float w = max(pxKm * 1.5, 4.0);
  float blast = 0.330 * uT;   // speed of sound (EIEP eq. 64)
  float seismic = 5.0 * uT;   // surface waves (EIEP)
  o += vec3(1.0, 0.85, 0.3) * exp(-pow((rKm - blast) / w, 2.0)) * step(uCrater.w, blast);
  o += vec3(0.5, 0.75, 1.0) * exp(-pow((rKm - seismic) / w, 2.0)) * step(rKm, 20000.0);
  vec4 ej = fxEjecta(ang);
  float lt = log(max(uT, 1e-3)) / 2.302585;
  o += vec3(1.0, 0.5, 0.25) * exp(-pow((lt - ej.r) / 0.01, 2.0));
  return o;
}

vec3 fxTsunamiOverlay(vec4 ts) {
  if (uOverlay < 0.5) return vec3(0.0);
  // Max height behind the front: dark blue 0.1 m → cyan 1 m → yellow 10 m → red ≥ 100 m.
  float h = clamp((ts.z + 1.0) / 3.0, 0.0, 1.0);
  vec3 c = h < 0.33 ? mix(vec3(0.05, 0.1, 0.5), vec3(0.1, 0.8, 0.9), h / 0.33)
         : h < 0.66 ? mix(vec3(0.1, 0.8, 0.9), vec3(1.0, 0.9, 0.2), (h - 0.33) / 0.33)
         : mix(vec3(1.0, 0.9, 0.2), vec3(1.0, 0.15, 0.1), (h - 0.66) / 0.34);
  float crest = ts.x / max(0.05, smoothstep(-1.0, 2.3, ts.z));
  return c * (0.18 * ts.w + 1.2 * crest);
}
`;
