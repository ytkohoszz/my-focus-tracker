import type { TFile } from "obsidian";

export interface ActiveFocusSession {
  isRunning: boolean;
  project: string;
  durationMinutes: number; // 0 для секундомера
  startAt: number; // timestamp (мс)
  endAt: number | null; // null для бесконечного секундомера
}

export interface DailyGoalItem {
  text: string;
  category: string;
  progress: number;
  loggedMinutes: number;
}

export interface TodayFocusContext {
  file: TFile | null;
  goals: DailyGoalItem[];
  totalsByGoal: Record<string, number>;
  totalMinutes: number;
}

export interface OpenFocusModalOptions {
  initialProject?: string;
}

export interface FocusTrackerSettings {
  defaultProject: string;
  soundEnabled: boolean;
}

export const DEFAULT_SETTINGS: FocusTrackerSettings = {
  defaultProject: "3D",
  soundEnabled: true,
};