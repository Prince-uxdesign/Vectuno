import { Logo } from "./Logo";
import { Button } from "./ui/Button";
import { usePwaInstall } from "../lib/usePwaInstall";

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
  const { isInstallable, install } = usePwaInstall();

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

        <div className="site-header__actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isInstallable && (
            <Button
              variant="secondary"
              className="site-header__install-btn"
              onClick={install}
              aria-label="Install Vectuno app on your device"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                style={{ marginRight: 6, display: 'inline-block', verticalAlign: 'middle' }}
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Install App
            </Button>
          )}

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
      </div>
    </header>
  );
}
