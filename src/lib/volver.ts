import { redirect } from "next/navigation";

/** Regresa a una página con un aviso corto o un mensaje de error en la URL. */
export function volver(ruta: string, q: { aviso?: string; error?: string }): never {
  const p = new URLSearchParams();
  if (q.aviso) p.set("aviso", q.aviso);
  if (q.error) p.set("error", q.error.slice(0, 200));
  redirect(`${ruta}${ruta.includes("?") ? "&" : "?"}${p.toString()}`);
}

export function texto(form: FormData, campo: string, max = 200): string {
  return String(form.get(campo) ?? "").trim().slice(0, max);
}
