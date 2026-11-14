import { App, Modal, Notice } from "obsidian";
import type MyFocusTrackerPlugin from "./main";
import type { OpenFocusModalOptions, TodayFocusContext } from "./types";

export class FocusTrackerModal extends Modal {
  private plugin: MyFocusTrackerPlugin;
  private options: OpenFocusModalOptions;
private timerInterval: number | null = null;
  private todayCtx: TodayFocusContext = {
    file: null,
    goals: [],
    totalsByGoal: {},
    totalMinutes: 0,
  };

  private projectInput!: HTMLInputElement;
  private digitsEl!: HTMLElement;
  private goalsSectionEl!: HTMLElement;
  private goalsContainerEl!: HTMLElement;
  private todayStatsEl!: HTMLElement;
  private startBtn!: HTMLButtonElement;
  private cancelBtn!: HTMLButtonElement;

  constructor(
    app: App,
    plugin: MyFocusTrackerPlugin,
    options: OpenFocusModalOptions = {}
  ) {
    super(app);
    this.plugin = plugin;
    this.options = options;
  }

  async onOpen(): Promise<void> {
    const { contentEl, modalEl } = this;
    modalEl.addClass("mod-focus-tracker");
    contentEl.empty();

const head = contentEl.createDiv({ cls: "mft-head" });
    head.createEl("h2", { text: "Фокус" });
    this.todayStatsEl = head.createSpan({ cls: "mft-head-badge" });

    // Дисплей секундомера
    const display = contentEl.createDiv({ cls: "mft-timer-display" });
    this.digitsEl = display.createDiv({
      cls: "mft-time-digits",
      text: "00:00",
    });

    // Секция целей дня (скрывается автоматически, если целей нет)
    this.goalsSectionEl = contentEl.createDiv({
      cls: "mft-goals-section mft-is-hidden",
    });
    this.goalsContainerEl = this.goalsSectionEl.createDiv({
      cls: "mft-goals-chips",
    });

    // Поле ввода задачи
    const inputGroup = contentEl.createDiv({ cls: "mft-input-group" });
    this.projectInput = inputGroup.createEl("input", {
      cls: "mft-project-input",
      attr: {
        type: "text",
        placeholder: "Задача…",
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
      text: this.plugin.session.isRunning ? "Стоп" : "Старт",
      attr: { type: "button" },
    });
    this.startBtn.onclick = () => void this.handleStartToggle();

    this.cancelBtn = actionsRow.createEl("button", {
      cls: "mft-btn-sec is-danger mft-is-hidden",
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

const mins = this.todayCtx.totalMinutes;
    if (mins >= 60) {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      this.todayStatsEl.setText(m > 0 ? `${h} ч ${m} мин` : `${h} ч`);
    } else {
      this.todayStatsEl.setText(`${mins} мин`);
    }

    if (!this.todayCtx.file) {
      this.goalsSectionEl.addClass("mft-is-hidden");
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
      this.goalsSectionEl.addClass("mft-is-hidden");
      return;
    }

    this.goalsSectionEl.removeClass("mft-is-hidden");

    for (const item of combinedChips) {
      const chip = this.goalsContainerEl.createEl("button", {
        cls: "mft-goal-chip",
        attr: { type: "button" },
      });
      chip.dataset.goalText = item.text;

      const titleSpan = chip.createSpan({
        cls: "mft-goal-chip-title",
        text: item.progress >= 100 ? `✓ ${item.text}` : item.text,
      });
      if (item.progress >= 100) {
        titleSpan.addClass("is-done");
      }

      if (item.minutes > 0) {
        chip.createSpan({
          cls: "mft-goal-chip-time",
          text: `${item.minutes}м`,
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

    if (this.projectInput) {
      this.projectInput.disabled = s.isRunning;
    }
    this.digitsEl.toggleClass("is-running", s.isRunning);
    this.cancelBtn?.toggleClass("mft-is-hidden", !s.isRunning);

    if (s.isRunning) {
      const elSec = Math.max(0, Math.floor((Date.now() - s.startAt) / 1000));
      const hh = Math.floor(elSec / 3600);
      const mm = String(Math.floor((elSec % 3600) / 60)).padStart(2, "0");
      const ss = String(elSec % 60).padStart(2, "0");
      this.digitsEl.setText(hh > 0 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`);
      this.startBtn.setText("Стоп");
    } else {
      this.digitsEl.setText("00:00");
      this.startBtn.setText("Старт");
    }
  }

  private startTicker(): void {
    if (this.timerInterval !== null) window.clearInterval(this.timerInterval);
    this.timerInterval = window.setInterval(() => {
      if (this.plugin.session.isRunning) {
        this.updateDisplay();
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
      this.plugin.session = {
        isRunning: true,
        project,
        startAt: Date.now(),
      };
      this.plugin.saveSessionState();
      this.updateDisplay();
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
      startAt: 0,
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