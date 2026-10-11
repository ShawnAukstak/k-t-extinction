import { ACESFilmicToneMapping, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import { IMPACT } from './config';
import { GlobeControls } from './camera/globe-controls';
import { detectTier, TIER_SETTINGS } from './core/device';
import { sunDirection } from './core/sun';
import { formatHash, parseHash, type CameraPose, type ViewState } from './core/url-state';
import { Globe } from './render/globe';
import { Sky } from './render/sky';

const DEFAULT_POSE: CameraPose = {
  lat: IMPACT.site.value.lat,
  lon: IMPACT.site.value.lon,
  range: 16_000_000,
  heading: 0,
  tilt: 0,
};

const tier = detectTier();
const settings = TIER_SETTINGS[tier];
const container = document.getElementById('app')!;

const renderer = new WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.maxPixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.55;
container.appendChild(renderer.domElement);

const scene = new Scene();
const camera = new PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 1e9);

const sky = new Sky(settings.stars);
scene.add(sky.stars, sky.atmosphere);
const globe = new Globe(settings.globeSegments);
scene.add(globe.group);

// ── state ────────────────────────────────────────────────────────────────────
const initial: ViewState = parseHash(location.hash);
const state = {
  t: initial.t ?? 0,
  paused: initial.paused ?? true,
  speed: initial.speed ?? 1,
};

const controls = new GlobeControls(camera, renderer.domElement, initial.camera ?? DEFAULT_POSE);

// ── deep links ───────────────────────────────────────────────────────────────
let lastHash = '';
let hashTimer = 0;
function scheduleHashUpdate(): void {
  window.clearTimeout(hashTimer);
  hashTimer = window.setTimeout(() => {
    const hash = formatHash({ t: state.t, camera: controls.getPose(), mode: 'free', speed: state.speed, paused: state.paused });
    if (hash !== lastHash) {
      lastHash = hash;
      history.replaceState(null, '', hash);
    }
  }, 400);
}
controls.onUserInput = scheduleHashUpdate;
window.addEventListener('hashchange', () => {
  if (location.hash === lastHash) return;
  const v = parseHash(location.hash);
  if (v.camera) controls.setPose(v.camera);
  if (v.t !== undefined) state.t = v.t;
});

// ── resize ───────────────────────────────────────────────────────────────────
function resize(): void {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// ── data ─────────────────────────────────────────────────────────────────────
const boot = document.getElementById('boot');
globe
  .load(`${import.meta.env.BASE_URL}data/globe`, settings.faceSize)
  .then((ok) => {
    if (!ok) console.warn('Globe data not found — run scripts/process_globe.py (see data/README.md).');
  })
  .finally(() => {
    if (boot) {
      boot.style.opacity = '0';
      setTimeout(() => boot.remove(), 700);
    }
  });

// ── loop ─────────────────────────────────────────────────────────────────────
const sun = new Vector3();
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  controls.update(dt);
  sunDirection(state.t, sun);
  sky.update(camera, sun, 1, 0, renderer.getPixelRatio());
  globe.update(camera, sun, 1, 0);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Exposed for end-to-end tests and debugging.
declare global {
  interface Window {
    __kt: { renderer: WebGLRenderer; scene: Scene; camera: PerspectiveCamera; controls: GlobeControls; globe: Globe; sky: Sky; state: typeof state; tier: string };
  }
}
window.__kt = { renderer, scene, camera, controls, globe, sky, state, tier };
