import { requireParentSession } from "@/lib/auth";
import { getDashboardSnapshot, saveReward } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import type { RewardFormPayload } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const session = await requireParentSession();
    const body = (await request.json()) as RewardFormPayload;

    if (!body.title?.trim() || !body.pointsRequired) {
      return jsonError("Başlık ve harçlık gerekli.");
    }

    await saveReward(session.familyId, {
      ...body,
      title: body.title.trim()
    });

    return jsonOk(await getDashboardSnapshot());
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Ödül kaydedilemedi", 500);
  }
}
