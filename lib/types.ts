export type UserRole = "ebeveyn" | "çocuk";
export type ScheduleType = "gunluk" | "haftalik" | "ozel";
export type TimeBlock = "sabah" | "ogleden_sonra" | "aksam" | "her_zaman";
export type ActiveTimeBlock = "gece" | "sabah" | "ogleden_sonra" | "aksam";
export type ThemeMode = "acik" | "koyu";
export type RewardSystemMode = "puan" | "odul" | "deger" | "karma";

export interface FamilyRecord {
  id: string;
  name: string;
  theme: ThemeMode;
  audio_enabled: boolean;
  child_sleep_time: string;
  parent_sleep_time: string;
  day_reset_time: string;
  created_at: string;
}

export interface UserRecord {
  id: string;
  family_id: string;
  name: string;
  role: UserRole;
  avatar: string;
  color: string;
  birthdate: string | null;
  visible_in_kiosk: boolean;
  points: number;
  created_at: string;
}

export interface TaskRecord {
  id: string;
  family_id: string;
  title: string;
  icon: string;
  points: number;
  assigned_to: string[];
  schedule_type: ScheduleType;
  days: string[];
  special_dates: string[];
  time_block: TimeBlock;
  created_at: string;
}

export interface CompletionRecord {
  id: string;
  family_id: string;
  user_id: string;
  task_id: string;
  completion_date: string;
  points_earned: number;
  created_at: string;
}

export interface RewardRecord {
  id: string;
  family_id: string;
  title: string;
  points_required: number;
  approval_required: boolean;
  created_at: string;
}

export interface RedemptionRecord {
  id: string;
  family_id: string;
  user_id: string;
  reward_id: string;
  status: "beklemede" | "onaylandi" | "reddedildi";
  requested_at: string;
  resolved_at: string | null;
}

export interface PointEventRecord {
  id: string;
  family_id: string;
  user_id: string;
  delta: number;
  source: "gorev" | "odul" | "manuel";
  task_id: string | null;
  reward_id: string | null;
  note: string | null;
  created_at: string;
}

export interface DashboardSession {
  accountAuthenticated: boolean;
  username: string | null;
  parentAuthenticated: boolean;
  role: "ebeveyn" | null;
}

export interface DashboardPayload {
  authRequired: boolean;
  setupRequired: boolean;
  family: FamilyRecord | null;
  session: DashboardSession;
  users: UserRecord[];
  tasks: TaskRecord[];
  completions: CompletionRecord[];
  rewards: RewardRecord[];
  redemptions: RedemptionRecord[];
  pointEvents: PointEventRecord[];
  today: {
    dateKey: string;
    label: string;
    weekday: string;
    activeTimeBlock: ActiveTimeBlock;
  };
  week: Array<{
    dateKey: string;
    dayLabel: string;
    weekday: string;
    isToday: boolean;
  }>;
}

export interface SetupPayload {
  familyName: string;
  pin: string;
  profiles: Array<{
    name: string;
    role: UserRole;
    avatar: string;
    color: string;
    birthdate?: string | null;
    visible_in_kiosk?: boolean;
  }>;
  includeSampleData: boolean;
}

export interface AccountAuthPayload {
  username: string;
  password: string;
}

export interface AccountPasswordChangePayload {
  currentPassword: string;
  newPassword: string;
}

export interface ParentPinChangePayload {
  currentPin: string;
  newPin: string;
}

export interface UserFormPayload {
  id?: string;
  name: string;
  role: UserRole;
  avatar: string;
  color: string;
  birthdate?: string | null;
  visible_in_kiosk?: boolean;
}

export interface TaskFormPayload {
  id?: string;
  title: string;
  icon?: string;
  points: number;
  assignedTo: string[];
  scheduleType: ScheduleType;
  days: string[];
  specialDates: string[];
  timeBlock: TimeBlock;
}

export interface RewardFormPayload {
  id?: string;
  title: string;
  pointsRequired: number;
  approvalRequired: boolean;
}

export interface FamilySettingsPayload {
  name?: string;
  theme?: "acik" | "koyu";
  audioEnabled?: boolean;
  childSleepTime?: string;
  parentSleepTime?: string;
  dayResetTime?: string;
  rewardMode?: RewardSystemMode;
  valueLabel?: string;
  valuePerPoint?: number;
}
