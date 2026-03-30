import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Camera, Upload, Link, Plus, Loader } from 'lucide-react';
import { useStore } from '../../store';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { generateId } from '../../lib/utils';
import type { Recipe } from '../../types';
import { RecipeForm } from './RecipeForm';

type CaptureMode = 'url' | 'upload' | 'manual';

export function NewRecipePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { addRecipe, knownSources } = useStore();

  const prefillTitle = searchParams.get('title') ?? '';
  const [mode, setMode] = useState<CaptureMode>(prefillTitle ? 'manual' : 'url');
  const [urlInput, setUrlInput] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');

  const [draft, setDraft] = useState<Partial<Recipe>>({
    title: prefillTitle,
    source: '',
    servings: 4,
    totalTimeMinutes: undefined,
    ingredients: [],
    steps: [],
    coverImage: '',
  });

  const handleUrlExtract = async () => {
    if (!urlInput.trim()) return;
    setIsExtracting(true);
    setExtractError('');
    try {
      // Stub: simulate AI extraction delay then fill with placeholder data
      await new Promise((r) => setTimeout(r, 1500));
      setDraft({
        title: 'Extracted Recipe Title',
        source: new URL(urlInput).hostname.replace('www.', ''),
        servings: 4,
        totalTimeMinutes: 30,
        ingredients: [
          { id: generateId(), name: 'Ingredient 1', quantity: 1, unit: 'cup' },
          { id: generateId(), name: 'Ingredient 2', quantity: 200, unit: 'g' },
        ],
        steps: [
          'First step of the recipe.',
          'Second step of the recipe.',
        ],
        coverImage: '',
      });
      setMode('manual');
    } catch {
      setExtractError('Could not extract recipe. Please check the URL and try again.');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Stub: In production, send image to AI vision API
    setDraft({
      title: 'Recipe from Image',
      source: 'Photo Upload',
      servings: 4,
      totalTimeMinutes: 45,
      ingredients: [
        { id: generateId(), name: 'Ingredient from photo', quantity: 2, unit: 'tbsp' },
      ],
      steps: ['Step extracted from photo.'],
      coverImage: URL.createObjectURL(file),
    });
    setMode('manual');
  };

  const handleSave = (recipe: Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString();
    addRecipe({ ...recipe, id: generateId(), createdAt: now, updatedAt: now });
    navigate('/recipes');
  };

  return (
    <div className="flex flex-col gap-5 animate-in">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="text-slate-500 hover:text-slate-800 transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-xl font-bold text-slate-800">
          {prefillTitle ? 'Digitise Recipe' : 'Add Recipe'}
        </h2>
      </div>

      {/* Capture mode selector (not shown if prefill from planner) */}
      {!prefillTitle && (
        <div className="flex bg-slate-100 rounded-xl p-1 gap-0">
          {[
            { key: 'url', label: 'URL', icon: Link },
            { key: 'upload', label: 'Photo', icon: Upload },
            { key: 'manual', label: 'Manual', icon: Plus },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setMode(key as CaptureMode)}
              className={[
                'flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg transition-all duration-150',
                mode === key
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700',
              ].join(' ')}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>
      )}

      {/* URL mode */}
      {mode === 'url' && (
        <div className="flex flex-col gap-3 animate-in">
          <Input
            label="Recipe URL"
            placeholder="https://cooking.nytimes.com/recipes/…"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            type="url"
          />
          {extractError && <p className="text-xs text-red-500">{extractError}</p>}
          <Button fullWidth onClick={handleUrlExtract} disabled={isExtracting || !urlInput.trim()}>
            {isExtracting ? (
              <>
                <Loader size={14} className="animate-spin" /> Extracting…
              </>
            ) : (
              <>
                <Link size={14} /> Extract Recipe
              </>
            )}
          </Button>
        </div>
      )}

      {/* Upload mode */}
      {mode === 'upload' && (
        <div className="flex flex-col gap-3 animate-in">
          <label className="flex flex-col items-center gap-3 border-2 border-dashed border-slate-200 rounded-2xl p-8 cursor-pointer hover:border-amber-300 hover:bg-amber-50 transition-colors">
            <Camera size={32} className="text-slate-400" />
            <div className="text-center">
              <p className="text-sm font-medium text-slate-700">Snap or upload a photo</p>
              <p className="text-xs text-slate-400 mt-0.5">AI will extract the recipe details</p>
            </div>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFileUpload}
            />
          </label>
        </div>
      )}

      {/* Form (manual / after extraction) */}
      {mode === 'manual' && (
        <RecipeForm
          initial={draft}
          knownSources={knownSources}
          onSave={handleSave}
          onCancel={() => navigate(-1)}
        />
      )}
    </div>
  );
}
