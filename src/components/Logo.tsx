export function Logo() {
  return (
    <span className="logo">
      <span className="logo__mark" aria-hidden="true">
        <svg
          viewBox="0 0 32 32"
          width="24"
          height="24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="logo__mark-img"
        >
          <path
            d="M6 7C7.5 10 11 12 16 12C21 12 24.5 10 26 7L17.4 25.4C16.8 26.6 15.2 26.6 14.6 25.4L6 7Z"
            fill="currentColor"
          />
          <line
            x1="16"
            y1="12"
            x2="16"
            y2="19.5"
            stroke="var(--canvas, #fffcfa)"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <circle cx="16" cy="20.5" r="2.2" fill="var(--coral, #f2805d)" />
        </svg>
      </span>
      <span className="logo__word">Vectuno</span>
    </span>
  );
}
