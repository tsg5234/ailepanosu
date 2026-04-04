import "server-only";

import { compareSync, hashSync } from "bcryptjs";
import { randomUUID } from "node:crypto";
import type { AppSession } from "@/lib/auth";
import {
  buildRewardSystemConfigRewards,
  getRewardSystemConfig
} from "@/lib/reward-system";
import { buildSampleTasks } from "@/lib/sample-data";
import { DEFAULT_TASK_ICON } from "@/lib/task-defaults";
import {
  getActiveTimeBlock,
  getDateKey,
  getTurkishDateLabel,
  getWeekDays
} from "@/lib/schedule";
import type {
  CompletionRecord,
  DashboardPayload,
  FamilySettingsPayload,
  FamilyRecord,
  PointEventRecord,
  RedemptionRecord,
  RewardFormPayload,
  RewardSystemMode,
  RewardRecord,
  SetupPayload,
  TaskFormPayload,
  TaskRecord,
  UserFormPayload,
  UserRecord
} from "@/lib/types";

interface LocalAccountRecord {
  id: string;
  username: string;
  password_hash: string;
  family_id: string | null;
  created_at: string;
}

interface LocalFamilyRecord extends FamilyRecord {
  parent_pin_hash: string;
}

interface LocalFamilyState {
  family: LocalFamilyRecord;
  users: UserRecord[];
  tasks: TaskRecord[];
  completions: CompletionRecord[];
  rewards: RewardRecord[];
  redemptions: RedemptionRecord[];
  pointEvents: PointEventRecord[];
}

interface LocalState {
  accounts: LocalAccountRecord[];
  families: Record<string, LocalFamilyState>;
}

declare global {
  var evProgramLocalState: LocalState | undefined;
}

function nowIso() {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
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

function getState() {
  globalThis.evProgramLocalState ??= {
    accounts: [],
    families: {}
  };

  return globalThis.evProgramLocalState;
}

function getPublicFamilyRecord(family: LocalFamilyRecord): FamilyRecord {
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

function normalizeLocalUserRecord(user: UserRecord): UserRecord {
  return {
    ...user,
    visible_in_kiosk: true
  };
}

function getFamilyState(familyId: string) {
  const familyState = getState().families[familyId];

  if (!familyState) {
    throw new Error("Aile kaydi bulunamadi.");
  }

  return familyState;
}

function toSnapshot(session: AppSession | null): DashboardPayload {
  if (!session) {
    return getEmptyDashboardSnapshot(null);
  }

  if (!session.familyId) {
    return getEmptyDashboardSnapshot(session);
  }

  const familyState = getState().families[session.familyId];

  if (!familyState) {
    return getEmptyDashboardSnapshot(session);
  }

  return {
    authRequired: false,
    setupRequired: false,
    family: getPublicFamilyRecord(familyState.family),
    session: getDashboardSession(session),
    users: clone(familyState.users).map(normalizeLocalUserRecord),
    tasks: clone(familyState.tasks),
    completions: clone(familyState.completions),
    rewards: clone(familyState.rewards),
    redemptions: clone(familyState.redemptions),
    pointEvents: clone(
      [...familyState.pointEvents]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 60)
    ),
    today: {
      dateKey: getDateKey(new Date(), familyState.family),
      label: getTurkishDateLabel(new Date(), familyState.family),
      weekday: new Intl.DateTimeFormat("tr-TR", {
        timeZone: "Europe/Istanbul",
        weekday: "long"
      }).format(new Date()),
      activeTimeBlock: getActiveTimeBlock(new Date(), familyState.family)
    },
    week: getWeekDays(new Date(), familyState.family)
  };
}

export async function getLocalDashboardSnapshot(session: AppSession | null = null) {
  return toSnapshot(session);
}

export async function registerLocalAccount(username: string, password: string) {
  const state = getState();

  if (state.accounts.some((account) => account.username === username)) {
    throw new Error("Bu kullanıcı adı zaten kullanılıyor.");
  }

  const account: LocalAccountRecord = {
    id: randomUUID(),
    username,
    password_hash: hashSync(password, 10),
    family_id: null,
    created_at: nowIso()
  };

  state.accounts.push(account);

  return {
    accountId: account.id,
    username: account.username,
    familyId: account.family_id,
    accessToken: randomUUID(),
    refreshToken: randomUUID()
  };
}

export async function loginLocalAccount(username: string, password: string) {
  const account = getState().accounts.find((item) => item.username === username);

  if (!account || !compareSync(password, account.password_hash)) {
    throw new Error("Kullanıcı adı veya şifre hatalı.");
  }

  return {
    accountId: account.id,
    username: account.username,
    familyId: account.family_id,
    accessToken: randomUUID(),
    refreshToken: randomUUID()
  };
}

export async function changeLocalAccountPassword(
  accountId: string,
  currentPassword: string,
  newPassword: string
) {
  const account = getState().accounts.find((item) => item.id === accountId);

  if (!account) {
    throw new Error("Hesap bulunamadı.");
  }

  if (!compareSync(currentPassword, account.password_hash)) {
    throw new Error("Mevcut şifre hatalı.");
  }

  if (newPassword.length < 6) {
    throw new Error("Yeni şifre en az 6 karakter olmalı.");
  }

  account.password_hash = hashSync(newPassword, 10);
}

export async function bootstrapLocalApp(accountId: string, payload: SetupPayload) {
  const state = getState();
  const account = state.accounts.find((item) => item.id === accountId);

  if (!account) {
    throw new Error("Hesap bulunamadi.");
  }

  if (account.family_id) {
    throw new Error("Kurulum zaten tamamlandı.");
  }

  const createdAt = nowIso();
  const familyId = randomUUID();
  const users = payload.profiles.map((profile) => ({
    id: randomUUID(),
    family_id: familyId,
    name: profile.name.trim(),
    role: profile.role,
    avatar: profile.avatar.trim(),
    color: profile.color.trim(),
    birthdate: profile.birthdate || null,
    visible_in_kiosk: true,
    points: 0,
    created_at: createdAt
  }));
  const childIds = users.filter((user) => user.role === "\u00e7ocuk").map((user) => user.id);
  const assignedUserIds = childIds.length > 0 ? childIds : users.map((user) => user.id);

  state.families[familyId] = {
    family: {
      id: familyId,
      name: payload.familyName,
      theme: "acik",
      audio_enabled: true,
      child_sleep_time: "22:00",
      parent_sleep_time: "00:00",
      day_reset_time: "00:00",
      created_at: createdAt,
      parent_pin_hash: hashSync(payload.pin, 10)
    },
    users,
    tasks: payload.includeSampleData ? buildSampleTasks(familyId, assignedUserIds, createdAt) : [],
    completions: [],
    rewards: payload.includeSampleData
      ? [
          {
            id: randomUUID(),
            family_id: familyId,
            title: "Film gecesi secimi",
            points_required: 120,
            approval_required: false,
            created_at: createdAt
          },
          {
            id: randomUUID(),
            family_id: familyId,
            title: "Hafta sonu dondurma",
            points_required: 180,
            approval_required: true,
            created_at: createdAt
          }
        ]
      : [],
    redemptions: [],
    pointEvents: []
  };

  account.family_id = familyId;

  return {
    familyId
  };
}

export async function verifyLocalParentPin(familyId: string, pin: string) {
  const family = getFamilyState(familyId).family;

  if (!compareSync(pin, family.parent_pin_hash)) {
    throw new Error("PIN hatali.");
  }

  return getPublicFamilyRecord(family);
}

export async function updateLocalParentPin(
  familyId: string,
  currentPin: string,
  newPin: string
) {
  const family = getFamilyState(familyId).family;

  if (!compareSync(currentPin, family.parent_pin_hash)) {
    throw new Error("Mevcut PIN hatalı.");
  }

  if (newPin.trim().length < 4) {
    throw new Error("Yeni PIN en az 4 haneli olmalı.");
  }

  family.parent_pin_hash = hashSync(newPin.trim(), 10);
}

export async function saveLocalUser(familyId: string, payload: UserFormPayload) {
  const familyState = getFamilyState(familyId);

  if (payload.id) {
    const target = familyState.users.find((user) => user.id === payload.id);

    if (!target) {
      throw new Error("Kullanıcı bulunamadı.");
    }

    target.name = payload.name;
    target.role = payload.role;
    target.avatar = payload.avatar;
    target.color = payload.color;
    target.birthdate = payload.birthdate || null;
    target.visible_in_kiosk = true;
    return;
  }

  familyState.users.push({
    id: randomUUID(),
    family_id: familyId,
    name: payload.name,
    role: payload.role,
    avatar: payload.avatar,
    color: payload.color,
    birthdate: payload.birthdate || null,
    visible_in_kiosk: true,
    points: 0,
    created_at: nowIso()
  });
}

export async function deleteLocalUser(familyId: string, userId: string) {
  const familyState = getFamilyState(familyId);
  const user = familyState.users.find((item) => item.id === userId);

  if (!user) {
    throw new Error("Profil bulunamadı.");
  }

  if (familyState.users.length <= 1) {
    throw new Error("Son profil silinemez.");
  }

  familyState.tasks = familyState.tasks
    .map((task) => ({
      ...task,
      assigned_to: task.assigned_to.filter((assignedId) => assignedId !== userId)
    }))
    .filter((task) => task.assigned_to.length > 0);

  familyState.completions = familyState.completions.filter((item) => item.user_id !== userId);
  familyState.redemptions = familyState.redemptions.filter((item) => item.user_id !== userId);
  familyState.pointEvents = familyState.pointEvents.filter((item) => item.user_id !== userId);
  familyState.users = familyState.users.filter((item) => item.id !== userId);
}

export async function saveLocalTask(familyId: string, payload: TaskFormPayload) {
  const familyState = getFamilyState(familyId);
  const existing = payload.id
    ? familyState.tasks.find((item) => item.id === payload.id)
    : null;

  const task: TaskRecord = {
    id: payload.id || randomUUID(),
    family_id: familyId,
    title: payload.title,
    icon: payload.icon?.trim() || DEFAULT_TASK_ICON,
    points: payload.points,
    assigned_to: payload.assignedTo,
    schedule_type: payload.scheduleType,
    days: payload.days,
    special_dates: payload.specialDates,
    time_block: payload.timeBlock,
    created_at: existing?.created_at || nowIso()
  };

  familyState.tasks = familyState.tasks.filter((item) => item.id !== task.id);
  familyState.tasks.push(task);
}

export async function reorderLocalTasks(familyId: string, orderedTaskIds: string[]) {
  const familyState = getFamilyState(familyId);
  const uniqueTaskIds = Array.from(new Set(orderedTaskIds));
  const taskLookup = new Map(familyState.tasks.map((task) => [task.id, task]));
  const orderedTasks = uniqueTaskIds.map((id) => taskLookup.get(id)).filter(Boolean) as TaskRecord[];

  if (orderedTasks.length < 2) {
    return;
  }

  const affectedTaskIds = new Set(orderedTasks.map((task) => task.id));
  const firstAffectedIndex = familyState.tasks.findIndex((task) => affectedTaskIds.has(task.id));

  if (firstAffectedIndex < 0) {
    return;
  }

  const remainingTasks = familyState.tasks.filter((task) => !affectedTaskIds.has(task.id));
  const baseTime = Number.isNaN(Date.parse(orderedTasks[0]?.created_at ?? ""))
    ? Date.now()
    : Date.parse(orderedTasks[0].created_at);

  orderedTasks.forEach((task, index) => {
    task.created_at = new Date(baseTime + index).toISOString();
  });

  remainingTasks.splice(firstAffectedIndex, 0, ...orderedTasks);
  familyState.tasks = remainingTasks;
}

export async function saveLocalReward(familyId: string, payload: RewardFormPayload) {
  const familyState = getFamilyState(familyId);
  const existing = payload.id
    ? familyState.rewards.find((item) => item.id === payload.id)
    : null;

  const reward: RewardRecord = {
    id: payload.id || randomUUID(),
    family_id: familyId,
    title: payload.title,
    points_required: payload.pointsRequired,
    approval_required: payload.approvalRequired,
    created_at: existing?.created_at || nowIso()
  };

  familyState.rewards = familyState.rewards.filter((item) => item.id !== reward.id);
  familyState.rewards.push(reward);
}

export async function saveLocalRewardSystemConfig(
  familyId: string,
  payload: Partial<{
    mode: RewardSystemMode;
    valueLabel: string;
    valuePerPoint: number;
  }>
) {
  const familyState = getFamilyState(familyId);
  const currentConfig = getRewardSystemConfig(familyState.rewards);
  const { modeReward, valueReward } = buildRewardSystemConfigRewards({
    mode: payload.mode ?? currentConfig.mode,
    valueLabel: payload.valueLabel ?? currentConfig.valueLabel,
    valuePerPoint: payload.valuePerPoint ?? currentConfig.valuePerPoint,
    modeRewardId: currentConfig.modeRewardId,
    valueRewardId: currentConfig.valueRewardId
  });

  await saveLocalReward(familyId, modeReward);
  await saveLocalReward(familyId, valueReward);
}

export async function toggleLocalTaskCompletion(
  familyId: string,
  taskId: string,
  userId: string,
  dateKey: string
) {
  const familyState = getFamilyState(familyId);
  const task = familyState.tasks.find((item) => item.id === taskId);
  const user = familyState.users.find((item) => item.id === userId);

  if (!task || !user) {
    throw new Error("Görev veya kullanıcı bulunamadı.");
  }

  const existing = familyState.completions.find(
    (item) =>
      item.task_id === taskId &&
      item.user_id === userId &&
      item.completion_date === dateKey
  );

  if (existing) {
    familyState.completions = familyState.completions.filter(
      (item) => item.id !== existing.id
    );
    user.points -= existing.points_earned;
    familyState.pointEvents.unshift({
      id: randomUUID(),
      family_id: familyId,
      user_id: userId,
      delta: -existing.points_earned,
      source: "gorev",
      task_id: taskId,
      reward_id: null,
      note: "Görev geri alındı",
      created_at: nowIso()
    });
    return { completed: false, points_change: -existing.points_earned, total_points: user.points };
  }

  familyState.completions.push({
    id: randomUUID(),
    family_id: familyId,
    user_id: userId,
    task_id: taskId,
    completion_date: dateKey,
    points_earned: task.points,
    created_at: nowIso()
  });

  user.points += task.points;
  familyState.pointEvents.unshift({
    id: randomUUID(),
    family_id: familyId,
    user_id: userId,
    delta: task.points,
    source: "gorev",
    task_id: taskId,
    reward_id: null,
    note: "Görev tamamlandı",
    created_at: nowIso()
  });

  return { completed: true, points_change: task.points, total_points: user.points };
}

export async function requestLocalReward(familyId: string, userId: string, rewardId: string) {
  const familyState = getFamilyState(familyId);
  const user = familyState.users.find((item) => item.id === userId);
  const reward = familyState.rewards.find((item) => item.id === rewardId);

  if (!user || !reward) {
    throw new Error("Kullanıcı veya ödül bulunamadı.");
  }

  if (user.points < reward.points_required) {
    throw new Error("Yeterli puan yok.");
  }

  const redemption: RedemptionRecord = {
    id: randomUUID(),
    family_id: familyId,
    user_id: userId,
    reward_id: rewardId,
    status: reward.approval_required ? "beklemede" : "onaylandi",
    requested_at: nowIso(),
    resolved_at: reward.approval_required ? null : nowIso()
  };

  familyState.redemptions.unshift(redemption);

  if (!reward.approval_required) {
    user.points -= reward.points_required;
    familyState.pointEvents.unshift({
      id: randomUUID(),
      family_id: familyId,
      user_id: userId,
      delta: -reward.points_required,
      source: "odul",
      task_id: null,
      reward_id: rewardId,
      note: "Ödül otomatik verildi",
      created_at: nowIso()
    });
  }

  return redemption;
}

export async function resolveLocalReward(
  familyId: string,
  redemptionId: string,
  status: "onaylandi" | "reddedildi"
) {
  const familyState = getFamilyState(familyId);
  const redemption = familyState.redemptions.find((item) => item.id === redemptionId);

  if (!redemption) {
    throw new Error("Talep bulunamadi.");
  }

  if (redemption.status !== "beklemede") {
    return redemption;
  }

  redemption.status = status;
  redemption.resolved_at = nowIso();

  if (status === "onaylandi") {
    const user = familyState.users.find((item) => item.id === redemption.user_id);
    const reward = familyState.rewards.find((item) => item.id === redemption.reward_id);

    if (!user || !reward) {
      throw new Error("Talep islenemedi.");
    }

    if (user.points < reward.points_required) {
      throw new Error("Onay icin yeterli puan yok.");
    }

    user.points -= reward.points_required;
    familyState.pointEvents.unshift({
      id: randomUUID(),
      family_id: familyId,
      user_id: user.id,
      delta: -reward.points_required,
      source: "odul",
      task_id: null,
      reward_id: reward.id,
      note: "Ödül onaylandı",
      created_at: nowIso()
    });
  }

  return redemption;
}

export async function adjustLocalPoints(
  familyId: string,
  userId: string,
  delta: number,
  note: string
) {
  const familyState = getFamilyState(familyId);
  const user = familyState.users.find((item) => item.id === userId);

  if (!user) {
    throw new Error("Kullanıcı bulunamadı.");
  }

  user.points += delta;
  familyState.pointEvents.unshift({
    id: randomUUID(),
    family_id: familyId,
    user_id: userId,
    delta,
    source: "manuel",
    task_id: null,
    reward_id: null,
    note,
    created_at: nowIso()
  });

  return { total_points: user.points };
}

export async function resetLocalProgress(familyId: string) {
  const familyState = getFamilyState(familyId);

  familyState.users = familyState.users.map((user) => ({
    ...user,
    points: 0
  }));
  familyState.completions = [];
  familyState.redemptions = [];
  familyState.pointEvents = [];
}

export async function updateLocalFamilySettings(
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
  const family = getFamilyState(familyId).family;

  if (typeof payload.name === "string" && payload.name.trim()) {
    family.name = payload.name.trim();
  }

  if (payload.theme) {
    family.theme = payload.theme;
  }

  if (typeof payload.audio_enabled === "boolean") {
    family.audio_enabled = payload.audio_enabled;
  }

  if (typeof payload.child_sleep_time === "string" && payload.child_sleep_time.trim()) {
    family.child_sleep_time = payload.child_sleep_time.trim();
  }

  if (typeof payload.parent_sleep_time === "string" && payload.parent_sleep_time.trim()) {
    family.parent_sleep_time = payload.parent_sleep_time.trim();
  }

  if (typeof payload.day_reset_time === "string" && payload.day_reset_time.trim()) {
    family.day_reset_time = payload.day_reset_time.trim();
  }
}
