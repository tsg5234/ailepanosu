import { requireParentSession } from "@/lib/auth";
import { changeAccountPassword } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import type { AccountPasswordChangePayload } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const session = await requireParentSession();
    const body = (await request.json()) as AccountPasswordChangePayload;

    await changeAccountPassword(session.accountId, {
      currentPassword: body.currentPassword ?? "",
      newPassword: body.newPassword ?? ""
    });

    return jsonOk({ success: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Şifre güncellenemedi.", 400);
  }
}
