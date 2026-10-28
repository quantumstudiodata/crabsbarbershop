// Avatares disponibles. Siempre en círculo, sin fotos.

export const AVATARES = {
  tijera: { fondo: "#4b6274" },
  cangrejo: { fondo: "#13171c" },
  bigote: { fondo: "#6d5a4b" },
  peine: { fondo: "#5c6f63" },
  navaja: { fondo: "#2b3a47" },
  luna: { fondo: "#56506e" },
  ola: { fondo: "#3f6b78" },
  iniciales: { fondo: "#8ea5b8" },
} as const;

export type ClaveAvatar = keyof typeof AVATARES;

export const esAvatar = (v: string): v is ClaveAvatar => v in AVATARES;
