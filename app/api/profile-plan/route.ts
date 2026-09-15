import { requireParentSession } from "@/lib/auth";
import { getDashboardSnapshot, saveProfilePlan } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { DEFAULT_PLAN_SLOTS, PLAN_WEEKDAYS } from "@/lib/profile-plan";
import type { ProfilePlanSavePayload } from "@/lib/types";

const weekdaySet = new Set<string>(PLAN_WEEKDAYS);
const slotIndexes = new Set<number>(DEFAULT_PLAN_SLOTS.map((slot) => slot.slotIndex));
const TIME_PATTERN = /^\d{2}:\d{2}$/;

export async function POST(request: Request) {
  try {
    const session = await requireParentSession();
    const body = (await request.json()) as ProfilePlanSavePayload;

    if (typeof body.userId !== "string" || !body.userId.trim()) {
      return jsonError("Profil seçimi gerekli.");
    }

    if (!Array.isArray(body.entries)) {
      return jsonError("Plan listesi gerekli.");
    }

    const entries = body.entries.map((entry) => ({
      weekday: String(entry.weekday ?? ""),
      slotIndex: Number(entry.slotIndex),
      slotLabel: String(entry.slotLabel ?? "").trim(),
      startTime: String(entry.startTime ?? ""),
      endTime: String(entry.endTime ?? ""),
      title: String(entry.title ?? "").trim()
    }));

    const invalidEntry = entries.find(
      (entry) =>
        !weekdaySet.has(entry.weekday) ||
        !slotIndexes.has(entry.slotIndex) ||
        !TIME_PATTERN.test(entry.startTime) ||
        !TIME_PATTERN.test(entry.endTime)
    );

    if (invalidEntry) {
      return jsonError("Planda geçersiz gün, saat veya plan bilgisi var.");
    }

    await saveProfilePlan(session.familyId, {
      userId: body.userId,
      entries
    });

    return jsonOk(await getDashboardSnapshot());
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Plan kaydedilemedi", 500);
  }
}
