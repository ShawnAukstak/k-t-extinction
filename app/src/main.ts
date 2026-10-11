import './ui/hud.css';
import { ACESFilmicToneMapping, PerspectiveCamera, Ray, Scene, Sphere, Vector2, Vector3, WebGLRenderer, Raycaster } from 'three';
import catalog from '../../data/catalog.yaml';
import { EARTH_RADIUS, IMPACT, SKY } from './config';
import { Cinematic } from './camera/cinematic';
import { frameToPose, GlobeControls } from './camera/globe-controls';
import { Clock } from './core/clock';
import { detectTier, TIER_SETTINGS } from './core/device';
import { latLonToVec, vecToLatLon, type LatLon } from './core/geo';
import { localHistory } from './core/local-history';
import { sunDirection } from './core/sun';
import { formatHash, parseHash, type CameraPose, type ViewState } from './core/url-state';
import { CRATER_OBSERVED, ImpactEffects, type WinterScenario } from './effects/impact-effects';
import { Asteroid } from './render/asteroid';
import { Globe } from './render/globe';
import { Plume } from './render/plume';
import { Sky } from './render/sky';
import { chip, InfoPanel, sourceLinks } from './ui/panel';
import { TimelineBar } from './ui/timeline-bar';
import { TopBar } from './ui/topbar';

const DEFAULT_POSE: CameraPose = {
  lat: IMPACT.site.value.lat,
  lon: IMPACT.site.value.lon,
  range: 16_000_000,
  heading: 0,
  tilt: 0,
};
/** Where playback starts when the link doesn't say: one hour out, riding along with the asteroid. */
const DEFAULT_T = -3600;
const DATA = `${import.meta.env.BASE_URL}data`;

const tier = detectTier();
const settings = TIER_SETTINGS[tier];
const container = document.getElementById('app')!;

// ── renderer and scene ───────────────────────────────────────────────────────
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
const fx = new ImpactEffects();
const globe = new Globe(settings.globeSegments, fx.uniforms);
scene.add(globe.group);
const asteroid = new Asteroid();
scene.add(asteroid.group, asteroid.light, asteroid.light.target);
const cine = new Cinematic(asteroid);
const plume = new Plume(settings.plumeScale, settings.plumeSteps);
plume.setFireballRadiusKm(fx.crater.fireballRadiusKm);

// ── state and UI ─────────────────────────────────────────────────────────────
const initial: ViewState = parseHash(location.hash);
const clock = new Clock(initial.t ?? DEFAULT_T, !(initial.paused ?? false), initial.speed ?? 1);
const controls = new GlobeControls(camera, renderer.domElement, initial.camera ?? DEFAULT_POSE);
const topbar = new TopBar(document.body);
const panel = new InfoPanel(document.body);
const timeline = new TimelineBar(clock, document.body);
let query: LatLon | null = initial.query ?? null;
// Cinematic unless the link pins a free camera.
let mode: 'cine' | 'free' = initial.mode === 'cine' || (!initial.camera && initial.mode !== 'free') ? 'cine' : 'free';
let scenario: WinterScenario = initial.scenario ?? 'soot';
topbar.setScenario(scenario);
topbar.setCinematic(mode === 'cine');

// ── deep links ───────────────────────────────────────────────────────────────
let lastHash = '';
let hashTimer = 0;
let lastHashWrite = 0;
function writeHash(): void {
  const hash = formatHash({
    t: clock.t, camera: mode === 'free' ? controls.getPose() : undefined, mode, speed: clock.speed, paused: !clock.playing,
    query: query ?? undefined, scenario,
  });
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
  if (v.camera && v.mode !== 'cine') { controls.setPose(v.camera); setMode('free'); }
  if (v.mode === 'cine') setMode('cine');
  if (v.t !== undefined) clock.seek(v.t);
  if (v.paused !== undefined) clock.setPlaying(!v.paused);
  if (v.speed !== undefined) clock.setSpeed(v.speed);
  if (v.query) setQuery(v.query);
  if (v.scenario && v.scenario !== scenario) void setScenario(v.scenario);
});

// ── camera mode ──────────────────────────────────────────────────────────────
function setMode(m: 'cine' | 'free'): void {
  if (m === mode) return;
  if (m === 'free') controls.setPose(frameToPose(camera.position, camera.quaternion));
  mode = m;
  topbar.setCinematic(m === 'cine');
  scheduleHashUpdate();
}
// Any grab of the globe hands the camera to the user, continuing from the current view.
for (const type of ['pointerdown', 'wheel'] as const) {
  renderer.domElement.addEventListener(type, () => { if (mode === 'cine') setMode('free'); }, { capture: true });
}
topbar.onCinematic = () => setMode(mode === 'cine' ? 'free' : 'cine');

// ── "what happened here?" ────────────────────────────────────────────────────
const raycaster = new Raycaster();
const _ndc = new Vector2();
const _hit = new Vector3();
const earth = new Sphere(new Vector3(), EARTH_RADIUS);

function pick(clientX: number, clientY: number): LatLon | null {
  const r = renderer.domElement.getBoundingClientRect();
  _ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(_ndc, camera);
  const ray: Ray = raycaster.ray;
  return ray.intersectSphere(earth, _hit) ? vecToLatLon(_hit) : null;
}

function showQuery(): void {
  if (!query) return;
  const h = localHistory(query, {
    crater: fx.crater,
    craterSite: IMPACT.site.value,
    craterRimKm: CRATER_OBSERVED.rimRadiusKm,
    elevationAt: (la, lo) => globe.elevationAt(la, lo),
    tsunamiAt: (la, lo) => fx.tsunamiAt(la, lo),
    dustArrivalAt: (a) => fx.dustArrivalAt(a),
    winterAt: (la, lo) => fx.winterAt(la, lo),
  });
  panel.showLocation(h, clock.t);
}

function setQuery(p: LatLon | null): void {
  query = p;
  const u = fx.uniforms.uPick.value as number[];
  if (p) {
    const v = latLonToVec(p.lat, p.lon, 1);
    u[0] = v.x; u[1] = v.y; u[2] = v.z; u[3] = 1;
    showQuery();
  } else {
    u[3] = 0;
  }
  scheduleHashUpdate();
}

controls.onTap = (x, y) => {
  const p = pick(x, y);
  if (p) setQuery(p);
};
panel.onSeek = (t) => {
  clock.seek(t);
  scheduleHashUpdate();
  if (panel.kind === 'location') showQuery();
};
panel.onClose = () => {
  if (query) setQuery(null);
};
timeline.onEvent = (e) => panel.showEvent(e);

// ── scenario, overlay, about ─────────────────────────────────────────────────
async function setScenario(s: WinterScenario): Promise<void> {
  scenario = s;
  topbar.setScenario(s);
  await fx.loadWinter(`${DATA}/effects`, s);
  if (panel.kind === 'location') showQuery();
  scheduleHashUpdate();
}
topbar.onScenario = (s) => void setScenario(s);

function setOverlay(on: boolean): void {
  fx.uniforms.uOverlay.value = on ? 1 : 0;
  topbar.setOverlay(on);
}
setOverlay(new URLSearchParams(location.search).get('overlay') === '1');
topbar.onOverlay = setOverlay;
window.addEventListener('keydown', (e) => {
  if ((e.key === 'o' || e.key === 'O') && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement)) {
    setOverlay(!fx.uniforms.uOverlay.value);
  }
  if (e.key === 'Escape') panel.close();
});

interface CatalogSource { id: string; name: string; credit: string; ship: boolean; licence: string | null; landing?: string }
topbar.onAbout = () => {
  const sources = (catalog as { sources: CatalogSource[] }).sources;
  const credits = sources
    .map((s) => `<li>${s.landing ? `<a href="${s.landing}" target="_blank" rel="noopener noreferrer">${s.credit}</a>` : s.credit}${s.ship ? '' : ' <em>(local development only: licence not yet confirmed)</em>'}</li>`)
    .join('');
  panel.showHtml('about', `
    <div class="kt-kicker">About</div>
    <h2>K–T Extinction Simulator</h2>
    <p>The Earth of 66 million years ago, rebuilt from published data, and the Chicxulub impact that ended the age of
    the non-avian dinosaurs. (Geologists now call the boundary <b>K–Pg</b>; "K–T" is the older name.)</p>
    <p>Every number is labelled: ${chip('known')} well constrained, ${chip('model')} from models that broadly agree,
    ${chip('contested')} scientists disagree, ${chip('chosen')} not knowable, so we picked a value.</p>
    <p><b>Chosen for this view.</b> Time of day: ${SKY.localSolarTimeH.value}:00 local time at the impact site. ${SKY.localSolarTimeH.note}
    Season: ${SKY.declinationDeg.note}</p>
    <div class="kt-sources"><span>Season and day length</span>${sourceLinks(['during2022', 'dewinter2020'])}</div>
    <p><b>Data</b></p>
    <ul class="kt-credits">${credits}</ul>
    <p class="kt-note">Vegetation colours, sea colour and atmospheric haze are visual interpretations of the data, documented in the project's research notes.</p>`);
};

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
  .load(`${DATA}/globe`, settings.faceSize)
  .then((ok) => {
    if (!ok) console.warn('Globe data not found — run scripts/process_globe.py (see data/README.md).');
  })
  .finally(() => {
    if (boot) {
      boot.style.opacity = '0';
      setTimeout(() => boot.remove(), 700);
    }
  });
const effectsReady = Promise.all([
  fx.loadDust(`${DATA}/effects/dust.json`),
  fx.loadTsunami(`${DATA}/effects`),
  fx.loadWinter(`${DATA}/effects`, scenario),
  plume.load(`${DATA}/effects`),
]);
if (initial.query) {
  // Show the shared location once the data it summarises has arrived.
  void effectsReady.then(() => setTimeout(() => setQuery(initial.query!), 300));
}

// ── lighting ─────────────────────────────────────────────────────────────────
// Beyond the first days the real day/night cycle is meaningless at playback speed (a frame can
// skip weeks), so lighting switches to a fixed "time-lapse" sun over the camera's shoulder.
const DAY_S = 86_400;
const physicalSun = new Vector3();
const lapseSun = new Vector3();
const _right = new Vector3();
const _up = new Vector3();
let timeLapseLighting = 0;
function updateSun(out: Vector3): void {
  sunDirection(clock.t, physicalSun);
  const a = Math.abs(clock.t);
  const k = Math.min(1, Math.max(0, (a - 2 * DAY_S) / (4 * DAY_S)));
  timeLapseLighting = k * k * (3 - 2 * k);
  if (timeLapseLighting === 0) { out.copy(physicalSun); return; }
  _right.setFromMatrixColumn(camera.matrixWorld, 0);
  _up.setFromMatrixColumn(camera.matrixWorld, 1);
  lapseSun.copy(camera.position).normalize().addScaledVector(_right, -0.55).addScaledVector(_up, 0.45).normalize();
  out.copy(physicalSun).lerp(lapseSun, timeLapseLighting).normalize();
}

// ── loop ─────────────────────────────────────────────────────────────────────
const sun = new Vector3();
/** Bring every time-dependent system up to the clock and draw one frame. */
function renderNow(dt = 0): void {
  if (mode === 'cine') cine.apply(clock.t, camera);
  else controls.update(dt);
  updateSun(sun);
  asteroid.update(clock.t, sun);
  fx.update(clock.t);
  sky.update(camera, sun, fx.meanLight, 0, renderer.getPixelRatio());
  globe.update(camera, sun, 1, 0);
  renderer.render(scene, camera);
  if (plume.update(clock.t, camera, sun, fx.meanLight)) plume.render(renderer, camera);
  timeline.update();
  topbar.setTimeLapse(timeLapseLighting > 0.5);
}
let last = performance.now();
let lastPanelRefresh = 0;
function frame(now: number): void {
  const dt = Math.min(0.25, (now - last) / 1000); // cap: no huge jump after a background tab
  last = now;
  clock.tick(dt);
  renderNow(dt);
  // Keep the shareable link current while playing (at most once a second).
  if (clock.playing && now - lastHashWrite > 1000) writeHash();
  // Rows that have "happened" are highlighted, so refresh the location card while time runs.
  if (clock.playing && panel.kind === 'location' && now - lastPanelRefresh > 500) {
    lastPanelRefresh = now;
    showQuery();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Exposed for end-to-end tests and debugging.
declare global {
  interface Window {
    __kt: {
      renderer: WebGLRenderer; scene: Scene; camera: PerspectiveCamera; controls: GlobeControls; globe: Globe; sky: Sky;
      fx: ImpactEffects; clock: Clock; timeline: TimelineBar; panel: InfoPanel; tier: string; asteroid: Asteroid;
      mode: () => 'cine' | 'free';
      renderNow: (dt?: number) => void; setQuery: (p: LatLon | null) => void; effectsReady: Promise<unknown>;
    };
  }
}
window.__kt = {
  renderer, scene, camera, controls, globe, sky, fx, clock, timeline, panel, tier, asteroid, mode: () => mode,
  renderNow, setQuery, effectsReady,
};
