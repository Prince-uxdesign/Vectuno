import { Logo } from "./Logo";
import { Button } from "./ui/Button";

interface NavigationProps {
  onStartConverting: () => void;
}

export function Navigation({ onStartConverting }: NavigationProps) {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <a href="#top" className="site-header__logo-link" aria-label="Vectuno home">
          <Logo />
        </a>

        <nav className="site-nav" aria-label="Primary">
          <a href="#how-it-works" className="site-nav__link">
            How it works
          </a>
          <a href="#about" className="site-nav__link">
            About
          </a>
        </nav>

        <Button variant="primary" className="site-header__cta" onClick={onStartConverting}>
          Start converting
        </Button>
      </div>
    </header>
  );
}
