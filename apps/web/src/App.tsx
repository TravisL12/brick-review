import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { SetsPage } from './pages/SetsPage';
import { ScanPage } from './pages/ScanPage';

export function App() {
  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-stud" aria-hidden="true" />
          <h1>Brick Review</h1>
        </div>
        <nav>
          <NavLink to="/sets">My sets</NavLink>
          <NavLink to="/scan">Scan bricks</NavLink>
        </nav>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/sets" replace />} />
          <Route path="/sets" element={<SetsPage />} />
          <Route path="/scan" element={<ScanPage />} />
          <Route path="*" element={<Navigate to="/sets" replace />} />
        </Routes>
      </main>
    </div>
  );
}
