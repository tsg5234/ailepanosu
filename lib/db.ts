import "server-only";

import bcrypt from "bcryptjs";
import { getParentSession } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";
import {
  adjustLocalPoints,
  bootstrapLocalApp,
  getLocalDashboardSnapshot,
  requestLocalReward,
  resetLocalProgress,
  resolveLocalReward,
  saveLocalReward,
  saveLocalTask,
  saveLocalUser,
  toggleLocalTaskCompletion,
  updateLocalFamilySettings,
  verifyLocalParentPin
} from "@/lib/local-db";
import { SAMPLE_TASK_TEMPLATES } from "@/lib/sample-data";
import {
  getActiveTimeBlock,
  getDateKey,
  getTurkishDateLabel,
  getWeekDays
} from "@/lib/schedule";
import { ensureStarterSeeded } from "@/lib/starter-seed";
import { createAdminClient } from "@/lib/supabase";
import type {
  DashboardPayload,
  FamilyRecord,
  RewardFormPayload,
  RewardRecord,
  SetupPayload,
  TaskFormPayload,
  TaskRecord,
  UserFormPayload,
  UserRecord
} from "@/lib/types";

interface InternalFamilyRecord extends FamilyRecord {
  parent_pin_hash: string;
}

function fail(message: string, error: unknown): never {
  const detail = error instanceof Error ? error.message : "Bilinmeyen hata";
  throw new Error(`${message}: ${detail}`);
}

function toPublicFamilyRecord(family: InternalFamilyRecord | null): FamilyRecord | null {
  if (!family) {
    return null;
  }

  return {
    id: family.id,
    name: family.name,
    theme: family.theme,
    audio_enabled: family.audio_enabled,
    child_sleep_time: family.child_sleep_time,
    parent_sleep_time: family.parent_sleep_time,
    day_reset_time: family.day_reset_time,
    created_at: family.created_at
  };
}

async function getFamilyInternal() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("families")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    fail("Aile bilgisi alinamadi", error);
  }

  return data as InternalFamilyRecord | null;
}

function getEmptyDashboardSnapshot(): DashboardPayload {
  return {
    setupRequired: true,
    family: null,
    session: {
      authenticated: false,
      role: null
    },
    users: [],
    tasks: [],
    completions: [],
    rewards: [],
    redemptions: [],
    pointEvents: [],
    today: {
      dateKey: getDateKey(),
      label: getTurkishDateLabel(),
      weekday: new Intl.DateTimeFormat("tr-TR", {
        timeZone: "Europe/Istanbul",
        weekday: "long"
      }).format(new Date()),
      activeTimeBlock: getActiveTimeBlock()
    },
    week: getWeekDays()
  };
}

export async function bootstrapApp({
  familyName,
  parentName,
  pin,
  includeSampleData
}: SetupPayload) {
  if (!isSupabaseConfigured()) {
    return bootstrapLocalApp({ familyName, parentName, pin, includeSampleData });
  }

  const currentFamily = await getFamilyInternal();

  if (currentFamily) {
    throw new Error("Kurulum zaten tamamlandi.");
  }

  const supabase = createAdminClient();
  const parentPinHash = await bcrypt.hash(pin, 10);

  const { data: family, error: familyError } = await supabase
    .from("families")
    .insert({
      name: familyName,
      parent_pin_hash: parentPinHash,
      child_sleep_time: "22:00",
      parent_sleep_time: "00:00",
      day_reset_time: "00:00"
    })
    .select("*")
    .single();

  if (familyError) {
    fail("Aile olusturulamadi", familyError);
  }

  const usersSeed: Array<Record<string, unknown>> = [
    {
      family_id: family.id,
      name: parentName,
      role: "ebeveyn",
      avatar: "\u{1F468}",
      color: "#2DD4BF"
    }
  ];

  if (includeSampleData) {
    usersSeed.push(
      {
        family_id: family.id,
        name: "Esra",
        role: "ebeveyn",
        avatar: "\u{1F469}",
        color: "#FB7185"
      },
      {
        family_id: family.id,
        name: "Poyraz",
        role: "\u00e7ocuk",
        avatar: "\u{1F981}",
        color: "#60A5FA",
        birthdate: "2016-05-14"
      },
      {
        family_id: family.id,
        name: "Aden",
        role: "\u00e7ocuk",
        avatar: "\u{1F984}",
        color: "#22C55E",
        birthdate: "2019-09-02"
      }
    );
  }

  const { data: insertedUsers, error: usersError } = await supabase
    .from("users")
    .insert(usersSeed)
    .select("*");

  if (usersError) {
    fail("Kullanicilar olusturulamadi", usersError);
  }

  if (includeSampleData) {
    const users = (insertedUsers ?? []) as UserRecord[];
    const childIds = users.filter((user) => user.role === "\u00e7ocuk").map((user) => user.id);
    const assignedUserIds = childIds.length > 0 ? childIds : users.map((user) => user.id);

    const { error: tasksError } = await supabase.from("tasks").insert(
      SAMPLE_TASK_TEMPLATES.map((task) => ({
        family_id: family.id,
        title: task.title,
        icon: task.icon,
        points: task.points,
        assigned_to: assignedUserIds,
        schedule_type: "gunluk",
        days: [],
        special_dates: [],
        time_block: task.timeBlock
      }))
    );

    if (tasksError) {
      fail("Ornek gorevler eklenemedi", tasksError);
    }

    const { error: rewardsError } = await supabase.from("rewards").insert([
      {
        family_id: family.id,
        title: "Film gecesi secimi",
        points_required: 120,
        approval_required: false
      },
      {
        family_id: family.id,
        title: "Hafta sonu dondurma",
        points_required: 180,
        approval_required: true
      }
    ]);

    if (rewardsError) {
      fail("Ornek oduller eklenemedi", rewardsError);
    }
  }

  return getDashboardSnapshot();
}

export async function getDashboardSnapshot(): Promise<DashboardPayload> {
  if (!isSupabaseConfigured()) {
    return getLocalDashboardSnapshot();
  }

  await ensureStarterSeeded();

  const familyInternal = await getFamilyInternal();
  const session = await getParentSession();

  if (!familyInternal) {
    return getEmptyDashboardSnapshot();
  }

  const family = toPublicFamilyRecord(familyInternal);

  if (!family) {
    return getEmptyDashboardSnapshot();
  }

  const supabase = createAdminClient();
  const week = getWeekDays(new Date(), family);
  const firstWeekDay = week[0]?.dateKey ?? getDateKey(new Date(), family);

  const [
    usersResult,
    tasksResult,
    completionsResult,
    rewardsResult,
    redemptionsResult,
    eventsResult
  ] = await Promise.all([
    supabase.from("users").select("*").eq("family_id", family.id).order("created_at"),
    supabase.from("tasks").select("*").eq("family_id", family.id).order("created_at"),
    supabase
      .from("completions")
      .select("*")
      .eq("family_id", family.id)
      .gte("completion_date", firstWeekDay)
      .order("completion_date", { ascending: false }),
    supabase.from("rewards").select("*").eq("family_id", family.id).order("points_required"),
    supabase
      .from("redemptions")
      .select("*")
      .eq("family_id", family.id)
      .order("requested_at", {
        ascending: false
      }),
    supabase
      .from("point_events")
      .select("*")
      .eq("family_id", family.id)
      .order("created_at", { ascending: false })
      .limit(60)
  ]);

  if (usersResult.error) {
    fail("Kullanicilar alinamadi", usersResult.error);
  }
  if (tasksResult.error) {
    fail("Gorevler alinamadi", tasksResult.error);
  }
  if (completionsResult.error) {
    fail("Tamamlanma kayitlari alinamadi", completionsResult.error);
  }
  if (rewardsResult.error) {
    fail("Oduller alinamadi", rewardsResult.error);
  }
  if (redemptionsResult.error) {
    fail("Odul talepleri alinamadi", redemptionsResult.error);
  }
  if (eventsResult.error) {
    fail("Puan gecmisi alinamadi", eventsResult.error);
  }

  return {
    setupRequired: false,
    family,
    session: {
      authenticated: Boolean(session?.familyId === family.id),
      role: session?.role ?? null
    },
    users: (usersResult.data ?? []) as UserRecord[],
    tasks: (tasksResult.data ?? []) as TaskRecord[],
    completions: completionsResult.data ?? [],
    rewards: (rewardsResult.data ?? []) as RewardRecord[],
    redemptions: redemptionsResult.data ?? [],
    pointEvents: eventsResult.data ?? [],
    today: {
      dateKey: getDateKey(new Date(), family),
      label: getTurkishDateLabel(new Date(), family),
      weekday: new Intl.DateTimeFormat("tr-TR", {
        timeZone: "Europe/Istanbul",
        weekday: "long"
      }).format(new Date()),
      activeTimeBlock: getActiveTimeBlock(new Date(), family)
    },
    week
  };
}

export async function verifyParentPin(pin: string) {
  if (!isSupabaseConfigured()) {
    return verifyLocalParentPin(pin);
  }

  await ensureStarterSeeded();

  const family = await getFamilyInternal();

  if (!family) {
    throw new Error("Once kurulum yapilmali.");
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("families")
    .select("id, parent_pin_hash")
    .eq("id", family.id)
    .single();

  if (error) {
    fail("PIN dogrulanamadi", error);
  }

  const matched = await bcrypt.compare(pin, data.parent_pin_hash as string);

  if (!matched) {
    throw new Error("PIN hatali.");
  }

  return toPublicFamilyRecord(family);
}

export async function saveUser(familyId: string, payload: UserFormPayload) {
  if (!isSupabaseConfigured()) {
    return saveLocalUser(familyId, payload);
  }

  const supabase = createAdminClient();
  const base = {
    family_id: familyId,
    name: payload.name,
    role: payload.role,
    avatar: payload.avatar,
    color: payload.color,
    birthdate: payload.birthdate || null
  };

  if (payload.id) {
    const { error } = await supabase.from("users").update(base).eq("id", payload.id);
    if (error) {
      fail("Kullanici guncellenemedi", error);
    }
    return;
  }

  const { error } = await supabase.from("users").insert(base);
  if (error) {
    fail("Kullanici olusturulamadi", error);
  }
}

export async function saveTask(familyId: string, payload: TaskFormPayload) {
  if (!isSupabaseConfigured()) {
    return saveLocalTask(familyId, payload);
  }

  const supabase = createAdminClient();
  const base = {
    family_id: familyId,
    title: payload.title,
    icon: payload.icon,
    points: payload.points,
    assigned_to: payload.assignedTo,
    schedule_type: payload.scheduleType,
    days: payload.days,
    special_dates: payload.specialDates,
    time_block: payload.timeBlock
  };

  if (payload.id) {
    const { error } = await supabase.from("tasks").update(base).eq("id", payload.id);
    if (error) {
      fail("Gorev guncellenemedi", error);
    }
    return;
  }

  const { error } = await supabase.from("tasks").insert(base);
  if (error) {
    fail("Gorev olusturulamadi", error);
  }
}

export async function saveReward(familyId: string, payload: RewardFormPayload) {
  if (!isSupabaseConfigured()) {
    return saveLocalReward(familyId, payload);
  }

  const supabase = createAdminClient();
  const base = {
    family_id: familyId,
    title: payload.title,
    points_required: payload.pointsRequired,
    approval_required: payload.approvalRequired
  };

  if (payload.id) {
    const { error } = await supabase.from("rewards").update(base).eq("id", payload.id);
    if (error) {
      fail("Odul guncellenemedi", error);
    }
    return;
  }

  const { error } = await supabase.from("rewards").insert(base);
  if (error) {
    fail("Odul olusturulamadi", error);
  }
}

export async function toggleTaskCompletion(taskId: string, userId: string, dateKey: string) {
  if (!isSupabaseConfigured()) {
    return toggleLocalTaskCompletion(taskId, userId, dateKey);
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("toggle_task_completion", {
    p_user_id: userId,
    p_task_id: taskId,
    p_completion_date: dateKey
  });

  if (error) {
    fail("Gorev islenemedi", error);
  }

  return data?.[0] ?? null;
}

export async function requestReward(userId: string, rewardId: string) {
  if (!isSupabaseConfigured()) {
    return requestLocalReward(userId, rewardId);
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("request_reward_redemption", {
    p_user_id: userId,
    p_reward_id: rewardId
  });

  if (error) {
    fail("Odul talebi olusturulamadi", error);
  }

  return data?.[0] ?? null;
}

export async function resolveReward(redemptionId: string, status: "onaylandi" | "reddedildi") {
  if (!isSupabaseConfigured()) {
    return resolveLocalReward(redemptionId, status);
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("resolve_redemption", {
    p_redemption_id: redemptionId,
    p_status: status
  });

  if (error) {
    fail("Odul talebi guncellenemedi", error);
  }

  return data?.[0] ?? null;
}

export async function adjustPoints(userId: string, delta: number, note: string) {
  if (!isSupabaseConfigured()) {
    return adjustLocalPoints(userId, delta, note);
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("adjust_user_points", {
    p_user_id: userId,
    p_delta: delta,
    p_note: note
  });

  if (error) {
    fail("Puan duzenlenemedi", error);
  }

  return data?.[0] ?? null;
}

export async function resetFamilyProgress(familyId: string) {
  if (!isSupabaseConfigured()) {
    return resetLocalProgress(familyId);
  }

  const supabase = createAdminClient();

  const { error: completionsError } = await supabase
    .from("completions")
    .delete()
    .eq("family_id", familyId);

  if (completionsError) {
    fail("Tamamlanmalar sifirlanamadi", completionsError);
  }

  const { error: redemptionsError } = await supabase
    .from("redemptions")
    .delete()
    .eq("family_id", familyId);

  if (redemptionsError) {
    fail("Odul talepleri sifirlanamadi", redemptionsError);
  }

  const { error: pointEventsError } = await supabase
    .from("point_events")
    .delete()
    .eq("family_id", familyId);

  if (pointEventsError) {
    fail("Puan gecmisi sifirlanamadi", pointEventsError);
  }

  const { error: usersError } = await supabase
    .from("users")
    .update({ points: 0 })
    .eq("family_id", familyId);

  if (usersError) {
    fail("Kullanici puanlari sifirlanamadi", usersError);
  }
}

export async function updateFamilySettings(
  familyId: string,
  payload: Partial<{
    name: string;
    theme: "acik" | "koyu";
    audio_enabled: boolean;
    child_sleep_time: string;
    parent_sleep_time: string;
    day_reset_time: string;
  }>
) {
  if (!isSupabaseConfigured()) {
    return updateLocalFamilySettings(familyId, payload);
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("families").update(payload).eq("id", familyId);

  if (error) {
    fail("Aile ayarlari guncellenemedi", error);
  }
}
