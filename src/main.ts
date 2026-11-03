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