import { supabase } from './supabase';

export const LOGO_BUCKET = 'business-logos';

export function logoUrl(path: string | null | undefined) {
  return path ? supabase.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl : null;
}

/** Shrink a logo to at most 600 px on its longest side as PNG, keeping transparency. */
export async function prepareLogo(file: File): Promise<Blob> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Choose a PNG, JPG or WebP image.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Could not read this image.'));
      i.src = url;
    });
    const scale = Math.min(1, 600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not read this image.');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
    if (!blob) throw new Error('Could not read this image.');
    if (blob.size > 1_000_000) throw new Error('This logo is too detailed. Try a simpler or smaller image (under 1 MB).');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}
