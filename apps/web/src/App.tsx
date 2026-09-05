import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { SetsGalleryPage } from './pages/SetsGalleryPage';
import { MinifigsGalleryPage } from './pages/MinifigsGalleryPage';
import { MinifigDetailPage } from './pages/MinifigDetailPage';
import { SetsAddPage } from './pages/SetsAddPage';
import { SetDetailPage } from './pages/SetDetailPage';
import { ScanPage } from './pages/ScanPage';
import { SignInPage } from './pages/SignInPage';

export function App() {
  const { user, loading, signOut } = useAuth();

  // Nothing is rendered until the session check settles, so a signed-in reload
  // does not flash the sign-in screen on its way to the collection.
  if (loading) {
    return (
      <div className="app-boot">
        <span className="brand-stud" aria-hidden="true" />
      </div>
    );
  }

  if (!user) return <SignInPage />;

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
          {/* `end` so the gallery link is not left active on /minifigs/:figNum */}
          <NavLink to="/minifigs" end>
            Minifigs
          </NavLink>
          <NavLink to="/scan">Scan bricks</NavLink>
        </nav>
        <div className="account">
          <span className="account-name" title={user.email}>
            {user.displayName || user.email}
          </span>
          <button type="button" className="link" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/sets" replace />} />
          <Route path="/sets" element={<SetsGalleryPage />} />
          {/* Static segment is matched ahead of the dynamic one by the router's ranking. */}
          <Route path="/sets/add" element={<SetsAddPage />} />
          <Route path="/sets/:setNum" element={<SetDetailPage />} />
          <Route path="/minifigs" element={<MinifigsGalleryPage />} />
          <Route path="/minifigs/:figNum" element={<MinifigDetailPage />} />
          <Route path="/scan" element={<ScanPage />} />
          <Route path="*" element={<Navigate to="/sets" replace />} />
        </Routes>
      </main>
    </div>
  );
}
