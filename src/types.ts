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