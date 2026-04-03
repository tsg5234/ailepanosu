"use client";

import { useRef, useState } from "react";
import { Camera, ImagePlus } from "lucide-react";
import { getAvatarOptions, isImageAvatar } from "@/lib/avatar";
import { createAvatarDataUrl } from "@/lib/client-avatar";
import type { UserRole } from "@/lib/types";
import { AvatarDisplay } from "@/components/kiosk/avatar-display";

interface AvatarPickerProps {
  label?: string;
  role: UserRole;
  value: string;
  onChange: (avatar: string) => void;
  compact?: boolean;
}

export function AvatarPicker({
  label = "Avatar",
  role,
  value,
  onChange,
  compact = false
}: AvatarPickerProps) {
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const avatarOptions = getAvatarOptions(role);

  const handleFileSelect = async (fileList: FileList | null) => {
    const file = fileList?.[0];

    if (!file) {
      return;
    }

    setError(null);
    setBusy(true);

    try {
      const avatar = await createAvatarDataUrl(file);
      onChange(avatar);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Resim eklenemedi.");
    } finally {
      setBusy(false);
    }
  };

  if (compact) {
    return (
      <div className="space-y-2">
        <span className="text-sm font-semibold text-slate-700">{label}</span>

        <div className="rounded-[1.3rem] border border-slate-200 bg-slate-50 px-3 py-3">
          <div className="space-y-3">
            <div className="flex flex-col gap-3 rounded-[1.2rem] bg-white px-3 py-3 shadow-[0_10px_22px_rgba(15,23,42,0.06)] sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[1.1rem] bg-slate-50 text-3xl shadow-[0_10px_20px_rgba(15,23,42,0.08)]">
                  <AvatarDisplay avatar={value} name="Profil" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900">Profil gorseli</div>
                  <div className="text-xs leading-5 text-slate-500">Emoji, fotograf ya da kamera kullan.</div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => uploadInputRef.current?.click()}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-3 py-2 text-sm font-bold text-white disabled:opacity-60"
                >
                  <ImagePlus className="h-4 w-4" />
                  Galeri
                </button>
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-2 text-sm font-bold text-sky-700 disabled:opacity-60"
                >
                  <Camera className="h-4 w-4" />
                  Kamera
                </button>
              </div>
            </div>

            <div className="soft-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {avatarOptions.map((avatar) => (
                <button
                  key={avatar}
                  type="button"
                  onClick={() => {
                    setError(null);
                    onChange(avatar);
                  }}
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-2xl transition ${
                    !isImageAvatar(value) && value === avatar
                      ? "border-slate-950 bg-slate-950 text-white shadow-[0_10px_22px_rgba(15,23,42,0.18)]"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                  aria-label={`Avatar ${avatar}`}
                >
                  {avatar}
                </button>
              ))}
            </div>

            <label className="block space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Kendi emojin
              </span>
              <input
                value={isImageAvatar(value) ? "" : value}
                onChange={(event) => {
                  setError(null);
                  onChange(event.target.value);
                }}
                className="w-full rounded-[1.1rem] border border-slate-200 bg-white px-3 py-3 text-lg outline-none transition focus:border-emerald-400 focus:shadow-[0_0_0_4px_rgba(16,185,129,0.12)]"
                placeholder={isImageAvatar(value) ? "Fotograf secili" : "🙂"}
              />
            </label>
          </div>

          <input
            ref={uploadInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (event) => {
              await handleFileSelect(event.target.files);
              event.target.value = "";
            }}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="user"
            className="hidden"
            onChange={async (event) => {
              await handleFileSelect(event.target.files);
              event.target.value = "";
            }}
          />

          {error ? (
            <div className="mt-3 rounded-[1rem] bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
              {error}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <span className="text-sm font-semibold text-slate-700">{label}</span>

      <div className="rounded-[1.3rem] border border-slate-200 bg-slate-50 px-3 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[1.1rem] bg-white text-3xl shadow-[0_10px_20px_rgba(15,23,42,0.08)]">
            <AvatarDisplay avatar={value} name="Profil" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900">Profil gorseli</div>
            <div className="text-xs leading-5 text-slate-500">
              Hazır avatar seç, galeri yükle ya da kamerayla çek.
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {avatarOptions.map((avatar) => (
            <button
              key={avatar}
              type="button"
              onClick={() => {
                setError(null);
                onChange(avatar);
              }}
              className={`flex h-11 w-11 items-center justify-center rounded-2xl border text-2xl transition ${
                !isImageAvatar(value) && value === avatar
                  ? "border-slate-950 bg-slate-950 text-white shadow-[0_10px_22px_rgba(15,23,42,0.18)]"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
              aria-label={`Avatar ${avatar}`}
            >
              {avatar}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => uploadInputRef.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
          >
            <ImagePlus className="h-4 w-4" />
            Galeriden yukle
          </button>
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-full bg-sky-100 px-4 py-2 text-sm font-bold text-sky-700 disabled:opacity-60"
          >
            <Camera className="h-4 w-4" />
            Kamerayla cek
          </button>
        </div>

        <input
          ref={uploadInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (event) => {
            await handleFileSelect(event.target.files);
            event.target.value = "";
          }}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="user"
          className="hidden"
          onChange={async (event) => {
            await handleFileSelect(event.target.files);
            event.target.value = "";
          }}
        />

        <label className="mt-3 block space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Istersen emoji kullan
          </span>
          <input
            value={isImageAvatar(value) ? "" : value}
            onChange={(event) => {
              setError(null);
              onChange(event.target.value);
            }}
            className="w-full rounded-[1.1rem] border border-slate-200 bg-white px-3 py-3 text-lg outline-none transition focus:border-emerald-400 focus:shadow-[0_0_0_4px_rgba(16,185,129,0.12)]"
            placeholder={isImageAvatar(value) ? "Fotograf secili" : "🙂 veya kendi emojin"}
          />
        </label>

        {error ? (
          <div className="mt-3 rounded-[1rem] bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}
