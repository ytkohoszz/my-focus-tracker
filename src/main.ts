import { Plugin, TFile, Notice } from "obsidian";
import { FocusTrackerModal } from "./focus-modal";
import {
  ActiveFocusSession,
  DailyGoalItem,
  DEFAULT_SETTINGS,
  FocusTrackerSettings,
  OpenFocusModalOptions,
  TodayFocusContext,
} from "./types";

const SESSION_STORAGE_KEY = "mft_active_focus_session_v1";
const FOCUS_LINE_REGEX =
  /^-\s*\(время::\s*([^)]+)\)\s*\(длительность_мин::\s*(\d+(?:[.,]\d+)?)\)\s*\(проект::\s*([^)]+)\)/;

export function getLocalDateISO(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getLocalTimeHHMM(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function extractISODate(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const y = raw.getFullYear();
    const m = String(raw.getMonth() + 1).padStart(2, "0");
    const d = String(raw.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(raw).trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

export default class MyFocusTrackerPlugin extends Plugin {
  public settings: FocusTrackerSettings = DEFAULT_SETTINGS;
  public session: ActiveFocusSession = {
    isRunning: false,
    project: "3D",
    durationMinutes: 45,
    startAt: 0,
    endAt: null,
  };
  private bgWatchInterval: number | null = null;
  private isFinishingSession = false;

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
      },
    });

    // Фоновая проверка истечения фиксированного таймера (даже если модальное окно закрыто)
    this.bgWatchInterval = window.setInterval(() => {
      if (
        this.session.isRunning &&
        this.session.endAt !== null &&
        Date.now() >= this.session.endAt
      ) {
        void this.completeCurrentSession();
      }
    }, 1000);

    (window as unknown as Record<string, unknown>).__myFocusTracker = this;
  }

  onunload(): void {
    if (this.bgWatchInterval !== null) {
      window.clearInterval(this.bgWatchInterval);
      this.bgWatchInterval = null;
    }
    delete (window as unknown as Record<string, unknown>).__myFocusTracker;
  }

  public openFocusModal(options: OpenFocusModalOptions = {}): void {
    new FocusTrackerModal(this.app, this, options).open();
  }

  public loadSessionState(): void {
    try {
      const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<ActiveFocusSession>;
        if (parsed && typeof parsed === "object") {
          this.session = { ...this.session, ...parsed };
        }
      }
    } catch {
      // Игнорируем ошибки чтения localStorage
    }
  }

  public saveSessionState(): void {
    try {
      window.localStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify(this.session)
      );
    } catch {
      // Игнорируем ошибки записи localStorage
    }
  }

  async loadSettingsData(): Promise<void> {
    const loaded = (await this.loadData()) as Partial<FocusTrackerSettings> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded ?? {});
  }

  async saveSettingsData(): Promise<void> {
    await this.saveData(this.settings);
  }

  public playNotificationBeep(): void {
    if (!this.settings.soundEnabled) return;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      const playTone = (freq: number, start: number, dur: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, ctx.currentTime + start);

        gain.gain.setValueAtTime(0.01, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(
          0.18,
          ctx.currentTime + start + 0.04
        );
        gain.gain.exponentialRampToValueAtTime(
          0.001,
          ctx.currentTime + start + dur
        );

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + dur);
      };

      playTone(587.33, 0.0, 0.16); // D5
      playTone(880.0, 0.2, 0.28); // A5
    } catch {
      // Игнорируем ограничения автовоспроизведения браузера
    }
  }

  /**
   * Находит заметку сегодняшнего дня в папке «Ежедневник» (поддерживает вложенные папки ГГГГ/ММ - месяц).
   */
  public findTodayDailyNote(): TFile | null {
    const todayISO = getLocalDateISO();
    const files = this.app.vault
      .getMarkdownFiles()
      .filter((f) => f.path.startsWith("Ежедневник/"));

    let bestMatch: TFile | null = null;
    for (const f of files) {
      const cache = this.app.metadataCache.getFileCache(f);
      const fmDate = extractISODate(cache?.frontmatter?.["дата"]);
      const isMatch = f.basename === todayISO || fmDate === todayISO;
      if (isMatch) {
        if (!bestMatch || f.stat.mtime > bestMatch.stat.mtime) {
          bestMatch = f;
        }
      }
    }
    return bestMatch;
  }

  /**
   * Извлекает список целей дня (`цели_дня`) и накопленные минуты фокуса по каждой задаче за сегодня.
   */
  public async getTodayFocusContext(): Promise<TodayFocusContext> {
    const file = this.findTodayDailyNote();
    if (!file) {
      return { file: null, goals: [], totalsByGoal: {}, totalMinutes: 0 };
    }

    const cache = this.app.metadataCache.getFileCache(file);
    const fm = (cache?.frontmatter ?? {}) as Record<string, unknown>;

    const totalsByGoal: Record<string, number> = {};

    // 1. Читаем словарь `фокус_по_целям` из frontmatter (если уже есть)
    const rawFocusMap = fm["фокус_по_целям"];
    if (rawFocusMap && typeof rawFocusMap === "object" && !Array.isArray(rawFocusMap)) {
      for (const [k, v] of Object.entries(rawFocusMap as Record<string, unknown>)) {
        const num = Number(v);
        if (k.trim() && Number.isFinite(num) && num > 0) {
          totalsByGoal[k.trim()] = Math.round(num);
        }
      }
    }

    // 2. Парсим строки из секции `## Фокус` (для обратной совместимости с прошлыми записями за день)
    try {
      const content = await this.app.vault.read(file);
      const parsedFromBody: Record<string, number> = {};
      for (const line of content.split(/\r?\n/)) {
        const m = line.trim().match(FOCUS_LINE_REGEX);
        if (!m) continue;
        const mins = Math.round(Number((m[2] ?? "0").replace(",", ".")));
        const proj = (m[3] ?? "").trim();
        if (proj && Number.isFinite(mins) && mins > 0) {
          parsedFromBody[proj] = (parsedFromBody[proj] ?? 0) + mins;
        }
      }
      for (const [proj, mins] of Object.entries(parsedFromBody)) {
        totalsByGoal[proj] = Math.max(totalsByGoal[proj] ?? 0, mins);
      }
    } catch {
      // Игнорируем ошибку чтения файла
    }

    // 3. Читаем список `цели_дня` из frontmatter
    const goals: DailyGoalItem[] = [];
    const rawGoals = Array.isArray(fm["цели_дня"]) ? fm["цели_дня"] : [];

    for (const g of rawGoals) {
      if (typeof g === "string" && g.trim()) {
        const text = g.trim();
        goals.push({
          text,
          category: "",
          progress: 0,
          loggedMinutes: totalsByGoal[text] ?? 0,
        });
      } else if (g && typeof g === "object") {
        const obj = g as Record<string, unknown>;
        const text = String(obj["text"] ?? "").trim();
        if (!text) continue;
        const category = obj["category"] ? String(obj["category"]).trim() : "";
        const progress = Math.max(0, Math.min(100, Number(obj["progress"]) || 0));
        const fmGoalMin = Number(obj["focus_minutes"]) || 0;
        const loggedMinutes = Math.max(totalsByGoal[text] ?? 0, Math.round(fmGoalMin));
        if (loggedMinutes > 0) {
          totalsByGoal[text] = loggedMinutes;
        }
        goals.push({ text, category, progress, loggedMinutes });
      }
    }

    const totalMinutes = Object.values(totalsByGoal).reduce((a, b) => a + b, 0);
    return { file, goals, totalsByGoal, totalMinutes };
  }

  /**
   * Завершает текущую активную сессию, начисляет время в заметку дня и сбрасывает таймер.
   */
  public async completeCurrentSession(): Promise<{
    project: string;
    elapsedMinutes: number;
    elapsedHours: number;
    goalTotalMinutes: number;
  } | null> {
    if (!this.session.isRunning || this.isFinishingSession) return null;
    this.isFinishingSession = true;

    try {
      const s = this.session;
      const elapsedMs = Math.max(0, Date.now() - s.startAt);
      const elapsedMinutes = Math.max(1, Math.round(elapsedMs / (60 * 1000)));
      const elapsedHours = Math.round((elapsedMinutes / 60) * 10) / 10;
      const project = s.project.trim() || this.settings.defaultProject || "Фокус";

      this.playNotificationBeep();

      this.session = {
        isRunning: false,
        project,
        durationMinutes: s.durationMinutes,
        startAt: 0,
        endAt: null,
      };
      this.saveSessionState();

      const goalTotalMinutes = await this.logSessionToDailyNote(
        project,
        elapsedMinutes
      );

      new Notice(
        `🎉 Фокус «${project}»: +${elapsedMinutes} мин (всего за день по цели: ${goalTotalMinutes} мин)`
      );

      return { project, elapsedMinutes, elapsedHours, goalTotalMinutes };
    } finally {
      this.isFinishingSession = false;
    }
  }

  /**
   * Записывает результат сессии в YAML frontmatter и в секцию `## Фокус` сегодняшней заметки.
   * Возвращает суммарное количество минут по данной цели за сегодня.
   */
  public async logSessionToDailyNote(
    project: string,
    minutes: number
  ): Promise<number> {
    const nowTimeStr = getLocalTimeHHMM();
    const cleanProject = project.trim() || "Фокус";
    const addMin = Math.max(1, Math.round(minutes));

    const ctx = await this.getTodayFocusContext();
    const targetFile = ctx.file;

    if (!targetFile) {
      new Notice(
        "Заметка на сегодня в папке «Ежедневник» не найдена. Создай запись дня."
      );
      return addMin;
    }

    const prevGoalMin = ctx.totalsByGoal[cleanProject] ?? 0;
    const nextGoalMin = prevGoalMin + addMin;

    const updatedTotals: Record<string, number> = {
      ...ctx.totalsByGoal,
      [cleanProject]: nextGoalMin,
    };
    const totalDayMinutes = Object.values(updatedTotals).reduce(
      (acc, val) => acc + val,
      0
    );
    const totalDayHours = Math.round((totalDayMinutes / 60) * 10) / 10;

    // 1. Атомарно обновляем frontmatter через processFrontMatter
    try {
      await this.app.fileManager.processFrontMatter(
        targetFile,
        (fm: Record<string, unknown>) => {
          fm["глубокая_работа_часов"] = totalDayHours;
          fm["глубокая_работа_мин"] = totalDayMinutes;
          fm["фокус_по_целям"] = updatedTotals;

          // Если название совпадает с задачей в `цели_дня`, сохраняем накопленные минуты и внутри объекта цели
          if (Array.isArray(fm["цели_дня"])) {
            for (const item of fm["цели_дня"]) {
              if (item && typeof item === "object") {
                const goalObj = item as Record<string, unknown>;
                const gText = String(goalObj["text"] ?? "").trim();
                if (gText.toLowerCase() === cleanProject.toLowerCase()) {
                  goalObj["focus_minutes"] = nextGoalMin;
                }
              }
            }
          }
        }
      );
    } catch (e) {
      console.error("Error updating frontmatter focus stats:", e);
    }

    // 2. Дописываем строку сессии в раздел ## Фокус
    try {
      const content = await this.app.vault.read(targetFile);
      const lineToAdd = `- (время:: ${nowTimeStr}) (длительность_мин:: ${addMin}) (проект:: ${cleanProject})`;

      if (/^##\s+Фокус\s*$/m.test(content)) {
        const updated = content.replace(
          /^##\s+Фокус\s*$/m,
          `## Фокус\n${lineToAdd}`
        );
        await this.app.vault.modify(targetFile, updated);
      } else {
        const trimmedEnd = content.replace(/\s+$/, "");
        const updated = `${trimmedEnd}\n\n## Фокус\n${lineToAdd}\n`;
        await this.app.vault.modify(targetFile, updated);
      }
    } catch (e) {
      console.error("Error logging focus bullet:", e);
    }

    return nextGoalMin;
  }
}