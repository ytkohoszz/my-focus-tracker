import { App, Modal, Notice } from "obsidian";
import type MyFocusTrackerPlugin from "./main";
import type { OpenFocusModalOptions, TodayFocusContext } from "./types";

export class FocusTrackerModal extends Modal {
  private plugin: MyFocusTrackerPlugin;
  private options: OpenFocusModalOptions;
  private timerInterval: number | null = null;
  private selectedDuration = 45; // 25, 45, 60, 90 или 0 (Секундомер)
  private todayCtx: TodayFocusContext = {
    file: null,
    goals: [],
    totalsByGoal: {},
    totalMinutes: 0,
  };

  private projectInput!: HTMLInputElement;
  private digitsEl!: HTMLElement;
  private subEl!: HTMLElement;
  private goalsContainerEl!: HTMLElement;
  private todayStatsEl!: HTMLElement;
  private startBtn!: HTMLButtonElement;
  private cancelBtn!: HTMLButtonElement;
  private presetsRowEl!: HTMLElement;

  constructor(
    app: App,
    plugin: MyFocusTrackerPlugin,
    options: OpenFocusModalOptions = {}
  ) {
    super(app);
    this.plugin = plugin;
    this.options = options;
    if (this.plugin.session.isRunning) {
      this.selectedDuration = this.plugin.session.durationMinutes;
    }
  }

  async onOpen(): Promise<void> {
    const { contentEl, modalEl } = this;
    modalEl.addClass("mod-focus-tracker");
    contentEl.empty();

    const head = contentEl.createDiv({ cls: "mft-head" });
    head.createEl("h2", { text: "⏱️ Глубокая работа и фокус" });
    this.todayStatsEl = head.createSpan({ cls: "mft-head-badge" });

    // Дисплей таймера
    const display = contentEl.createDiv({ cls: "mft-timer-display" });
    this.digitsEl = display.createDiv({
      cls: "mft-time-digits",
      text: "45:00",
    });
    this.subEl = display.createDiv({
      cls: "mft-time-sub",
      text: "Готов к запуску сессии",
    });

    // Пресеты времени (25 / 45 / 60 / 90 мин + бесконечный Секундомер)
    this.presetsRowEl = contentEl.createDiv({ cls: "mft-presets-row" });
    const presets = [
      { min: 25, label: "25 мин" },
      { min: 45, label: "45 мин" },
      { min: 60, label: "60 мин" },
      { min: 90, label: "90 мин" },
      { min: 0, label: "∞ Секундомер" },
    ];

    presets.forEach((p) => {
      const isAct = this.selectedDuration === p.min;
      const b = this.presetsRowEl.createEl("button", {
        cls: `mft-preset-btn ${isAct ? "is-active" : ""}`,
        text: p.label,
        attr: { type: "button" },
      });
      b.onclick = () => {
        if (this.plugin.session.isRunning) return;
        this.selectedDuration = p.min;
        this.presetsRowEl
          .querySelectorAll(".mft-preset-btn")
          .forEach((btn) => btn.classList.remove("is-active"));
        b.classList.add("is-active");
        this.updateDisplay();
      };
    });

    // Секция выбора цели из ежедневной заметки
    const goalsGroup = contentEl.createDiv({ cls: "mft-goals-section" });
    const goalsHeader = goalsGroup.createDiv({ cls: "mft-goals-header" });
    goalsHeader.createSpan({
      cls: "mft-input-label",
      text: "Цели на сегодня (из ежедневника)",
    });
    this.goalsContainerEl = goalsGroup.createDiv({ cls: "mft-goals-chips" });

    // Поле ручного ввода задачи / проекта
    const inputGroup = contentEl.createDiv({ cls: "mft-input-group" });
    inputGroup.createSpan({
      cls: "mft-input-label",
      text: "Выбранная цель или произвольная задача",
    });
    this.projectInput = inputGroup.createEl("input", {
      cls: "mft-project-input",
      attr: {
        type: "text",
        placeholder: "Выбери цель выше или введи свою задачу (напр. Obsidian)…",
      },
    });

    const initialTarget =
      this.options.initialProject?.trim() ||
      this.plugin.session.project ||
      this.plugin.settings.defaultProject;
    this.projectInput.value = initialTarget;
    if (!this.plugin.session.isRunning) {
      this.plugin.session.project = initialTarget;
    }

    this.projectInput.oninput = () => {
      const val = this.projectInput.value.trim();
      if (!this.plugin.session.isRunning) {
        this.plugin.session.project = val || this.plugin.settings.defaultProject;
      }
      this.syncGoalChipHighlight();
      this.updateDisplay();
    };

    // Кнопки управления
    const actionsRow = contentEl.createDiv({ cls: "mft-actions-row" });

    this.startBtn = actionsRow.createEl("button", {
      cls: "mft-btn-main mod-cta",
      text: this.plugin.session.isRunning
        ? "Завершить и сохранить"
        : "Старт сессии",
      attr: { type: "button" },
    });
    this.startBtn.onclick = () => void this.handleStartToggle();

    this.cancelBtn = actionsRow.createEl("button", {
      cls: "mft-btn-sec is-danger",
      text: "Сброс",
      attr: { type: "button" },
    });
    this.cancelBtn.onclick = () => this.handleReset();

    await this.refreshTodayGoalsUI();
    this.updateDisplay();
    this.startTicker();
  }

  private async refreshTodayGoalsUI(): Promise<void> {
    this.todayCtx = await this.plugin.getTodayFocusContext();
    this.goalsContainerEl.empty();

    const totalH = Math.round((this.todayCtx.totalMinutes / 60) * 10) / 10;
    this.todayStatsEl.setText(
      this.todayCtx.totalMinutes > 0
        ? `За день: ${this.todayCtx.totalMinutes} мин (${totalH} ч)`
        : "За день: 0 мин"
    );

    if (!this.todayCtx.file) {
      this.goalsContainerEl.createDiv({
        cls: "mft-goals-empty",
        text: "Заметка на сегодня ещё не создана — введи задачу вручную ниже.",
      });
      return;
    }

    // Собираем список целей из `цели_дня` + задачи, по которым сегодня уже логировался фокус
    const seen = new Set<string>();
    const combinedChips: Array<{
      text: string;
      category: string;
      progress: number;
      minutes: number;
    }> = [];

    for (const g of this.todayCtx.goals) {
      seen.add(g.text.toLowerCase());
      combinedChips.push({
        text: g.text,
        category: g.category,
        progress: g.progress,
        minutes: g.loggedMinutes,
      });
    }

    for (const [projName, mins] of Object.entries(this.todayCtx.totalsByGoal)) {
      if (!seen.has(projName.toLowerCase())) {
        seen.add(projName.toLowerCase());
        combinedChips.push({
          text: projName,
          category: "",
          progress: 0,
          minutes: mins,
        });
      }
    }

    // Если при открытии окна не был передан проект и сессия не идёт, по умолчанию выбираем первую невыполненную цель дня
    if (
      !this.plugin.session.isRunning &&
      !this.options.initialProject &&
      combinedChips.length > 0 &&
      (!this.projectInput.value ||
        this.projectInput.value === this.plugin.settings.defaultProject)
    ) {
      const firstActiveGoal =
        combinedChips.find((c) => c.progress < 100) ?? combinedChips[0];
      if (firstActiveGoal) {
        this.projectInput.value = firstActiveGoal.text;
        this.plugin.session.project = firstActiveGoal.text;
      }
    }

    if (combinedChips.length === 0) {
      this.goalsContainerEl.createDiv({
        cls: "mft-goals-empty",
        text: "В заметке дня пока нет целей (`цели_дня`). Введи задачу в поле ниже.",
      });
      return;
    }

    for (const item of combinedChips) {
      const chip = this.goalsContainerEl.createEl("button", {
        cls: "mft-goal-chip",
        attr: { type: "button" },
      });
      chip.dataset.goalText = item.text;

      const titleSpan = chip.createSpan({
        cls: "mft-goal-chip-title",
        text: item.progress >= 100 ? `✓ ${item.text}` : `🎯 ${item.text}`,
      });
      if (item.progress >= 100) {
        titleSpan.addClass("is-done");
      }

      if (item.category) {
        chip.createSpan({
          cls: "mft-goal-chip-cat",
          text: item.category,
        });
      }

      if (item.minutes > 0) {
        chip.createSpan({
          cls: "mft-goal-chip-time",
          text: `${item.minutes} мин`,
        });
      }

      chip.onclick = () => {
        if (this.plugin.session.isRunning) return;
        this.projectInput.value = item.text;
        this.plugin.session.project = item.text;
        this.syncGoalChipHighlight();
        this.updateDisplay();
      };
    }

    // Кнопка быстрого перехода к вводу произвольной задачи
    const customChip = this.goalsContainerEl.createEl("button", {
      cls: "mft-goal-chip is-custom",
      text: "✍️ Своя задача…",
      attr: { type: "button" },
    });
    customChip.onclick = () => {
      if (this.plugin.session.isRunning) return;
      this.projectInput.value = "";
      this.projectInput.focus();
      this.syncGoalChipHighlight();
      this.updateDisplay();
    };

    this.syncGoalChipHighlight();
  }

  private syncGoalChipHighlight(): void {
    const curVal = this.projectInput?.value.trim().toLowerCase() ?? "";
    this.goalsContainerEl
      ?.querySelectorAll<HTMLButtonElement>(".mft-goal-chip")
      .forEach((btn) => {
        const goalText = (btn.dataset.goalText ?? "").toLowerCase();
        if (!goalText) {
          btn.classList.toggle(
            "is-active",
            curVal.length > 0 &&
              !Array.from(
                this.goalsContainerEl.querySelectorAll<HTMLButtonElement>(
                  ".mft-goal-chip[data-goal-text]"
                )
              ).some((b) => (b.dataset.goalText ?? "").toLowerCase() === curVal)
          );
        } else {
          btn.classList.toggle("is-active", goalText === curVal);
        }
      });
  }

  private updateDisplay(): void {
    const s = this.plugin.session;
    const currentTarget =
      (s.isRunning ? s.project : this.projectInput?.value.trim()) ||
      this.plugin.settings.defaultProject ||
      "Фокус";
    const alreadyLoggedMin = this.todayCtx.totalsByGoal[currentTarget] ?? 0;
    const loggedSuffix =
      alreadyLoggedMin > 0 ? ` · за день уже ${alreadyLoggedMin} мин` : "";

    if (this.projectInput) {
      this.projectInput.disabled = s.isRunning;
    }

    if (s.isRunning) {
      if (s.endAt !== null) {
        const remSec = Math.max(0, Math.ceil((s.endAt - Date.now()) / 1000));
        const mm = String(Math.floor(remSec / 60)).padStart(2, "0");
        const ss = String(remSec % 60).padStart(2, "0");
        this.digitsEl.setText(`${mm}:${ss}`);
        this.subEl.setText(
          `Фокус: ${s.project} · Осталось ${mm} мин${loggedSuffix}`
        );
        this.startBtn.setText("Завершить и сохранить");
      } else {
        const elSec = Math.max(0, Math.floor((Date.now() - s.startAt) / 1000));
        const mm = String(Math.floor(elSec / 60)).padStart(2, "0");
        const ss = String(elSec % 60).padStart(2, "0");
        this.digitsEl.setText(`${mm}:${ss}`);
        this.subEl.setText(
          `Секундомер: ${s.project} · Прошло ${mm} мин${loggedSuffix}`
        );
        this.startBtn.setText("Остановить и сохранить");
      }
    } else {
      if (this.selectedDuration > 0) {
        this.digitsEl.setText(
          `${String(this.selectedDuration).padStart(2, "0")}:00`
        );
        this.subEl.setText(`Цель: ${currentTarget}${loggedSuffix}`);
      } else {
        this.digitsEl.setText("00:00");
        this.subEl.setText(
          `Свободный секундомер · ${currentTarget}${loggedSuffix}`
        );
      }
      this.startBtn.setText("Старт сессии");
    }
  }

  private startTicker(): void {
    if (this.timerInterval !== null) window.clearInterval(this.timerInterval);
    this.timerInterval = window.setInterval(() => {
      this.updateDisplay();
      if (
        this.plugin.session.isRunning &&
        this.plugin.session.endAt !== null &&
        Date.now() >= this.plugin.session.endAt
      ) {
        void this.handleFinishTimer();
      }
    }, 500);
  }

  private async handleStartToggle(): Promise<void> {
    if (this.plugin.session.isRunning) {
      await this.handleFinishTimer();
    } else {
      const project =
        this.projectInput.value.trim() ||
        this.plugin.settings.defaultProject ||
        "Фокус";
      const durationMs = this.selectedDuration * 60 * 1000;
      this.plugin.session = {
        isRunning: true,
        project,
        durationMinutes: this.selectedDuration,
        startAt: Date.now(),
        endAt: this.selectedDuration > 0 ? Date.now() + durationMs : null,
      };
      this.plugin.saveSessionState();
      this.updateDisplay();
      new Notice(
        this.selectedDuration > 0
          ? `Фокус «${project}» (${this.selectedDuration} мин) запущен.`
          : `Секундомер фокуса «${project}» запущен.`
      );
    }
  }

  private async handleFinishTimer(): Promise<void> {
    if (!this.plugin.session.isRunning) return;
    await this.plugin.completeCurrentSession();
    await this.refreshTodayGoalsUI();
    this.updateDisplay();
  }

  private handleReset(): void {
    const project =
      this.projectInput.value.trim() ||
      this.plugin.settings.defaultProject ||
      "Фокус";
    this.plugin.session = {
      isRunning: false,
      project,
      durationMinutes: this.selectedDuration,
      startAt: 0,
      endAt: null,
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