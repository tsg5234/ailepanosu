import "server-only";

import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import type { AppSession } from "@/lib/auth";
import { getAppSession } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";
import {
  adjustLocalPoints,
  bootstrapLocalApp,
  changeLocalAccountPassword,
  deleteLocalUser,
  getLocalDashboardSnapshot,
  loginLocalAccount,
  registerLocalAccount,
  reorderLocalTasks,
  requestLocalReward,
  resetLocalProgress,
  resolveLocalReward,
  saveLocalReward,
  saveLocalRewardSystemConfig,
  saveLocalTask,
  saveLocalUser,
  toggleLocalTaskCompletion,
  updateLocalParentPin,
  updateLocalFamilySettings,
  verifyLocalParentPin
} from "@/lib/local-db";
import {
  buildRewardSystemConfigRewards,
  getRewardSystemConfig
} from "@/lib/reward-system";
import { SAMPLE_TASK_TEMPLATES } from "@/lib/sample-data";
import { DEFAULT_TASK_ICON } from "@/lib/task-defaults";
import {
  getActiveTimeBlock,
  getDateKey,
  getTurkishDateLabel,
  getWeekDays
} from "@/lib/schedule";
import { createAdminClient } from "@/lib/supabase";
import type {
  AccountAuthPayload,
  AccountPasswordChangePayload,
  DashboardPayload,
  FamilySettingsPayload,
  FamilyRecord,
  ParentPinChangePayload,
  RewardSystemMode,
  RewardFormPayload,
  RewardRecord,
  SetupPayload,
  TaskFormPayload,
  TaskRecord,
  UserFormPayload,
  UserRecord
} from "@/lib/types";

const USERNAME_PATTERN = /^[a-z0-9._-]{3,24}$/;
const CHILD_ROLE = "çocuk";
const CHILD_USER_PREFIX = "__child__:";
const HIDDEN_USER_PREFIX = "__hidden__:";
const ACCOUNT_USER_PREFIX = "__account__:";
const ACCOUNT_PENDING_COLOR = "#0F172A";
const ACCOUNT_READY_COLOR = "#1D4ED8";
const ACCOUNT_PLACEHOLDER_FAMILY_NAME = "Kurulum bekliyor";

interface InternalFamilyRecord extends FamilyRecord {
  parent_pin_hash: string;
}

interface AccountUserRecord {
  id: string;
  family_id: string;
  name: string;
  avatar: string;
  color: string;
}

interface AuthAccount {
  accountId: string;
  username: string;
  familyId: string | null;
  accessToken: string;
  refreshToken: string;
}

function fail(message: string, error: unknown): never {
  const detail =
    error instanceof Error
      ? error.message
      : error && typeof error === "object" && "message" in error
        ? [
            String((error as { message?: unknown }).message ?? ""),
            "details" in error ? String((error as { details?: unknown }).details ?? "") : "",
            "hint" in error ? String((error as { hint?: unknown }).hint ?? "") : ""
          ]
            .filter(Boolean)
            .join(" | ")
        : "Bilinmeyen hata";
  throw new Error(`${message}: ${detail}`);
}

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

function validateAccountPayload(payload: AccountAuthPayload) {
  const username = normalizeUsername(payload.username);
  const password = payload.password;

  if (!USERNAME_PATTERN.test(username)) {
    throw new Error(
      "Kullanıcı adı 3-24 karakter olmalı ve sadece harf, rakam, nokta, tire veya alt çizgi içermeli."
    );
  }

  if (password.length < 6) {
    throw new Error("Şifre en az 6 karakter olmalı.");
  }

  return {
    username,
    password
  };
}

function getAccountMarkerName(username: string) {
  return `${ACCOUNT_USER_PREFIX}${username}`;
}

function isAccountMarkerName(name: string) {
  return name.startsWith(ACCOUNT_USER_PREFIX);
}

function isStoredHiddenName(name: string) {
  return name.startsWith(HIDDEN_USER_PREFIX);
}

function stripStoredVisibilityPrefix(name: string) {
  return isStoredHiddenName(name) ? name.slice(HIDDEN_USER_PREFIX.length) : name;
}

function stripStoredProfileName(name: string) {
  const visibleName = stripStoredVisibilityPrefix(name);

  return visibleName.startsWith(CHILD_USER_PREFIX)
    ? visibleName.slice(CHILD_USER_PREFIX.length)
    : visibleName;
}

function isAccountUserRecord(user: Pick<UserRecord, "name"> | Pick<AccountUserRecord, "name">) {
  return isAccountMarkerName(user.name);
}

function isAccountSetupComplete(user: Pick<AccountUserRecord, "color">) {
  return user.color === ACCOUNT_READY_COLOR;
}

function normalizeUserRole(role: string): UserRecord["role"] {
  return role === "ebeveyn" ? "ebeveyn" : CHILD_ROLE;
}

function getStoredProfileName(name: string, role: UserRecord["role"]) {
  const baseName = role === CHILD_ROLE ? `${CHILD_USER_PREFIX}${name}` : name;

  return baseName;
}

function normalizeUserRecord(user: UserRecord): UserRecord {
  const storedName = stripStoredVisibilityPrefix(user.name);

  return {
    ...user,
    name: stripStoredProfileName(user.name),
    role: storedName.startsWith(CHILD_USER_PREFIX) ? CHILD_ROLE : normalizeUserRole(user.role),
    visible_in_kiosk: true
  };
}

function toAuthAccount(user: AccountUserRecord, username: string): AuthAccount {
  return {
    accountId: user.id,
    username: normalizeUsername(username),
    familyId: user.family_id,
    accessToken: "",
    refreshToken: ""
  };
}

function getDashboardSession(session: AppSession | null): DashboardPayload["session"] {
  return {
    accountAuthenticated: Boolean(session),
    username: session?.username ?? null,
    parentAuthenticated: Boolean(session?.parentAuthenticated && session?.familyId),
    role: session?.parentAuthenticated ? "ebeveyn" : null
  };
}

function getEmptyDashboardSnapshot(session: AppSession | null): DashboardPayload {
  return {
    authRequired: !session,
    setupRequired: Boolean(session),
    family: null,
    session: getDashboardSession(session),
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

async function getFamilyInternal(familyId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("families")
    .select("*")
    .eq("id", familyId)
    .maybeSingle();

  if (error) {
    fail("Aile bilgisi alinamadi", error);
  }

  return data as InternalFamilyRecord | null;
}

async function getAccountUserByUsername(username: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, family_id, name, avatar, color")
    .eq("name", getAccountMarkerName(username))
    .maybeSingle();

  if (error) {
    fail("Hesap bilgisi alinamadi", error);
  }

  return (data as AccountUserRecord | null) ?? null;
}

async function getAccountUserById(accountId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, family_id, name, avatar, color")
    .eq("id", accountId)
    .maybeSingle();

  if (error) {
    fail("Hesap bilgisi alinamadi", error);
  }

  return (data as AccountUserRecord | null) ?? null;
}

async function createPlaceholderFamily() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("families")
    .insert({
      name: ACCOUNT_PLACEHOLDER_FAMILY_NAME,
      parent_pin_hash: await bcrypt.hash(randomUUID(), 10)
    })
    .select("id")
    .single();

  if (error) {
    fail("Aile kaydi olusturulamadi", error);
  }

  return data.id as string;
}

async function updateAccountUser(
  accountId: string,
  payload: Partial<{
    family_id: string;
    color: string;
  }>
) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("users").update(payload).eq("id", accountId);

  if (error) {
    fail("Hesap bilgisi guncellenemedi", error);
  }
}

async function updateAccountPasswordHash(accountId: string, passwordHash: string) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("users").update({ avatar: passwordHash }).eq("id", accountId);

  if (error) {
    fail("Hesap şifresi güncellenemedi", error);
  }
}

async function insertProfileUser(
  familyId: string,
  profile: {
    name: string;
    role: UserRecord["role"];
    avatar: string;
    color: string;
    birthdate: string | null;
    visibleInKiosk: boolean;
  }
) {
  const supabase = createAdminClient();
  const base = {
    family_id: familyId,
    name: getStoredProfileName(profile.name, profile.role),
    avatar: profile.avatar,
    color: profile.color,
    birthdate: profile.birthdate
  };
  const { data, error } = await supabase
    .from("users")
    .insert({ ...base, role: profile.role })
    .select("*")
    .single();

  if (error) {
    fail("Kullanıcılar oluşturulamadı", error);
  }

  return normalizeUserRecord(data as UserRecord);
}

async function updateProfileUser(
  familyId: string,
  userId: string,
  profile: {
    name: string;
    role: UserRecord["role"];
    avatar: string;
    color: string;
    birthdate: string | null;
    visibleInKiosk: boolean;
  }
) {
  const supabase = createAdminClient();
  const base = {
    family_id: familyId,
    name: getStoredProfileName(profile.name, profile.role),
    avatar: profile.avatar,
    color: profile.color,
    birthdate: profile.birthdate
  };
  const { error } = await supabase
    .from("users")
    .update({ ...base, role: profile.role })
    .eq("id", userId)
    .eq("family_id", familyId);

  if (error) {
    fail("Kullanıcı güncellenemedi", error);
  }
}

async function ensureFamilyRecordExists(
  table: "users" | "tasks" | "rewards" | "redemptions",
  id: string,
  familyId: string
) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from(table)
    .select("id")
    .eq("id", id)
    .eq("family_id", familyId)
    .maybeSingle();

  if (error) {
    fail("Aile kaydi dogrulanamadi", error);
  }

  if (!data) {
    throw new Error("Bu kayit bu hesaba ait degil.");
  }
}

export async function registerAccount(payload: AccountAuthPayload) {
  const { username, password } = validateAccountPayload(payload);

  if (!isSupabaseConfigured()) {
    return registerLocalAccount(username, password);
  }

  if (await getAccountUserByUsername(username)) {
    throw new Error("Bu kullanıcı adı zaten kullanılıyor.");
  }

  const familyId = await createPlaceholderFamily();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("users")
    .insert({
      family_id: familyId,
      name: getAccountMarkerName(username),
      role: "ebeveyn",
      avatar: await bcrypt.hash(password, 10),
      color: ACCOUNT_PENDING_COLOR
    })
    .select("id, family_id, name, avatar, color")
    .single();

  if (error) {
    fail("Hesap olusturulamadi", error);
  }

  return toAuthAccount(data as AccountUserRecord, username);
}

export async function loginAccount(payload: AccountAuthPayload) {
  const { username, password } = validateAccountPayload(payload);

  if (!isSupabaseConfigured()) {
    return loginLocalAccount(username, password);
  }

  const accountUser = await getAccountUserByUsername(username);

  if (!accountUser || !(await bcrypt.compare(password, accountUser.avatar))) {
    throw new Error("Kullanıcı adı veya şifre hatalı.");
  }

  return toAuthAccount(accountUser, username);
}

export async function changeAccountPassword(
  accountId: string,
  payload: AccountPasswordChangePayload
) {
  const currentPassword = payload.currentPassword ?? "";
  const newPassword = payload.newPassword ?? "";

  if (!isSupabaseConfigured()) {
    return changeLocalAccountPassword(accountId, currentPassword, newPassword);
  }

  if (newPassword.length < 6) {
    throw new Error("Yeni şifre en az 6 karakter olmalı.");
  }

  const accountUser = await getAccountUserById(accountId);

  if (!accountUser || !isAccountUserRecord(accountUser)) {
    throw new Error("Hesap bulunamadı.");
  }

  if (!(await bcrypt.compare(currentPassword, accountUser.avatar))) {
    throw new Error("Mevcut şifre hatalı.");
  }

  await updateAccountPasswordHash(accountId, await bcrypt.hash(newPassword, 10));
}

async function hasVisibleUsers(familyId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("users").select("name").eq("family_id", familyId);

  if (error) {
    fail("Kurulum durumu kontrol edilemedi", error);
  }

  return (data ?? []).some((user) => !isAccountMarkerName(user.name));
}

function buildSetupRequiredSnapshot(
  session: AppSession,
  family: FamilyRecord | null
): DashboardPayload {
  return {
    authRequired: false,
    setupRequired: true,
    family,
    session: getDashboardSession(session),
    users: [],
    tasks: [],
    completions: [],
    rewards: [],
    redemptions: [],
    pointEvents: [],
    today: {
      dateKey: getDateKey(new Date(), family),
      label: getTurkishDateLabel(new Date(), family),
      weekday: new Intl.DateTimeFormat("tr-TR", {
        timeZone: "Europe/Istanbul",
        weekday: "long"
      }).format(new Date()),
      activeTimeBlock: getActiveTimeBlock(new Date(), family)
    },
    week: getWeekDays(new Date(), family)
  };
}

export async function bootstrapApp(account: AuthAccount, payload: SetupPayload) {
  if (!isSupabaseConfigured()) {
    return bootstrapLocalApp(account.accountId, payload);
  }

  const accountUser = await getAccountUserById(account.accountId);

  if (!accountUser || !isAccountUserRecord(accountUser)) {
    throw new Error("Hesap bulunamadi.");
  }

  if (isAccountSetupComplete(accountUser)) {
    throw new Error("Kurulum zaten tamamlandı.");
  }

  const supabase = createAdminClient();
  const sanitizedProfiles = payload.profiles.map((profile) => ({
    name: profile.name.trim(),
    role: profile.role,
    avatar: profile.avatar.trim(),
    color: profile.color.trim(),
    birthdate: profile.birthdate || null,
    visible_in_kiosk: true
  }));

  if (sanitizedProfiles.length === 0) {
    throw new Error("En az bir profil gerekli.");
  }

  let familyId = accountUser.family_id || account.familyId;

  if (!familyId) {
    familyId = await createPlaceholderFamily();
    await updateAccountUser(account.accountId, { family_id: familyId });
  }

  const [familyInternal, familyHasVisibleUsers] = await Promise.all([
    getFamilyInternal(familyId),
    hasVisibleUsers(familyId)
  ]);

  if (
    familyHasVisibleUsers ||
    (familyInternal && familyInternal.name !== ACCOUNT_PLACEHOLDER_FAMILY_NAME)
  ) {
    familyId = await createPlaceholderFamily();
    await updateAccountUser(account.accountId, { family_id: familyId });
  }

  const parentPinHash = await bcrypt.hash(payload.pin, 10);

  const { error: familyError } = await supabase
    .from("families")
    .update({
      name: payload.familyName,
      parent_pin_hash: parentPinHash
    })
    .eq("id", familyId);

  if (familyError) {
    fail("Aile olusturulamadi", familyError);
  }

  const insertedUsers = await Promise.all(
    sanitizedProfiles.map((profile) =>
      insertProfileUser(familyId, {
        name: profile.name,
        role: normalizeUserRole(profile.role),
        avatar: profile.avatar,
        color: profile.color,
        birthdate: profile.birthdate,
        visibleInKiosk: true
      })
    )
  );

  if (payload.includeSampleData) {
    const childIds = insertedUsers
      .filter((user) => user.role === CHILD_ROLE)
      .map((user) => user.id);
    const assignedUserIds = childIds.length > 0 ? childIds : insertedUsers.map((user) => user.id);

    const { error: tasksError } = await supabase.from("tasks").insert(
      SAMPLE_TASK_TEMPLATES.map((task) => ({
        family_id: familyId,
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
      fail("Örnek görevler eklenemedi", tasksError);
    }

    const { error: rewardsError } = await supabase.from("rewards").insert([
      {
        family_id: familyId,
        title: "Film gecesi secimi",
        points_required: 120,
        approval_required: false
      },
      {
        family_id: familyId,
        title: "Hafta sonu dondurma",
        points_required: 180,
        approval_required: true
      }
    ]);

    if (rewardsError) {
      fail("Örnek ödüller eklenemedi", rewardsError);
    }
  }

  await updateAccountUser(account.accountId, {
    family_id: familyId,
    color: ACCOUNT_READY_COLOR
  });

  return {
    familyId
  };
}

export async function getDashboardSnapshot(
  sessionOverride: AppSession | null = null
): Promise<DashboardPayload> {
  const session = sessionOverride || (await getAppSession());

  if (!isSupabaseConfigured()) {
    return getLocalDashboardSnapshot(session);
  }

  if (!session) {
    return getEmptyDashboardSnapshot(null);
  }

  if (!session.familyId) {
    return getEmptyDashboardSnapshot(session);
  }

  const accountUser = await getAccountUserById(session.accountId);

  if (!accountUser || !isAccountUserRecord(accountUser)) {
    return getEmptyDashboardSnapshot(null);
  }

  if (!isAccountSetupComplete(accountUser)) {
    return buildSetupRequiredSnapshot(session, null);
  }

  const familyInternal = await getFamilyInternal(session.familyId);

  if (!familyInternal) {
    return getEmptyDashboardSnapshot(session);
  }

  const family = toPublicFamilyRecord(familyInternal);

  if (!family) {
    return getEmptyDashboardSnapshot(session);
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
      .order("requested_at", { ascending: false }),
    supabase
      .from("point_events")
      .select("*")
      .eq("family_id", family.id)
      .order("created_at", { ascending: false })
      .limit(60)
  ]);

  if (usersResult.error) {
    fail("Kullanıcılar alınamadı", usersResult.error);
  }
  if (tasksResult.error) {
    fail("Görevler alınamadı", tasksResult.error);
  }
  if (completionsResult.error) {
    fail("Tamamlanma kayitlari alinamadi", completionsResult.error);
  }
  if (rewardsResult.error) {
    fail("Ödüller alınamadı", rewardsResult.error);
  }
  if (redemptionsResult.error) {
    fail("Ödül talepleri alınamadı", redemptionsResult.error);
  }
  if (eventsResult.error) {
    fail("Puan gecmisi alinamadi", eventsResult.error);
  }

  const visibleUsers = ((usersResult.data ?? []) as UserRecord[])
    .filter((user) => !isAccountUserRecord(user))
    .map(normalizeUserRecord);

  if (visibleUsers.length === 0) {
    return buildSetupRequiredSnapshot(session, null);
  }

  return {
    authRequired: false,
    setupRequired: false,
    family,
    session: getDashboardSession(session),
    users: visibleUsers,
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

export async function verifyParentPin(familyId: string, pin: string) {
  if (!isSupabaseConfigured()) {
    return verifyLocalParentPin(familyId, pin);
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("families")
    .select("*")
    .eq("id", familyId)
    .single();

  if (error) {
    fail("PIN dogrulanamadi", error);
  }

  const family = data as InternalFamilyRecord;
  const matched = await bcrypt.compare(pin, family.parent_pin_hash);

  if (!matched) {
    throw new Error("PIN hatali.");
  }

  const publicFamily = toPublicFamilyRecord(family);

  if (!publicFamily) {
    throw new Error("Aile bilgisi alinamadi.");
  }

  return publicFamily;
}

export async function changeParentPin(
  familyId: string,
  payload: ParentPinChangePayload
) {
  const currentPin = payload.currentPin?.trim() ?? "";
  const newPin = payload.newPin?.trim() ?? "";

  if (!currentPin) {
    throw new Error("Mevcut PIN gerekli.");
  }

  if (newPin.length < 4) {
    throw new Error("Yeni PIN en az 4 haneli olmalı.");
  }

  if (!isSupabaseConfigured()) {
    return updateLocalParentPin(familyId, currentPin, newPin);
  }

  await verifyParentPin(familyId, currentPin);

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("families")
    .update({ parent_pin_hash: await bcrypt.hash(newPin, 10) })
    .eq("id", familyId);

  if (error) {
    fail("Yönetim PIN'i güncellenemedi", error);
  }
}

export async function saveUser(familyId: string, payload: UserFormPayload) {
  if (!isSupabaseConfigured()) {
    return saveLocalUser(familyId, payload);
  }

  if (isAccountMarkerName(payload.name.trim())) {
    throw new Error("Bu isim kullanilamaz.");
  }

  const supabase = createAdminClient();

  if (payload.id) {
    const { data: existing, error: existingError } = await supabase
      .from("users")
      .select("id, name")
      .eq("id", payload.id)
      .eq("family_id", familyId)
      .maybeSingle();

    if (existingError) {
      fail("Kullanıcı güncellenemedi", existingError);
    }

    if (!existing) {
      throw new Error("Kullanıcı bulunamadı.");
    }

    if (isAccountMarkerName(existing.name)) {
      throw new Error("Bu profil duzenlenemez.");
    }

    await updateProfileUser(familyId, payload.id, {
      name: payload.name,
      role: normalizeUserRole(payload.role),
      avatar: payload.avatar,
      color: payload.color,
      birthdate: payload.birthdate || null,
      visibleInKiosk: true
    });

    return;
  }

  await insertProfileUser(familyId, {
    name: payload.name,
    role: normalizeUserRole(payload.role),
    avatar: payload.avatar,
    color: payload.color,
    birthdate: payload.birthdate || null,
    visibleInKiosk: true
  });
}

export async function deleteUserProfile(familyId: string, userId: string) {
  if (!isSupabaseConfigured()) {
    return deleteLocalUser(familyId, userId);
  }

  const supabase = createAdminClient();
  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("id, name")
    .eq("family_id", familyId)
    .order("created_at");

  if (usersError) {
    fail("Profiller alınamadı", usersError);
  }

  const visibleProfiles = ((users ?? []) as Array<{ id: string; name: string }>).filter(
    (user) => !isAccountMarkerName(user.name)
  );
  const targetUser = visibleProfiles.find((user) => user.id === userId);

  if (!targetUser) {
    throw new Error("Profil bulunamadı.");
  }

  if (visibleProfiles.length <= 1) {
    throw new Error("Son profil silinemez.");
  }

  const { data: tasks, error: tasksError } = await supabase
    .from("tasks")
    .select("id, assigned_to")
    .eq("family_id", familyId)
    .contains("assigned_to", [userId]);

  if (tasksError) {
    fail("Profille ilişkili görevler alınamadı", tasksError);
  }

  const taskMutations = (tasks ?? []).map((task) => {
    const remainingAssignedTo = ((task.assigned_to as string[] | null) ?? []).filter(
      (assignedId) => assignedId !== userId
    );

    if (remainingAssignedTo.length === 0) {
      return supabase.from("tasks").delete().eq("id", task.id).eq("family_id", familyId);
    }

    return supabase
      .from("tasks")
      .update({ assigned_to: remainingAssignedTo })
      .eq("id", task.id)
      .eq("family_id", familyId);
  });

  const mutationResults = await Promise.all(taskMutations);
  const failedTaskMutation = mutationResults.find((result) => result.error);

  if (failedTaskMutation?.error) {
    fail("Profil görevlerden kaldırılamadı", failedTaskMutation.error);
  }

  const { error: deleteError } = await supabase
    .from("users")
    .delete()
    .eq("id", userId)
    .eq("family_id", familyId);

  if (deleteError) {
    fail("Profil silinemedi", deleteError);
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
    icon: payload.icon?.trim() || DEFAULT_TASK_ICON,
    points: payload.points,
    assigned_to: payload.assignedTo,
    schedule_type: payload.scheduleType,
    days: payload.days,
    special_dates: payload.specialDates,
    time_block: payload.timeBlock
  };

  if (payload.id) {
    const { data, error } = await supabase
      .from("tasks")
      .update(base)
      .eq("id", payload.id)
      .eq("family_id", familyId)
      .select("id")
      .maybeSingle();

    if (error) {
      fail("Görev güncellenemedi", error);
    }

    if (!data) {
      throw new Error("Görev bulunamadı.");
    }

    return;
  }

  const { error } = await supabase.from("tasks").insert(base);

  if (error) {
    fail("Görev oluşturulamadı", error);
  }
}

export async function reorderTasks(familyId: string, orderedTaskIds: string[]) {
  if (!orderedTaskIds.length) {
    return;
  }

  if (!isSupabaseConfigured()) {
    return reorderLocalTasks(familyId, orderedTaskIds);
  }

  const supabase = createAdminClient();
  const uniqueTaskIds = Array.from(new Set(orderedTaskIds));
  const { data, error } = await supabase
    .from("tasks")
    .select("id, created_at")
    .eq("family_id", familyId)
    .in("id", uniqueTaskIds)
    .order("created_at");

  if (error) {
    fail("Görev sırası alınamadı", error);
  }

  const existingTasks = data ?? [];
  if (existingTasks.length < 2) {
    return;
  }

  const taskLookup = new Map(existingTasks.map((task) => [task.id, task]));
  const orderedExistingIds = uniqueTaskIds.filter((id) => taskLookup.has(id));

  if (orderedExistingIds.length < 2) {
    return;
  }

  const firstCreatedAt = existingTasks[0]?.created_at;
  const baseTime = Number.isNaN(Date.parse(firstCreatedAt ?? ""))
    ? Date.now()
    : Date.parse(firstCreatedAt as string);

  const updates = orderedExistingIds.map((taskId, index) =>
    supabase
      .from("tasks")
      .update({ created_at: new Date(baseTime + index).toISOString() })
      .eq("id", taskId)
      .eq("family_id", familyId)
  );

  const results = await Promise.all(updates);
  const failedResult = results.find((result) => result.error);

  if (failedResult?.error) {
    fail("Görev sırası güncellenemedi", failedResult.error);
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
    const { data, error } = await supabase
      .from("rewards")
      .update(base)
      .eq("id", payload.id)
      .eq("family_id", familyId)
      .select("id")
      .maybeSingle();

    if (error) {
      fail("Ödül güncellenemedi", error);
    }

    if (!data) {
      throw new Error("Ödül bulunamadı.");
    }

    return;
  }

  const { error } = await supabase.from("rewards").insert(base);

  if (error) {
    fail("Ödül oluşturulamadı", error);
  }
}

export async function saveRewardSystemConfig(
  familyId: string,
  payload: Partial<{
    mode: RewardSystemMode;
    valueLabel: string;
    valuePerPoint: number;
  }>
) {
  if (!isSupabaseConfigured()) {
    return saveLocalRewardSystemConfig(familyId, payload);
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("rewards")
    .select("*")
    .eq("family_id", familyId);

  if (error) {
    fail("Puan sistemi ayarlari alinamadi", error);
  }

  const currentConfig = getRewardSystemConfig((data ?? []) as RewardRecord[]);
  const { modeReward, valueReward } = buildRewardSystemConfigRewards({
    mode: payload.mode ?? currentConfig.mode,
    valueLabel: payload.valueLabel ?? currentConfig.valueLabel,
    valuePerPoint: payload.valuePerPoint ?? currentConfig.valuePerPoint,
    modeRewardId: currentConfig.modeRewardId,
    valueRewardId: currentConfig.valueRewardId
  });

  await saveReward(familyId, modeReward);
  await saveReward(familyId, valueReward);
}

export async function toggleTaskCompletion(
  familyId: string,
  taskId: string,
  userId: string,
  dateKey: string
) {
  if (!isSupabaseConfigured()) {
    return toggleLocalTaskCompletion(familyId, taskId, userId, dateKey);
  }

  const supabase = createAdminClient();
  const [{ data: task, error: taskError }, { data: user, error: userError }] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, points")
      .eq("id", taskId)
      .eq("family_id", familyId)
      .maybeSingle(),
    supabase
      .from("users")
      .select("id, name, points")
      .eq("id", userId)
      .eq("family_id", familyId)
      .maybeSingle()
  ]);

  if (taskError) {
    fail("Görev doğrulanamadı", taskError);
  }

  if (userError) {
    fail("Kullanıcı doğrulanamadı", userError);
  }

  if (!task || !user || isAccountMarkerName(user.name)) {
    throw new Error("Bu islem bu hesaba ait olmayan bir kayit iceriyor.");
  }

  const { data: existingCompletion, error: completionLookupError } = await supabase
    .from("completions")
    .select("id, points_earned")
    .eq("family_id", familyId)
    .eq("task_id", taskId)
    .eq("user_id", userId)
    .eq("completion_date", dateKey)
    .maybeSingle();

  if (completionLookupError) {
    fail("Görev kaydı kontrol edilemedi", completionLookupError);
  }

  if (existingCompletion) {
    const nextPoints = user.points - existingCompletion.points_earned;
    const [deleteResult, userUpdateResult, eventInsertResult] = await Promise.all([
      supabase
        .from("completions")
        .delete()
        .eq("id", existingCompletion.id)
        .eq("family_id", familyId),
      supabase
        .from("users")
        .update({ points: nextPoints })
        .eq("id", userId)
        .eq("family_id", familyId),
      supabase.from("point_events").insert({
        family_id: familyId,
        user_id: userId,
        delta: -existingCompletion.points_earned,
        source: "gorev",
        task_id: taskId,
        reward_id: null,
        note: "Görev geri alındı"
      })
    ]);

    if (deleteResult.error) {
      fail("Tamamlanan görev geri alınamadı", deleteResult.error);
    }

    if (userUpdateResult.error) {
      fail("Kullanıcı puanı geri alınamadı", userUpdateResult.error);
    }

    if (eventInsertResult.error) {
      fail("Görev geçmişi güncellenemedi", eventInsertResult.error);
    }

    return {
      completed: false,
      points_change: -existingCompletion.points_earned,
      total_points: nextPoints
    };
  }

  const { data, error } = await supabase.rpc("toggle_task_completion", {
    p_user_id: userId,
    p_task_id: taskId,
    p_completion_date: dateKey
  });

  if (error) {
    fail("Görev işlenemedi", error);
  }

  return data?.[0] ?? null;
}

export async function requestReward(familyId: string, userId: string, rewardId: string) {
  if (!isSupabaseConfigured()) {
    return requestLocalReward(familyId, userId, rewardId);
  }

  const supabase = createAdminClient();
  const [{ data: user, error: userError }, { data: reward, error: rewardError }] =
    await Promise.all([
      supabase
        .from("users")
        .select("id, name")
        .eq("id", userId)
        .eq("family_id", familyId)
        .maybeSingle(),
      supabase
        .from("rewards")
        .select("id")
        .eq("id", rewardId)
        .eq("family_id", familyId)
        .maybeSingle()
    ]);

  if (userError) {
    fail("Kullanıcı doğrulanamadı", userError);
  }

  if (rewardError) {
    fail("Ödül doğrulanamadı", rewardError);
  }

  if (!user || !reward || isAccountMarkerName(user.name)) {
    throw new Error("Bu ödül talebi bu hesaba ait değil.");
  }

  const { data, error } = await supabase.rpc("request_reward_redemption", {
    p_user_id: userId,
    p_reward_id: rewardId
  });

  if (error) {
    fail("Ödül talebi oluşturulamadı", error);
  }

  return data?.[0] ?? null;
}

export async function resolveReward(
  familyId: string,
  redemptionId: string,
  status: "onaylandi" | "reddedildi"
) {
  if (!isSupabaseConfigured()) {
    return resolveLocalReward(familyId, redemptionId, status);
  }

  await ensureFamilyRecordExists("redemptions", redemptionId, familyId);

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("resolve_redemption", {
    p_redemption_id: redemptionId,
    p_status: status
  });

  if (error) {
    fail("Ödül talebi güncellenemedi", error);
  }

  return data?.[0] ?? null;
}

export async function adjustPoints(familyId: string, userId: string, delta: number, note: string) {
  if (!isSupabaseConfigured()) {
    return adjustLocalPoints(familyId, userId, delta, note);
  }

  const supabase = createAdminClient();
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id, name")
    .eq("id", userId)
    .eq("family_id", familyId)
    .maybeSingle();

  if (userError) {
    fail("Kullanıcı doğrulanamadı", userError);
  }

  if (!user || isAccountMarkerName(user.name)) {
    throw new Error("Bu kullanıcı bulunamadı.");
  }

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
    fail("Tamamlanmalar sıfırlanamadı", completionsError);
  }

  const { error: redemptionsError } = await supabase
    .from("redemptions")
    .delete()
    .eq("family_id", familyId);

  if (redemptionsError) {
    fail("Ödül talepleri sıfırlanamadı", redemptionsError);
  }

  const { error: pointEventsError } = await supabase
    .from("point_events")
    .delete()
    .eq("family_id", familyId);

  if (pointEventsError) {
    fail("Puan geçmişi sıfırlanamadı", pointEventsError);
  }

  const { error: usersError } = await supabase
    .from("users")
    .update({ points: 0 })
    .eq("family_id", familyId);

  if (usersError) {
    fail("Kullanıcı puanları sıfırlanamadı", usersError);
  }
}

export async function updateFamilySettings(
  familyId: string,
  payload: Partial<{
    name: FamilySettingsPayload["name"];
    theme: FamilySettingsPayload["theme"];
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
