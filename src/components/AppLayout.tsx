import { Link, NavLink } from "react-router-dom";
import type { ReactNode } from "react";
import { ArchiveIcon } from "./ArchiveIcon";

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="brand" to="/scans" aria-label="People Gator Archive home">
          <span className="brand-mark" aria-hidden="true">
            PG
          </span>
          <span>
            <strong>People Gator</strong>
            <small>Face archive</small>
          </span>
        </Link>
        <nav className="desktop-nav" aria-label="Main navigation">
          <NavLink to="/scans">
            <ArchiveIcon type="scans" />
            Scans
          </NavLink>
          <NavLink to="/people">
            <ArchiveIcon type="people" />
            People
          </NavLink>
        </nav>
      </header>
      <main>{children}</main>
      <footer>
        <span>People Gator Archive</span>
        <span>Names reflect independent human annotations.</span>
      </footer>
      <nav className="mobile-nav" aria-label="Main navigation">
        <NavLink to="/scans">
          <ArchiveIcon type="scans" />
          <span>Scans</span>
        </NavLink>
        <NavLink to="/people">
          <ArchiveIcon type="people" />
          <span>People</span>
        </NavLink>
      </nav>
    </div>
  );
}

