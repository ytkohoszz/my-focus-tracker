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