import type {
  ActiveTimeBlock,
  CompletionRecord,
  FamilyRecord,
  PointEventRecord,
  TaskRecord,
  TimeBlock,
  UserRole
} from "@/lib/types";

export const FAMILY_TIMEZONE = "Europe/Istanbul";
export const DEFAULT_CHILD_SLEEP_TIME = "22:00";
export const DEFAULT_PARENT_SLEEP_TIME = "00:00";
export const DEFAULT_DAY_RESET_TIME = "00:00";
export const WEEKDAY_KEYS = ["pzt", "sal", "car", "per", "cum", "cts", "paz"] as const;
export const WEEKDAY_LABELS: Record<(typeof WEEKDAY_KEYS)[number], string> = {
  pzt: "Pzt",
  sal: "Sal",
  car: "Çar",
  per: "Per",
  cum: "Cum",
  cts: "Cts",
  paz: "Paz"
};

export const TIME_BLOCK_LABELS: Record<TimeBlock, string> = {
  sabah: "Sabah",
  ogleden_sonra: "Öğleden Sonra",
  aksam: "Akşam",
  her_zaman: "Gün Boyu"
};

interface FamilyTimingSettings {
  child_sleep_time?: string | null;
  parent_sleep_time?: string | null;
  day_reset_time?: string | null;
}

const MORNING_START_MINUTES = 6 * 60;
const AFTERNOON_START_MINUTES = 12 * 60;
const EVENING_START_MINUTES = 18 * 60;

function getTimeParts(date: Date, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: FAMILY_TIMEZONE,
    ...options
  }).formatToParts(date);
}

export function getFamilyTimingSettings(
  _settings?: FamilyTimingSettings | FamilyRecord | null,
  _role?: UserRole
) {
  void _settings;
  void _role;

  return {
    childSleepMinutes: 0,
    parentSleepMinutes: 0,
    dayResetMinutes: 0,
    childSleepTime: DEFAULT_DAY_RESET_TIME,
    parentSleepTime: DEFAULT_DAY_RESET_TIME,
    activeSleepMinutes: 0,
    activeSleepTime: DEFAULT_DAY_RESET_TIME,
    dayResetTime: DEFAULT_DAY_RESET_TIME
  };
}

function getClockMinutes(date: Date) {
  const parts = getTimeParts(date, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

function getReferenceDate(date: Date, _settings?: FamilyTimingSettings | FamilyRecord | null) {
  void _settings;

  return date;
}

export function getDateKey(
  date = new Date(),
  settings?: FamilyTimingSettings | FamilyRecord | null
) {
  const parts = getTimeParts(getReferenceDate(date, settings), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const year = parts.find((part) => part.type === "year")?.value ?? "2000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

export function getTurkishDateLabel(
  date = new Date(),
  settings?: FamilyTimingSettings | FamilyRecord | null
) {
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: FAMILY_TIMEZONE,
    day: "numeric",
    month: "long"
  }).format(getReferenceDate(date, settings));
}

export function getTurkishWeekdayLabel(
  date = new Date(),
  settings?: FamilyTimingSettings | FamilyRecord | null
) {
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: FAMILY_TIMEZONE,
    weekday: "long"
  }).format(getReferenceDate(date, settings));
}

export function getWeekdayKey(
  date = new Date(),
  settings?: FamilyTimingSettings | FamilyRecord | null
) {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: FAMILY_TIMEZONE,
    weekday: "short"
  }).format(getReferenceDate(date, settings));

  const mapping: Record<string, (typeof WEEKDAY_KEYS)[number]> = {
    Mon: "pzt",
    Tue: "sal",
    Wed: "car",
    Thu: "per",
    Fri: "cum",
    Sat: "cts",
    Sun: "paz"
  };

  return mapping[weekday] ?? "pzt";
}

export function getActiveTimeBlock(
  date = new Date(),
  _settings?: FamilyTimingSettings | FamilyRecord | null,
  _role?: UserRole
): ActiveTimeBlock {
  void _settings;
  void _role;

  const minutes = getClockMinutes(date);

  if (minutes < MORNING_START_MINUTES) {
    return "gece";
  }

  if (minutes < AFTERNOON_START_MINUTES) {
    return "sabah";
  }

  if (minutes < EVENING_START_MINUTES) {
    return "ogleden_sonra";
  }

  return "aksam";
}

export function getDigitalTimeLabel(date = new Date()) {
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: FAMILY_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

export function getWeekDays(
  date = new Date(),
  settings?: FamilyTimingSettings | FamilyRecord | null
) {
  const current = getReferenceDate(date, settings);
  const lookup = { pzt: 1, sal: 2, car: 3, per: 4, cum: 5, cts: 6, paz: 0 } as const;
  const dayIndex = lookup[getWeekdayKey(current)];
  const diff = dayIndex === 0 ? -6 : 1 - dayIndex;

  current.setDate(current.getDate() + diff);

  return Array.from({ length: 7 }, (_, index) => {
    const next = new Date(current);
    next.setDate(current.getDate() + index);

    return {
      dateKey: getDateKey(next),
      dayLabel: new Intl.DateTimeFormat("tr-TR", {
        timeZone: FAMILY_TIMEZONE,
        day: "numeric",
        month: "short"
      }).format(next),
      weekday: WEEKDAY_LABELS[getWeekdayKey(next)],
      isToday: getDateKey(next) === getDateKey(date, settings)
    };
  });
}

export function isTaskScheduledForDate(
  task: TaskRecord,
  dateKey: string,
  date = new Date(),
  settings?: FamilyTimingSettings | FamilyRecord | null
) {
  if (task.schedule_type === "gunluk") {
    return true;
  }

  if (task.schedule_type === "haftalik") {
    return task.days.includes(getWeekdayKey(date, settings));
  }

  return task.special_dates.includes(dateKey);
}

export function isTaskCompleted(
  completions: CompletionRecord[],
  taskId: string,
  userId: string,
  dateKey: string
) {
  return completions.some(
    (completion) =>
      completion.task_id === taskId &&
      completion.user_id === userId &&
      completion.completion_date === dateKey
  );
}

export function getTasksForUserOnDate(
  tasks: TaskRecord[],
  userId: string,
  dateKey: string,
  date = new Date(),
  settings?: FamilyTimingSettings | FamilyRecord | null
) {
  return tasks.filter(
    (task) =>
      task.assigned_to.includes(userId) &&
      isTaskScheduledForDate(task, dateKey, date, settings)
  );
}

export function getTodayPoints(pointEvents: PointEventRecord[], userId: string, dateKey: string) {
  return pointEvents
    .filter(
      (event) =>
        event.user_id === userId &&
        event.created_at.startsWith(dateKey) &&
        event.delta > 0
    )
    .reduce((total, event) => total + event.delta, 0);
}

export function getWeeklyPoints(pointEvents: PointEventRecord[], userId: string, weekKeys: string[]) {
  return pointEvents
    .filter(
      (event) =>
        event.user_id === userId &&
        weekKeys.some((key) => event.created_at.startsWith(key)) &&
        event.delta > 0
    )
    .reduce((total, event) => total + event.delta, 0);
}
