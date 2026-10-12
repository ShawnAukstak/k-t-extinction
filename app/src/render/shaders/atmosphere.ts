/**
 * Single-scattering atmosphere (Rayleigh + Mie), shared by the sky pass and the ground shader.
 * Units are kilometres in a planet-centred frame. Coefficients follow Bruneton & Neyret 2008 /
 * Hillaire 2020 (Earth-like). The Cretaceous atmosphere had more CO₂ but CO₂ does not change
 * Rayleigh colour visibly, so modern values are used.
 *
 * Uniforms expected by including shaders:
 *   uSunDir      vec3   unit vector to the Sun (world)
 *   uSunScale    float  sunlight multiplier (impact winter dims this)
 *   uHaze        float  extra aerosol optical depth multiplier (dust/soot), 0 = clear
 */
export const atmosphereChunk = /* glsl */ `
const float PR = 6371.0;
const float AR = 6471.0;
const vec3 BETA_R = vec3(5.802e-3, 13.558e-3, 33.1e-3);
const float H_R = 8.0;
const float BETA_M = 3.996e-3;
const float BETA_M_EXT = 4.44e-3;
const float H_M = 1.2;
const float G_M = 0.76;
const float SUN_E = 22.0;

uniform vec3 uSunDir;
uniform float uSunScale;
uniform float uHaze;

// Ray–sphere intersection with a numerically stable 'c' for rays starting near the surface.
vec2 raySphere(vec3 ro, vec3 rd, float r) {
  float lr = length(ro);
  float b = dot(ro, rd);
  float c = (lr - r) * (lr + r);
  float d = b * b - c;
  if (d < 0.0) return vec2(1e9, -1e9);
  d = sqrt(d);
  return vec2(-b - d, -b + d);
}

float phaseR(float mu) { return 0.0596831 * (1.0 + mu * mu); }
float phaseM(float mu) {
  float g2 = G_M * G_M;
  return 0.1193662 * (1.0 - g2) * (1.0 + mu * mu) / ((2.0 + g2) * pow(max(1e-4, 1.0 + g2 - 2.0 * G_M * mu), 1.5));
}

vec3 extinction(float odR, float odM) {
  return BETA_R * odR + vec3(BETA_M_EXT * (1.0 + uHaze * 40.0)) * odM;
}

// Relative optical depth of an exponential atmosphere from altitude h (in scale heights) toward
// zenith angle χ, times exp(−h): Schüler's approximation to the Chapman function (GPU Pro 3, 2012).
// X is the planet radius in scale heights.
float chapman(float X, float h, float cosChi) {
  float c = sqrt(X + h);
  if (cosChi >= 0.0) return c / (c * cosChi + 1.0) * exp(-h);
  float x0 = sqrt(max(0.0, 1.0 - cosChi * cosChi)) * (X + h);
  float c0 = sqrt(x0);
  return 2.0 * c0 * exp(min(X - x0, 60.0)) - c / (1.0 - c * cosChi) * exp(-h);
}

// Transmittance from p toward the Sun to space (0 inside the planet's shadow). Analytic: no loop.
vec3 sunTransmittance(vec3 p, vec3 sunDir) {
  vec2 tp = raySphere(p, sunDir, PR - 0.5);
  if (tp.x > 0.0 && tp.x < tp.y) return vec3(0.0);
  float r = length(p);
  float h = max(0.0, r - PR);
  float cosChi = dot(p, sunDir) / r;
  float odR = H_R * chapman(PR / H_R, h / H_R, cosChi);
  float odM = H_M * chapman(PR / H_M, h / H_M, cosChi);
  return exp(-extinction(odR, odM));
}

// In-scattered light along ro + rd*t for t in [t0, t1]; transmittance over the segment returned in T.
// Steps scale with the path: a few km near the ground needs two (the air barely changes over it),
// long paths through the whole atmosphere ten.
vec3 inscatter(vec3 ro, vec3 rd, float t0, float t1, vec3 sunDir, out vec3 T) {
  float len = max(0.0, t1 - t0);
  int N = int(clamp(ceil(len / 6.0), 2.0, 10.0));
  float seg = len / float(N);
  float odR = 0.0, odM = 0.0;
  vec3 sumR = vec3(0.0), sumM = vec3(0.0);
  for (int i = 0; i < 10; i++) {
    if (i >= N) break;
    vec3 p = ro + rd * (t0 + seg * (float(i) + 0.5));
    float h = max(0.0, length(p) - PR);
    float dR = exp(-h / H_R) * seg;
    float dM = exp(-h / H_M) * seg;
    odR += 0.5 * dR; odM += 0.5 * dM;              // midpoint of this sample's own segment
    vec3 Tv = exp(-extinction(odR, odM));
    vec3 Ts = sunTransmittance(p, sunDir);
    sumR += Tv * Ts * dR;
    sumM += Tv * Ts * dM;
    odR += 0.5 * dR; odM += 0.5 * dM;
  }
  T = exp(-extinction(odR, odM));
  float mu = dot(rd, sunDir);
  return SUN_E * uSunScale * (sumR * BETA_R * phaseR(mu) + sumM * BETA_M * (1.0 + uHaze * 40.0) * phaseM(mu));
}
`;
