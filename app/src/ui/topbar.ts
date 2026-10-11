/** Title, science overlay toggle, impact-winter scenario (contested), About. */
import { WINTER_LOOK, type WinterScenario } from '../effects/impact-effects';

export class TopBar {
  readonly root: HTMLElement;
  onOverlay: ((on: boolean) => void) | null = null;
  onScenario: ((s: WinterScenario) => void) | null = null;
  onAbout: (() => void) | null = null;
  onCinematic: (() => void) | null = null;
  private readonly cineBtn: HTMLButtonElement;
  private readonly overlayBtn: HTMLButtonElement;
  private readonly scenarioSel: HTMLSelectElement;
  private readonly lapse: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('header');
    this.root.className = 'kt-top-bar';
    const options = (Object.keys(WINTER_LOOK) as WinterScenario[])
      .map((k) => `<option value="${k}" title="${WINTER_LOOK[k].label}">${WINTER_LOOK[k].short}</option>`)
      .join('');
    this.root.innerHTML = `
      <div class="kt-title"><b>K–T Extinction Simulator</b><span>The Chicxulub impact, minute by minute</span></div>
      <div class="kt-tools">
        <span class="kt-lapse" hidden title="Days pass faster than frames: the Sun is held over your shoulder instead of following the real day–night cycle.">Time-lapse lighting</span>
        <label class="kt-scenario" title="Which particles darkened the sky is debated (Tabor et al. 2020 ran all three).">
          <span>Darkening agent</span>
          <select aria-label="Impact winter scenario">${options}</select>
          <span class="kt-chip kt-chip-contested">Contested</span>
        </label>
        <button type="button" class="kt-tool" aria-pressed="true" data-testid="cinematic-toggle" title="Follow the scripted camera; drag the globe to take over">Cinematic</button>
        <button type="button" class="kt-tool" aria-pressed="false" data-testid="overlay-toggle" title="Show fronts: air blast, earthquake, ejecta, tsunami (O)">Overlay</button>
        <button type="button" class="kt-tool" data-testid="about" title="About the data">About</button>
      </div>`;
    parent.append(this.root);
    this.overlayBtn = this.root.querySelector('[data-testid="overlay-toggle"]')!;
    this.scenarioSel = this.root.querySelector('select')!;
    this.lapse = this.root.querySelector('.kt-lapse')!;
    this.cineBtn = this.root.querySelector('[data-testid="cinematic-toggle"]')!;
    this.cineBtn.addEventListener('click', () => this.onCinematic?.());
    this.overlayBtn.addEventListener('click', () => {
      const on = this.overlayBtn.getAttribute('aria-pressed') !== 'true';
      this.setOverlay(on);
      this.onOverlay?.(on);
    });
    this.scenarioSel.addEventListener('change', () => this.onScenario?.(this.scenarioSel.value as WinterScenario));
    this.root.querySelector('[data-testid="about"]')!.addEventListener('click', () => this.onAbout?.());
  }

  setOverlay(on: boolean): void {
    this.overlayBtn.setAttribute('aria-pressed', String(on));
  }

  setCinematic(on: boolean): void {
    this.cineBtn.setAttribute('aria-pressed', String(on));
  }

  setScenario(s: WinterScenario): void {
    this.scenarioSel.value = s;
  }

  setTimeLapse(on: boolean): void {
    if (this.lapse.hidden === on) this.lapse.hidden = !on;
  }
}
