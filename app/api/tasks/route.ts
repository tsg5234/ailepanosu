import { requireParentSession } from "@/lib/auth";
import { deleteTask, getDashboardSnapshot, saveTask } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { DEFAULT_TASK_ICON } from "@/lib/task-defaults";
import type { TaskFormPayload } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const session = await requireParentSession();
    const body = (await request.json()) as TaskFormPayload;

    if (!body.title?.trim() || !body.assignedTo?.length) {
      return jsonError("Başlık ve atanan kişiler gerekli.");
    }

    await saveTask(session.familyId, {
      ...body,
      title: body.title.trim(),
      icon: body.icon?.trim() || DEFAULT_TASK_ICON,
      assignedTo: body.assignedTo,
      days: body.days ?? [],
      specialDates: body.specialDates ?? []
    });

    return jsonOk(await getDashboardSnapshot());
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Görev kaydedilemedi", 500);
  }
}

export async function DELETE(request: Request) {
 try {
 const session = await requireParentSession();
 const body = await request.json();
 if (typeof body.taskId !== "string" || !body.taskId.trim()) return jsonError("Görev kimliği gerekli.");
 await deleteTask(session.familyId, body.taskId);
 return jsonOk(await getDashboardSnapshot());
 } catch (error) { return jsonError(error instanceof Error ? error.message : "Görev silinemedi", 500); }
}
