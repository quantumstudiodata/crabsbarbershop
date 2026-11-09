/** Reduce una foto a 1600 px de lado y la convierte a JPEG, para que pese poco. Los PDF pasan tal cual. Solo en el navegador. */
export async function prepararArchivo(f: File): Promise<string> {
  const leer = (b: Blob) => new Promise<string>((ok, mal) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = mal; r.readAsDataURL(b); });
  if (f.type === "application/pdf") return leer(f);
  const img = await createImageBitmap(f);
  const k = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.8);
}

/** Fotos o PDF en formato data URL, de máximo 2 MB. */
export const TIPOS_ADJUNTO = /^data:(image\/(jpeg|png|webp)|application\/pdf);base64,[A-Za-z0-9+/=]+$/;
export const MAX_ADJUNTO = 1_300_000;
