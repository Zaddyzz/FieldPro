/** Resize and re-encode a photo in the browser before upload, to save mobile data. */
export async function compressImage(file: File, maxSide = 1600, quality = 0.72): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Could not read this image'));
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality));
    return blob && blob.size < file.size ? blob : file;
  } finally {
    URL.revokeObjectURL(url);
  }
}
