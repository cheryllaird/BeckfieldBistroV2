import { useEffect, useState } from 'react';
import { Loader } from 'lucide-react';
import type { ImageExtractionStage } from '../../lib/recipeExtraction';

const SLOW_AFTER_MS = 10_000;

const LABELS: Record<ImageExtractionStage, string> = {
  preparing: 'Preparing photo',
  reading: 'Reading recipe',
};

/** Progress panel body for photo extraction: honest stage label, plus reassurance when slow. */
export function ExtractionProgress({ stage }: { stage: ImageExtractionStage }) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      <Loader size={32} className="text-amber-500 animate-spin" />
      <div className="text-center max-w-full" aria-live="polite">
        <p className="text-sm font-medium text-slate-700 break-words">{LABELS[stage]}</p>
        {slow && (
          <p className="text-xs text-slate-400 mt-0.5 break-words">Some photos take up to a minute.</p>
        )}
      </div>
    </>
  );
}
