"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Gift, Settings2, ShieldCheck, Star, Users } from "lucide-react";
import { AvatarDisplay } from "@/components/kiosk/avatar-display";
import { AvatarPicker } from "@/components/kiosk/avatar-picker";
import { getDefaultAvatar, normalizeAvatarForRole } from "@/lib/avatar";
import { TIME_BLOCK_LABELS, WEEKDAY_LABELS } from "@/lib/schedule";
import type { DashboardPayload, RewardFormPayload, TaskFormPayload, UserFormPayload } from "@/lib/types";

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
  birthdate: "",
  visible_in_kiosk: true
};

const taskDefaults: TaskFormPayload = {
  title: "",
  icon: "⭐",
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

  const userLookup = useMemo(
    () => Object.fromEntries((data?.users ?? []).map((user) => [user.id, user])),
    [data?.users]
  );
  const rewardLookup = useMemo(
    () => Object.fromEntries((data?.rewards ?? []).map((reward) => [reward.id, reward])),
    [data?.rewards]
  );

  const lockedView = (
    <div className="flex min-h-0 flex-1 items-center justify-center p-8">
      <div className="glass-panel-strong max-w-xl rounded-[2rem] p-8 text-center">
        <ShieldCheck className="mx-auto h-12 w-12 text-teal-600" />
        <h2 className="mt-4 text-3xl font-semibold">Ebeveyn girişi gerekli</h2>
        <p className="mt-3 text-[color:var(--text-muted)]">
          Yönetim araçları yalnızca ebeveyn PIN doğrulaması ile açılır.
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
      <Card title="Profil düzenleyici" description="Admin ve çocuk profillerini buradan yönetin.">
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
                      event.target.value === "ebeveyn" ? null : current.birthdate,
                    visible_in_kiosk:
                      current.role === (event.target.value as UserFormPayload["role"])
                        ? current.visible_in_kiosk
                        : event.target.value !== "ebeveyn"
                  }))
                }
                className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
              >
                <option value="çocuk">Çocuk</option>
                <option value="ebeveyn">Admin</option>
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
          <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)] md:items-start">
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
            <label className="flex items-center justify-between rounded-[1.5rem] border border-slate-200 bg-white px-4 py-4">
              <div>
                <div className="font-semibold">Kioskta goster</div>
                <div className="text-sm text-[color:var(--text-muted)]">
                  Kapaliysa profil ana secim ekraninda gorunmez.
                </div>
              </div>
              <input
                type="checkbox"
                checked={userDraft.visible_in_kiosk !== false}
                onChange={(event) =>
                  setUserDraft((current) => ({
                    ...current,
                    visible_in_kiosk: event.target.checked
                  }))
                }
                className="h-5 w-5"
              />
            </label>
          </div>
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
                  birthdate: user.birthdate ?? "",
                  visible_in_kiosk: user.visible_in_kiosk
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
                    {user.role === "ebeveyn" ? "admin" : "çocuk"} • {user.points} puan
                    {user.visible_in_kiosk ? " • kioskta gorunur" : " • kioskta gizli"}
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
    <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
      <Card title="Görev düzenleyici" description="Tablet ekranında görünecek görevleri planlayın.">
        <div className="space-y-4">
          <label className="block space-y-2">
            <Label>Başlık</Label>
            <input
              value={taskDraft.title}
              onChange={(event) => setTaskDraft((current) => ({ ...current, title: event.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-2">
              <Label>İkon</Label>
              <input
                value={taskDraft.icon}
                onChange={(event) => setTaskDraft((current) => ({ ...current, icon: event.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-2xl"
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
          <div className="space-y-2">
            <Label>Atanan kişiler</Label>
            <div className="flex flex-wrap gap-2">
              {data?.users.map((user) => {
                  const active = taskDraft.assignedTo.includes(user.id);
                  return (
                    <button
                      key={user.id}
                      onClick={() =>
                        setTaskDraft((current) => ({
                          ...current,
                          assignedTo: active
                            ? current.assignedTo.filter((id) => id !== user.id)
                            : [...current.assignedTo, user.id]
                        }))
                      }
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
            <div className="flex flex-wrap gap-2">
              {Object.entries(WEEKDAY_LABELS).map(([key, label]) => {
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
              disabled={working}
              className="rounded-[1.4rem] bg-slate-950 px-5 py-3 font-semibold text-white disabled:opacity-60"
            >
              {taskDraft.id ? "Güncelle" : "Görev ekle"}
            </button>
            <button
              onClick={() => {
                setTaskDraft(taskDefaults);
                setSpecialDate("");
              }}
              className="rounded-[1.4rem] bg-slate-200 px-5 py-3 font-semibold text-slate-800"
            >
              Temizle
            </button>
          </div>
        </div>
      </Card>

      <Card title="Görev listesi" description="Seçerek görev bilgilerini forma aktarın.">
        <div className="space-y-3">
          {data?.tasks.map((task) => (
            <button
              key={task.id}
              onClick={() =>
                setTaskDraft({
                  id: task.id,
                  title: task.title,
                  icon: task.icon,
                  points: task.points,
                  assignedTo: task.assigned_to,
                  scheduleType: task.schedule_type,
                  days: task.days,
                  specialDates: task.special_dates,
                  timeBlock: task.time_block
                })
              }
              className="w-full rounded-[1.6rem] border border-slate-200 bg-white/80 p-4 text-left"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-[1.2rem] bg-slate-100 text-3xl">
                    {task.icon}
                  </div>
                  <div>
                    <div className="text-lg font-semibold">{task.title}</div>
                    <div className="text-sm text-[color:var(--text-muted)]">
                      {task.points} puan • {TIME_BLOCK_LABELS[task.time_block]}
                    </div>
                    <div className="text-sm text-[color:var(--text-muted)]">
                      {task.schedule_type === "gunluk"
                        ? "Her gün"
                        : task.schedule_type === "haftalik"
                          ? toWeekText(task.days)
                          : task.special_dates.join(", ")}
                    </div>
                  </div>
                </div>
                <div className="text-sm text-[color:var(--text-muted)]">
                  {task.assigned_to.map((id) => userLookup[id]?.name).filter(Boolean).join(", ")}
                </div>
              </div>
            </button>
          ))}
        </div>
      </Card>
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
          <div className="rounded-[1.5rem] bg-white/80 p-4">Yönetim paneli ebeveyn PIN ile korunur.</div>
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
            <div className="text-sm font-semibold uppercase tracking-[0.24em] text-teal-700">Ebeveyn paneli</div>
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
