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
  const { splashDone, isAuthenticated, signIn, resubscribe } = useStore();
  const [redirectError, setRedirectError] = useState<string | null>(null);

  // If the user was previously signed in (persisted to localStorage), skip
  // the Firebase auth wait entirely — we already know who they are.
  const [authChecked, setAuthChecked] = useState(
    () => useStore.getState().isAuthenticated
  );

  useEffect(() => {
    const unsubRef = { current: null as (() => void) | null };
    let safetyTimer: ReturnType<typeof setTimeout> | null = null;

    // Fast path: cached user — reattach Firestore listeners immediately so
    // IndexedDB data is available while Firebase validates in the background.
    if (useStore.getState().isAuthenticated) {
      resubscribe();
    } else {
      // No cached user — wait for Firebase, cap at 5 s.
      safetyTimer = setTimeout(() => setAuthChecked(true), 5000);
    }

    // Subscribe to auth state BEFORE getRedirectResult so the cached user
    // is received from IndexedDB as soon as Firebase reads it.
    unsubRef.current = onAuthStateChanged(auth!, async (firebaseUser) => {
      if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; }
      try {
        if (firebaseUser) {
          signIn(firebaseUser);
        } else if (!useStore.getState().isAuthenticated) {
          // Not signed in at all — nothing to clear.
        }
        // If isAuthenticated is true but Firebase returned null, the SDK
        // couldn't restore the session (offline token refresh failure). Keep
        // the cached user; Firebase will re-evaluate once back online and
        // call onAuthStateChanged again with the real user.
      } catch (e) {
        console.error('Auth state change error:', e);
      } finally {
        setAuthChecked(true);
      }
    });

    // Handle OAuth redirect results in the background — don't block
    // onAuthStateChanged. Races with a 5 s timeout so it can't hang.
    Promise.race([
      getRedirectResult(auth!).catch((e: any) => {
        setRedirectError(authErrorMessage(e?.code ?? ''));
      }),
      new Promise<void>((resolve) => setTimeout(resolve, 5000)),
    ]);

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
