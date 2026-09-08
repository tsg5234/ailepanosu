"use client";

const AVATAR_SIZE = 384;

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Resim okunamadı."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Resim hazırlanamadı."));
    image.src = src;
  });
}

export async function createAvatarDataUrl(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Lutfen bir resim sec.");
  }

  const source = await readFileAsDataUrl(file);
  const image = await loadImage(source);
  const size = Math.min(image.naturalWidth || image.width, image.naturalHeight || image.height);
  const startX = Math.max(0, ((image.naturalWidth || image.width) - size) / 2);
  const startY = Math.max(0, ((image.naturalHeight || image.height) - size) / 2);
  const canvas = document.createElement("canvas");

  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Resim hazırlanamadı.");
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, startX, startY, size, size, 0, 0, AVATAR_SIZE, AVATAR_SIZE);

  return canvas.toDataURL("image/jpeg", 0.86);
}
