import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { onAuthStateChanged, getRedirectResult } from 'firebase/auth';
import { auth, firebaseConfigured } from './lib/firebase';
import { authErrorMessage } from './lib/authErrors';
import { useStore } from './store';
import { SplashScreen } from './pages/SplashScreen';
import { AuthPage } from './pages/AuthPage';
import { AppLayout } from './components/layout/AppLayout';
import { LibraryPage } from './pages/Library/index';
import { RecipeDetailPage } from './pages/RecipeDetail/index';
import { NewRecipePage } from './pages/NewRecipe/index';
import { PlanPage } from './pages/Plan/index';
import { ShoppingListPage } from './pages/ShoppingList/index';
import { PantryPage } from './pages/Pantry/index';

function FirebaseSetupScreen() {
  return (
    <div className="fixed inset-0 bg-slate-50 flex flex-col items-center justify-center px-6 text-center gap-4">
      <div className="text-4xl">🔥</div>
      <h1 className="text-xl font-bold text-slate-800">Firebase not configured</h1>
      <p className="text-sm text-slate-500 max-w-sm">
        Copy <code className="bg-slate-100 px-1 rounded">.env.example</code> to{' '}
        <code className="bg-slate-100 px-1 rounded">.env.local</code> and fill in your Firebase
        project credentials, then restart the dev server.
      </p>
    </div>
  );
}

// Separated so hooks are always called in the same order (Rules of Hooks).
function AuthenticatedApp() {
  const { splashDone, isAuthenticated, signIn, signOut } = useStore();
  const [authChecked, setAuthChecked] = useState(false);
  const [redirectError, setRedirectError] = useState<string | null>(null);

  useEffect(() => {
    const unsubRef = { current: null as (() => void) | null };
    let safetyTimer: ReturnType<typeof setTimeout> | null = null;

    const init = async () => {
      // getRedirectResult needs a network round-trip to finalise OAuth redirects.
      // Offline or in airplane mode it never resolves, permanently blocking
      // onAuthStateChanged and freezing the splash screen.
      // navigator.onLine is not reliable (iOS reports true in airplane mode when
      // Wi-Fi is enabled), so we always race against a 2 s timeout — short
      // enough to clear within the 2.2 s splash window on any connection.
      try {
        await Promise.race([
          getRedirectResult(auth!),
          new Promise<null>((resolve) => setTimeout(resolve, 2000)),
        ]);
      } catch (e: any) {
        const code = e?.code ?? '';
        console.error('Redirect result error:', e);
        setRedirectError(authErrorMessage(code));
      }

      // Safety net: force authChecked after 5 s in case onAuthStateChanged
      // never fires (e.g. Firebase SDK stuck waiting for a token refresh).
      safetyTimer = setTimeout(() => setAuthChecked(true), 5000);

      unsubRef.current = onAuthStateChanged(auth!, async (firebaseUser) => {
        if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; }
        try {
          if (firebaseUser) {
            signIn(firebaseUser);
          } else if (useStore.getState().isAuthenticated) {
            await signOut();
          }
        } catch (e) {
          console.error('Auth state change error:', e);
        } finally {
          setAuthChecked(true);
        }
      });
    };

    init();
    return () => {
      unsubRef.current?.();
      if (safetyTimer) clearTimeout(safetyTimer);
    };
  }, []);

  // Keep splash up until both the timer fires AND the auth check resolves
  if (!splashDone || !authChecked) return <SplashScreen />;
  if (!isAuthenticated) return <AuthPage initialError={redirectError} />;

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/recipes" replace />} />
        <Route path="/recipes" element={<LibraryPage />} />
        <Route path="/recipes/new" element={<NewRecipePage />} />
        <Route path="/recipes/:id" element={<RecipeDetailPage />} />
        <Route path="/recipes/:id/edit" element={<NewRecipePage />} />
        <Route path="/plan" element={<PlanPage />} />
        <Route path="/list" element={<ShoppingListPage />} />
        <Route path="/pantry" element={<PantryPage />} />
        <Route path="*" element={<Navigate to="/recipes" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  if (!firebaseConfigured) return <FirebaseSetupScreen />;
  return <AuthenticatedApp />;
}
