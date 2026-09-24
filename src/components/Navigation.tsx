import { Logo } from "./Logo";
import { Button } from "./ui/Button";

interface NavigationProps {
  onStartConverting: () => void;
  onNavigateToSection: (sectionId: string) => void;
  isConvertMode?: boolean;
  onConvert?: () => void;
  canConvert?: boolean;
  onPwaAction?: () => void;
  pwaLabel?: string;
  showPwaButton?: boolean;
}

export function Navigation({
  onStartConverting,
  onNavigateToSection,
  isConvertMode = false,
  onConvert,
  canConvert = false,
  onPwaAction,
  pwaLabel = "Download on your device",
  showPwaButton = false,
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

        <div className="site-header__actions">
          {showPwaButton && onPwaAction && (
            <Button
              variant="secondary"
              className="site-header__pwa-btn"
              onClick={onPwaAction}
              aria-label={pwaLabel}
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
              <span className="pwa-btn__label-full">{pwaLabel}</span>
              <span className="pwa-btn__label-short">
                {pwaLabel.startsWith("Open") ? "Open app" : "Download app"}
              </span>
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
