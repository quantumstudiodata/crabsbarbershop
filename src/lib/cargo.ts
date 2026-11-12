/**
 * Cargo por pagar en línea: lo que Stripe cobra en México con tarjeta (3.6% + $3, más 16% de IVA sobre esa comisión).
 * Se suma al monto para que al negocio le llegue completo lo que cuesta el servicio. Todo en centavos.
 */
const PCT = 0.036, FIJO = 300, IVA = 0.16;

export function cargoEnLinea(neto: number) {
  if (neto <= 0) return 0;
  // Total que, menos la comisión de Stripe con IVA, deja exactamente el neto.
  const total = Math.ceil((neto + FIJO * (1 + IVA)) / (1 - PCT * (1 + IVA)));
  return total - neto;
}
