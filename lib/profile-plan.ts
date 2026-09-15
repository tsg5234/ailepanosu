import type { ProfilePlanEntryRecord } from "@/lib/types";

export const PLAN_WEEKDAYS = ["pzt", "sal", "car", "per", "cum", "cts", "paz"] as const;

export const PLAN_WEEKDAY_LABELS: Record<(typeof PLAN_WEEKDAYS)[number], string> = {
  pzt: "Pazartesi",
  sal: "Salı",
  car: "Çarşamba",
  per: "Perşembe",
  cum: "Cuma",
  cts: "Cumartesi",
  paz: "Pazar"
};

export const PLAN_WEEKDAY_SHORT_LABELS: Record<(typeof PLAN_WEEKDAYS)[number], string> = {
  pzt: "Pzt",
  sal: "Sal",
  car: "Çar",
  per: "Per",
  cum: "Cum",
  cts: "Cts",
  paz: "Paz"
};

export const DEFAULT_PLAN_SLOTS = [
  { slotIndex: 1, label: "", startTime: "08:40", endTime: "09:20" },
  { slotIndex: 2, label: "", startTime: "09:40", endTime: "10:20" },
  { slotIndex: 3, label: "", startTime: "10:35", endTime: "11:15" },
  { slotIndex: 4, label: "", startTime: "11:25", endTime: "12:05" },
  { slotIndex: 5, label: "", startTime: "12:15", endTime: "12:55" },
  { slotIndex: 6, label: "", startTime: "13:25", endTime: "14:05" },
  { slotIndex: 7, label: "", startTime: "14:15", endTime: "14:55" },
  { slotIndex: 8, label: "", startTime: "15:05", endTime: "15:45" }
] as const;

export function getPlanEntry(
  entries: ProfilePlanEntryRecord[],
  userId: string,
  weekday: string,
  slotIndex: number
) {
  return entries.find(
    (entry) =>
      entry.user_id === userId &&
      entry.weekday === weekday &&
      entry.slot_index === slotIndex
  );
}

export function getTodayPlanEntries(
  entries: ProfilePlanEntryRecord[],
  userId: string,
  weekday: string
) {
  return entries
    .filter((entry) => entry.user_id === userId && entry.weekday === weekday && entry.title.trim())
    .sort((left, right) => left.slot_index - right.slot_index);
}
