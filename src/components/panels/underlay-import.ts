import type { Underlay } from '../../engine/types';

const MAX_DIM = 1600;

/** Downscale + re-encode a phone photo so it fits comfortably in storage. */
function fileToBitmap(file: File): Promise<{ src: string; wPx: number; hPx: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * k);
      const h = Math.round(img.naturalHeight * k);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('no canvas'));
        return;
      }
      // JPEG has no alpha — without this, transparent PNG floorplans re-encode
      // onto a black page and both readability and wall detection suffer.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve({ src: canvas.toDataURL('image/jpeg', 0.72), wPx: w, hPx: h });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('bad image'));
    };
    img.src = url;
  });
}

/**
 * Turn a picked image File into a ready `Underlay` — shared by the DESIGN/Build
 * `UnderlayCard` and the first-run "Start from a floorplan photo" entry (UX-4
 * item G) so the two import homes build identical underlays. Assumes ~8 m wide
 * to start; the user calibrates the true scale right after.
 */
export async function buildUnderlay(file: File): Promise<Underlay> {
  const { src, wPx, hPx } = await fileToBitmap(file);
  const scale = 8 / wPx;
  return {
    src,
    wPx,
    hPx,
    center: { x: (wPx * scale) / 2, y: (hPx * scale) / 2 },
    scale,
    rotation: 0,
    opacity: 0.55,
  };
}
