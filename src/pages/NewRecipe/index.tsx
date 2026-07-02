import { useState } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { ArrowLeft, Camera, Upload, Link, Plus, Loader, WifiOff } from 'lucide-react';
import { useStore } from '../../store';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { generateId } from '../../lib/utils';
import { extractRecipeFromImage, extractRecipeFromUrl, resizeImage, RecipeExtractionError } from '../../lib/recipeExtraction';
import type { Recipe } from '../../types';
import { RecipeForm } from './RecipeForm';
import { ImageCropper } from '../../components/ImageCropper';
import { CameraCapture } from '../../components/CameraCapture';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

type CaptureMode = 'url' | 'upload' | 'manual';

export function NewRecipePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { id: editId } = useParams<{ id: string }>();
  const { addRecipe, updateRecipe, knownSources, recipes } = useStore();

  const existingRecipe = editId ? recipes.find((r) => r.id === editId) : undefined;
  const isEditMode = !!existingRecipe;

  const { isOnline } = useOnlineStatus();

  const prefillTitle = searchParams.get('title') ?? '';
  const [mode, setMode] = useState<CaptureMode>(prefillTitle || isEditMode ? 'manual' : 'upload');
  const [urlInput, setUrlInput] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);

  const [draft, setDraft] = useState<Partial<Recipe>>(
    existingRecipe ?? {
      title: prefillTitle,
      source: '',
      servings: 4,
      prepTime: '',
      totalTime: '',
      ingredients: [],
      steps: [],
      coverImage: '',
    }
  );

  const handleUrlExtract = async () => {
    if (!urlInput.trim()) return;
    setIsExtracting(true);
    setExtractError('');
    try {
      const extracted = await extractRecipeFromUrl(urlInput.trim());
      setDraft((prev) => ({ ...prev, ...extracted, sourceUrl: urlInput.trim() }));
      setMode('manual');
    } catch (err) {
      setExtractError(
        err instanceof RecipeExtractionError
          ? err.message
          : 'Could not extract recipe. Please check the URL and try again.'
      );
    } finally {
      setIsExtracting(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = () => setCropSrc(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleCropConfirm = async (croppedDataUrl: string) => {
    setCropSrc(null);
    setIsExtracting(true);
    setExtractError('');
    try {
      const [extracted, resizedDataUrl] = await Promise.all([
        extractRecipeFromImage(croppedDataUrl),
        resizeImage(croppedDataUrl),
      ]);
      setDraft({ ...extracted, coverImage: resizedDataUrl });
      setMode('manual');
    } catch (err) {
      setExtractError(
        err instanceof RecipeExtractionError
          ? err.message
          : 'Failed to extract recipe. Please check your API key and try again.'
      );
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSave = async (recipe: Omit<Recipe, 'id' | 'createdAt' | 'updatedAt' | 'userId'>) => {
    setIsSaving(true);
    setSaveError('');
    try {
      const now = new Date().toISOString();
      if (isEditMode && existingRecipe) {
        await updateRecipe({ ...existingRecipe, ...recipe, updatedAt: now });
        navigate(`/recipes/${existingRecipe.id}`);
      } else {
        await addRecipe({ ...recipe, id: generateId(), createdAt: now, updatedAt: now });
        navigate('/recipes');
      }
    } catch (err) {
      if (err instanceof Error && err.message === 'SAVE_TIMEOUT') {
        navigate(isEditMode && existingRecipe ? `/recipes/${existingRecipe.id}` : '/recipes');
      } else {
        console.error('Failed to save recipe:', err);
        const code = (err as { code?: string })?.code;
        setSaveError(
          code === 'permission-denied'
            ? 'Your session has expired. Please sign in again to save recipes.'
            : code === 'invalid-argument' || code === 'resource-exhausted'
            ? 'This recipe is too large to save (likely the photo). Try a smaller image.'
            : 'Failed to save recipe. Please try again.'
        );
      }
    } finally {
      setIsSaving(false);
    }
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
          {isEditMode ? 'Edit Recipe' : prefillTitle ? 'Digitise Recipe' : 'Add Recipe'}
        </h2>
      </div>

      {/* Capture mode selector (not shown if prefill from planner or in edit mode) */}
      {!prefillTitle && !isEditMode && (
        <div className="flex bg-slate-100 rounded-xl p-1 gap-0">
          {[
            { key: 'url', label: 'URL', icon: Link, requiresOnline: true },
            { key: 'upload', label: 'Photo', icon: Upload, requiresOnline: true },
            { key: 'manual', label: 'Manual', icon: Plus, requiresOnline: false },
          ].map(({ key, label, icon: Icon, requiresOnline }) => {
            const disabled = requiresOnline && !isOnline;
            return (
              <button
                key={key}
                onClick={() => !disabled && setMode(key as CaptureMode)}
                disabled={disabled}
                aria-disabled={disabled}
                title={disabled ? 'Requires internet connection' : undefined}
                className={[
                  'flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg transition-all duration-150',
                  disabled
                    ? 'text-slate-300 cursor-not-allowed'
                    : mode === key
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700',
                ].join(' ')}
              >
                <Icon size={13} />
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* URL mode */}
      {mode === 'url' && (
        <div className="flex flex-col gap-3 animate-in">
          {!isOnline && (
            <div className="flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-500">
              <WifiOff size={15} className="shrink-0" />
              Recipe extraction requires an internet connection. Switch to Manual to add a recipe offline.
            </div>
          )}
          <Input
            label="Recipe URL"
            placeholder="https://cooking.nytimes.com/recipes/…"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            type="url"
            disabled={!isOnline}
          />
          {extractError && <p className="text-xs text-red-500">{extractError}</p>}
          <Button fullWidth onClick={handleUrlExtract} disabled={isExtracting || !urlInput.trim() || !isOnline}>
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
          {!isOnline && (
            <div className="flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-500">
              <WifiOff size={15} className="shrink-0" />
              Photo extraction requires an internet connection. Switch to Manual to add a recipe offline.
            </div>
          )}
          {isOnline && showCamera && (
            <CameraCapture
              onCapture={(dataUrl) => {
                setShowCamera(false);
                setCropSrc(dataUrl);
              }}
              onCancel={() => setShowCamera(false)}
            />
          )}
          {isOnline && (cropSrc ? (
            <ImageCropper
              src={cropSrc}
              onConfirm={handleCropConfirm}
              onCancel={() => setCropSrc(null)}
            />
          ) : (
            <div className={[
              'flex flex-col items-center gap-4 border-2 border-dashed rounded-2xl p-8',
              isExtracting
                ? 'border-amber-300 bg-amber-50'
                : 'border-slate-200',
            ].join(' ')}>
              {isExtracting ? (
                <>
                  <Loader size={32} className="text-amber-500 animate-spin" />
                  <div className="text-center">
                    <p className="text-sm font-medium text-slate-700">Analysing photo…</p>
                    <p className="text-xs text-slate-400 mt-0.5">This may take a few seconds</p>
                  </div>
                </>
              ) : (
                <>
                  <Camera size={32} className="text-slate-400" />
                  <div className="text-center">
                    <p className="text-sm font-medium text-slate-700">Add a recipe photo</p>
                    <p className="text-xs text-slate-400 mt-0.5">AI will extract the recipe details</p>
                  </div>
                  <div className="flex gap-2 w-full">
                    <button
                      type="button"
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-xl border border-amber-200 transition-colors"
                      onClick={() => setShowCamera(true)}
                    >
                      <Camera size={14} /> Take Photo
                    </button>
                    <label className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl border border-slate-200 transition-colors cursor-pointer">
                      <Upload size={14} /> From Gallery
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleFileUpload}
                      />
                    </label>
                  </div>
                </>
              )}
            </div>
          ))}
          {extractError && <p className="text-xs text-red-500">{extractError}</p>}
        </div>
      )}

      {/* Form (manual / after extraction) */}
      {mode === 'manual' && (
        <>
          <RecipeForm
            initial={draft}
            knownSources={knownSources}
            onSave={handleSave}
            onCancel={() => navigate(-1)}
            isSaving={isSaving}
          />
          {saveError && <p className="text-xs text-red-500">{saveError}</p>}
        </>
      )}

    </div>
  );
}
