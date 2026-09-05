import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { errorMessage } from '../lib/api';

type Mode = 'signin' | 'register';

/**
 * The whole app is behind this: sign in, or create the account. Registration is
 * open, and whoever registers first becomes the admin of the instance.
 */
export function SignInPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    <div className="auth-screen">
      <div className="auth-card card">
        <div className="brand auth-brand">
          <span className="brand-stud" aria-hidden="true" />
          <h1>Brick Review</h1>
        </div>
        <p className="muted small auth-tagline">
          Point a camera at a pile of bricks and find out which of your sets they belong to.
        </p>

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
  );
}
