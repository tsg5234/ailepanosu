import { requireParentSession } from "@/lib/auth";
import { changeParentPin, getDashboardSnapshot } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import type { ParentPinChangePayload } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const session = await requireParentSession();
    const body = (await request.json()) as ParentPinChangePayload;

    await changeParentPin(session.familyId, {
      currentPin: body.currentPin ?? "",
      newPin: body.newPin ?? ""
    });

    return jsonOk(await getDashboardSnapshot());
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "PIN güncellenemedi.", 400);
  }
}
