import { Logo } from "./Logo";
import { Button } from "./ui/Button";

interface NavigationProps {
  onStartConverting: () => void;
  onNavigateToSection: (sectionId: string) => void;
  isConvertMode?: boolean;
  onConvert?: () => void;
  canConvert?: boolean;
}

export function Navigation({
  onStartConverting,
  onNavigateToSection,
  isConvertMode = false,
  onConvert,
  canConvert = false,
}: NavigationProps) {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <a
          href="#top"
          className="site-header__logo-link"
          aria-label="Vectuno home"
          onClick={(event) => {
            event.preventDefault();
            onNavigateToSection("top");
          }}
        >
          <Logo />
        </a>

        <nav className="site-nav" aria-label="Primary">
          <a
            href="#how-it-works"
            className="site-nav__link"
            onClick={(event) => {
              event.preventDefault();
              onNavigateToSection("how-it-works");
            }}
          >
            How it works
          </a>
          <a
            href="#about"
            className="site-nav__link"
            onClick={(event) => {
              event.preventDefault();
              onNavigateToSection("about");
            }}
          >
            About
          </a>
        </nav>

        {isConvertMode ? (
          <Button
            variant="primary"
            className="site-header__cta"
            onClick={onConvert}
            disabled={!canConvert}
          >
            Convert to SVG
          </Button>
        ) : (
          <Button variant="primary" className="site-header__cta" onClick={onStartConverting}>
            Start converting
          </Button>
        )}
      </div>
    </header>
  );
}
