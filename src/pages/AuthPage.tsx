import { useState } from 'react';
import { ChefHat } from 'lucide-react';
import { signInWithPopup, signInWithRedirect } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';

export function AuthPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithPopup(auth!, googleProvider);
      // App.tsx onAuthStateChanged handles loading user data and updating the store
    } catch (e: any) {
      const code = e?.code ?? '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        // User dismissed — not an error
        setLoading(false);
        return;
      }
      if (code === 'auth/popup-blocked') {
        // Popup blocked (e.g. PWA standalone mode) — fall back to redirect
        try {
          await signInWithRedirect(auth!, googleProvider);
          return; // page will navigate away
        } catch {
          // fall through to show error
        }
      }
      console.error('Sign-in error:', e);
      setError('Sign-in failed. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-slate-50 via-white to-amber-50 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm flex flex-col items-center gap-8 animate-slide-up">
        <div className="flex flex-col items-center gap-4">
          <div className="w-20 h-20 rounded-3xl bg-amber-50 border border-amber-100 flex items-center justify-center shadow-sm">
            <ChefHat size={40} className="text-amber-500" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Beckfield Bistro</h1>
            <p className="text-sm text-slate-500 mt-1">Your AI culinary companion</p>
          </div>
        </div>

        <div className="w-full flex flex-col gap-3">
          <p className="text-xs text-slate-400 text-center uppercase tracking-wider font-medium">
            Sign in to continue
          </p>
          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white border border-slate-200 rounded-xl shadow-sm text-sm font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="w-[18px] h-[18px] border-2 border-slate-300 border-t-amber-500 rounded-full animate-spin" />
            ) : (
              <GoogleIcon />
            )}
            {loading ? 'Signing in…' : 'Continue with Google'}
          </button>
          {error && (
            <p className="text-xs text-red-500 text-center">{error}</p>
          )}
        </div>

        <p className="text-xs text-slate-400 text-center leading-relaxed">
          By continuing, you agree to our Terms of Service<br />and Privacy Policy.
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C12.955 4 4 12.955 4 24s8.955 20 20 20s20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
      <path fill="#FF3D00" d="m6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C16.318 4 9.656 8.337 6.306 14.691z" />
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
    </svg>
  );
}
