import type {
  RewardFormPayload,
  RewardRecord,
  RewardSystemMode
} from "@/lib/types";

const CONFIG_PREFIX = "__family_config__";
const MODE_PREFIX = `${CONFIG_PREFIX}:mode:`;
const VALUE_PREFIX = `${CONFIG_PREFIX}:value:`;
const VALUE_SCALE = 100;

export const DEFAULT_REWARD_MODE: RewardSystemMode = "odul";
export const DEFAULT_VALUE_LABEL = "TL";
export const DEFAULT_VALUE_PER_POINT = 0.5;

export interface RewardSystemConfig {
  mode: RewardSystemMode;
  valueLabel: string;
  valuePerPoint: number;
  modeRewardId?: string;
  valueRewardId?: string;
}

export const REWARD_MODE_OPTIONS: Array<{
  value: RewardSystemMode;
  label: string;
  description: string;
}> = [
  {
    value: "puan",
    label: "Sadece puan",
    description: "Çocuk sadece puan biriktirir."
  },
  {
    value: "odul",
    label: "Hedef ödüller",
    description: "Puan belirli ödül hedeflerini açar."
  },
  {
    value: "deger",
    label: "Değer karşılığı",
    description: "Puan bir değer birimine dönüşür."
  },
  {
    value: "karma",
    label: "Ikisi birlikte",
    description: "Hem hedef ödüller hem değer karşılığı görünür."
  }
];

function isRewardSystemMode(value: string | undefined): value is RewardSystemMode {
  return REWARD_MODE_OPTIONS.some((option) => option.value === value);
}

function encodeValueLabel(label: string) {
  return encodeURIComponent(label.trim() || DEFAULT_VALUE_LABEL);
}

function decodeValueLabel(value: string) {
  try {
    const decoded = decodeURIComponent(value);
    return decoded.trim() || DEFAULT_VALUE_LABEL;
  } catch {
    return value.trim() || DEFAULT_VALUE_LABEL;
  }
}

export function sanitizeValueLabel(label: string) {
  return label.trim().slice(0, 24) || DEFAULT_VALUE_LABEL;
}

export function sanitizeValuePerPoint(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_VALUE_PER_POINT;
  }

  return Math.max(0.01, Math.round(value * VALUE_SCALE) / VALUE_SCALE);
}

export function isRewardSystemConfigReward(reward: Pick<RewardRecord, "title">) {
  return reward.title.startsWith(MODE_PREFIX) || reward.title.startsWith(VALUE_PREFIX);
}

export function getVisibleRewards(rewards: RewardRecord[]) {
  return rewards.filter((reward) => !isRewardSystemConfigReward(reward));
}

export function getRewardSystemConfig(rewards: RewardRecord[]): RewardSystemConfig {
  const modeReward = rewards.find((reward) => reward.title.startsWith(MODE_PREFIX));
  const parsedMode = modeReward?.title.slice(MODE_PREFIX.length) as RewardSystemMode | undefined;
  const mode = isRewardSystemMode(parsedMode) ? parsedMode : DEFAULT_REWARD_MODE;

  const valueReward = rewards.find((reward) => reward.title.startsWith(VALUE_PREFIX));
  const rawLabel = valueReward?.title.slice(VALUE_PREFIX.length) ?? DEFAULT_VALUE_LABEL;
  const valueLabel = decodeValueLabel(rawLabel);
  const rawValue = valueReward ? valueReward.points_required / VALUE_SCALE : DEFAULT_VALUE_PER_POINT;
  const valuePerPoint = sanitizeValuePerPoint(rawValue);

  return {
    mode,
    valueLabel,
    valuePerPoint,
    modeRewardId: modeReward?.id,
    valueRewardId: valueReward?.id
  };
}

export function buildRewardSystemConfigRewards(
  config: RewardSystemConfig
): {
  modeReward: RewardFormPayload;
  valueReward: RewardFormPayload;
} {
  const sanitizedLabel = sanitizeValueLabel(config.valueLabel);
  const sanitizedValuePerPoint = sanitizeValuePerPoint(config.valuePerPoint);

  return {
    modeReward: {
      id: config.modeRewardId,
      title: `${MODE_PREFIX}${config.mode}`,
      pointsRequired: 1,
      approvalRequired: true
    },
    valueReward: {
      id: config.valueRewardId,
      title: `${VALUE_PREFIX}${encodeValueLabel(sanitizedLabel)}`,
      pointsRequired: Math.round(sanitizedValuePerPoint * VALUE_SCALE),
      approvalRequired: true
    }
  };
}

export function rewardModeUsesGoals(mode: RewardSystemMode) {
  return mode === "odul" || mode === "karma";
}

export function rewardModeUsesValue(mode: RewardSystemMode) {
  return mode === "deger" || mode === "karma";
}

function formatNumber(value: number, locale = "tr-TR") {
  const hasFractions = Math.abs(value % 1) > 0.001;

  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: hasFractions ? 1 : 0,
    maximumFractionDigits: hasFractions ? 2 : 0
  }).format(value);
}

export function formatValueAmount(
  value: number,
  label: string,
  locale = "tr-TR"
) {
  return `${formatNumber(value, locale)} ${label}`;
}

export function formatPointsAsValue(
  points: number,
  config: Pick<RewardSystemConfig, "valueLabel" | "valuePerPoint">,
  locale = "tr-TR"
) {
  return formatValueAmount(points * sanitizeValuePerPoint(config.valuePerPoint), config.valueLabel, locale);
}
