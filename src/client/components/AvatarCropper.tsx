// Square crop for a new profile picture: drag to move, slider (or pinch) to zoom.
// Exports a 512 px square WebP or JPEG under the upload limit.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { LIMITS } from "@shared/game/config";
import { AVATAR_OUTPUT_PX, MAX_ZOOM, clampView, initialView, sourceRect, zoomAroundCentre, type CropView } from "../lib/crop";
import { Button } from "./ui";

const VIEWPORT = 280;

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Draws the crop to a square canvas and encodes it under the upload limit (WebP, then JPEG). */
export async function exportCrop(img: HTMLImageElement, view: CropView, viewport: number): Promise<Blob> {
  const { sx, sy, size } = sourceRect(view, img.naturalWidth, img.naturalHeight, viewport);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_OUTPUT_PX;
  canvas.height = AVATAR_OUTPUT_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot crop images.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, size, size, 0, 0, AVATAR_OUTPUT_PX, AVATAR_OUTPUT_PX);
  for (const type of ["image/webp", "image/jpeg"]) {
    for (const quality of [0.9, 0.8, 0.65, 0.5]) {
      const blob = await toBlob(canvas, type, quality);
      // Some browsers fall back to PNG for a type they cannot encode.
      if (!blob || blob.type !== type) break;
      if (blob.size <= LIMITS.avatarMaxBytes) return blob;
    }
  }
  throw new Error("Could not make the picture small enough. Try another one.");
}

export function AvatarCropper({
  file,
  onCancel,
  onDone,
  busy,
}: {
  file: File;
  onCancel: () => void;
  onDone: (blob: Blob) => void;
  busy?: boolean;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [view, setView] = useState<CropView>({ x: 0, y: 0, zoom: 1 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{ dist: number; zoom: number } | null>(null);

  useEffect(() => {
    let live = true;
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      if (!live) return;
      setImg(image);
      setView(initialView(image.naturalWidth, image.naturalHeight, VIEWPORT));
    };
    image.onerror = () => {
      if (live) setLoadError("That file is not an image this browser can open.");
    };
    image.src = url;
    return () => {
      live = false;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  if (loadError) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-wrong">{loadError}</p>
        <Button variant="secondary" onClick={onCancel}>
          Back
        </Button>
      </div>
    );
  }

  const w = img?.naturalWidth ?? 1;
  const h = img?.naturalHeight ?? 1;
  const scale = (VIEWPORT / Math.min(w, h)) * view.zoom;

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchStart.current = { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y), zoom: view.zoom };
    }
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev || !img) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinchStart.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      setView((v) => zoomAroundCentre(v, pinchStart.current!.zoom * (dist / pinchStart.current!.dist), w, h, VIEWPORT));
      return;
    }
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    setView((v) => clampView({ ...v, x: v.x + dx, y: v.y + dy }, w, h, VIEWPORT));
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
  };

  const save = async () => {
    if (!img) return;
    setExportError(null);
    try {
      onDone(await exportCrop(img, view, VIEWPORT));
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Could not crop that picture.");
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className="relative touch-none overflow-hidden rounded-2xl bg-bg select-none"
        style={{ width: VIEWPORT, height: VIEWPORT, cursor: "grab" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        aria-label="Drag to move the picture"
      >
        {img ? (
          <img
            src={img.src}
            alt=""
            draggable={false}
            className="pointer-events-none absolute top-0 left-0 max-w-none origin-top-left"
            style={{ width: w * scale, height: h * scale, transform: `translate(${view.x}px, ${view.y}px)` }}
          />
        ) : null}
        {/* Circle guide: the avatar is shown round, the upload stays square. */}
        <div
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{ boxShadow: "0 0 0 9999px rgb(10 17 40 / 0.55)", outline: "2px solid rgb(255 255 255 / 0.6)" }}
        />
      </div>
      <label className="flex w-full items-center gap-3 text-sm text-muted">
        Zoom
        <input
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={view.zoom}
          onChange={(e) => setView((v) => zoomAroundCentre(v, Number(e.target.value), w, h, VIEWPORT))}
          className="h-tap flex-1 accent-[var(--color-you)]"
          disabled={!img}
        />
      </label>
      {exportError ? <p className="text-sm text-wrong">{exportError}</p> : null}
      <div className="flex w-full gap-3">
        <Button variant="secondary" className="flex-1" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button className="flex-1" onClick={save} loading={busy} disabled={!img}>
          Use this
        </Button>
      </div>
    </div>
  );
}
