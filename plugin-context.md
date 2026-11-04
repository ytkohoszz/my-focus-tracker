# Plugin Context

## manifest.json
```json
{
  "id": "my-focus-tracker",
  "name": "Focus Tracker",
  "version": "0.1.0",
  "minAppVersion": "1.4.0",
  "description": "Таймер глубокой работы и сессий фокуса с автоматической записью времени в ежедневник.",
  "author": "Mersinho Hecke",
  "isDesktopOnly": false
}
```

## versions.json
```json
{
	"1.0.0": "1.0.0"
}

```

## package.json
```json
{
  "name": "obsidian-sample-plugin",
  "version": "1.0.0",
  "description": "This is a sample plugin for Obsidian (https://obsidian.md)",
  "main": "main.js",
  "type": "module",
  "scripts": {
    "dev": "node esbuild.config.mjs",
    "build": "tsc -noEmit -skipLibCheck && node esbuild.config.mjs production",
    "version": "node version-bump.mjs && git add manifest.json versions.json",
    "lint": "eslint .",
    "pack": "node -e 'import(\"fs\").then(fs => { const files = [\"manifest.json\", \"versions.json\", \"package.json\", \"styles.css\"]; const walk = d => fs.existsSync(d) && fs.readdirSync(d, { withFileTypes: true }).forEach(e => { const p = `${d}/${e.name}`; e.isDirectory() ? walk(p) : files.push(p); }); walk(\"src\"); let out = \"# Plugin Context\\n\"; for (const f of files) { if (fs.existsSync(f)) { const ext = f.split(\".\").pop(); out += `\\n## ${f}\\n\\`\\`\\`${ext}\\n${fs.readFileSync(f, \"utf8\")}\\n\\`\\`\\`\\n`; } } fs.writeFileSync(\"plugin-context.md\", out); console.log(\"Done: plugin-context.md\"); })'"
  },
  "keywords": [],
  "license": "0-BSD",
  "devDependencies": {
    "@eslint/js": "^9.39.4",
    "@types/node": "^22.15.17",
    "esbuild": "0.25.5",
    "eslint": "^9.39.4",
    "eslint-plugin-obsidianmd": "^0.4.0",
    "globals": "^17.6.0",
    "jiti": "^2.6.1",
    "obsidian": "latest",
    "typescript": "^5.8.3",
    "typescript-eslint": "^8.59.1"
  }
}
```

## styles.css
```css
.modal.mod-focus-tracker {
  width: 90vw !important;
  max-width: 460px !important;
  padding: 20px 24px !important;
  border-radius: 14px !important;
  background: var(--background-secondary) !important;
  border: 1px solid var(--background-modifier-border) !important;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45) !important;
}

.mft-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--background-modifier-border);
}

.mft-head h2 {
  margin: 0 !important;
  font-size: 1.15rem;
}

.mft-timer-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 18px 0;
  margin-bottom: 14px;
  border-radius: 12px;
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
}

.mft-time-digits {
  font-size: 3.2rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
  color: var(--text-normal);
  line-height: 1.1;
}

.mft-time-sub {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
  margin-top: 6px;
}

.mft-presets-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}

.mft-preset-btn {
  min-height: 44px;
  min-width: 68px;
  padding: 0 10px;
  border-radius: 8px;
  font-size: 0.82rem;
  font-weight: 650;
  cursor: pointer;
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
  color: var(--text-muted);
  transition: all 0.14s ease;
}

.mft-preset-btn:hover {
  border-color: var(--interactive-accent);
  color: var(--text-normal);
}

.mft-preset-btn.is-active {
  background: color-mix(in srgb, var(--interactive-accent) 20%, var(--background-primary));
  border-color: var(--interactive-accent);
  color: var(--text-normal);
}

.mft-input-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
}

.mft-input-label {
  font-size: 0.74rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.mft-project-input {
  height: 40px !important;
  font-size: 0.88rem !important;
  border-radius: 8px !important;
  background: var(--background-primary) !important;
  border: 1px solid var(--background-modifier-border) !important;
  color: var(--text-normal) !important;
  padding: 0 12px !important;
}

.mft-actions-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mft-btn-main {
  flex: 2;
  min-height: 46px;
  height: 46px;
  font-size: 0.92rem;
  font-weight: 700;
  border-radius: 10px;
  cursor: pointer;
}

.mft-btn-sec {
  flex: 1;
  min-height: 46px;
  height: 46px;
  font-size: 0.85rem;
  font-weight: 600;
  border-radius: 10px;
  cursor: pointer;
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
  color: var(--text-normal);
}

.mft-btn-sec.is-danger {
  color: #d85b57;
  border-color: rgba(216, 91, 87, 0.4);
}
```

## src/focus-modal.ts
```ts
import { App, Modal, Notice } from "obsidian";
import type MyFocusTrackerPlugin from "./main";

export class FocusTrackerModal extends Modal {
  private plugin: MyFocusTrackerPlugin;
  private timerInterval: number | null = null;
  private selectedDuration: number = 45; // мин
  private projectInput!: HTMLInputElement;
  private digitsEl!: HTMLElement;
  private subEl!: HTMLElement;
  private startBtn!: HTMLButtonElement;
  private cancelBtn!: HTMLButtonElement;

  constructor(app: App, plugin: MyFocusTrackerPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen(): void {
    const { contentEl, modalEl } = this;
    modalEl.addClass("mod-focus-tracker");
    contentEl.empty();

    const head = contentEl.createDiv({ cls: "mft-head" });
    head.createEl("h2", { text: "⏱️ Глубокая работа и фокус" });

    // Таймер дисплей
    const display = contentEl.createDiv({ cls: "mft-timer-display" });
    this.digitsEl = display.createDiv({ cls: "mft-time-digits", text: "45:00" });
    this.subEl = display.createDiv({ cls: "mft-time-sub", text: "Готов к запуску сессии" });

    // Пресеты времени
    const presetsRow = contentEl.createDiv({ cls: "mft-presets-row" });
    const presets = [
      { min: 25, label: "25 мин" },
      { min: 45, label: "45 мин" },
      { min: 60, label: "60 мин" },
      { min: 90, label: "90 мин" },
      { min: 0, label: "Секундомер" }
    ];

    presets.forEach(p => {
      const isAct = this.selectedDuration === p.min;
      const b = presetsRow.createEl("button", {
        cls: `mft-preset-btn ${isAct ? "is-active" : ""}`,
        text: p.label,
        attr: { type: "button" }
      });
      b.onclick = () => {
        if (this.plugin.session.isRunning) return;
        this.selectedDuration = p.min;
        presetsRow.querySelectorAll(".mft-preset-btn").forEach(btn => btn.classList.remove("is-active"));
        b.classList.add("is-active");
        this.updateDisplay();
      };
    });

    // Поле фокус-проекта
    const inputGroup = contentEl.createDiv({ cls: "mft-input-group" });
    inputGroup.createSpan({ cls: "mft-input-label", text: "Проект / задача" });
    this.projectInput = inputGroup.createEl("input", {
      cls: "mft-project-input",
      attr: { type: "text", placeholder: "3D / Магистратура / Английский / Код" }
    });
    this.projectInput.value = this.plugin.session.project || this.plugin.settings.defaultProject;
    this.projectInput.oninput = () => {
      this.plugin.session.project = this.projectInput.value.trim() || "Фокус";
    };

    // Кнопки управления
    const actionsRow = contentEl.createDiv({ cls: "mft-actions-row" });

    this.startBtn = actionsRow.createEl("button", {
      cls: "mft-btn-main mod-cta",
      text: this.plugin.session.isRunning ? "Завершить сессию" : "Старт сессии",
      attr: { type: "button" }
    });
    this.startBtn.onclick = () => this.handleStartToggle();

    this.cancelBtn = actionsRow.createEl("button", {
      cls: "mft-btn-sec is-danger",
      text: "Сброс",
      attr: { type: "button" }
    });
    this.cancelBtn.onclick = () => this.handleReset();

    this.updateDisplay();
    this.startTicker();
  }

  private updateDisplay(): void {
    const s = this.plugin.session;
    if (s.isRunning) {
      if (s.endAt !== null) {
        // Режим обратного отсчета
        const remSec = Math.max(0, Math.ceil((s.endAt - Date.now()) / 1000));
        const mm = String(Math.floor(remSec / 60)).padStart(2, "0");
        const ss = String(remSec % 60).padStart(2, "0");
        this.digitsEl.setText(`${mm}:${ss}`);
        this.subEl.setText(`Фокус: ${s.project} · Осталось ${mm} мин`);
        this.startBtn.setText("Завершить и сохранить");
      } else {
        // Режим секундомера
        const elSec = Math.max(0, Math.floor((Date.now() - s.startAt) / 1000));
        const mm = String(Math.floor(elSec / 60)).padStart(2, "0");
        const ss = String(elSec % 60).padStart(2, "0");
        this.digitsEl.setText(`${mm}:${ss}`);
        this.subEl.setText(`Секундомер: ${s.project} · Прошло ${mm} мин`);
        this.startBtn.setText("Остановить и сохранить");
      }
    } else {
      if (this.selectedDuration > 0) {
        this.digitsEl.setText(`${String(this.selectedDuration).padStart(2, "0")}:00`);
        this.subEl.setText("Готов к запуску сессии");
      } else {
        this.digitsEl.setText("00:00");
        this.subEl.setText("Свободный секундомер");
      }
      this.startBtn.setText("Старт сессии");
    }
  }

  private startTicker(): void {
    if (this.timerInterval !== null) window.clearInterval(this.timerInterval);
    this.timerInterval = window.setInterval(() => {
      this.updateDisplay();
      if (this.plugin.session.isRunning && this.plugin.session.endAt !== null) {
        if (Date.now() >= this.plugin.session.endAt) {
          this.handleFinishTimer();
        }
      }
    }, 500);
  }

  private handleStartToggle(): void {
    if (this.plugin.session.isRunning) {
      this.handleFinishTimer();
    } else {
      const project = this.projectInput.value.trim() || this.plugin.settings.defaultProject;
      const durationMs = this.selectedDuration * 60 * 1000;
      this.plugin.session = {
        isRunning: true,
        project,
        durationMinutes: this.selectedDuration,
        startAt: Date.now(),
        endAt: this.selectedDuration > 0 ? Date.now() + durationMs : null
      };
      this.plugin.saveSessionState();
      this.updateDisplay();
      new Notice(`Фокус-сессия «${project}» запущена.`);
    }
  }

  private async handleFinishTimer(): Promise<void> {
    const s = this.plugin.session;
    if (!s.isRunning) return;

    const elapsedMs = Date.now() - s.startAt;
    const elapsedMinutes = Math.max(1, Math.round(elapsedMs / (60 * 1000)));
    const elapsedHours = Math.round((elapsedMinutes / 60) * 10) / 10;

    this.plugin.playNotificationBeep();

    // Запись в ежедневник
    await this.plugin.logSessionToDailyNote(s.project, elapsedMinutes, elapsedHours);

    this.plugin.session = {
      isRunning: false,
      project: s.project,
      durationMinutes: this.selectedDuration,
      startAt: 0,
      endAt: null
    };
    this.plugin.saveSessionState();
    this.updateDisplay();

    new Notice(`🎉 Сессия завершена: +${elapsedMinutes} мин (+${elapsedHours} ч) записано в ежедневник!`);
  }

  private handleReset(): void {
    this.plugin.session = {
      isRunning: false,
      project: this.projectInput.value.trim() || this.plugin.settings.defaultProject,
      durationMinutes: this.selectedDuration,
      startAt: 0,
      endAt: null
    };
    this.plugin.saveSessionState();
    this.updateDisplay();
  }

  onClose(): void {
    if (this.timerInterval !== null) {
      window.clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.contentEl.empty();
  }
}
```

## src/main.ts
```ts
import { Plugin, TFile, Notice } from "obsidian";
import { FocusTrackerModal } from "./focus-modal";
import { ActiveFocusSession, FocusTrackerSettings, DEFAULT_SETTINGS } from "./types";

const SESSION_STORAGE_KEY = "mft_active_focus_session_v1";

function getLocalDateISO(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getLocalTimeHHMM(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export default class MyFocusTrackerPlugin extends Plugin {
  public settings: FocusTrackerSettings = DEFAULT_SETTINGS;
  public session: ActiveFocusSession = {
    isRunning: false,
    project: "3D",
    durationMinutes: 45,
    startAt: 0,
    endAt: null
  };

  async onload(): Promise<void> {
    await this.loadSettingsData();
    this.loadSessionState();

    this.addRibbonIcon("clock", "Фокус-таймер глубокой работы", () => {
      this.openFocusModal();
    });

    this.addCommand({
      id: "open-focus-tracker-modal",
      name: "Фокус: Открыть таймер глубокой работы",
      callback: () => {
        this.openFocusModal();
      }
    });

    (window as unknown as Record<string, unknown>).__myFocusTracker = this;
  }

  onunload(): void {
    delete (window as unknown as Record<string, unknown>).__myFocusTracker;
  }

  public openFocusModal(): void {
    new FocusTrackerModal(this.app, this).open();
  }

  public loadSessionState(): void {
    try {
      const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          this.session = { ...this.session, ...parsed };
        }
      }
    } catch {}
  }

  public saveSessionState(): void {
    try {
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(this.session));
    } catch {}
  }

  async loadSettingsData(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) || {});
  }

  async saveSettingsData(): Promise<void> {
    await this.saveData(this.settings);
  }

  public playNotificationBeep(): void {
    if (!this.settings.soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      const playTone = (freq: number, start: number, dur: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, ctx.currentTime + start);

        gain.gain.setValueAtTime(0.01, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + start + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + dur);
      };

      playTone(587.33, 0.0, 0.16); // D5
      playTone(880.00, 0.2, 0.28); // A5
    } catch {}
  }

  public async logSessionToDailyNote(project: string, minutes: number, hours: number): Promise<void> {
    const todayISO = getLocalDateISO();
    const nowTimeStr = getLocalTimeHHMM();

    // Ищем заметку сегодняшнего дня в папке «Ежедневник»
    const files = this.app.vault.getMarkdownFiles().filter(f => f.path.startsWith("Ежедневник/"));
    let targetFile: TFile | null = null;

    for (const f of files) {
      if (f.basename === todayISO) {
        targetFile = f;
        break;
      }
      const cache = this.app.metadataCache.getFileCache(f);
      if (cache?.frontmatter?.["дата"] === todayISO) {
        targetFile = f;
        break;
      }
    }

    if (!targetFile) {
      new Notice("Заметка на сегодня в папке «Ежедневник» не найдена. Создай запись дня.");
      return;
    }

    // 1. Обновляем frontmatter: глубокая_работа_часов
    try {
      await this.app.fileManager.processFrontMatter(targetFile, fm => {
        const curH = typeof fm["глубокая_работа_часов"] === "number" ? fm["глубокая_работа_часов"] : 0;
        fm["глубокая_работа_часов"] = Math.round((curH + hours) * 10) / 10;
      });
    } catch (e) {
      console.log("Error updating frontmatter focus hours:", e);
    }

    // 2. Дописываем строчку сессии в раздел ## Фокус
    try {
      const content = await this.app.vault.read(targetFile);
      const lineToAdd = `- (время:: ${nowTimeStr}) (длительность_мин:: ${minutes}) (проект:: ${project})`;

      if (content.includes("## Фокус")) {
        const updated = content.replace("## Фокус", `## Фокус\n${lineToAdd}`);
        await this.app.vault.modify(targetFile, updated);
      } else {
        const updated = content + `\n\n## Фокус\n${lineToAdd}\n`;
        await this.app.vault.modify(targetFile, updated);
      }
    } catch (e) {
      console.log("Error logging focus bullet:", e);
    }
  }
}
```

## src/types.ts
```ts
export interface ActiveFocusSession {
  isRunning: boolean;
  project: string;
  durationMinutes: number; // 0 для секундомера
  startAt: number; // timestamp
  endAt: number | null; // null для секундомера
}

export interface FocusTrackerSettings {
  defaultProject: string;
  soundEnabled: boolean;
}

export const DEFAULT_SETTINGS: FocusTrackerSettings = {
  defaultProject: "3D",
  soundEnabled: true
};
```
