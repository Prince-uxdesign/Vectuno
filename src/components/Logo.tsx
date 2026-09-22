interface LogoProps {
  className?: string;
}

export function Logo({ className = "" }: LogoProps) {
  return (
    <span className={`logo ${className}`.trim()}>
      <span className="logo__mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M3 12 L9 4 L21 4 L15 12 L21 20 L9 20 Z"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </span>
      <span className="logo__word">Vectuno</span>
    </span>
  );
}
