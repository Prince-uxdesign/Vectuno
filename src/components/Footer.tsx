import { Logo } from "./Logo";

interface FooterProps {
  onNavigateToSection: (sectionId: string) => void;
}

// Below 640px, the header nav links are hidden entirely (see .site-nav in
// index.css) with no hamburger replacement — these footer links are the
// only way a mobile visitor can reach "How it works" / "About" without
// scrolling past them on the way down.
export function Footer({ onNavigateToSection }: FooterProps) {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <Logo />
        <nav className="site-footer__nav" aria-label="Footer">
          <a
            href="#how-it-works"
            className="site-footer__nav-link"
            onClick={(event) => {
              event.preventDefault();
              onNavigateToSection("how-it-works");
            }}
          >
            How it works
          </a>
          <a
            href="#about"
            className="site-footer__nav-link"
            onClick={(event) => {
              event.preventDefault();
              onNavigateToSection("about");
            }}
          >
            About
          </a>
        </nav>
        <p className="site-footer__note">Converted locally in your browser. Nothing is uploaded.</p>
        <p className="site-footer__copyright">© {new Date().getFullYear()} Vectuno</p>
      </div>
    </footer>
  );
}
