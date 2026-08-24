"use client";

import { useRef, useState } from "react";

/**
 * A file input that downscales images in the browser before they are ever sent.
 *
 * A phone photo is 3–5 MB; nothing about a gown needs that. Resizing here keeps
 * uploads fast on a shop's connection, keeps us well under the serverless request
 * limit, and keeps hosted storage from filling up. Same canvas approach as the
 * CRM's image optimizer, but applied when the file is chosen rather than on
 * submit — a form driven by a server action must not be submitted natively.
 */

const MAX_EDGE = 1600;
const QUALITY = 0.82;

function stripExtension(name: string) {
  return name.replace(/\.[^.]+$/, "");
}

function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not read ${file.name}`));
    };
    image.src = url;
  });
}

async function downscale(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  const image = await loadImage(file);
  const scale = Math.min(MAX_EDGE / image.naturalWidth, MAX_EDGE / image.naturalHeight, 1);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return file;
  context.drawImage(image, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", QUALITY);
  });
  if (!blob || blob.size >= file.size) return file;

  return new File([blob], `${stripExtension(file.name) || "photo"}.jpg`, {
    type: "image/jpeg",
    lastModified: file.lastModified
  });
}

function formatSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PhotoInput({ name = "photos" }: { name?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  async function onChange() {
    const input = inputRef.current;
    const chosen = Array.from(input?.files ?? []);
    if (!input || chosen.length === 0) {
      setStatus(null);
      return;
    }

    setWorking(true);
    setStatus("Resizing…");

    try {
      const before = chosen.reduce((sum, file) => sum + file.size, 0);
      const resized = await Promise.all(chosen.map(downscale));
      const after = resized.reduce((sum, file) => sum + file.size, 0);

      const transfer = new DataTransfer();
      for (const file of resized) transfer.items.add(file);
      input.files = transfer.files;

      setStatus(
        after < before
          ? `${resized.length} photo${resized.length === 1 ? "" : "s"} ready — ${formatSize(before)} → ${formatSize(after)}`
          : `${resized.length} photo${resized.length === 1 ? "" : "s"} ready — ${formatSize(after)}`
      );
    } catch {
      // Resizing is an optimization; the originals still upload fine.
      setStatus("Using the original files.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        id={name}
        name={name}
        type="file"
        accept="image/*"
        multiple
        onChange={onChange}
        disabled={working}
      />
      <span className="hint">
        {status ?? "Photos are resized in your browser before uploading, so phone shots are fine."}
      </span>
    </>
  );
}
