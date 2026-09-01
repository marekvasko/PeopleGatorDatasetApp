import { Link, useLocation } from "react-router-dom";

export function NotFoundPage() {
  const location = useLocation();
  return (
    <div className="empty-state full-page">
      <span className="empty-symbol">404</span>
      <h1>This archive page is missing</h1>
      <p>No view exists at {location.pathname}.</p>
      <Link className="primary-button" to="/scans">Browse scans</Link>
    </div>
  );
}

