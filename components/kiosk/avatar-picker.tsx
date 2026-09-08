"use client";

import { useRef, useState } from "react";
import { Camera, ImagePlus, X } from "lucide-react";
import { isImageAvatar } from "@/lib/avatar";
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
  label = "Profil fotoğrafı",
  value,
  onChange
}: AvatarPickerProps) {
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasPhoto = isImageAvatar(value);

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

  return (
    <div className="avatar-upload-field">
      <span className="avatar-upload-label">{label}</span>

      <div className="avatar-upload-box">
        <div className="avatar-upload-preview">
          <AvatarDisplay avatar={hasPhoto ? value : ""} name="Profil" />
        </div>

        <div className="avatar-upload-copy">
          <strong>{hasPhoto ? "Fotoğraf seçildi" : "Fotoğraf yok"}</strong>
          <span>Profil için galeri veya kamera ile fotoğraf ekle.</span>
        </div>

        <div className="avatar-upload-actions">
          <button
            type="button"
            onClick={() => uploadInputRef.current?.click()}
            disabled={busy}
            className="avatar-upload-primary"
          >
            <ImagePlus className="h-4 w-4" />
            Galeri
          </button>
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            disabled={busy}
            className="avatar-upload-secondary"
          >
            <Camera className="h-4 w-4" />
            Kamera
          </button>
          {hasPhoto ? (
            <button
              type="button"
              onClick={() => onChange("")}
              disabled={busy}
              className="avatar-upload-clear"
              aria-label="Fotoğrafı kaldır"
              title="Fotoğrafı kaldır"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
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

      {error ? <div className="avatar-upload-error">{error}</div> : null}
    </div>
  );
}
