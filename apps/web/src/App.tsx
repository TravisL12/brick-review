import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { SetsGalleryPage } from './pages/SetsGalleryPage';
import { SetsAddPage } from './pages/SetsAddPage';
import { SetDetailPage } from './pages/SetDetailPage';
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
          {/* `end` so the gallery link is not left active on /sets/add or /sets/:setNum */}
          <NavLink to="/sets" end>
            My sets
          </NavLink>
          <NavLink to="/sets/add">Add sets</NavLink>
          <NavLink to="/scan">Scan bricks</NavLink>
        </nav>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/sets" replace />} />
          <Route path="/sets" element={<SetsGalleryPage />} />
          {/* Static segment is matched ahead of the dynamic one by the router's ranking. */}
          <Route path="/sets/add" element={<SetsAddPage />} />
          <Route path="/sets/:setNum" element={<SetDetailPage />} />
          <Route path="/scan" element={<ScanPage />} />
          <Route path="*" element={<Navigate to="/sets" replace />} />
        </Routes>
      </main>
    </div>
  );
}
