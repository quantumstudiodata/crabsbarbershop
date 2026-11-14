/**
 * En laptops la app se dibuja al 90% (atributo data-zoom en <html>). Las ventanas flotantes que se
 * colocan con medidas de pantalla deben dividir entre este factor para quedar junto a su botón.
 */
export function zoomPagina(): number {
  if (typeof document === "undefined") return 1;
  const h = document.documentElement as HTMLElement & { currentCSSZoom?: number };
  const z = h.currentCSSZoom ?? (parseFloat(getComputedStyle(h).zoom) || 1);
  return z > 0 ? z : 1;
}

/** Se ejecuta antes de pintar. Chrome, Edge y Firefox (126+) usan el zoom estándar; Safari se queda sin reducir. */
export const SCRIPT_COMPACTA = `try{var u=navigator.userAgent;if(CSS.supports("zoom","1")&&!(/safari/i.test(u)&&!/chrome|chromium|crios|edg|android/i.test(u)))document.documentElement.setAttribute("data-zoom","ok")}catch(e){}`;
