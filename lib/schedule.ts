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
  car: "Car",
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

const MINUTES_PER_DAY = 24 * 60;
const MORNING_START_MINUTES = 6 * 60;
const AFTERNOON_START_MINUTES = 12 * 60;
const EVENING_START_MINUTES = 18 * 60;

function getTimeParts(date: Date, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: FAMILY_TIMEZONE,
    ...options
  }).formatToParts(date);
}

function parseTimeValue(value: string | null | undefined, fallbackMinutes: number) {
  if (!value) {
    return fallbackMinutes;
  }

  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());

  if (!match) {
    return fallbackMinutes;
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

function formatMinutes(minutes: number) {
  const safeMinutes = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hour = String(Math.floor(safeMinutes / 60)).padStart(2, "0");
  const minute = String(safeMinutes % 60).padStart(2, "0");
  return `${hour}:${minute}`;
}

export function getFamilyTimingSettings(
  settings?: FamilyTimingSettings | FamilyRecord | null,
  role?: UserRole
) {
  const childSleepMinutes = parseTimeValue(settings?.child_sleep_time, 22 * 60);
  const parentSleepMinutes = parseTimeValue(settings?.parent_sleep_time, 0);
  const dayResetMinutes = parseTimeValue(settings?.day_reset_time, 0);
  const activeSleepMinutes = role === "ebeveyn" ? parentSleepMinutes : childSleepMinutes;

  return {
    childSleepMinutes,
    parentSleepMinutes,
    dayResetMinutes,
    childSleepTime: formatMinutes(childSleepMinutes),
    parentSleepTime: formatMinutes(parentSleepMinutes),
    activeSleepMinutes,
    activeSleepTime: formatMinutes(activeSleepMinutes),
    dayResetTime: formatMinutes(dayResetMinutes)
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

function getReferenceDate(date: Date, settings?: FamilyTimingSettings | FamilyRecord | null) {
  const { dayResetMinutes } = getFamilyTimingSettings(settings);
  return new Date(date.getTime() - dayResetMinutes * 60_000);
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
  settings?: FamilyTimingSettings | FamilyRecord | null,
  role?: UserRole
): ActiveTimeBlock {
  const minutes = getClockMinutes(date);
  const { activeSleepMinutes } = getFamilyTimingSettings(settings, role);

  if (
    minutes < MORNING_START_MINUTES ||
    (activeSleepMinutes >= MORNING_START_MINUTES && minutes >= activeSleepMinutes)
  ) {
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
