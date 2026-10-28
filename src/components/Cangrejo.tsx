export function Cangrejo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 48" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="32" cy="31" rx="13" ry="9" />
        <path d="M27 22.5 25 15M37 22.5 39 15" />
        <path d="M20 27C13 25 11 20 12 15M44 27C51 25 53 20 52 15" />
        <path d="M12 15 6 11C5 7 8 4 12 5 15 6 16 9 15 12ZM52 15 58 11C59 7 56 4 52 5 49 6 48 9 49 12Z" />
        <path d="M20 33 12 37M21 37 15 42M45 33 52 37M43 37 49 42" />
      </g>
      <circle cx="25" cy="14" r="2.2" fill="currentColor" />
      <circle cx="39" cy="14" r="2.2" fill="currentColor" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="logo">
      <Cangrejo />
      CRABS
    </span>
  );
}
