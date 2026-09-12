"use client";

import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, ArrowUp, CheckCircle2, Settings2, ShieldCheck, Star, Users } from "lucide-react";
import { AvatarDisplay } from "@/components/kiosk/avatar-display";
import { AvatarPicker } from "@/components/kiosk/avatar-picker";
import { formatAllowance } from "@/lib/allowance";
import { getDefaultAvatar, normalizeAvatarForRole } from "@/lib/avatar";
import { isTaskScheduledForDate, TIME_BLOCK_LABELS, WEEKDAY_KEYS, WEEKDAY_LABELS } from "@/lib/schedule";
import { DEFAULT_TASK_ICON } from "@/lib/task-defaults";
import type {
  AccountPasswordChangePayload,
  DashboardPayload,
  FamilySettingsPayload,
  ParentPinChangePayload,
  TaskFormPayload,
  TaskRecord,
  TimeBlock,
  UserFormPayload
} from "@/lib/types";

type TabId = "kullanicilar" | "gorevler" | "harcliklar" | "ayarlar";

interface ParentPanelProps {
  open: boolean;
  standalone?: boolean;
  data: DashboardPayload | null;
  working: boolean;
  onClose: () => void;
  onOpenLogin: () => void;
  onSaveUser: (payload: UserFormPayload) => Promise<void>;
  onDeleteUser: (userId: string) => Promise<void>;
  onSaveTask: (payload: TaskFormPayload) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<boolean>;
  onReorderTasks: (orderedTaskIds: string[]) => Promise<void>;
  onAdjustPoints: (userId: string, delta: number, note: string) => Promise<void>;
  onUndoTaskCompletion: (
    taskId: string,
    userId: string,
    dateKey: string,
    taskTitle: string
  ) => Promise<void>;
  onResetProgress: () => Promise<void>;
  onUpdateSettings: (payload: FamilySettingsPayload) => Promise<void>;
  onChangeAccountPassword: (payload: AccountPasswordChangePayload) => Promise<void>;
  onChangeParentPin: (payload: ParentPinChangePayload) => Promise<void>;
  onLogout: () => Promise<void>;
}

const tabs: Array<{ id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "kullanicilar", label: "Kullanıcılar", icon: Users },
  { id: "gorevler", label: "Görevler", icon: CheckCircle2 },
  { id: "harcliklar", label: "Harçlık", icon: Star },
  { id: "ayarlar", label: "Ayarlar", icon: Settings2 }
];

const PROFILE_COLORS = [
  "#60A5FA",
  "#34D399",
  "#F97316",
  "#F472B6",
  "#A78BFA",
  "#22C55E",
  "#F59E0B",
  "#06B6D4"
];

function getRandomProfileColor() {
  return PROFILE_COLORS[Math.floor(Math.random() * PROFILE_COLORS.length)] ?? PROFILE_COLORS[0];
}

function createUserDefaults(): UserFormPayload {
  return {
    name: "",
    role: "çocuk",
    avatar: getDefaultAvatar(),
    color: getRandomProfileColor(),
    birthdate: ""
  };
}

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
    <section className={`parent-management-panel ${className ?? ""}`}>
      <div className="parent-management-heading">
        <div>
          <span>Yönetim alanı</span>
          <strong>{title}</strong>
        </div>
        <p>{description}</p>
      </div>
      <div className="parent-management-body">{children}</div>
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

const POINT_DELTA_PRESETS = [10, 20, 50, -10, -20, -50];

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
    onDeleteUser,
    onSaveTask,
    onDeleteTask,
    onReorderTasks,
    onAdjustPoints,
    onUndoTaskCompletion,
    onResetProgress,
    onUpdateSettings,
    onChangeAccountPassword,
    onChangeParentPin,
    onLogout
  } = props;

  const [tab, setTab] = useState<TabId>("kullanicilar");
  const [userDraft, setUserDraft] = useState<UserFormPayload>(() => createUserDefaults());
  const [taskDraft, setTaskDraft] = useState<TaskFormPayload>(taskDefaults);
  const [specialDate, setSpecialDate] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [childSleepTime, setChildSleepTime] = useState("22:00");
  const [parentSleepTime, setParentSleepTime] = useState("00:00");
  const [dayResetTime, setDayResetTime] = useState("00:00");
  const [pointsUserId, setPointsUserId] = useState("");
  const [pointsDeltaInput, setPointsDeltaInput] = useState("10");
  const [pointsNote, setPointsNote] = useState("Harçlık düzeltmesi");
  const [taskSearch, setTaskSearch] = useState("");
  const [taskTimeFilter, setTaskTimeFilter] = useState<TaskListTimeFilter>("tum");
  const [showTaskPotentialDetails, setShowTaskPotentialDetails] = useState(false);
  const [taskUserView, setTaskUserView] = useState<string>("tum");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  useEffect(() => {
    if (!data?.family) {
      return;
    }
    setFamilyName(data.family.name);
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
  const taskUsers = data?.users ?? [];
  const selectedTaskUser = taskUserView !== "tum" ? userLookup[taskUserView] : undefined;
  const taskLookup = useMemo(
    () => Object.fromEntries((data?.tasks ?? []).map((task) => [task.id, task])),
    [data?.tasks]
  );
  const filteredTasks = useMemo(() => {
    const searchTerm = taskSearch.trim().toLocaleLowerCase("tr-TR");
    return (data?.tasks ?? [])
      .filter((task) => {
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
      })
      .sort((left, right) => {
        const timeOrder = TASK_TIME_BLOCK_ORDER[left.time_block] - TASK_TIME_BLOCK_ORDER[right.time_block];
        if (timeOrder !== 0) {
          return timeOrder;
        }

        return Date.parse(left.created_at) - Date.parse(right.created_at);
      });
  }, [data?.tasks, taskSearch, taskTimeFilter, taskUserView, userLookup]);

  const filteredTaskGroups = useMemo(() => {
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

    return Array.from(grouped.values());
  }, [filteredTasks, userLookup]);
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
  const parsedPointsDelta =
    pointsDeltaInput.trim() !== "" && pointsDeltaInput !== "-" ? Number(pointsDeltaInput) : null;
  const canSubmitPoints = parsedPointsDelta !== null && Number.isFinite(parsedPointsDelta);
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
    setTaskDraft({
      id: task.id,
      title: task.title,
      icon: task.icon || DEFAULT_TASK_ICON,
      points: task.points,
      assignedTo: [...task.assigned_to],
      scheduleType: task.schedule_type,
      days: task.days,
      specialDates: task.special_dates,
      timeBlock: task.time_block
    });
    document.getElementById("parent-task-title")?.focus();
  };

  const canReorderTasks = taskUserView !== "tum";

  const getTaskMoveScopeIds = (task: TaskRecord) =>
    filteredTasks.filter((item) => item.time_block === task.time_block).map((item) => item.id);

  const moveTask = async (task: TaskRecord, direction: -1 | 1) => {
    const moveableTaskIds = getTaskMoveScopeIds(task);
    const currentIndex = moveableTaskIds.indexOf(task.id);
    const nextIndex = currentIndex + direction;

    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= moveableTaskIds.length) {
      return;
    }

    const reordered = [...moveableTaskIds];
    [reordered[currentIndex], reordered[nextIndex]] = [reordered[nextIndex], reordered[currentIndex]];
    await onReorderTasks(reordered);
  };

  const handleSaveSettings = async () => {
    await onUpdateSettings({
      name: familyName,
      audioEnabled,
      childSleepTime,
      parentSleepTime,
      dayResetTime
    });
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) {
      window.alert("Mevcut şifre ve yeni şifre gerekli.");
      return;
    }

    if (newPassword !== confirmPassword) {
      window.alert("Yeni şifre tekrar alanı eşleşmiyor.");
      return;
    }

    await onChangeAccountPassword({
      currentPassword,
      newPassword
    });

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const handleChangePin = async () => {
    if (!currentPin || !newPin) {
      window.alert("Mevcut PIN ve yeni PIN gerekli.");
      return;
    }

    if (newPin !== confirmPin) {
      window.alert("Yeni PIN tekrar alanı eşleşmiyor.");
      return;
    }

    await onChangeParentPin({
      currentPin,
      newPin
    });

    setCurrentPin("");
    setNewPin("");
    setConfirmPin("");
  };

  const handleDeleteSelectedUser = async () => {
    if (!userDraft.id) {
      return;
    }

    if (!window.confirm("Bu profili silmek istediğine emin misin? Bu profile bağlı görev kayıtları da güncellenir.")) {
      return;
    }

    await onDeleteUser(userDraft.id);
    setUserDraft(createUserDefaults());
  };

  const lockedView = (
    <div className="flex min-h-0 flex-1 items-center justify-center p-8">
      <div className="glass-panel-strong max-w-xl rounded-[2rem] p-8 text-center">
        <ShieldCheck className="mx-auto h-12 w-12 text-teal-600" />
        <h2 className="mt-4 text-3xl font-semibold">Yönetim girişi gerekli</h2>
        <p className="mt-3 text-[color:var(--text-muted)]">
          Yönetim araçları yalnızca PIN doğrulaması ile açılır.
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
    <div className="parent-users-workspace">
      <section className="parent-user-editor-panel">
        <div className="parent-panel-heading">
          <div>
            <span>Profil merkezi</span>
            <strong>{userDraft.id ? "Profili düzenle" : "Yeni profil"}</strong>
          </div>
          <button type="button" onClick={() => setUserDraft(createUserDefaults())}>
            Yeni profil
          </button>
        </div>

        <div className="parent-user-editor-grid">
          <div
            className="parent-user-preview"
            style={{ "--profile-color": userDraft.color } as CSSProperties}
          >
            <div className="parent-user-preview-avatar">
              <AvatarDisplay avatar={userDraft.avatar} name={userDraft.name || "Profil"} />
            </div>
            <div>
              <span>{userDraft.id ? "Seçili profil" : "Yeni profil"}</span>
              <strong>{userDraft.name || "Profil adı"}</strong>
              <em>{userDraft.role === "ebeveyn" ? "Ebeveyn" : "Çocuk"}</em>
            </div>
          </div>

          <div className="parent-user-fields">
            <label>
              <Label>İsim</Label>
              <input
                value={userDraft.name}
                onChange={(event) => setUserDraft((current) => ({ ...current, name: event.target.value }))}
              />
            </label>
            <label>
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
              >
                <option value="çocuk">Çocuk</option>
                <option value="ebeveyn">Ebeveyn</option>
              </select>
            </label>
            <label>
              <Label>Doğum tarihi</Label>
              <input
                type="date"
                value={userDraft.birthdate ?? ""}
                onChange={(event) => setUserDraft((current) => ({ ...current, birthdate: event.target.value }))}
              />
            </label>
          </div>
        </div>

        <div className="parent-user-customize">
          <div className="parent-avatar-compact">
            <AvatarPicker
              compact
              role={userDraft.role}
              value={userDraft.avatar}
              onChange={(avatar) => setUserDraft((current) => ({ ...current, avatar }))}
            />
          </div>
        </div>

        <div className="parent-editor-actions">
          <button onClick={() => onSaveUser(userDraft)} disabled={working} className="is-primary">
            {userDraft.id ? "Güncelle" : "Kullanıcı ekle"}
          </button>
          {userDraft.id ? (
            <button onClick={handleDeleteSelectedUser} disabled={working} className="is-danger">
              Profili sil
            </button>
          ) : null}
          <button onClick={() => setUserDraft(createUserDefaults())} className="is-secondary">
            Temizle
          </button>
        </div>
      </section>

      <section className="parent-profile-directory-panel">
        <div className="parent-panel-heading">
          <div>
            <span>Aile profilleri</span>
            <strong>Mevcut profiller</strong>
          </div>
        </div>
        <div className="parent-profile-list soft-scrollbar">
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
              className={`parent-profile-button ${userDraft.id === user.id ? "is-active" : ""}`}
            >
              <div className="parent-profile-row">
                <div
                  className="parent-profile-avatar"
                  style={{ backgroundColor: `${user.color}22`, color: user.color }}
                >
                  <AvatarDisplay avatar={user.avatar} name={user.name} />
                </div>
                <div className="parent-profile-copy">
                  <div className="parent-profile-name">{user.name}</div>
                  <div className="parent-profile-meta">
                    {user.role === "ebeveyn" ? "Ebeveyn" : "Çocuk"} / {formatAllowance(user.points)}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );

  const tasksTab = (
    <div className="space-y-5">
      <div className="parent-management-toolbar">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-950">Kişiye göre görev yönetimi</div>
            <div className="text-sm text-[color:var(--text-muted)]">
              Her profilin görevini ve harçlığını ayrı ayrı planla.
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

      <div className="parent-tasks-layout">
      <Card title={taskDraft.id ? "Görevi düzenle" : "Yeni görev"} description="Kişi, zaman ve harçlık seçin.">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_100px]">
            <label className="block space-y-2">
              <Label>Başlık</Label>
              <input
                id="parent-task-title"
                value={taskDraft.title}
                onChange={(event) => setTaskDraft((current) => ({ ...current, title: event.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
              />
            </label>
            <label className="block space-y-2">
              <Label>Harçlık</Label>
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
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Görev kimlerin?</legend>
            <div className="flex flex-wrap gap-3">{taskUsers.map((user) => (
              <label key={user.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={taskDraft.assignedTo.includes(user.id)} onChange={(event) => setTaskDraft((current) => ({ ...current, assignedTo: event.target.checked ? [...current.assignedTo, user.id] : current.assignedTo.filter((id) => id !== user.id) }))} />{user.name}
              </label>
            ))}</div>
          </fieldset>
          <div className="flex gap-3">
            <button
              onClick={() => onSaveTask(taskDraft)}
              disabled={working || !taskDraft.title.trim() || !taskDraft.assignedTo.length}
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
            : "Görevleri bulun, düzenleyin veya silin."
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
              {filteredTaskCount} görev
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

          <details className="task-allowance-summary"><summary>Harçlık özeti</summary>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-700">
                {selectedTaskUser ? (
                  <>
                    <span className="font-semibold text-slate-950">
                      {selectedTaskUser.name} için {formatAllowance(visibleTaskPoints)} görünür
                    </span>
                    <span>{formatAllowance(selectedTaskUserPotential?.points ?? 0)} bugün kazanabilir</span>
                    <span>{selectedTaskUserPotential?.taskCount ?? 0} görev bugün planlı</span>
                  </>
                ) : (
                  <>
                    <span className="font-semibold text-slate-950">{formatAllowance(visibleTaskPoints)} görünür</span>
                    <span>{formatAllowance(todaysFamilyPotential)} bugün dağıtılabilir</span>
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
                        {formatAllowance(item.points)}
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : null}
          </details>

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
                          {group.entries.length} zaman planı
                          {taskUserView === "tum" ? ` • ${group.assignedSummary}` : ""}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    {group.entries.map((task) => {
                      const active = taskDraft.id === task.id;
                      const moveScopeIds = getTaskMoveScopeIds(task);
                      const moveIndex = moveScopeIds.indexOf(task.id);
                      return (
                        <div
                          key={task.id}
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
                                {formatAllowance(task.points)}
                              </span>
                              <span
                                className={`text-sm ${
                                  active ? "text-white/80" : "text-[color:var(--text-muted)]"
                                }`}
                              >
                                {getTaskScheduleSummary(task)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {taskUserView === "tum" ? (
                                <div
                                  className={`text-sm ${
                                    active ? "text-white/80" : "text-[color:var(--text-muted)]"
                                  }`}
                                >
                                  {task.assigned_to.map((id) => userLookup[id]?.name).filter(Boolean).join(", ")}
                                </div>
                              ) : null}

                              {canReorderTasks ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void moveTask(task, -1);
                                    }}
                                    disabled={working || moveScopeIds.length < 2 || moveIndex === 0}
                                    className={`rounded-full p-2 ${
                                      active
                                        ? "bg-white/12 text-white"
                                        : "bg-slate-100 text-slate-700"
                                    } disabled:opacity-40`}
                                    aria-label="Yukari tasi"
                                  >
                                    <ArrowUp className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void moveTask(task, 1);
                                    }}
                                    disabled={
                                      working || moveScopeIds.length < 2 || moveIndex === moveScopeIds.length - 1
                                    }
                                    className={`rounded-full p-2 ${
                                      active
                                        ? "bg-white/12 text-white"
                                        : "bg-slate-100 text-slate-700"
                                    } disabled:opacity-40`}
                                    aria-label="Asagi tasi"
                                  >
                                    <ArrowDown className="h-4 w-4" />
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          <div className="parent-task-actions">
                            <button disabled={working} onClick={() => loadTaskIntoDraft(task)}>Düzenle</button>
                            <button className="is-delete" disabled={working} onClick={async () => {
                              const names = task.assigned_to.map((id) => userLookup[id]?.name).filter(Boolean).join(", ");
                              if (!window.confirm(task.title + " (" + TIME_BLOCK_LABELS[task.time_block] + ") silinsin mi? Bu görev " + names + " için kaldırılır. Tamamlama kayıtları silinir; kazanılmış harçlık korunur.")) return;
                              if (await onDeleteTask(task.id)) {
                                if (taskDraft.id === task.id) setTaskDraft(createTaskDraft(taskUserView !== "tum" ? taskUserView : taskUsers[0]?.id));
                              }
                            }}>Sil</button>
                          </div>
                          </div>
                        </div>
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

  const pointsTab = (
    <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <Card title="Harçlık düzenleme" description="Bonus ve düzeltme harçlıklarını manuel işleyin.">
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
            <Label>Harçlık farkı</Label>
            <input
              type="text"
              inputMode="numeric"
              value={pointsDeltaInput}
              onChange={(event) => {
                const nextValue = event.target.value.replace(",", ".");

                if (/^-?\d*$/.test(nextValue)) {
                  setPointsDeltaInput(nextValue);
                }
              }}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
            />
          </label>
          <div className="space-y-2">
            <Label>Hızlı harçlık seç</Label>
            <div className="flex flex-wrap gap-2">
              {POINT_DELTA_PRESETS.map((delta) => {
                const active = parsedPointsDelta === delta;
                const negative = delta < 0;

                return (
                  <button
                    key={delta}
                    type="button"
                    onClick={() => setPointsDeltaInput(String(delta))}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      active
                        ? negative
                          ? "bg-rose-600 text-white"
                          : "bg-emerald-600 text-white"
                        : negative
                          ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
                          : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                    }`}
                  >
                    {delta > 0 ? `+${formatAllowance(delta)}` : formatAllowance(delta)}
                  </button>
                );
              })}
            </div>
            <div className="text-xs text-[color:var(--text-muted)]">
              Eksi değer harçlık düşürür, artı değer bonus harçlık ekler.
            </div>
          </div>
          <label className="block space-y-2">
            <Label>Açıklama</Label>
            <input
              value={pointsNote}
              onChange={(event) => setPointsNote(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
            />
          </label>
          <button
            onClick={() => {
              if (!canSubmitPoints || parsedPointsDelta === null) {
                return;
              }

              onAdjustPoints(pointsUserId, parsedPointsDelta, pointsNote);
            }}
            disabled={working || !canSubmitPoints}
            className="rounded-[1.4rem] bg-slate-950 px-5 py-3 font-semibold text-white disabled:opacity-60"
          >
            Harcligi isle
          </button>
        </div>
      </Card>

      <div className="space-y-5">
        <Card
          title="Bugün tamamlananlar"
          description={`${selectedPointUser?.name ?? "Seçili kullanıcı"} için yanlış işaretlenen görevleri geri alın.`}
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
                    {TIME_BLOCK_LABELS[task.time_block]} • {formatAllowance(task.points)}
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
                Bugün bu kullanıcı için tamamlanan görev yok.
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
                  <div className="text-sm text-[color:var(--text-muted)]">{event.note || "Harçlık hareketi"}</div>
                </div>
                <div
                  className={`rounded-full px-3 py-1 text-sm font-semibold ${
                    event.delta >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                  }`}
                >
                  {event.delta > 0 ? `+${formatAllowance(event.delta)}` : formatAllowance(event.delta)}
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
      <Card title="Aile ayarları" description="Ses, uyku saati ve kiosk davranışını yönetin.">
        <div className="space-y-4">
          <label className="block space-y-2">
            <Label>Aile adı</Label>
            <input
              value={familyName}
              onChange={(event) => setFamilyName(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
            />
          </label>
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
              <Label>Çocuk uyku saati</Label>
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
              <Label>Gün reset saati</Label>
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
            Kioskta çocuk ve ebeveyn için ayrı uyku saati kullanılır. Uyku saatinden sonra görev yerine sade gün özeti gösterilir. Gün reset saati ise yeni günün hangi saatte başlayacağını belirler.
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleSaveSettings}
              disabled={working}
              className="rounded-[1.4rem] bg-slate-950 px-5 py-3 font-semibold text-white disabled:opacity-60"
            >
              Ayarları kaydet
            </button>
            <button
              onClick={async () => {
                if (!window.confirm("Tüm harçlıklar, tamamlanan görevler ve test geçmişi sıfırlansın mı?")) {
                  return;
                }
                await onResetProgress();
              }}
              disabled={working}
              className="rounded-[1.4rem] bg-amber-100 px-5 py-3 font-semibold text-amber-800 disabled:opacity-60"
            >
              Testi sıfırla
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

      <div className="space-y-5">
        <Card title="Güvenlik" description="Hesap şifresini ve yönetim PIN'ini buradan güncelle.">
          <div className="space-y-5">
            <div className="space-y-4 rounded-[1.6rem] border border-slate-200 bg-white/70 p-4">
              <div>
                <div className="text-base font-semibold">Hesap şifresi</div>
                <div className="mt-1 text-sm text-[color:var(--text-muted)]">
                  {data?.session.username ? `${data.session.username} hesabının giriş şifresini değiştir.` : "Giriş şifresini değiştir."}
                </div>
              </div>
              <label className="block space-y-2">
                <Label>Mevcut şifre</Label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
                  autoComplete="current-password"
                />
              </label>
              <label className="block space-y-2">
                <Label>Yeni şifre</Label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
                  autoComplete="new-password"
                />
              </label>
              <label className="block space-y-2">
                <Label>Yeni şifre tekrar</Label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
                  autoComplete="new-password"
                />
              </label>
              <button
                onClick={handleChangePassword}
                disabled={working}
                className="rounded-[1.4rem] bg-slate-950 px-5 py-3 font-semibold text-white disabled:opacity-60"
              >
                Şifreyi güncelle
              </button>
            </div>

            <div className="space-y-4 rounded-[1.6rem] border border-slate-200 bg-white/70 p-4">
              <div>
                <div className="text-base font-semibold">Yönetim PIN&apos;i</div>
                <div className="mt-1 text-sm text-[color:var(--text-muted)]">
                  Yönetim paneline girişte kullanılan PIN&apos;i değiştir.
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="block space-y-2">
                  <Label>Mevcut PIN</Label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={currentPin}
                    onChange={(event) => setCurrentPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
                  />
                </label>
                <label className="block space-y-2">
                  <Label>Yeni PIN</Label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={newPin}
                    onChange={(event) => setNewPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
                  />
                </label>
                <label className="block space-y-2">
                  <Label>Yeni PIN tekrar</Label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={confirmPin}
                    onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
                  />
                </label>
              </div>
              <button
                onClick={handleChangePin}
                disabled={working}
                className="rounded-[1.4rem] bg-slate-950 px-5 py-3 font-semibold text-white disabled:opacity-60"
              >
                PIN&apos;i güncelle
              </button>
            </div>
          </div>
        </Card>

        <Card title="Tablet notları" description="Kiosk kullanımına yönelik kısa hatırlatmalar.">
          <div className="space-y-3 text-[color:var(--text-muted)]">
            <div className="rounded-[1.5rem] bg-white/80 p-4">Uygulamayı ana ekrana ekleyip tam ekran açın.</div>
            <div className="rounded-[1.5rem] bg-white/80 p-4">Yönetim paneli PIN ile korunur.</div>
            <div className="rounded-[1.5rem] bg-white/80 p-4">Testi sıfırla butonu harçlıkları ve tamamlananları temizler, kullanıcıları silmez.</div>
            <div className="rounded-[1.5rem] bg-white/80 p-4">Görevler günlük, haftalık ve özel gün olarak planlanabilir.</div>
          </div>
        </Card>
      </div>
    </div>
  );

  const activeTabContent = tab === "kullanicilar"
    ? usersTab
    : tab === "gorevler"
      ? tasksTab
      : tab === "harcliklar"
        ? pointsTab
        : settingsTab;

  const body = !data?.session.parentAuthenticated
    ? lockedView
    : (
      <div className="parent-command-layout">
        <aside className="parent-command-sidebar">
          <div className="parent-command-family">
            <div className="text-sm font-semibold uppercase tracking-[0.24em] text-teal-700">Yönetim paneli</div>
            <strong>{data.family?.name}</strong>
            <span>Aile ayarları ve görev sistemi</span>
          </div>
          <div className="parent-command-tabs">
            {tabs.map((item) => (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`parent-command-tab ${
                  tab === item.id
                    ? "is-active"
                    : ""
                }`}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </button>
            ))}
          </div>
        </aside>

        <div className="parent-command-content">
          {activeTabContent}
        </div>
      </div>
    );

  const panelShell = (
    <div className="parent-command-shell">
      <div className="parent-command-header">
        <div className="parent-command-title">
          <div className="text-sm font-semibold uppercase tracking-[0.24em] text-teal-700">Yönetim paneli</div>
          <div className="text-xl font-semibold sm:text-2xl">Aile kontrol merkezi</div>
        </div>
        {!standalone ? (
          <button
            onClick={onClose}
            className="parent-command-close"
          >
            Kapat
          </button>
        ) : null}
      </div>
      <div className="parent-command-scroll soft-scrollbar">{body}</div>
    </div>
  );

  if (standalone) {
    return (
      <div className="parent-command-page">
        <div className="parent-command-page-inner">
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
