// Square avatar crop math (pure, unit tested). The canvas export lives in
// components/AvatarCropper.tsx.

/** Side of the exported square avatar, in pixels. */
export const AVATAR_OUTPUT_PX = 512;
/** Most zoom the cropper allows, relative to "cover". */
export const MAX_ZOOM = 4;

export interface CropView {
  /** Image position inside the square viewport, in viewport pixels (top-left corner). */
  x: number;
  y: number;
  /** 1 = the image just covers the viewport. */
  zoom: number;
}

/** Displayed scale (viewport px per image px) for a zoom level. */
export function displayScale(imgW: number, imgH: number, viewport: number, zoom: number): number {
  return (viewport / Math.min(imgW, imgH)) * zoom;
}

/** Clamps a view so the image always covers the viewport. */
export function clampView(view: CropView, imgW: number, imgH: number, viewport: number): CropView {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, view.zoom));
  const s = displayScale(imgW, imgH, viewport, zoom);
  const w = imgW * s;
  const h = imgH * s;
  return {
    zoom,
    x: Math.min(0, Math.max(viewport - w, view.x)),
    y: Math.min(0, Math.max(viewport - h, view.y)),
  };
}

/** The view that centres the image at zoom 1. */
export function initialView(imgW: number, imgH: number, viewport: number): CropView {
  const s = displayScale(imgW, imgH, viewport, 1);
  return { zoom: 1, x: (viewport - imgW * s) / 2, y: (viewport - imgH * s) / 2 };
}

/** Changes zoom while keeping the viewport centre fixed on the same image point. */
export function zoomAroundCentre(view: CropView, nextZoom: number, imgW: number, imgH: number, viewport: number): CropView {
  const s0 = displayScale(imgW, imgH, viewport, view.zoom);
  const z = Math.min(MAX_ZOOM, Math.max(1, nextZoom));
  const s1 = displayScale(imgW, imgH, viewport, z);
  const c = viewport / 2;
  const imgCx = (c - view.x) / s0;
  const imgCy = (c - view.y) / s0;
  return clampView({ zoom: z, x: c - imgCx * s1, y: c - imgCy * s1 }, imgW, imgH, viewport);
}

/** Source square in image pixels for a view. */
export function sourceRect(view: CropView, imgW: number, imgH: number, viewport: number): { sx: number; sy: number; size: number } {
  const v = clampView(view, imgW, imgH, viewport);
  const s = displayScale(imgW, imgH, viewport, v.zoom);
  const size = Math.min(viewport / s, imgW, imgH);
  return {
    sx: Math.min(imgW - size, Math.max(0, -v.x / s)),
    sy: Math.min(imgH - size, Math.max(0, -v.y / s)),
    size,
  };
}
