import { useEffect } from 'react';
import { useStore } from '../store';

export function SplashScreen() {
  const setSplashDone = useStore((s) => s.setSplashDone);

  useEffect(() => {
    const timer = setTimeout(setSplashDone, 2200);
    return () => clearTimeout(timer);
  }, [setSplashDone]);

  return (
    <div className="fixed inset-0 bg-ink-950 flex flex-col items-center justify-center gap-5 z-50 animate-fade">
      <div className="flex flex-col items-center gap-5">
        <img src="/logo-icon.svg" alt="Beckfield Bistro" className="w-28 h-28" />
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white tracking-tight">Beckfield Bistro</h1>
          <p className="text-sm text-amber-400 mt-1">Entering the Bistro...</p>
        </div>
      </div>

      {/* Loading dots */}
      <div className="flex gap-1.5 mt-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-amber-400"
            style={{ animation: `fadeOnly 0.8s ease-in-out ${i * 0.2}s infinite alternate` }}
          />
        ))}
      </div>
    </div>
  );
}
