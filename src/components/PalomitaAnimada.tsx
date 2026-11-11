/** Confirmación de pago: el aro se dibuja, la palomita se traza y una onda suave se expande una vez. */
export function PalomitaAnimada({ t = 84 }: { t?: number }) {
  return (
    <span className="pal-anim" style={{ width: t, height: t }} aria-hidden="true">
      <span className="pal-onda" />
      <svg viewBox="0 0 84 84" width={t} height={t}>
        <circle className="pal-fondo" cx="42" cy="42" r="38" />
        <circle className="pal-aro" cx="42" cy="42" r="38" />
        <path className="pal-trazo" d="M27 43.5l10 10 20-22" />
      </svg>
    </span>
  );
}
