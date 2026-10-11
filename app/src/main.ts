import './ui/hud.css';
import { ACESFilmicToneMapping, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import { IMPACT } from './config';
import { GlobeControls } from './camera/globe-controls';
import { Clock } from './core/clock';
import { detectTier, TIER_SETTINGS } from './core/device';
import { sunDirection } from './core/sun';
import { formatHash, parseHash, type CameraPose, type ViewState } from './core/url-state';
import { Globe } from './render/globe';
import { Sky } from './render/sky';
import { TimelineBar } from './ui/timeline-bar';

const DEFAULT_POSE: CameraPose = {
  lat: IMPACT.site.value.lat,
  lon: IMPACT.site.value.lon,
  range: 16_000_000,
  heading: 0,
  tilt: 0,
};
/** Where playback starts when the link doesn't say: the start of the Impact segment. */
const DEFAULT_T = -60;

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
const clock = new Clock(initial.t ?? DEFAULT_T, !(initial.paused ?? false), initial.speed ?? 1);
const controls = new GlobeControls(camera, renderer.domElement, initial.camera ?? DEFAULT_POSE);
const timeline = new TimelineBar(clock, document.body);

// ── deep links ───────────────────────────────────────────────────────────────
let lastHash = '';
let hashTimer = 0;
let lastHashWrite = 0;
function writeHash(): void {
  const hash = formatHash({ t: clock.t, camera: controls.getPose(), mode: 'free', speed: clock.speed, paused: !clock.playing });
  lastHashWrite = performance.now();
  if (hash !== lastHash) {
    lastHash = hash;
    history.replaceState(null, '', hash);
  }
}
function scheduleHashUpdate(): void {
  window.clearTimeout(hashTimer);
  hashTimer = window.setTimeout(writeHash, 300);
}
controls.onUserInput = scheduleHashUpdate;
timeline.onUserInput = scheduleHashUpdate;
window.addEventListener('hashchange', () => {
  if (location.hash === lastHash) return;
  const v = parseHash(location.hash);
  if (v.camera) controls.setPose(v.camera);
  if (v.t !== undefined) clock.seek(v.t);
  if (v.paused !== undefined) clock.setPlaying(!v.paused);
  if (v.speed !== undefined) clock.setSpeed(v.speed);
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
  const dt = Math.min(0.25, (now - last) / 1000); // cap: no huge jump after a background tab
  last = now;
  clock.tick(dt);
  controls.update(dt);
  sunDirection(clock.t, sun);
  sky.update(camera, sun, 1, 0, renderer.getPixelRatio());
  globe.update(camera, sun, 1, 0);
  renderer.render(scene, camera);
  timeline.update();
  // Keep the shareable link current while playing (at most once a second).
  if (clock.playing && now - lastHashWrite > 1000) writeHash();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Exposed for end-to-end tests and debugging.
declare global {
  interface Window {
    __kt: { renderer: WebGLRenderer; scene: Scene; camera: PerspectiveCamera; controls: GlobeControls; globe: Globe; sky: Sky; clock: Clock; timeline: TimelineBar; tier: string };
  }
}
window.__kt = { renderer, scene, camera, controls, globe, sky, clock, timeline, tier };
