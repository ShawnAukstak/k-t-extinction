import './ui/hud.css';
import { ACESFilmicToneMapping, PerspectiveCamera, Ray, Scene, Sphere, Vector2, Vector3, WebGLRenderer, Raycaster } from 'three';
import catalog from '../../data/catalog.yaml';
import { EARTH_RADIUS, IMPACT, SKY } from './config';
import { Soundscape } from './audio/soundscape';
import { Cinematic } from './camera/cinematic';
import { frameToPose, GlobeControls } from './camera/globe-controls';
import { Clock } from './core/clock';
import { detectTier, TIER_SETTINGS } from './core/device';
import { latLonToVec, vecToLatLon, type LatLon } from './core/geo';
import { localHistory } from './core/local-history';
import { Plates, type PlatesData } from './core/plates';
import { POIS, poiById, type Poi } from './core/pois';
import { sunDirection } from './core/sun';
import { formatAge, formatRelative } from './core/timeline';
import { formatHash, parseHash, type CameraPose, type ViewState } from './core/url-state';
import { CRATER_OBSERVED, ImpactEffects, type WinterScenario } from './effects/impact-effects';
import { Asteroid } from './render/asteroid';
import { Clouds } from './render/clouds';
import { Globe } from './render/globe';
import { Plume } from './render/plume';
import { Vegetation } from './terrain/vegetation';
import { Herds } from './life/herds';
import { loadRoster } from './life/roster';
import { Sky } from './render/sky';
import { Markers } from './ui/markers';
import { chip, InfoPanel, sourceLinks } from './ui/panel';
import { ShareSheet } from './ui/share';
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
// The sky browns out inside blast-raised dust (shares the effects' uniforms).
sky.skyMaterial.uniforms.uBlastDustCam = fx.uniforms.uBlastDustCam;
sky.skyMaterial.uniforms.uBlastDustColor = fx.uniforms.uBlastDustColor;
sky.skyMaterial.uniforms.uBlastFront = fx.uniforms.uBlastFront;
sky.skyMaterial.uniforms.uBlastWall = fx.uniforms.uBlastWall;
const globe = new Globe(settings.terrain, fx.uniforms);
scene.add(globe.group);
const gu = globe.material.uniforms;
// Sharp ground at grazing angles (most of what you see from a low camera).
globe.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
(gu.uDetail.value as { anisotropy: number; needsUpdate: boolean }).anisotropy = globe.anisotropy;
(gu.uDetail.value as { anisotropy: number; needsUpdate: boolean }).needsUpdate = true;
// Clouds: baked once on the GPU (a few ms), sampled by the globe.
const clouds = new Clouds(settings.faceSize);
clouds.bake(renderer);
gu.uClouds.value = clouds.target.texture;
gu.uCloudsOn.value = 1;
sky.skyMaterial.uniforms.uClouds.value = clouds.target.texture;
sky.skyMaterial.uniforms.uCloudsOn.value = 1;
sky.skyMaterial.uniforms.uT = fx.uniforms.uT;
const vegetation = new Vegetation(globe.heights, fx.crater, {
  ...fx.uniforms, uSunDir: gu.uSunDir, uSunScale: gu.uSunScale, uHaze: gu.uHaze, uCamPosKm: gu.uCamPosKm,
}, { ...settings.vegetation, baseUrl: `${import.meta.env.BASE_URL}data/globe`, mapSize: 512 });
scene.add(vegetation.group);
const herds = new Herds(globe.heights, vegetation.map, fx.crater, {
  ...fx.uniforms, uSunDir: gu.uSunDir, uSunScale: gu.uSunScale, uHaze: gu.uHaze, uCamPosKm: gu.uCamPosKm,
}, settings.herds, [], []);
// The species cards load the first time the camera is low enough for animals.
herds.requestRoster = () => void loadRoster().then((r) => herds.setRoster(r.species, r.regions));
scene.add(herds.group);
const asteroid = new Asteroid();
scene.add(asteroid.group, ...asteroid.lights.flatMap((l) => [l, l.target]));
const cine = new Cinematic(asteroid);
const plume = new Plume(settings.plumeScale, settings.plumeSteps);
plume.setFireballRadiusKm(fx.crater.fireballRadiusKm);

// ── state and UI ─────────────────────────────────────────────────────────────
const initial: ViewState = parseHash(location.hash);
const clock = new Clock(initial.t ?? DEFAULT_T, !(initial.paused ?? false), initial.speed ?? 1);
const controls = new GlobeControls(camera, renderer.domElement, initial.camera ?? DEFAULT_POSE);
controls.terrainHeight = (d) => globe.terrain.heightAt(d);
// Re-seat the camera on real ground once heights arrive (links can open before they load).
globe.onHeights = () => controls.setPose(controls.getPose());
const topbar = new TopBar(document.body);
const panel = new InfoPanel(document.body);
const markers = new Markers(document.body, POIS);
const timeline = new TimelineBar(clock, document.body);
let query: LatLon | null = initial.query ?? null;
let queryName: string | null = initial.queryName ?? null;
// Cinematic unless the link pins a free camera.
let mode: 'cine' | 'free' = initial.mode === 'cine' || (!initial.camera && initial.mode !== 'free') ? 'cine' : 'free';
let scenario: WinterScenario = initial.scenario ?? 'soot';
topbar.setScenario(scenario);
topbar.setCinematic(mode === 'cine');

// ── deep links ───────────────────────────────────────────────────────────────
let lastHash = '';
let hashTimer = 0;
let lastHashWrite = 0;
/** Everything a link carries: time, camera, playback, the open location card, the scenario. */
function currentView(): ViewState {
  return {
    t: clock.t, camera: mode === 'free' ? controls.getPose() : undefined, mode, speed: clock.speed, paused: !clock.playing,
    query: query ?? undefined, queryName: queryName ?? undefined, scenario, preset: place ?? undefined,
  };
}
function writeHash(): void {
  const hash = formatHash(currentView());
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
  if (v.query) setQuery(v.query, v.queryName ?? null);
  if (v.preset) { const p = poiById(v.preset); if (p) goToPlace(p); }
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
const sound = new Soundscape();
topbar.onSound = (on) => { if (on) void sound.enable(); else sound.disable(); };

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
  panel.showLocation(h, clock.t, queryName ?? undefined);
}

function setQuery(p: LatLon | null, name: string | null = null): void {
  query = p;
  queryName = p ? name : null;
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
  // Animals first: tapping one opens its species card.
  const r = renderer.domElement.getBoundingClientRect();
  _ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(_ndc, camera);
  const hit = herds.pick(raycaster);
  if (hit) { panel.showSpecies(hit.species, hit.entry); return; }
  const p = pick(x, y);
  if (!p) return;
  setQuery(p);
  // Rows for the tsunami and impact winter appear once their data arrive.
  void ensureEffectData(true).then(() => { if (query === p) showQuery(); });
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

// ── places ───────────────────────────────────────────────────────────────────
let place: string | null = null;
function goToPlace(p: Poi, fly = true): void {
  place = p.id;
  setMode('free');
  const cam = p.camera ?? { range: 400_000, heading: 0, tilt: 45 };
  const pose = { lat: p.paleo.lat, lon: p.paleo.lon, ...cam };
  if (fly) void controls.flyTo(pose); else controls.setPose(pose);
  panel.showPlace(p);
  scheduleHashUpdate();
}
markers.onSelect = (p) => goToPlace(p);
topbar.onPlaces = () => panel.showPlaces(POIS);
panel.onPlaceAction = (action, id) => {
  const p = poiById(id);
  if (!p) return;
  if (action === 'fly') goToPlace(p);
  else if (action === 'animals') void findAnimals(p);
  else { setQuery(p.paleo); void ensureEffectData(true).then(() => showQuery()); }
};
/** Fly low over a place, wait for herds to populate, then go to the nearest large-animal herd. */
async function findAnimals(p: Poi): Promise<void> {
  await controls.flyTo({ lat: p.paleo.lat, lon: p.paleo.lon, range: 3000, heading: 0, tilt: 55 }, 2.5);
  const here = latLonToVec(p.paleo.lat, p.paleo.lon, 1);
  for (let i = 0; i < 40; i++) {
    // Large animals first; after the extinction, whatever lives here.
    const h = herds.nearestHerd(here, clock.t) ?? herds.nearestHerd(here, clock.t, 1);
    if (h) {
      const ll = vecToLatLon(h.dir);
      await controls.flyTo({ lat: ll.lat, lon: ll.lon, range: Math.max(12, h.species.lengthM * 5), heading: 30, tilt: 70 }, 2.5);
      panel.showSpecies(h.species, h.entry, h.size > 1 ? `<p>A group of ${h.size}.</p>` : '');
      return;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  panel.showHtml('about', `<div class="kt-kicker">Animals</div><h2>None in view</h2><p>No animals are modelled near ${p.name} at this time.</p>`);
}
// A selected place stays in the link until the user moves the camera themselves.
renderer.domElement.addEventListener('pointerdown', () => { place = null; }, { capture: true });

// ── where was my city? ───────────────────────────────────────────────────────
function showPaleoSpot(paleo: LatLon, name: string): void {
  place = null;
  setMode('free');
  void controls.flyTo({ lat: paleo.lat, lon: paleo.lon, range: 2_800_000, heading: 0, tilt: 25 });
  setQuery(paleo, name);
  void ensureEffectData(true).then(() => { if (query === paleo) showQuery(); });
}
panel.onNeedCities = async () => {
  if (panel.cities.length) return;
  const d = (await (await fetch(`${DATA}/places/cities.json`)).json()) as { cities: [string, string, number, number, number, number, number][] };
  panel.cities = d.cities.map(([name, country, lat, lon, pop, paleoLat, paleoLon]) => ({ name, country, lat, lon, pop, paleoLat, paleoLon }));
};
panel.onCity = (c) => showPaleoSpot({ lat: c.paleoLat, lon: c.paleoLon }, `${c.name}, ${c.country}`);
let plates: Plates | null = null;
panel.onLocate = () => {
  if (!navigator.geolocation) return;
  // The position never leaves the device: the reconstruction runs here.
  navigator.geolocation.getCurrentPosition(async (pos) => {
    plates ??= new Plates((await (await fetch(`${DATA}/places/plates65.json`)).json()) as PlatesData);
    const r = plates.reconstruct(pos.coords.latitude, pos.coords.longitude);
    if (r) showPaleoSpot(r, 'Where you are');
  }, () => { /* permission denied: nothing to do */ }, { maximumAge: 600_000, timeout: 15_000 });
};

// ── share ────────────────────────────────────────────────────────────────────
// Sharing freezes the moment: playback pauses while the sheet is open, so the link, the preview and
// the screen agree. The preview is read from the canvas straight after drawing it.
const share = new ShareSheet(document.body);
let resumeAfterShare = false;
topbar.onShare = timeline.onShare = () => {
  if (share.isOpen) return;
  resumeAfterShare = clock.playing;
  clock.setPlaying(false);
  renderNow(0);
  const view = currentView();
  const base = location.href.split('#')[0];
  share.open({
    when: formatRelative(clock.t),
    age: formatAge(clock.t, IMPACT.ageMa.value),
    caption: timeline.captionText,
    frame: renderer.domElement,
    cinematic: mode === 'cine',
    link: (playing) => base + formatHash({ ...view, paused: !playing }),
  });
  writeHash();
};
share.onClose = () => {
  if (resumeAfterShare) clock.setPlaying(true);
  resumeAfterShare = false;
  scheduleHashUpdate();
};

// ── scenario, overlay, about ─────────────────────────────────────────────────
async function setScenario(s: WinterScenario): Promise<void> {
  scenario = s;
  topbar.setScenario(s);
  winterLoad = fx.loadWinter(`${DATA}/effects`, s);
  await winterLoad;
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
    <p class="kt-note">Vegetation colours, sea colour, atmospheric haze, the clouds (their pattern follows the general
    circulation, but the weather of that day is unknowable), the asteroid's shape, the plume's look and the soundtrack are interpretations
    of the data, documented in the project's research notes. Space is silent; on the ground the quake, the blast and the
    falling debris would arrive minutes to hours apart depending on distance.</p>`);
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
// Small effect data loads up front; the tsunami (~2 MB) and impact winter (~1 MB) load when
// playback gets near them or someone asks about a location, so the first view stays light.
const earlyEffects = Promise.all([fx.loadDust(`${DATA}/effects/dust.json`), plume.load(`${DATA}/effects`)]);
let tsunamiLoad: Promise<boolean> | null = null;
let winterLoad: Promise<boolean> | null = null;
function ensureEffectData(all = false): Promise<unknown> {
  if (!tsunamiLoad && (all || clock.t > -120)) tsunamiLoad = fx.loadTsunami(`${DATA}/effects`);
  if (!winterLoad && (all || clock.t > 3 * 3600)) winterLoad = fx.loadWinter(`${DATA}/effects`, scenario);
  return Promise.all([earlyEffects, tsunamiLoad, winterLoad]);
}
let effectsReady: Promise<unknown> = earlyEffects;
if (initial.preset) {
  const p = poiById(initial.preset);
  if (p) goToPlace(p, false);
}
if (initial.query) {
  // Show the shared location once the data it summarises has arrived.
  effectsReady = ensureEffectData(true);
  void effectsReady.then(() => setTimeout(() => setQuery(initial.query!, initial.queryName ?? null), 300));
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
const fogColor = new Vector3();
/** Bring every time-dependent system up to the clock and draw one frame. */
function renderNow(dt = 0): void {
  if (mode === 'cine') cine.apply(clock.t, camera);
  else controls.update(dt);
  updateSun(sun);
  asteroid.update(clock.t, sun);
  fx.update(clock.t);
  fx.updateCamera(camera.position, sun, 1);
  sky.update(camera, sun, fx.meanLight, 0, renderer.getPixelRatio());
  globe.update(camera, sun, 1, 0, renderer.domElement.height);
  {
    // Haze colour for plants: sky blue scaled by how high the Sun is here and how much light gets through.
    const up = camera.position.clone().normalize();
    const day = Math.min(1, Math.max(0, up.dot(sun) + 0.15));
    fogColor.set(0.34, 0.44, 0.58).multiplyScalar(day * fx.meanLight);
  }
  vegetation.update(camera, fogColor);
  herds.update(camera, clock.t, clock.rate(), fogColor);
  renderer.render(scene, camera);
  if (plume.update(clock.t, camera, sun, fx.meanLight)) plume.render(renderer, camera);
  timeline.update();
  topbar.setTimeLapse(timeLapseLighting > 0.5);
  const range = mode === 'free' ? controls.pose.range : camera.position.length() - EARTH_RADIUS;
  markers.update(camera, window.innerWidth, window.innerHeight, range < 6_000_000);
}
// ── adaptive resolution ──────────────────────────────────────────────────────
// Hold ~60 fps by trading pixel ratio (1 … the tier's maximum) against frame time.
let frameMs = 16;
let lastScale = 0;
function adaptResolution(now: number, dtMs: number): void {
  if (dtMs > 0 && dtMs < 250) frameMs = frameMs * 0.95 + dtMs * 0.05;
  if (now - lastScale < 1500) return;
  const pr = renderer.getPixelRatio();
  const max = Math.min(window.devicePixelRatio, settings.maxPixelRatio);
  let next = pr;
  if (frameMs > 19 && pr > 1) next = Math.max(1, pr - 0.25);
  else if (frameMs < 12.5 && pr < max) next = Math.min(max, pr + 0.25);
  if (next !== pr) {
    renderer.setPixelRatio(next);
    renderer.setSize(window.innerWidth, window.innerHeight);
    lastScale = now;
  }
}

let last = performance.now();
let lastPanelRefresh = 0;
function frame(now: number): void {
  adaptResolution(now, now - last);
  const dt = Math.min(0.25, (now - last) / 1000); // cap: no huge jump after a background tab
  last = now;
  clock.tick(dt);
  void ensureEffectData();
  sound.update(clock.t, clock.rate(), clock.playing);
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
      fx: ImpactEffects; clock: Clock; timeline: TimelineBar; panel: InfoPanel; share: ShareSheet; tier: string; asteroid: Asteroid; vegetation: Vegetation; herds: Herds;
      mode: () => 'cine' | 'free';
      renderNow: (dt?: number) => void; setQuery: (p: LatLon | null) => void; effectsReady: () => Promise<unknown>;
    };
  }
}
window.__kt = {
  renderer, scene, camera, controls, globe, sky, fx, clock, timeline, panel, share, tier, asteroid, vegetation, herds, mode: () => mode,
  renderNow, setQuery, effectsReady: () => ensureEffectData(true),
};
