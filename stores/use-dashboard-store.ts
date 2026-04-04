"use client";

import { create } from "zustand";
import type {
  AccountAuthPayload,
  AccountPasswordChangePayload,
  DashboardPayload,
  FamilySettingsPayload,
  ParentPinChangePayload,
  RewardFormPayload,
  TaskFormPayload,
  UserFormPayload
} from "@/lib/types";

interface ToastState {
  kind: "basari" | "bilgi" | "hata";
  message: string;
}

interface CelebrationState {
  userId: string;
  taskTitle: string;
  points: number;
  key: number;
}

interface DashboardStore {
  data: DashboardPayload | null;
  activeProfileId: string | null;
  pendingTaskKeys: string[];
  loading: boolean;
  working: boolean;
  error: string | null;
  toast: ToastState | null;
  celebration: CelebrationState | null;
  loginOpen: boolean;
  adminOpen: boolean;
  loadDashboard: () => Promise<void>;
  setActiveProfile: (profileId: string) => void;
  openLogin: () => void;
  closeLogin: () => void;
  openAdmin: () => void;
  closeAdmin: () => void;
  clearToast: () => void;
  clearCelebration: () => void;
  loginAccount: (payload: AccountAuthPayload) => Promise<boolean>;
  registerAccount: (payload: AccountAuthPayload) => Promise<boolean>;
  logoutAccount: () => Promise<void>;
  loginParent: (pin: string) => Promise<boolean>;
  logoutParent: () => Promise<void>;
  completeTask: (
    taskId: string,
    userId: string,
    dateKey: string,
    taskTitle: string,
    points: number
  ) => Promise<void>;
  undoTaskCompletion: (
    taskId: string,
    userId: string,
    dateKey: string,
    taskTitle: string
  ) => Promise<void>;
  requestReward: (rewardId: string, userId: string) => Promise<void>;
  saveUser: (payload: UserFormPayload) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
  saveTask: (payload: TaskFormPayload) => Promise<void>;
  reorderTasks: (orderedTaskIds: string[]) => Promise<void>;
  saveReward: (payload: RewardFormPayload) => Promise<void>;
  resolveRedemption: (
    redemptionId: string,
    status: "onaylandi" | "reddedildi"
  ) => Promise<void>;
  adjustPoints: (userId: string, delta: number, note: string) => Promise<void>;
  resetProgress: () => Promise<void>;
  updateFamilySettings: (payload: FamilySettingsPayload) => Promise<void>;
  changeAccountPassword: (payload: AccountPasswordChangePayload) => Promise<void>;
  changeParentPin: (payload: ParentPinChangePayload) => Promise<void>;
}

async function requestJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  const payload = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error || "Islem basarisiz.");
  }

  return payload;
}

function pickDefaultProfile(data: DashboardPayload | null) {
  if (!data?.users.length) {
    return null;
  }

  return data.users.find((user) => user.role === "\u00e7ocuk")?.id ?? data.users[0]?.id ?? null;
}

function withDashboardState(
  set: (
    partial:
      | Partial<DashboardStore>
      | ((state: DashboardStore) => Partial<DashboardStore>)
  ) => void,
  data: DashboardPayload
) {
  set((state) => {
    const existingActive = data.users.some((user) => user.id === state.activeProfileId)
      ? state.activeProfileId
      : pickDefaultProfile(data);

    return {
      data,
      activeProfileId: existingActive
    };
  });
}

function getTaskActionKey(taskId: string, userId: string, dateKey: string) {
  return `${taskId}:${userId}:${dateKey}`;
}

export const useDashboardStore = create<DashboardStore>((set, get) => ({
  data: null,
  activeProfileId: null,
  pendingTaskKeys: [],
  loading: true,
  working: false,
  error: null,
  toast: null,
  celebration: null,
  loginOpen: false,
  adminOpen: false,
  async loadDashboard() {
    set({ loading: true, error: null });

    try {
      const data = await requestJson<DashboardPayload>("/api/dashboard");
      withDashboardState(set, data);
      set({ loading: false });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : "Veriler yuklenemedi."
      });
    }
  },
  setActiveProfile(profileId) {
    set({
      activeProfileId: profileId,
      toast: { kind: "bilgi", message: "Profil secildi." }
    });
  },
  openLogin() {
    set({ loginOpen: true });
  },
  closeLogin() {
    set({ loginOpen: false });
  },
  openAdmin() {
    set({ adminOpen: true });
  },
  closeAdmin() {
    set({ adminOpen: false });
  },
  clearToast() {
    set({ toast: null });
  },
  clearCelebration() {
    set({ celebration: null });
  },
  async loginAccount(payload) {
    set({ working: true, error: null });

    try {
      await requestJson<{ success: boolean }>("/api/auth/account-login", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      const data = await requestJson<DashboardPayload>("/api/dashboard");
      withDashboardState(set, data);
      set({
        working: false,
        loginOpen: false,
        adminOpen: false,
        toast: { kind: "basari", message: "Hesaba giris yapildi." }
      });
      return true;
    } catch (error) {
      set({
        working: false,
        toast: {
          kind: "hata",
          message: error instanceof Error ? error.message : "Giris yapilamadi."
        }
      });
      return false;
    }
  },
  async registerAccount(payload) {
    set({ working: true, error: null });

    try {
      await requestJson<{ success: boolean }>("/api/auth/account-register", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      const data = await requestJson<DashboardPayload>("/api/dashboard");
      withDashboardState(set, data);
      set({
        working: false,
        loginOpen: false,
        adminOpen: false,
        toast: { kind: "basari", message: "Hesap olusturuldu." }
      });
      return true;
    } catch (error) {
      set({
        working: false,
        toast: {
          kind: "hata",
          message: error instanceof Error ? error.message : "Hesap olusturulamadi."
        }
      });
      return false;
    }
  },
  async logoutAccount() {
    set({ working: true });

    try {
      await requestJson<{ success: boolean }>("/api/auth/logout", {
        method: "POST",
        body: JSON.stringify({})
      });

      const data = await requestJson<DashboardPayload>("/api/dashboard");
      withDashboardState(set, data);
      set({
        working: false,
        adminOpen: false,
        loginOpen: false,
        pendingTaskKeys: [],
        celebration: null,
        toast: { kind: "bilgi", message: "Hesaptan cikis yapildi." }
      });
    } catch (error) {
      set({
        working: false,
        toast: {
          kind: "hata",
          message: error instanceof Error ? error.message : "Cikis yapilamadi."
        }
      });
    }
  },
  async loginParent(pin) {
    set({ working: true, error: null });

    try {
      await requestJson<{ success: boolean }>("/api/auth/parent-login", {
        method: "POST",
        body: JSON.stringify({ pin })
      });

      const data = await requestJson<DashboardPayload>("/api/dashboard");
      withDashboardState(set, data);
      set({
        working: false,
        loginOpen: false,
        adminOpen: true,
        toast: { kind: "basari", message: "Ebeveyn modu acildi." }
      });
      return true;
    } catch (error) {
      set({
        working: false,
        toast: {
          kind: "hata",
          message: error instanceof Error ? error.message : "Giris yapilamadi."
        }
      });
      return false;
    }
  },
  async logoutParent() {
    set({ working: true });

    try {
      await requestJson<{ success: boolean }>("/api/auth/parent-logout", {
        method: "POST",
        body: JSON.stringify({})
      });

      const data = await requestJson<DashboardPayload>("/api/dashboard");
      withDashboardState(set, data);
      set({
        working: false,
        adminOpen: false,
        toast: { kind: "bilgi", message: "Ebeveyn kilidi kapatildi." }
      });
    } catch (error) {
      set({
        working: false,
        toast: {
          kind: "hata",
          message: error instanceof Error ? error.message : "Cikis yapilamadi."
        }
      });
    }
  },
  async completeTask(taskId, userId, dateKey, taskTitle, points) {
    const taskKey = getTaskActionKey(taskId, userId, dateKey);

    if (get().pendingTaskKeys.includes(taskKey)) {
      return;
    }

    set((state) => ({
      working: true,
      error: null,
      pendingTaskKeys: [...state.pendingTaskKeys, taskKey]
    }));

    try {
      const data = await requestJson<DashboardPayload>(`/api/tasks/${taskId}/toggle`, {
        method: "POST",
        body: JSON.stringify({ userId, dateKey })
      });

      withDashboardState(set, data);
      set((state) => ({
        working: false,
        pendingTaskKeys: state.pendingTaskKeys.filter((key) => key !== taskKey),
        celebration: {
          userId,
          taskTitle,
          points,
          key: (state.celebration?.key ?? 0) + 1
        },
        toast: { kind: "basari", message: "Aferin! Gorev islendi." }
      }));
    } catch (error) {
      set((state) => ({
        working: false,
        pendingTaskKeys: state.pendingTaskKeys.filter((key) => key !== taskKey),
        toast: {
          kind: "hata",
          message: error instanceof Error ? error.message : "Gorev guncellenemedi."
        }
      }));
    }
  },
  async undoTaskCompletion(taskId, userId, dateKey, taskTitle) {
    const taskKey = getTaskActionKey(taskId, userId, dateKey);

    if (get().pendingTaskKeys.includes(taskKey)) {
      return;
    }

    set((state) => ({
      working: true,
      error: null,
      pendingTaskKeys: [...state.pendingTaskKeys, taskKey]
    }));

    try {
      const data = await requestJson<DashboardPayload>(`/api/tasks/${taskId}/toggle`, {
        method: "POST",
        body: JSON.stringify({ userId, dateKey })
      });

      withDashboardState(set, data);
      set((state) => ({
        working: false,
        pendingTaskKeys: state.pendingTaskKeys.filter((key) => key !== taskKey),
        toast: { kind: "bilgi", message: `${taskTitle} geri alindi.` }
      }));
    } catch (error) {
      set((state) => ({
        working: false,
        pendingTaskKeys: state.pendingTaskKeys.filter((key) => key !== taskKey),
        toast: {
          kind: "hata",
          message: error instanceof Error ? error.message : "Gorev geri alinamadi."
        }
      }));
    }
  },
  async requestReward(rewardId, userId) {
    set({ working: true });

    try {
      const data = await requestJson<DashboardPayload>(`/api/rewards/${rewardId}/redeem`, {
        method: "POST",
        body: JSON.stringify({ userId })
      });
      withDashboardState(set, data);
      set({
        working: false,
        toast: { kind: "basari", message: "Odul talebi gonderildi." }
      });
    } catch (error) {
      set({
        working: false,
        toast: {
          kind: "hata",
          message: error instanceof Error ? error.message : "Odul talebi gonderilemedi."
        }
      });
    }
  },
  async saveUser(payload) {
    set({ working: true });

    try {
      const data = await requestJson<DashboardPayload>("/api/users", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      withDashboardState(set, data);
      set({
        working: false,
        toast: { kind: "basari", message: "Kullanici kaydedildi." }
      });
    } catch (error) {
      set({
        working: false,
        toast: {
          kind: "hata",
          message: error instanceof Error ? error.message : "Kullanici kaydedilemedi."
        }
      });
    }
  },
  async deleteUser(userId) {
    set({ working: true });

    try {
      const data = await requestJson<DashboardPayload>(`/api/users/${userId}`, {
        method: "DELETE"
      });
      withDashboardState(set, data);
      set({
        working: false,
        toast: { kind: "basari", message: "Profil silindi." }
      });
    } catch (error) {
      set({
        working: false,
        toast: {
          kind: "hata",
          message: error instanceof Error ? error.message : "Profil silinemedi."
        }
      });
    }
  },
  async saveTask(payload) {
    set({ working: true });

    try {
      const data = await requestJson<DashboardPayload>("/api/tasks", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      withDashboardState(set, data);
      set({
        working: false,
        toast: { kind: "basari", message: "Gorev kaydedildi." }
      });
    } catch (error) {
      set({
        working: false,
        toast: {
          kind: "hata",
          message: error instanceof Error ? error.message : "Gorev kaydedilemedi."
        }
      });
    }
  },
  async reorderTasks(orderedTaskIds) {
    if (orderedTaskIds.length < 2) {
      return;
    }

    set({ working: true });

    try {
      const data = await requestJson<DashboardPayload>("/api/tasks/reorder", {
        method: "POST",
        body: JSON.stringify({ orderedTaskIds })
      });
      withDashboardState(set, data);
      set({
        working: false,
        toast: { kind: "basari", message: "Gorev sirasi guncellendi." }
      });
    } catch (error) {
      set({
        working: false,
        toast: {
          kind: "hata",
          message: error instanceof Error ? error.message : "Gorev sirasi guncellenemedi."
        }
      });
    }
  },
  async saveReward(payload) {
    set({ working: true });

    try {
      const data = await requestJson<DashboardPayload>("/api/rewards", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      withDashboardState(set, data);
      set({
        working: false,
        toast: { kind: "basari", message: "Odul kaydedildi." }
      });
    } catch (error) {
      set({
        working: false,
        toast: {
          kind: "hata",
          message: error instanceof Error ? error.message : "Odul kaydedilemedi."
        }
      });
    }
  },
  async resolveRedemption(redemptionId, status) {
    set({ working: true });

    try {
      const data = await requestJson<DashboardPayload>(
        `/api/redemptions/${redemptionId}/status`,
        {
          method: "POST",
          body: JSON.stringify({ status })
        }
      );
      withDashboardState(set, data);
      set({
        working: false,
        toast: {
          kind: "basari",
          message: status === "onaylandi" ? "Odul onaylandi." : "Odul reddedildi."
        }
      });
    } catch (error) {
      set({
        working: false,
        toast: {
          kind: "hata",
          message: error instanceof Error ? error.message : "Talep guncellenemedi."
        }
      });
    }
  },
  async adjustPoints(userId, delta, note) {
    set({ working: true });

    try {
      const data = await requestJson<DashboardPayload>("/api/points/adjust", {
        method: "POST",
        body: JSON.stringify({ userId, delta, note })
      });
      withDashboardState(set, data);
      set({
        working: false,
        toast: { kind: "basari", message: "Puan duzenlendi." }
      });
    } catch (error) {
      set({
        working: false,
        toast: {
          kind: "hata",
          message: error instanceof Error ? error.message : "Puan duzenlenemedi."
        }
      });
    }
  },
  async resetProgress() {
    set({ working: true });

    try {
      const data = await requestJson<DashboardPayload>("/api/family/reset-progress", {
        method: "POST",
        body: JSON.stringify({})
      });
      withDashboardState(set, data);
      set({
        working: false,
        toast: { kind: "basari", message: "Test verileri sifirlandi." }
      });
    } catch (error) {
      set({
        working: false,
        toast: {
          kind: "hata",
          message: error instanceof Error ? error.message : "Test verileri sifirlanamadi."
        }
      });
    }
  },
  async updateFamilySettings(payload) {
    set({ working: true });

    try {
      const data = await requestJson<DashboardPayload>("/api/family/settings", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      withDashboardState(set, data);
      set({
        working: false,
        toast: { kind: "basari", message: "Aile ayarlari kaydedildi." }
      });
    } catch (error) {
      set({
        working: false,
        toast: {
          kind: "hata",
          message: error instanceof Error ? error.message : "Aile ayarlari kaydedilemedi."
        }
      });
    }
  },
  async changeAccountPassword(payload) {
    set({ working: true });

    try {
      await requestJson<{ success: boolean }>("/api/auth/account-password", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      set({
        working: false,
        toast: { kind: "basari", message: "Hesap şifresi güncellendi." }
      });
    } catch (error) {
      set({
        working: false,
        toast: {
          kind: "hata",
          message: error instanceof Error ? error.message : "Şifre güncellenemedi."
        }
      });
    }
  },
  async changeParentPin(payload) {
    set({ working: true });

    try {
      const data = await requestJson<DashboardPayload>("/api/family/pin", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      withDashboardState(set, data);
      set({
        working: false,
        toast: { kind: "basari", message: "Yönetim PIN'i güncellendi." }
      });
    } catch (error) {
      set({
        working: false,
        toast: {
          kind: "hata",
          message: error instanceof Error ? error.message : "PIN güncellenemedi."
        }
      });
    }
  }
}));
