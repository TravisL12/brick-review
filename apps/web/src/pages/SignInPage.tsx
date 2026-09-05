import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { api, errorMessage } from '../lib/api';
import { tileSources } from '../lib/images';
import type { ShowcaseSet } from '../lib/types';

type Mode = 'signin' | 'register';

/**
 * The signed-out splash: the pitch and the sign-in form over a mosaic of set art.
 *
 * The artwork is curated catalogue data from `/api/splash/sets`, never anyone's
 * collection — this page is public, so rendering real sets here would tell any
 * visitor what the account holders own.
 */
export function SignInPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showcase, setShowcase] = useState<ShowcaseSet[]>([]);

  // Decoration only: a failure here leaves the plain background, so it is not
  // surfaced to the visitor and never blocks the form.
  useEffect(() => {
    let cancelled = false;
    api
      .splashSets()
      .then((sets) => {
        if (!cancelled) setShowcase(sets.filter((s) => s.imgUrl));
      })
      .catch(() => {
        /* no artwork, no problem */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const registering = mode === 'register';

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (registering) await signUp(email, password, displayName);
      else await signIn(email, password);
      // On success the provider sets the user and <App> swaps this page out.
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  function switchMode() {
    setMode(registering ? 'signin' : 'register');
    setError(null);
  }

  return (
    <div className="splash">
      <SplashMosaic sets={showcase} />

      <div className="splash-content">
        <section className="splash-pitch">
          <div className="brand">
            <span className="brand-stud" aria-hidden="true" />
            <h1>Brick Review</h1>
          </div>
          <h2 className="splash-headline">
            Which of your sets is <em>this</em> brick from?
          </h2>
          <p className="splash-sub">
            Point a camera at a pile of LEGO® bricks. Brick Review recognises each piece and
            ranks your own collection by how much of the pile it explains.
          </p>
          <ul className="splash-points">
            <li>
              <strong>Scan a pile.</strong> One brick at a time, or live from the camera.
            </li>
            <li>
              <strong>Match against your sets.</strong> Full inventories, colours and minifigs,
              synced from Rebrickable.
            </li>
            <li>
              <strong>Your collection is yours.</strong> Every account keeps its own sets, scans
              and results.
            </li>
          </ul>
        </section>

        <div className="auth-card card">
          <h2 className="auth-title">{registering ? 'Create your account' : 'Sign in'}</h2>

          <form onSubmit={onSubmit} className="auth-form">
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                autoFocus
              />
            </label>

            {registering && (
              <label className="field">
                <span>
                  Display name <span className="muted small">(optional)</span>
                </span>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  autoComplete="nickname"
                  maxLength={80}
                />
              </label>
            )}

            <label className="field">
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={registering ? 'new-password' : 'current-password'}
                required
                minLength={registering ? 8 : undefined}
              />
              {registering && <span className="muted small">At least 8 characters.</span>}
            </label>

            {error && <p className="error small">{error}</p>}

            <button type="submit" className="primary" disabled={busy}>
              {busy ? 'Working…' : registering ? 'Create account' : 'Sign in'}
            </button>
          </form>

          <p className="muted small auth-switch">
            {registering ? 'Already have an account?' : 'No account yet?'}{' '}
            <button type="button" className="link" onClick={switchMode}>
              {registering ? 'Sign in' : 'Create one'}
            </button>
          </p>
        </div>
      </div>

      <p className="splash-footer small">
        Set data from Rebrickable and Brickset · recognition by Brickognize · LEGO® is a
        trademark of the LEGO Group, which does not sponsor or endorse this project.
      </p>
    </div>
  );
}

/**
 * The background wall of set art. `aria-hidden` because it carries no information
 * a screen reader needs.
 */
function SplashMosaic({ sets }: { sets: ShowcaseSet[] }) {
  if (sets.length === 0) return <div className="splash-mosaic is-empty" aria-hidden="true" />;

  const COLUMN_COUNT = 4;
  /*
   * Each column has to be at least twice the height of the viewport for the -50%
   * drift to land on its duplicate rather than on a gap. A tile is about 0.8x a
   * column's width, so four per column clears a tall screen with room to spare —
   * splitting the ten sets evenly instead would leave short columns that visibly
   * run out mid-scroll.
   */
  const PER_COLUMN = 4;
  // Interleaved rather than sliced: stepping by COLUMN_COUNT means each visual row
  // draws four consecutive — so four different — sets. Handing each column a
  // contiguous block instead puts the same model side by side once the list wraps.
  const columns = Array.from({ length: COLUMN_COUNT }, (_, col) =>
    Array.from({ length: PER_COLUMN }, (_, i) => sets[(i * COLUMN_COUNT + col) % sets.length]),
  );

  return (
    <div className="splash-mosaic" aria-hidden="true">
      {columns.map((column, index) => (
        <div className={`mosaic-col mosaic-col-${index}`} key={index}>
          {/* Doubled so the CSS loop has a seamless second copy to scroll into. */}
          {[...column, ...column].map((set, i) => {
            const { src, srcSet } = tileSources(set.imgUrl!);
            return (
              <img
                key={`${set.setNum}-${i}`}
                src={src}
                srcSet={srcSet}
                sizes="(max-width: 899px) 50vw, 25vw"
                alt=""
                decoding="async"
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
