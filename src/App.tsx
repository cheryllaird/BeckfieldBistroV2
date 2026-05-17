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

  // Wait for Zustand's persist middleware to finish reading from localStorage
  // before doing anything else. For synchronous storage this is nearly instant,
  // but without this gate signIn() can run before the persisted user/recipes
  // are in the store — causing the account-switch wipe to fire incorrectly.
  const [hasHydrated, setHasHydrated] = useState(
    () => useStore.persist.hasHydrated()
  );
  useEffect(() => {
    if (!useStore.persist.hasHydrated()) {
      return useStore.persist.onFinishHydration(() => setHasHydrated(true));
    }
  }, []);

  // If the user was previously signed in (persisted to localStorage), skip
  // the Firebase auth wait entirely — we already know who they are.
  const [authChecked, setAuthChecked] = useState(
    () => useStore.getState().isAuthenticated
  );

  useEffect(() => {
    const unsubRef = { current: null as (() => void) | null };
    let safetyTimer: ReturnType<typeof setTimeout> | null = null;

    const hasCachedAuth = useStore.getState().isAuthenticated;

    // No cached user — wait for Firebase, cap at 5 s so the splash can't hang.
    if (!hasCachedAuth) {
      safetyTimer = setTimeout(() => setAuthChecked(true), 5000);
    }

    // Do NOT call resubscribe() here. Firestore evaluates its security rules
    // using Firebase Auth's internal state, which is null until
    // onAuthStateChanged fires (it reads from its own IndexedDB asynchronously).
    // Calling onSnapshot before auth is ready returns empty results / permission
    // errors, leaving the library blank. Let onAuthStateChanged control all
    // Firestore setup so the auth context is always ready first.

    unsubRef.current = onAuthStateChanged(auth!, async (firebaseUser) => {
      if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; }
      try {
        if (firebaseUser) {
          // Firebase Auth has loaded the cached user — set up Firestore
          // subscriptions now that auth context is available.
          signIn(firebaseUser);
        } else if (hasCachedAuth) {
          // Firebase returned null (offline token-refresh failure) but we have
          // a persisted identity. Try attaching Firestore listeners anyway —
          // Firebase Auth has at least finished initialising at this point so
          // the local cache may be served even with a stale/missing token.
          resubscribe();
        }
        // else: no cached auth and not signed in — show the login page.
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

  // Keep splash up until the store has hydrated from localStorage, the
  // splash timer has fired, and auth state has been determined.
  if (!hasHydrated || !splashDone || !authChecked) return <SplashScreen />;
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
