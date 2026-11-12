/** Logos de los métodos con los que paga el cliente en línea, en gris para no competir con la página. */
export function IconosPago() {
  return (
    <span className="pm-ics" aria-label="Tarjetas Visa, Mastercard y American Express, Apple Pay y Google Pay">
      <span className="pm"><svg viewBox="0 0 40 14" aria-hidden="true"><text x="20" y="11.5" textAnchor="middle" fontFamily="Arial Black,Arial" fontWeight="900" fontStyle="italic" fontSize="12" fill="#1f2c38">VISA</text></svg></span>
      <span className="pm"><svg viewBox="0 0 40 24" aria-hidden="true"><circle cx="16" cy="12" r="7.5" fill="#55687a" /><circle cx="24" cy="12" r="7.5" fill="#a7b4c0" fillOpacity=".9" /></svg></span>
      <span className="pm"><svg viewBox="0 0 40 14" aria-hidden="true"><text x="20" y="11" textAnchor="middle" fontFamily="Arial" fontWeight="800" fontSize="10" letterSpacing=".5" fill="#1f2c38">AMEX</text></svg></span>
      <span className="pm"><svg viewBox="0 0 40 16" aria-hidden="true"><path d="M9.6 4.1c.5-.6.8-1.4.7-2.2-.7 0-1.5.5-2 1.1-.4.5-.8 1.3-.7 2.1.8.1 1.5-.4 2-1zM10.3 5.3c-1.1-.1-2 .6-2.5.6s-1.3-.6-2.2-.6C4.5 5.3 3.4 6 2.8 7c-1.2 2.1-.3 5.1.9 6.8.6.8 1.2 1.7 2.1 1.7.8 0 1.2-.5 2.2-.5s1.3.5 2.2.5 1.4-.8 2-1.7c.6-.9.9-1.8.9-1.9 0 0-1.7-.7-1.7-2.7 0-1.7 1.4-2.4 1.4-2.5-.8-1.1-2-1.3-2.5-1.4z" fill="#1f2c38" transform="translate(1 -1) scale(.95)" /><text x="27" y="12" textAnchor="middle" fontFamily="Arial" fontWeight="600" fontSize="10" fill="#1f2c38">Pay</text></svg></span>
      <span className="pm"><svg viewBox="0 0 40 16" aria-hidden="true"><text x="11" y="12.5" textAnchor="middle" fontFamily="Arial" fontWeight="700" fontSize="12" fill="#55687a">G</text><text x="26" y="12" textAnchor="middle" fontFamily="Arial" fontWeight="600" fontSize="10" fill="#1f2c38">Pay</text></svg></span>
    </span>
  );
}

/** Logo de la marca de una tarjeta a partir de su texto ("Mastercard 7445", "Visa 4242"). */
export function MarcaTarjeta({ tarjeta }: { tarjeta: string }) {
  const t = tarjeta.toLowerCase();
  const svg = t.includes("visa") ? <svg viewBox="0 0 40 14" aria-hidden="true"><text x="20" y="11.5" textAnchor="middle" fontFamily="Arial Black,Arial" fontWeight="900" fontStyle="italic" fontSize="12" fill="#1f2c38">VISA</text></svg>
    : t.includes("master") ? <svg viewBox="0 0 40 24" aria-hidden="true"><circle cx="16" cy="12" r="7.5" fill="#55687a" /><circle cx="24" cy="12" r="7.5" fill="#a7b4c0" fillOpacity=".9" /></svg>
    : t.includes("amex") || t.includes("american") ? <svg viewBox="0 0 40 14" aria-hidden="true"><text x="20" y="11" textAnchor="middle" fontFamily="Arial" fontWeight="800" fontSize="10" letterSpacing=".5" fill="#1f2c38">AMEX</text></svg>
    : null;
  return svg ? <span className="pm pm-chico">{svg}</span> : null;
}
