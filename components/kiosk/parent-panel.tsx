"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Gift, Settings2, ShieldCheck, Star, Users } from "lucide-react";
import { AvatarDisplay } from "@/components/kiosk/avatar-display";
import { AvatarPicker } from "@/components/kiosk/avatar-picker";
import { getDefaultAvatar, normalizeAvatarForRole } from "@/lib/avatar";
import { isTaskScheduledForDate, TIME_BLOCK_LABELS, WEEKDAY_KEYS, WEEKDAY_LABELS } from "@/lib/schedule";
import { DEFAULT_TASK_ICON } from "@/lib/task-defaults";
import type {
  DashboardPayload,
  RewardFormPayload,
  TaskFormPayload,
  TaskRecord,
  TimeBlock,
  UserFormPayload
} from "@/lib/types";

type TabId = "kullanicilar" | "gorevler" | "oduller" | "puanlar" | "ayarlar";

interface ParentPanelProps {
  open: boolean;
  standalone?: boolean;
  data: DashboardPayload | null;
  working: boolean;
  onClose: () => void;
  onOpenLogin: () => void;
  onSaveUser: (payload: UserFormPayload) => Promise<void>;
  onSaveTask: (payload: TaskFormPayload) => Promise<void>;
  onSaveReward: (payload: RewardFormPayload) => Promise<void>;
  onResolveRedemption: (redemptionId: string, status: "onaylandi" | "reddedildi") => Promise<void>;
  onAdjustPoints: (userId: string, delta: number, note: string) => Promise<void>;
  onUndoTaskCompletion: (
    taskId: string,
    userId: string,
    dateKey: string,
    taskTitle: string
  ) => Promise<void>;
  onResetProgress: () => Promise<void>;
  onUpdateSettings: (payload: {
    name?: string;
    theme?: "acik" | "koyu";
    audioEnabled?: boolean;
    childSleepTime?: string;
    parentSleepTime?: string;
    dayResetTime?: string;
  }) => Promise<void>;
  onLogout: () => Promise<void>;
}

const tabs: Array<{ id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "kullanicilar", label: "Kullanıcılar", icon: Users },
  { id: "gorevler", label: "Görevler", icon: CheckCircle2 },
  { id: "oduller", label: "Ödüller", icon: Gift },
  { id: "puanlar", label: "Puanlar", icon: Star },
  { id: "ayarlar", label: "Ayarlar", icon: Settings2 }
];

const userDefaults: UserFormPayload = {
  name: "",
  role: "çocuk",
  avatar: getDefaultAvatar("çocuk"),
  color: "#FB923C",
  birthdate: ""
};

const taskDefaults: TaskFormPayload = {
  title: "",
  icon: DEFAULT_TASK_ICON,
  points: 20,
  assignedTo: [],
  scheduleType: "gunluk",
  days: [],
  specialDates: [],
  timeBlock: "sabah"
};

const rewardDefaults: RewardFormPayload = {
  title: "",
  pointsRequired: 120,
  approvalRequired: true
};

function createTaskDraft(ownerId?: string): TaskFormPayload {
  return {
    ...taskDefaults,
    assignedTo: ownerId ? [ownerId] : []
  };
}

function Card({
  title,
  description,
  children,
  className
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`glass-panel rounded-[2rem] p-5 ${className ?? ""}`}>
      <h3 className="text-xl font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-[color:var(--text-muted)]">{description}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-sm font-semibold text-[color:var(--text-muted)]">{children}</span>;
}

function toWeekText(days: string[]) {
  return days.map((day) => WEEKDAY_LABELS[day as keyof typeof WEEKDAY_LABELS] ?? day).join(", ");
}

const WEEKDAY_PRESETS = [
  { id: "her-gun", label: "Her gün", days: [...WEEKDAY_KEYS] },
  { id: "hafta-ici", label: "Hafta içi", days: WEEKDAY_KEYS.filter((day) => day !== "cts" && day !== "paz") },
  { id: "hafta-sonu", label: "Hafta sonu", days: ["cts", "paz"] }
] as const;

type TaskListTimeFilter = "tum" | TimeBlock;

const TASK_LIST_TIME_FILTERS: Array<{ id: TaskListTimeFilter; label: string }> = [
  { id: "tum", label: "Tüm" },
  { id: "sabah", label: TIME_BLOCK_LABELS.sabah },
  { id: "ogleden_sonra", label: TIME_BLOCK_LABELS.ogleden_sonra },
  { id: "aksam", label: TIME_BLOCK_LABELS.aksam },
  { id: "her_zaman", label: TIME_BLOCK_LABELS.her_zaman }
];

const TASK_TIME_BLOCK_ORDER: Record<TimeBlock, number> = {
  sabah: 0,
  ogleden_sonra: 1,
  aksam: 2,
  her_zaman: 3
};

function hasSameDays(left: string[], right: readonly string[]) {
  return WEEKDAY_KEYS.every((key) => left.includes(key) === right.includes(key));
}

function getTaskScheduleSummary(task: TaskRecord) {
  if (task.schedule_type === "gunluk") {
    return "Her gün";
  }

  if (task.schedule_type === "haftalik") {
    return toWeekText(task.days);
  }

  return task.special_dates.join(", ");
}

function summarizeAssignedUsers(names: string[]) {
  if (names.length === 0) {
    return "Atama yok";
  }

  if (names.length <= 2) {
    return names.join(", ");
  }

  return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

export function ParentPanel(props: ParentPanelProps) {
  const {
    open,
    standalone,
    data,
    working,
    onClose,
    onOpenLogin,
    onSaveUser,
    onSaveTask,
    onSaveReward,
    onResolveRedemption,
    onAdjustPoints,
    onUndoTaskCompletion,
    onResetProgress,
    onUpdateSettings,
    onLogout
  } = props;

  const [tab, setTab] = useState<TabId>("kullanicilar");
  const [userDraft, setUserDraft] = useState<UserFormPayload>(userDefaults);
  const [taskDraft, setTaskDraft] = useState<TaskFormPayload>(taskDefaults);
  const [rewardDraft, setRewardDraft] = useState<RewardFormPayload>(rewardDefaults);
  const [specialDate, setSpecialDate] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [theme, setTheme] = useState<"acik" | "koyu">("acik");
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [childSleepTime, setChildSleepTime] = useState("22:00");
  const [parentSleepTime, setParentSleepTime] = useState("00:00");
  const [dayResetTime, setDayResetTime] = useState("00:00");
  const [pointsUserId, setPointsUserId] = useState("");
  const [pointsDelta, setPointsDelta] = useState(10);
  const [pointsNote, setPointsNote] = useState("Bonus puan");
  const [taskSearch, setTaskSearch] = useState("");
  const [taskTimeFilter, setTaskTimeFilter] = useState<TaskListTimeFilter>("tum");
  const [showTaskPotentialDetails, setShowTaskPotentialDetails] = useState(false);
  const [taskUserView, setTaskUserView] = useState<string>("tum");

  useEffect(() => {
    if (!data?.family) {
      return;
    }
    setFamilyName(data.family.name);
    setTheme(data.family.theme);
    setAudioEnabled(data.family.audio_enabled);
    setChildSleepTime(data.family.child_sleep_time || "22:00");
    setParentSleepTime(data.family.parent_sleep_time || "00:00");
    setDayResetTime(data.family.day_reset_time || "00:00");
    setPointsUserId((current) => current || data.users[0]?.id || "");
  }, [data]);

  useEffect(() => {
    if (!data?.users.length) {
      setTaskUserView("tum");
      return;
    }

    const validUserIds = new Set(data.users.map((user) => user.id));

    setTaskUserView((current) => (current === "tum" || validUserIds.has(current) ? current : data.users[0].id));
    setTaskDraft((current) => {
      const currentOwnerId = current.assignedTo[0];
      if (currentOwnerId && validUserIds.has(currentOwnerId)) {
        return current;
      }

      return createTaskDraft(data.users[0].id);
    });
  }, [data?.users]);

  useEffect(() => {
    if (taskUserView === "tum") {
      return;
    }

    setTaskDraft((current) => {
      if (current.id || current.assignedTo[0] === taskUserView) {
        return current;
      }

      return {
        ...current,
        assignedTo: [taskUserView]
      };
    });
  }, [taskUserView]);

  const userLookup = useMemo(
    () => Object.fromEntries((data?.users ?? []).map((user) => [user.id, user])),
    [data?.users]
  );
  const rewardLookup = useMemo(
    () => Object.fromEntries((data?.rewards ?? []).map((reward) => [reward.id, reward])),
    [data?.rewards]
  );
  const taskUsers = data?.users ?? [];
  const selectedTaskUser = taskUserView !== "tum" ? userLookup[taskUserView] : undefined;
  const taskLookup = useMemo(
    () => Object.fromEntries((data?.tasks ?? []).map((task) => [task.id, task])),
    [data?.tasks]
  );
  const filteredTaskGroups = useMemo(() => {
    const searchTerm = taskSearch.trim().toLocaleLowerCase("tr-TR");
    const filteredTasks = (data?.tasks ?? []).filter((task) => {
      const matchesUser = taskUserView === "tum" || task.assigned_to.includes(taskUserView);
      if (!matchesUser) {
        return false;
      }

      const matchesTime = taskTimeFilter === "tum" || task.time_block === taskTimeFilter;
      if (!matchesTime) {
        return false;
      }

      if (!searchTerm) {
        return true;
      }

      const assignedNames = task.assigned_to
        .map((id) => userLookup[id]?.name ?? "")
        .join(" ")
        .toLocaleLowerCase("tr-TR");

      return [
        task.title,
        TIME_BLOCK_LABELS[task.time_block],
        getTaskScheduleSummary(task),
        assignedNames
      ]
        .join(" ")
        .toLocaleLowerCase("tr-TR")
        .includes(searchTerm);
    });

    const grouped = new Map<
      string,
      {
        key: string;
        title: string;
        icon: string;
        entries: TaskRecord[];
        assignedSummary: string;
      }
    >();

    filteredTasks.forEach((task) => {
      const key = task.title.trim().toLocaleLowerCase("tr-TR");
      const assignedNames = Array.from(
        new Set(task.assigned_to.map((id) => userLookup[id]?.name).filter(Boolean) as string[])
      );

      const existing = grouped.get(key);
      if (existing) {
        existing.entries.push(task);
        const mergedNames = Array.from(
          new Set(
            existing.entries.flatMap((item) =>
              item.assigned_to.map((id) => userLookup[id]?.name).filter(Boolean) as string[]
            )
          )
        );
        existing.assignedSummary = summarizeAssignedUsers(mergedNames);
        return;
      }

      grouped.set(key, {
        key,
        title: task.title,
        icon: task.icon || DEFAULT_TASK_ICON,
        entries: [task],
        assignedSummary: summarizeAssignedUsers(assignedNames)
      });
    });

    return Array.from(grouped.values())
      .map((group) => ({
        ...group,
        entries: [...group.entries].sort((left, right) => {
          const timeOrder = TASK_TIME_BLOCK_ORDER[left.time_block] - TASK_TIME_BLOCK_ORDER[right.time_block];
          if (timeOrder !== 0) {
            return timeOrder;
          }

          return left.points - right.points;
        })
      }))
      .sort((left, right) => left.title.localeCompare(right.title, "tr"));
  }, [data?.tasks, taskSearch, taskTimeFilter, taskUserView, userLookup]);
  const filteredTaskCount = useMemo(
    () => filteredTaskGroups.reduce((total, group) => total + group.entries.length, 0),
    [filteredTaskGroups]
  );
  const visibleTaskPoints = useMemo(
    () =>
      filteredTaskGroups.reduce(
        (total, group) => total + group.entries.reduce((groupTotal, task) => groupTotal + task.points, 0),
        0
      ),
    [filteredTaskGroups]
  );
  const todaysPotentialByUser = useMemo(() => {
    if (!data?.family) {
      return [];
    }

    const now = new Date();

    return data.users
      .map((user) => {
        const todaysTasks = data.tasks.filter(
          (task) =>
            task.assigned_to.includes(user.id) &&
            isTaskScheduledForDate(task, data.today.dateKey, now, data.family)
        );

        return {
          user,
          taskCount: todaysTasks.length,
          points: todaysTasks.reduce((total, task) => total + task.points, 0)
        };
      })
      .filter((item) => item.taskCount > 0)
      .sort((left, right) => {
        if (right.points !== left.points) {
          return right.points - left.points;
        }

        return left.user.name.localeCompare(right.user.name, "tr");
      });
  }, [data]);
  const todaysFamilyPotential = useMemo(
    () => todaysPotentialByUser.reduce((total, item) => total + item.points, 0),
    [todaysPotentialByUser]
  );
  const selectedTaskUserPotential = useMemo(
    () => (taskUserView === "tum" ? undefined : todaysPotentialByUser.find((item) => item.user.id === taskUserView)),
    [taskUserView, todaysPotentialByUser]
  );
  const selectedPointUser = pointsUserId ? userLookup[pointsUserId] : undefined;
  const todaysCompletedTasks = useMemo(() => {
    if (!data || !pointsUserId) {
      return [];
    }

    return data.completions
      .filter((completion) => completion.user_id === pointsUserId && completion.completion_date === data.today.dateKey)
      .map((completion) => ({
        completion,
        task: taskLookup[completion.task_id]
      }))
      .filter((item) => item.task)
      .sort((left, right) => Date.parse(right.completion.created_at) - Date.parse(left.completion.created_at));
  }, [data, pointsUserId, taskLookup]);

  const loadTaskIntoDraft = (task: TaskRecord) => {
    const focusedOwnerId =
      taskUserView !== "tum" && task.assigned_to.includes(taskUserView)
        ? taskUserView
        : task.assigned_to[0] ?? "";

    setTaskDraft({
      id: task.id,
      title: task.title,
      icon: task.icon || DEFAULT_TASK_ICON,
      points: task.points,
      assignedTo: focusedOwnerId ? [focusedOwnerId] : task.assigned_to,
      scheduleType: task.schedule_type,
      days: task.days,
      specialDates: task.special_dates,
      timeBlock: task.time_block
    });
  };

  const lockedView = (
    <div className="flex min-h-0 flex-1 items-center justify-center p-8">
      <div className="glass-panel-strong max-w-xl rounded-[2rem] p-8 text-center">
        <ShieldCheck className="mx-auto h-12 w-12 text-teal-600" />
        <h2 className="mt-4 text-3xl font-semibold">Yonetim girisi gerekli</h2>
        <p className="mt-3 text-[color:var(--text-muted)]">
          Yonetim araclari yalnizca PIN dogrulamasi ile acilir.
        </p>
        <button
          onClick={onOpenLogin}
          className="mt-6 rounded-[1.4rem] bg-slate-950 px-5 py-3 font-semibold text-white"
        >
          PIN ile giriş yap
        </button>
      </div>
    </div>
  );

  const usersTab = (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.05fr)_380px]">
      <Card title="Profil düzenleyici" description="Ebeveyn ve çocuk profillerini buradan yönetin.">
        <div className="space-y-4">
          <label className="block space-y-2">
            <Label>İsim</Label>
            <input
              value={userDraft.name}
              onChange={(event) => setUserDraft((current) => ({ ...current, name: event.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
            />
          </label>
          <div className="grid gap-4 md:grid-cols-2 md:items-end">
            <label className="block space-y-2">
              <Label>Rol</Label>
              <select
                value={userDraft.role}
                onChange={(event) =>
                  setUserDraft((current) => ({
                    ...current,
                    role: event.target.value as UserFormPayload["role"],
                    avatar: normalizeAvatarForRole(
                      event.target.value as UserFormPayload["role"],
                      current.avatar
                    ),
                    birthdate:
                      event.target.value === "ebeveyn" ? null : current.birthdate
                  }))
                }
                className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
              >
                <option value="çocuk">Çocuk</option>
                <option value="ebeveyn">Ebeveyn</option>
              </select>
            </label>
            <label className="block space-y-2">
              <Label>Doğum tarihi</Label>
              <input
                type="date"
                value={userDraft.birthdate ?? ""}
                onChange={(event) => setUserDraft((current) => ({ ...current, birthdate: event.target.value }))}
                className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
              />
            </label>
          </div>
          <AvatarPicker
            compact
            role={userDraft.role}
            value={userDraft.avatar}
            onChange={(avatar) => setUserDraft((current) => ({ ...current, avatar }))}
          />
          <label className="block space-y-2">
            <Label>Renk</Label>
            <div className="flex h-14 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2">
              <input
                type="color"
                value={userDraft.color}
                onChange={(event) => setUserDraft((current) => ({ ...current, color: event.target.value }))}
                className="h-10 w-14 rounded-xl"
              />
              <span className="font-medium">{userDraft.color}</span>
            </div>
          </label>
          <div className="flex gap-3">
            <button
              onClick={() => onSaveUser(userDraft)}
              disabled={working}
              className="rounded-[1.4rem] bg-slate-950 px-5 py-3 font-semibold text-white disabled:opacity-60"
            >
              {userDraft.id ? "Güncelle" : "Kullanıcı ekle"}
            </button>
            <button
              onClick={() => setUserDraft(userDefaults)}
              className="rounded-[1.4rem] bg-slate-200 px-5 py-3 font-semibold text-slate-800"
            >
              Temizle
            </button>
          </div>
        </div>
      </Card>

      <Card
        title="Mevcut profiller"
        description="Düzenlemek için bir profile dokunun."
        className="xl:sticky xl:top-0"
      >
        <div className="soft-scrollbar grid max-h-[calc(100dvh-17rem)] gap-3 overflow-y-auto pr-1 md:grid-cols-2 xl:grid-cols-1">
          {data?.users.map((user) => (
            <button
              key={user.id}
              onClick={() =>
                setUserDraft({
                  id: user.id,
                  name: user.name,
                  role: user.role,
                  avatar: user.avatar,
                  color: user.color,
                  birthdate: user.birthdate ?? ""
                })
              }
              className="rounded-[1.6rem] border border-slate-200 bg-white/80 p-4 text-left"
            >
              <div className="flex items-center gap-4">
                <div
                  className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-[1.3rem] text-3xl"
                  style={{ backgroundColor: `${user.color}22`, color: user.color }}
                >
                  <AvatarDisplay avatar={user.avatar} name={user.name} />
                </div>
                <div>
                  <div className="text-lg font-semibold">{user.name}</div>
                  <div className="text-sm text-[color:var(--text-muted)]">
                    {user.role === "ebeveyn" ? "Ebeveyn" : "Cocuk"} • {user.points} puan
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );

  const tasksTab = (
    <div className="space-y-5">
      <div className="glass-panel rounded-[1.8rem] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-950">Kişiye göre görev yönetimi</div>
            <div className="text-sm text-[color:var(--text-muted)]">
              Her profilin görevini ve puanını ayrı ayrı planla.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setTaskUserView("tum")}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                taskUserView === "tum" ? "bg-slate-950 text-white" : "bg-white ring-1 ring-slate-200"
              }`}
            >
              Tümü
            </button>
            {taskUsers.map((user) => {
              const active = taskUserView === user.id;
              return (
                <button
                  key={user.id}
                  onClick={() => setTaskUserView(user.id)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold ${
                    active ? "bg-slate-950 text-white" : "bg-white ring-1 ring-slate-200"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-base">
                      <AvatarDisplay avatar={user.avatar} name={user.name} />
                    </span>
                    <span>{user.name}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
      <Card title="Görev düzenleyici" description="Tablet ekranında görünecek görevleri planlayın.">
        <div className="space-y-4">
          <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700">
            {selectedTaskUser ? (
              <span>
                Şu an <strong>{selectedTaskUser.name}</strong> için görev planlıyorsun.
              </span>
            ) : (
              <span>Önce üstten bir profil seç, sonra o kişiye özel görev planla.</span>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
            <label className="block space-y-2">
              <Label>Başlık</Label>
              <input
                value={taskDraft.title}
                onChange={(event) => setTaskDraft((current) => ({ ...current, title: event.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
              />
            </label>
            <label className="block space-y-2">
              <Label>Puan</Label>
              <input
                type="number"
                min={5}
                value={taskDraft.points}
                onChange={(event) =>
                  setTaskDraft((current) => ({ ...current, points: Number(event.target.value || 0) }))
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
              />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-2">
              <Label>Zamanlama</Label>
              <select
                value={taskDraft.scheduleType}
                onChange={(event) =>
                  setTaskDraft((current) => ({
                    ...current,
                    scheduleType: event.target.value as TaskFormPayload["scheduleType"],
                    days: event.target.value === "haftalik" ? current.days : [],
                    specialDates: event.target.value === "ozel" ? current.specialDates : []
                  }))
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
              >
                <option value="gunluk">Günlük</option>
                <option value="haftalik">Haftalık</option>
                <option value="ozel">Özel günler</option>
              </select>
            </label>
            <label className="block space-y-2">
              <Label>Zaman dilimi</Label>
              <select
                value={taskDraft.timeBlock}
                onChange={(event) =>
                  setTaskDraft((current) => ({
                    ...current,
                    timeBlock: event.target.value as TaskFormPayload["timeBlock"]
                  }))
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
              >
                {Object.entries(TIME_BLOCK_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {taskDraft.scheduleType === "haftalik" ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {WEEKDAY_PRESETS.map((preset) => {
                  const active = hasSameDays(taskDraft.days, preset.days);
                  return (
                    <button
                      key={preset.id}
                      onClick={() => setTaskDraft((current) => ({ ...current, days: [...preset.days] }))}
                      className={`rounded-full px-4 py-2 text-sm font-semibold ${
                        active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-2">
                {WEEKDAY_KEYS.map((key) => {
                  const label = WEEKDAY_LABELS[key];
                  const active = taskDraft.days.includes(key);
                  return (
                    <button
                      key={key}
                      onClick={() =>
                        setTaskDraft((current) => ({
                          ...current,
                          days: active ? current.days.filter((day) => day !== key) : [...current.days, key]
                        }))
                      }
                      className={`rounded-full px-4 py-2 text-sm font-semibold ${
                        active ? "bg-teal-600 text-white" : "bg-white ring-1 ring-slate-200"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          {taskDraft.scheduleType === "ozel" ? (
            <div className="space-y-3">
              <div className="flex gap-3">
                <input
                  type="date"
                  value={specialDate}
                  onChange={(event) => setSpecialDate(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
                />
                <button
                  onClick={() => {
                    if (!specialDate) {
                      return;
                    }
                    setTaskDraft((current) => ({
                      ...current,
                      specialDates: Array.from(new Set([...current.specialDates, specialDate]))
                    }));
                    setSpecialDate("");
                  }}
                  className="rounded-[1.3rem] bg-slate-200 px-4 py-3 font-semibold"
                >
                  Ekle
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {taskDraft.specialDates.map((date) => (
                  <button
                    key={date}
                    onClick={() =>
                      setTaskDraft((current) => ({
                        ...current,
                        specialDates: current.specialDates.filter((item) => item !== date)
                      }))
                    }
                    className="rounded-full bg-white px-4 py-2 text-sm font-semibold ring-1 ring-slate-200"
                  >
                    {date}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="flex gap-3">
            <button
              onClick={() => onSaveTask(taskDraft)}
              disabled={working || !taskDraft.assignedTo.length}
              className="rounded-[1.4rem] bg-slate-950 px-5 py-3 font-semibold text-white disabled:opacity-60"
            >
              {taskDraft.id ? "Güncelle" : "Görev ekle"}
            </button>
            <button
              onClick={() => {
                setTaskDraft(createTaskDraft(taskUserView !== "tum" ? taskUserView : taskUsers[0]?.id));
                setSpecialDate("");
              }}
              className="rounded-[1.4rem] bg-slate-200 px-5 py-3 font-semibold text-slate-800"
            >
              Temizle
            </button>
          </div>
        </div>
      </Card>

      <Card
        title="Görev listesi"
        description={
          selectedTaskUser
            ? `${selectedTaskUser.name} için görevleri ara, filtrele ve düzenle.`
            : "Ara, filtrele ve görev varyasyonlarını daha net görün."
        }
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <label className="block w-full lg:max-w-sm">
              <input
                value={taskSearch}
                onChange={(event) => setTaskSearch(event.target.value)}
                placeholder="Görev ara"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
              />
            </label>
            <div className="text-sm font-medium text-[color:var(--text-muted)]">
              {selectedTaskUser ? `${selectedTaskUser.name} için ` : ""}
              {filteredTaskCount} varyasyon • {filteredTaskGroups.length} başlık
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {TASK_LIST_TIME_FILTERS.map((filter) => {
              const active = taskTimeFilter === filter.id;
              return (
                <button
                  key={filter.id}
                  onClick={() => setTaskTimeFilter(filter.id)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold ${
                    active ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {filter.label}
                </button>
              );
            })}
          </div>

          <div className="rounded-[1.5rem] border border-slate-200 bg-white/80 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-700">
                {selectedTaskUser ? (
                  <>
                    <span className="font-semibold text-slate-950">
                      {selectedTaskUser.name} için {visibleTaskPoints} puan görünür
                    </span>
                    <span>{selectedTaskUserPotential?.points ?? 0} puan bugün kazanabilir</span>
                    <span>{selectedTaskUserPotential?.taskCount ?? 0} görev bugün planlı</span>
                  </>
                ) : (
                  <>
                    <span className="font-semibold text-slate-950">{visibleTaskPoints} puan görünür</span>
                    <span>{todaysFamilyPotential} puan bugün dağıtılabilir</span>
                    <span>{todaysPotentialByUser.length || 0} profil bugün görev alıyor</span>
                  </>
                )}
              </div>
              {taskUserView === "tum" ? (
                <button
                  onClick={() => setShowTaskPotentialDetails((current) => !current)}
                  className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700"
                >
                  {showTaskPotentialDetails ? "Kişi bazlı özeti gizle" : "Kişi bazlı özeti aç"}
                </button>
              ) : null}
            </div>

            {taskUserView === "tum" && showTaskPotentialDetails ? (
              todaysPotentialByUser.length === 0 ? (
                <div className="mt-3 rounded-[1.2rem] border border-dashed border-slate-200 bg-slate-50/70 p-4 text-sm text-[color:var(--text-muted)]">
                  Bugün için planlanmış görev görünmüyor.
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  {todaysPotentialByUser.map((item) => (
                    <div
                      key={item.user.id}
                      className="flex min-w-[180px] flex-1 items-center gap-3 rounded-[1.2rem] border border-slate-200 bg-white px-3 py-3"
                    >
                      <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[1rem] text-xl"
                        style={{ backgroundColor: `${item.user.color}20` }}
                      >
                        <AvatarDisplay avatar={item.user.avatar} name={item.user.name} />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-950">{item.user.name}</div>
                        <div className="text-xs text-[color:var(--text-muted)]">{item.taskCount} görev</div>
                      </div>
                      <div className="ml-auto rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
                        {item.points} puan
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : null}
          </div>

          <div className="space-y-3">
            {filteredTaskGroups.length === 0 ? (
              <div className="rounded-[1.6rem] border border-dashed border-slate-200 bg-white/70 p-5 text-sm text-[color:var(--text-muted)]">
                Bu filtreyle görünen görev yok.
              </div>
            ) : (
              filteredTaskGroups.map((group) => (
                <div key={group.key} className="rounded-[1.6rem] border border-slate-200 bg-white/80 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[1rem] bg-slate-100 text-2xl">
                        {group.icon}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-lg font-semibold">{group.title}</div>
                        <div className="text-sm text-[color:var(--text-muted)]">
                          {group.entries.length} varyasyon
                          {taskUserView === "tum" ? ` • ${group.assignedSummary}` : ""}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    {group.entries.map((task) => {
                      const active = taskDraft.id === task.id;
                      return (
                        <button
                          key={task.id}
                          onClick={() => loadTaskIntoDraft(task)}
                          className={`w-full rounded-[1.2rem] border px-3 py-3 text-left transition ${
                            active
                              ? "border-slate-900 bg-slate-950 text-white"
                              : "border-slate-200 bg-white/90 text-slate-900"
                          }`}
                        >
                          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <span
                                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                  active ? "bg-white/15 text-white" : "bg-slate-100 text-slate-700"
                                }`}
                              >
                                {TIME_BLOCK_LABELS[task.time_block]}
                              </span>
                              <span
                                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                  active
                                    ? "bg-amber-300/20 text-amber-100"
                                    : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                                }`}
                              >
                                {task.points} puan
                              </span>
                              <span
                                className={`text-sm ${
                                  active ? "text-white/80" : "text-[color:var(--text-muted)]"
                                }`}
                              >
                                {getTaskScheduleSummary(task)}
                              </span>
                            </div>
                            {taskUserView === "tum" ? (
                              <div
                                className={`text-sm ${
                                  active ? "text-white/80" : "text-[color:var(--text-muted)]"
                                }`}
                              >
                                {task.assigned_to.map((id) => userLookup[id]?.name).filter(Boolean).join(", ")}
                              </div>
                            ) : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </Card>
      </div>
    </div>
  );

  const rewardsTab = (
    <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <Card title="Ödül düzenleyici" description="Çocuklar için yeni ödüller oluşturun.">
        <div className="space-y-4">
          <label className="block space-y-2">
            <Label>Başlık</Label>
            <input
              value={rewardDraft.title}
              onChange={(event) => setRewardDraft((current) => ({ ...current, title: event.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
            />
          </label>
          <label className="block space-y-2">
            <Label>Gerekli puan</Label>
            <input
              type="number"
              min={10}
              value={rewardDraft.pointsRequired}
              onChange={(event) =>
                setRewardDraft((current) => ({
                  ...current,
                  pointsRequired: Number(event.target.value || 0)
                }))
              }
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
            />
          </label>
          <label className="flex items-center justify-between rounded-[1.5rem] border border-slate-200 bg-white px-4 py-4">
            <div>
              <div className="font-semibold">Ebeveyn onayı gerekli</div>
              <div className="text-sm text-[color:var(--text-muted)]">Kapalıysa otomatik verilir.</div>
            </div>
            <input
              type="checkbox"
              checked={rewardDraft.approvalRequired}
              onChange={(event) =>
                setRewardDraft((current) => ({ ...current, approvalRequired: event.target.checked }))
              }
              className="h-5 w-5"
            />
          </label>
          <div className="flex gap-3">
            <button
              onClick={() => onSaveReward(rewardDraft)}
              disabled={working}
              className="rounded-[1.4rem] bg-slate-950 px-5 py-3 font-semibold text-white disabled:opacity-60"
            >
              {rewardDraft.id ? "Güncelle" : "Ödül ekle"}
            </button>
            <button
              onClick={() => setRewardDraft(rewardDefaults)}
              className="rounded-[1.4rem] bg-slate-200 px-5 py-3 font-semibold text-slate-800"
            >
              Temizle
            </button>
          </div>
        </div>
      </Card>

      <div className="space-y-5">
        <Card title="Bekleyen talepler" description="Çocuk taleplerini onaylayın veya reddedin.">
          <div className="space-y-3">
            {data?.redemptions
              .filter((item) => item.status === "beklemede")
              .map((item) => (
                <div key={item.id} className="rounded-[1.5rem] border border-slate-200 bg-white/80 p-4">
                  <div className="text-lg font-semibold">
                    {userLookup[item.user_id]?.name} • {rewardLookup[item.reward_id]?.title}
                  </div>
                  <div className="mt-1 text-sm text-[color:var(--text-muted)]">
                    {rewardLookup[item.reward_id]?.points_required} puan
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => onResolveRedemption(item.id, "onaylandi")}
                      className="rounded-full bg-emerald-100 px-4 py-2 font-semibold text-emerald-700"
                    >
                      Onayla
                    </button>
                    <button
                      onClick={() => onResolveRedemption(item.id, "reddedildi")}
                      className="rounded-full bg-rose-100 px-4 py-2 font-semibold text-rose-700"
                    >
                      Reddet
                    </button>
                  </div>
                </div>
              ))}
            {data?.redemptions.filter((item) => item.status === "beklemede").length === 0 ? (
              <div className="rounded-[1.5rem] bg-white/80 p-4 text-sm text-[color:var(--text-muted)]">
                Bekleyen talep yok.
              </div>
            ) : null}
          </div>
        </Card>

        <Card title="Ödül listesi" description="Düzenlemek için bir ödüle dokunun.">
          <div className="grid gap-3 md:grid-cols-2">
            {data?.rewards.map((reward) => (
              <button
                key={reward.id}
                onClick={() =>
                  setRewardDraft({
                    id: reward.id,
                    title: reward.title,
                    pointsRequired: reward.points_required,
                    approvalRequired: reward.approval_required
                  })
                }
                className="rounded-[1.5rem] border border-slate-200 bg-white/80 p-4 text-left"
              >
                <div className="text-lg font-semibold">{reward.title}</div>
                <div className="mt-1 text-sm text-[color:var(--text-muted)]">
                  {reward.points_required} puan • {reward.approval_required ? "Onaylı" : "Otomatik"}
                </div>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );

  const pointsTab = (
    <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <Card title="Puan düzenleme" description="Bonus ve düzeltme puanlarını manuel işleyin.">
        <div className="space-y-4">
          <label className="block space-y-2">
            <Label>Kullanıcı</Label>
            <select
              value={pointsUserId}
              onChange={(event) => setPointsUserId(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
            >
              {data?.users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-2">
            <Label>Puan farkı</Label>
            <input
              type="number"
              value={pointsDelta}
              onChange={(event) => setPointsDelta(Number(event.target.value || 0))}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
            />
          </label>
          <label className="block space-y-2">
            <Label>Açıklama</Label>
            <input
              value={pointsNote}
              onChange={(event) => setPointsNote(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
            />
          </label>
          <button
            onClick={() => onAdjustPoints(pointsUserId, pointsDelta, pointsNote)}
            disabled={working}
            className="rounded-[1.4rem] bg-slate-950 px-5 py-3 font-semibold text-white disabled:opacity-60"
          >
            Puani işle
          </button>
        </div>
      </Card>

      <div className="space-y-5">
        <Card
          title="Bugün tamamlananlar"
          description={`${selectedPointUser?.name ?? "Secili kullanici"} icin yanlis isaretlenen gorevleri geri alin.`}
        >
          <div className="space-y-3">
            {todaysCompletedTasks.map(({ completion, task }) => (
              <div
                key={completion.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[1.5rem] border border-slate-200 bg-white/80 p-4"
              >
                <div>
                  <div className="font-semibold">{task.title}</div>
                  <div className="text-sm text-[color:var(--text-muted)]">
                    {TIME_BLOCK_LABELS[task.time_block]} • {task.points} puan
                  </div>
                </div>
                <button
                  onClick={() =>
                    onUndoTaskCompletion(task.id, completion.user_id, completion.completion_date, task.title)
                  }
                  disabled={working}
                  className="rounded-full bg-rose-100 px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-60"
                >
                  Geri al
                </button>
              </div>
            ))}
            {todaysCompletedTasks.length === 0 ? (
              <div className="rounded-[1.5rem] bg-white/80 p-4 text-sm text-[color:var(--text-muted)]">
                Bugun bu kullanici icin tamamlanan gorev yok.
              </div>
            ) : null}
          </div>
        </Card>

        <Card title="Son hareketler" description="Görev ve ödül geçmişi burada görünür.">
          <div className="space-y-3">
            {data?.pointEvents.map((event) => (
              <div key={event.id} className="flex items-center justify-between rounded-[1.5rem] border border-slate-200 bg-white/80 p-4">
                <div>
                  <div className="font-semibold">{userLookup[event.user_id]?.name}</div>
                  <div className="text-sm text-[color:var(--text-muted)]">{event.note || "Puan hareketi"}</div>
                </div>
                <div
                  className={`rounded-full px-3 py-1 text-sm font-semibold ${
                    event.delta >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                  }`}
                >
                  {event.delta > 0 ? `+${event.delta}` : event.delta} puan
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );

  const settingsTab = (
    <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <Card title="Aile ayarları" description="Tema, ses ve kiosk davranışını yönetin.">
        <div className="space-y-4">
          <label className="block space-y-2">
            <Label>Aile adı</Label>
            <input
              value={familyName}
              onChange={(event) => setFamilyName(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
            />
          </label>
          <div className="space-y-2">
            <Label>Tema</Label>
            <div className="flex gap-3">
              {[
                { value: "acik", label: "Açık" },
                { value: "koyu", label: "Koyu" }
              ].map((item) => (
                <button
                  key={item.value}
                  onClick={() => setTheme(item.value as "acik" | "koyu")}
                  className={`rounded-full px-4 py-2 font-semibold ${
                    theme === item.value ? "bg-slate-950 text-white" : "bg-white ring-1 ring-slate-200"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center justify-between rounded-[1.5rem] border border-slate-200 bg-white px-4 py-4">
            <div>
              <div className="font-semibold">Sesli geri bildirim açık</div>
              <div className="text-sm text-[color:var(--text-muted)]">Görevlerde ses ve tebrik oynatılır.</div>
            </div>
            <input
              type="checkbox"
              checked={audioEnabled}
              onChange={(event) => setAudioEnabled(event.target.checked)}
              className="h-5 w-5"
            />
          </label>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="block space-y-2">
              <Label>Cocuk uyku saati</Label>
              <input
                type="time"
                step="60"
                value={childSleepTime}
                onChange={(event) => setChildSleepTime(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
              />
            </label>
            <label className="block space-y-2">
              <Label>Ebeveyn uyku saati</Label>
              <input
                type="time"
                step="60"
                value={parentSleepTime}
                onChange={(event) => setParentSleepTime(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
              />
            </label>
            <label className="block space-y-2">
              <Label>Gun reset saati</Label>
              <input
                type="time"
                step="60"
                value={dayResetTime}
                onChange={(event) => setDayResetTime(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
              />
            </label>
          </div>
          <div className="rounded-[1.5rem] border border-slate-200 bg-white/80 p-4 text-sm text-[color:var(--text-muted)]">
            Kioskta cocuk ve ebeveyn icin ayri uyku saati kullanilir. Uyku saatinden sonra gorev yerine sade gun ozeti gosterilir. Gun reset saati ise yeni gunun hangi saatte baslayacagini belirler.
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() =>
                onUpdateSettings({
                  name: familyName,
                  theme,
                  audioEnabled,
                  childSleepTime,
                  parentSleepTime,
                  dayResetTime
                })
              }
              disabled={working}
              className="rounded-[1.4rem] bg-slate-950 px-5 py-3 font-semibold text-white disabled:opacity-60"
            >
              Ayarları kaydet
            </button>
            <button
              onClick={async () => {
                if (!window.confirm("Tum puanlar, tamamlanan gorevler ve test gecmisi sifirlansin mi?")) {
                  return;
                }
                await onResetProgress();
              }}
              disabled={working}
              className="rounded-[1.4rem] bg-amber-100 px-5 py-3 font-semibold text-amber-800 disabled:opacity-60"
            >
              Testi sifirla
            </button>
            <button
              onClick={onLogout}
              className="rounded-[1.4rem] bg-rose-100 px-5 py-3 font-semibold text-rose-700"
            >
              Ebeveyn kilidini kapat
            </button>
          </div>
        </div>
      </Card>

      <Card title="Tablet notları" description="Kiosk kullanımına yönelik kısa hatırlatmalar.">
        <div className="space-y-3 text-[color:var(--text-muted)]">
          <div className="rounded-[1.5rem] bg-white/80 p-4">Uygulamayı ana ekrana ekleyip tam ekran açın.</div>
          <div className="rounded-[1.5rem] bg-white/80 p-4">Yonetim paneli PIN ile korunur.</div>
          <div className="rounded-[1.5rem] bg-white/80 p-4">Testi sifirla butonu puanlari ve tamamlananlari temizler, kullanicilari silmez.</div>
          <div className="rounded-[1.5rem] bg-white/80 p-4">Görevler günlük, haftalık ve özel gün olarak planlanabilir.</div>
        </div>
      </Card>
    </div>
  );

  const activeTabContent = tab === "kullanicilar"
    ? usersTab
    : tab === "gorevler"
      ? tasksTab
      : tab === "oduller"
        ? rewardsTab
        : tab === "puanlar"
          ? pointsTab
          : settingsTab;

  const body = !data?.session.parentAuthenticated
    ? lockedView
    : (
      <div className="flex min-h-0 flex-1 flex-col gap-4 xl:grid xl:grid-cols-[220px_minmax(0,1fr)] xl:items-start">
        <aside className="glass-panel rounded-[2rem] p-3 lg:p-4 xl:sticky xl:top-0 xl:min-h-0">
          <div className="mb-4 px-2">
            <div className="text-sm font-semibold uppercase tracking-[0.24em] text-teal-700">Yonetim paneli</div>
            <div className="mt-2 text-2xl font-semibold">{data.family?.name}</div>
          </div>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 xl:mx-0 xl:block xl:space-y-2 xl:overflow-visible xl:px-0 xl:pb-0">
            {tabs.map((item) => (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`flex shrink-0 items-center gap-3 rounded-[1.3rem] px-4 py-3 text-left font-semibold xl:w-full ${
                  tab === item.id
                    ? "bg-slate-950 text-white"
                    : "bg-white/70 text-slate-700"
                }`}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </button>
            ))}
          </div>
        </aside>

        <div className="min-h-0 flex-1 pr-1 sm:pr-2">
          {activeTabContent}
        </div>
      </div>
    );

  const panelShell = (
    <div className="glass-panel-strong flex h-full min-h-0 flex-col overflow-hidden rounded-none p-3 sm:rounded-[2.4rem] sm:p-4 lg:p-5">
      <div className="mb-3 flex items-center justify-between gap-4 border-b border-white/60 px-1 pb-3 sm:mb-4 sm:pb-4">
        <div className="min-w-0">
          <div className="text-sm font-semibold uppercase tracking-[0.24em] text-teal-700">Yonetim paneli</div>
          <div className="text-xl font-semibold sm:text-2xl">Aile kontrol merkezi</div>
        </div>
        {!standalone ? (
          <button
            onClick={onClose}
            className="rounded-full bg-slate-200 px-4 py-2 font-semibold text-slate-800"
          >
            Kapat
          </button>
        ) : null}
      </div>
      <div className="soft-scrollbar min-h-0 flex-1 overflow-y-auto pr-1 sm:pr-2">{body}</div>
    </div>
  );

  if (standalone) {
    return (
      <div className="app-surface min-h-screen overflow-hidden p-0 sm:p-3 lg:p-4">
        <div className="mx-auto h-[100dvh] w-full max-w-[1600px] sm:h-[calc(100dvh-1.5rem)] lg:h-[calc(100dvh-2rem)]">
          {panelShell}
        </div>
      </div>
    );
  }

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-slate-950/24"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 260, damping: 28 }}
            className="fixed inset-0 z-50 bg-transparent p-0 sm:p-3 lg:p-4"
          >
            <div className="mx-auto h-full w-full max-w-[1600px]">{panelShell}</div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}

