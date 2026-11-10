/**
 * Fotos del perfil (foto pròpia i de la moto) a Supabase Storage, bucket públic «media».
 * Abans de pujar-les es redueixen al mòbil: menys dades i menys espai al pla gratuït.
 */
import { sb } from './social';
import { t } from '../i18n';

const BUCKET = 'media';
export const MAX_BIKE_PHOTOS = 6;

/** Redueix i comprimeix una imatge (també les HEIC que l'iPhone converteix en triar-les). */
export async function shrinkImage(file: File, maxSide: number, quality = 0.82, square = false): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error(t("Tria una imatge (JPG, PNG o HEIC)."));
  if (file.size > 25 * 1024 * 1024) throw new Error(t("La imatge és massa gran (màxim 25 MB)."));
  let bmp: ImageBitmap | HTMLImageElement;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
  } catch {
    bmp = await new Promise<HTMLImageElement>((ok, ko) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => ko(new Error(t("No s'ha pogut llegir la imatge.")));
      img.src = URL.createObjectURL(file);
    });
  }
  const w0 = bmp.width;
  const h0 = bmp.height;
  // retall quadrat centrat per a la foto de perfil
  const sw = square ? Math.min(w0, h0) : w0;
  const sh = square ? Math.min(w0, h0) : h0;
  const sx = (w0 - sw) / 2;
  const sy = (h0 - sh) / 2;
  const k = Math.min(1, maxSide / Math.max(sw, sh));
  const w = Math.round(sw * k);
  const h = Math.round(sh * k);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(t("El dispositiu no pot processar la imatge."));
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, w, h);
  if ('close' in bmp) bmp.close();
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', quality));
  if (!blob) throw new Error(t("No s'ha pogut comprimir la imatge."));
  return blob;
}

export async function uploadPhoto(userId: string, kind: 'avatar' | 'bike', file: File): Promise<string> {
  const blob = await shrinkImage(file, kind === 'avatar' ? 512 : 1600, kind === 'avatar' ? 0.85 : 0.8, kind === 'avatar');
  const path = `${userId}/${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}.jpg`;
  const { error } = await sb().storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
  if (error) {
    if (/bucket not found/i.test(error.message)) throw new Error(t("Falta configurar l'espai de fotos al servidor."));
    if (/row-level security|unauthorized|403/i.test(error.message)) throw new Error(t("No tens permís per pujar fotos. Torna a entrar al compte."));
    if (/too large|exceeded|size/i.test(error.message)) throw new Error(t("La foto és massa gran."));
    throw new Error(t("No s'ha pogut pujar la foto ({0})", [error.message]));
  }
  return sb().storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Esborra una foto pujada (si és nostra); si falla no passa res, només ocupa espai. */
export async function deletePhoto(url: string | null | undefined) {
  if (!url) return;
  const m = url.match(/\/storage\/v1\/object\/public\/media\/(.+)$/);
  if (!m) return;
  await sb().storage.from(BUCKET).remove([decodeURIComponent(m[1])]).catch(() => {});
}
