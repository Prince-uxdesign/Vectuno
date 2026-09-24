export function Logo() {
  return (
    <span className="logo">
      <span className="logo__mark" aria-hidden="true">
        <img
          src={`${import.meta.env.BASE_URL}favicon.svg`}
          alt=""
          width="24"
          height="23"
          className="logo__mark-img"
        />
      </span>
      <span className="logo__word">Vectuno</span>
    </span>
  );
}
