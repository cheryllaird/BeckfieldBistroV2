import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { onAuthStateChanged, getRedirectResult } from 'firebase/auth';
import { auth, firebaseConfigured } from './lib/firebase';
import { useStore } from './store';
import { SplashScreen } from './pages/SplashScreen';
import { AuthPage } from './pages/AuthPage';
import { AppLayout } from './components/layout/AppLayout';
import { LibraryPage } from './pages/Library/index';
import { RecipeDetailPage } from './pages/RecipeDetail/index';
import { NewRecipePage } from './pages/NewRecipe/index';
import { PlanPage } from './pages/Plan/index';
import { ShoppingListPage } from './pages/ShoppingList/index';

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

  useEffect(() => {
    // Process any pending redirect result first, then listen for auth state.
    getRedirectResult(auth!).catch(() => {/* redirect errors are surfaced via onAuthStateChanged */});

    const unsubscribe = onAuthStateChanged(auth!, async (firebaseUser) => {
      if (firebaseUser) {
        await signIn(firebaseUser);
      } else if (useStore.getState().isAuthenticated) {
        await signOut();
      }
      setAuthChecked(true);
    });
    return unsubscribe;
  }, []);

  // Keep splash up until both the timer fires AND the auth check resolves
  if (!splashDone || !authChecked) return <SplashScreen />;
  if (!isAuthenticated) return <AuthPage />;

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
        <Route path="*" element={<Navigate to="/recipes" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  if (!firebaseConfigured) return <FirebaseSetupScreen />;
  return <AuthenticatedApp />;
}
