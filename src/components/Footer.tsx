import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <Logo />
        <p className="site-footer__note">Converted locally in your browser. Nothing is uploaded.</p>
        <p className="site-footer__copyright">© {new Date().getFullYear()} Vectuno</p>
      </div>
    </footer>
  );
}
