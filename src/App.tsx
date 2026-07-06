import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { onAuthStateChanged, getRedirectResult } from 'firebase/auth';
import { auth, firebaseConfigured } from './lib/firebase';
import { startConnectivityManager } from './lib/connectivity';
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
import { SettingsPage } from './pages/Settings/index';

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

  // Single gate: render nothing until Zustand has hydrated from persisted
  // storage (IndexedDB). Everything below — auth checks, listener setup,
  // persisted data — is accurate only after hydration. Hydration is async, so
  // hasHydrated() is false on first render and onFinishHydration flips it.
  const [hasHydrated, setHasHydrated] = useState(() => useStore.persist.hasHydrated());
  useEffect(() => {
    if (useStore.persist.hasHydrated()) return;
    return useStore.persist.onFinishHydration(() => setHasHydrated(true));
  }, []);

  // firebaseChecked flips true when onAuthStateChanged fires. We don't need
  // to wait for it if we already have a persisted identity — that path
  // renders against persisted state immediately and lets Firebase catch up.
  const [firebaseChecked, setFirebaseChecked] = useState(false);

  // Keep Firestore's realtime connection awake across backgrounding so edits
  // made on other devices stay live-synced. Independent of auth/hydration.
  useEffect(() => startConnectivityManager(), []);

  useEffect(() => {
    if (!hasHydrated) return;

    // If we have a persisted user, attach Firestore listeners immediately —
    // the UI can render against persisted state while Firebase validates the
    // token in the background.
    if (useStore.getState().isAuthenticated) {
      resubscribe();
    }

    const unsubAuth = onAuthStateChanged(auth!, (firebaseUser) => {
      if (firebaseUser) {
        signIn(firebaseUser);
      } else if (useStore.getState().isAuthenticated) {
        // We rendered against a persisted session (see resubscribe() above),
        // but Firebase says there's no real session — the token was revoked,
        // expired, or the account was deleted/disabled elsewhere. Writes made
        // against a persisted-but-invalid uid are silently rejected by
        // Firestore security rules, which is what "Failed to save recipe"
        // looks like from the user's side. Drop back to the sign-in screen
        // instead of leaving the app stuck on a session Firebase disowns.
        useStore.getState().signOut();
      }
      setFirebaseChecked(true);
    });

    // Handle OAuth redirect results in the background — don't block render.
    // Races with a 5 s timeout so it can't hang.
    Promise.race([
      getRedirectResult(auth!).catch((e: { code?: string }) => {
        setRedirectError(authErrorMessage(e?.code ?? ''));
      }),
      new Promise<void>((resolve) => setTimeout(resolve, 5000)),
    ]);

    return () => {
      unsubAuth();
    };
  }, [hasHydrated, signIn, resubscribe]);

  // Splash stays up until we know what to render: hydration done, splash
  // timer fired, and either a persisted session exists (render immediately)
  // or Firebase has resolved the auth state (render Library or AuthPage).
  if (!hasHydrated || !splashDone || (!isAuthenticated && !firebaseChecked)) {
    return <SplashScreen />;
  }
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
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/recipes" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  if (!firebaseConfigured) return <FirebaseSetupScreen />;
  return <AuthenticatedApp />;
}
