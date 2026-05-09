import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Loader, Camera, X, Link, UtensilsCrossed } from 'lucide-react';
import type { Recipe, Ingredient, IngredientSection } from '../../types';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { resizeImage } from '../../lib/recipeExtraction';
import { ImageCropper } from '../../components/ImageCropper';

interface Props {
  initial: Partial<Recipe>;
  knownSources: string[];
  onSave: (recipe: Omit<Recipe, 'id' | 'createdAt' | 'updatedAt' | 'userId'>) => void;
  onCancel: () => void;
  isSaving?: boolean;
}

export function RecipeForm({ initial, knownSources, onSave, onCancel, isSaving }: Props) {
  const [title, setTitle] = useState(initial.title ?? '');
  const [source, setSource] = useState(initial.source ?? '');
  const [servings, setServings] = useState(initial.servings ?? 4);
  const [prepTime, setPrepTime] = useState(initial.prepTime ?? '');
  const [totalTime, setTotalTime] = useState(initial.totalTime ?? '');
  const [coverImage, setCoverImage] = useState(initial.coverImage ?? '');
  const [sections, setSections] = useState<IngredientSection[]>(() => {
    if (initial.ingredientSections?.length) return initial.ingredientSections;
    if (initial.ingredients?.length) return [{ title: '', ingredients: initial.ingredients }];
    return [{ title: '', ingredients: [{ name: '', quantity: 0, unit: '', originalText: '' }] }];
  });
  const [steps, setSteps] = useState<string[]>(
    initial.steps?.length ? initial.steps : ['']
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [coverPhotoLoading, setCoverPhotoLoading] = useState(false);
  const [coverCropSrc, setCoverCropSrc] = useState<string | null>(null);
  const [showCoverActions, setShowCoverActions] = useState(false);
  const [showUrlEntry, setShowUrlEntry] = useState(false);
  const [imgError, setImgError] = useState(false);
  useEffect(() => { setImgError(false); }, [coverImage]);
  const coverPhotoRef = useRef<HTMLInputElement>(null);

  const handleCoverPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (coverPhotoRef.current) coverPhotoRef.current.value = '';
    const reader = new FileReader();
    reader.onload = () => setCoverCropSrc(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleCoverCropConfirm = async (croppedDataUrl: string) => {
    setCoverCropSrc(null);
    setCoverPhotoLoading(true);
    try {
      const resized = await resizeImage(croppedDataUrl);
      setCoverImage(resized);
      setShowCoverActions(false);
      setShowUrlEntry(false);
    } finally {
      setCoverPhotoLoading(false);
    }
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = 'Title is required';
    if (servings < 1) e.servings = 'Servings must be at least 1';
    return e;
  };

  const handleSave = () => {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    const filledSections = sections
      .map((s) => ({
        title: s.title.trim(),
        ingredients: s.ingredients
          .filter((i) => i.name.trim())
          .map((i) => ({
            ...i,
            originalText: i.originalText.trim() || `${i.quantity}${i.unit} ${i.name}`.trim(),
          })),
      }))
      .filter((s) => s.ingredients.length > 0);
    const flatIngredients = filledSections.flatMap((s) => s.ingredients);
    onSave({
      title: title.trim(),
      source: source.trim() || 'Unknown',
      servings,
      prepTime: prepTime.trim(),
      totalTime: totalTime.trim(),
      coverImage: coverImage.trim() || undefined,
      originalImage: initial.originalImage,
      sourceUrl: initial.sourceUrl,
      ingredientSections: filledSections,
      ingredients: flatIngredients,
      steps: steps.filter((s) => s.trim()),
    });
  };

  const addSection = () =>
    setSections((prev) => [
      ...prev,
      { title: '', ingredients: [{ name: '', quantity: 0, unit: '', originalText: '' }] },
    ]);

  const updateSectionTitle = (sIdx: number, title: string) =>
    setSections((prev) => prev.map((s, i) => (i === sIdx ? { ...s, title } : s)));

  const removeSection = (sIdx: number) =>
    setSections((prev) => prev.filter((_, i) => i !== sIdx));

  const addIngredient = (sIdx: number) =>
    setSections((prev) =>
      prev.map((s, i) =>
        i === sIdx
          ? { ...s, ingredients: [...s.ingredients, { name: '', quantity: 0, unit: '', originalText: '' }] }
          : s
      )
    );

  const updateIngredient = (sIdx: number, iIdx: number, field: keyof Ingredient, value: string | number) =>
    setSections((prev) =>
      prev.map((s, si) =>
        si === sIdx
          ? { ...s, ingredients: s.ingredients.map((ing, ii) => (ii === iIdx ? { ...ing, [field]: value } : ing)) }
          : s
      )
    );

  const removeIngredient = (sIdx: number, iIdx: number) =>
    setSections((prev) =>
      prev.map((s, si) =>
        si === sIdx ? { ...s, ingredients: s.ingredients.filter((_, ii) => ii !== iIdx) } : s
      )
    );

  const addStep = () => setSteps((prev) => [...prev, '']);
  const updateStep = (idx: number, value: string) =>
    setSteps((prev) => prev.map((s, i) => (i === idx ? value : s)));
  const removeStep = (idx: number) =>
    setSteps((prev) => prev.filter((_, i) => i !== idx));

  return (
    <div className="flex flex-col gap-5">
      {/* Basic info */}
      <section className="flex flex-col gap-3">
        <Input
          label="Recipe Title *"
          placeholder="e.g. Spaghetti Carbonara"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={errors.title}
        />

        {/* Source with suggestions */}
        <div className="flex flex-col gap-1">
          <Input
            label="Source"
            placeholder="e.g. NYT Cooking"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            list="sources-list"
          />
          <datalist id="sources-list">
            {knownSources.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Input
            label="Servings *"
            type="number"
            min={1}
            value={servings}
            onChange={(e) => setServings(Number(e.target.value))}
            error={errors.servings}
          />
          <Input
            label="Prep Time"
            type="text"
            placeholder="e.g. 15 mins"
            value={prepTime}
            onChange={(e) => setPrepTime(e.target.value)}
          />
          <Input
            label="Total Time"
            type="text"
            placeholder="e.g. 45 mins"
            value={totalTime}
            onChange={(e) => setTotalTime(e.target.value)}
          />
        </div>

        {/* Cover Image */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-slate-600 uppercase tracking-wide">Cover Image</span>

          {coverImage && (
            <div className="relative">
              {imgError ? (
                <div className="w-full aspect-video rounded-xl bg-slate-100 flex items-center justify-center text-slate-300">
                  <UtensilsCrossed size={48} />
                </div>
              ) : (
                <img
                  src={coverImage}
                  alt="Cover preview"
                  className="w-full aspect-video object-cover rounded-xl"
                  onError={() => setImgError(true)}
                />
              )}
              <button
                type="button"
                onClick={() => setCoverImage('')}
                className="absolute top-2 right-2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1.5 transition-colors"
                aria-label="Remove cover image"
              >
                <X size={13} />
              </button>
            </div>
          )}

          <input
            ref={coverPhotoRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleCoverPhotoChange}
          />

          {/* Main action button — expands to two choices */}
          {!showCoverActions && !showUrlEntry && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowCoverActions(true)}
              disabled={coverPhotoLoading}
            >
              {coverPhotoLoading ? (
                <><Loader size={13} className="animate-spin" /> Processing…</>
              ) : (
                coverImage ? 'Replace Photo / URL' : 'Add Cover Photo / URL'
              )}
            </Button>
          )}

          {/* Two inline choices */}
          {showCoverActions && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="flex-1"
                onClick={() => {
                  setShowCoverActions(false);
                  coverPhotoRef.current?.click();
                }}
              >
                <Camera size={13} /> Take Photo
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="flex-1"
                onClick={() => {
                  setShowCoverActions(false);
                  setShowUrlEntry(true);
                }}
              >
                <Link size={13} /> Enter URL
              </Button>
              <button
                type="button"
                onClick={() => setShowCoverActions(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors px-1"
                aria-label="Cancel"
              >
                <X size={15} />
              </button>
            </div>
          )}

          {/* URL entry */}
          {showUrlEntry && (
            <div className="flex gap-2 items-start">
              <div className="flex-1">
                <Input
                  type="url"
                  placeholder="Paste an image URL…"
                  value={coverImage.startsWith('data:') ? '' : coverImage}
                  onChange={(e) => setCoverImage(e.target.value)}
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                />
              </div>
              <button
                type="button"
                onClick={() => setShowUrlEntry(false)}
                className="mt-2.5 text-slate-400 hover:text-slate-600 transition-colors"
                aria-label="Done"
              >
                <X size={15} />
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Ingredients */}
      <section className="flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Ingredients</h3>
        {sections.map((section, sIdx) => (
          <div key={sIdx} className="flex flex-col gap-2">
            {/* Section header row */}
            <div className="flex items-center gap-2">
              <Input
                placeholder={sections.length > 1 ? 'Section name, e.g. For the dressing' : 'Section name (optional)'}
                value={section.title}
                onChange={(e) => updateSectionTitle(sIdx, e.target.value)}
                className="flex-1 text-sm font-medium"
              />
              {sections.length > 1 && (
                <button
                  onClick={() => removeSection(sIdx)}
                  className="text-slate-300 hover:text-red-400 transition-colors shrink-0"
                  aria-label="Remove section"
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>

            {/* Ingredients in this section */}
            <div className={sections.length > 1 ? 'pl-3 border-l-2 border-amber-100 flex flex-col gap-2' : 'flex flex-col gap-2'}>
              {section.ingredients.map((ing, iIdx) => (
                <div key={iIdx} className="flex gap-2 items-start">
                  <div className="grid grid-cols-[1fr_70px_60px] gap-1.5 flex-1">
                    <Input
                      placeholder="Ingredient"
                      value={ing.name}
                      onChange={(e) => updateIngredient(sIdx, iIdx, 'name', e.target.value)}
                    />
                    <Input
                      placeholder="Qty"
                      type="number"
                      min={0}
                      step={0.1}
                      value={ing.quantity || ''}
                      onChange={(e) => updateIngredient(sIdx, iIdx, 'quantity', parseFloat(e.target.value) || 0)}
                    />
                    <Input
                      placeholder="Unit"
                      value={ing.unit}
                      onChange={(e) => updateIngredient(sIdx, iIdx, 'unit', e.target.value)}
                    />
                  </div>
                  <button
                    onClick={() => removeIngredient(sIdx, iIdx)}
                    className="mt-2 text-slate-300 hover:text-red-400 transition-colors shrink-0"
                    aria-label="Remove ingredient"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
              <Button variant="ghost" size="sm" onClick={() => addIngredient(sIdx)}>
                <Plus size={13} /> Add Ingredient
              </Button>
            </div>
          </div>
        ))}
        <Button variant="ghost" size="sm" onClick={addSection}>
          <Plus size={13} /> Add Section
        </Button>
      </section>

      {/* Steps */}
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Method</h3>
        {steps.map((step, idx) => (
          <div key={idx} className="flex gap-2 items-start">
            <span className="mt-2.5 shrink-0 w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center">
              {idx + 1}
            </span>
            <textarea
              value={step}
              onChange={(e) => updateStep(idx, e.target.value)}
              placeholder={`Step ${idx + 1}`}
              rows={2}
              className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 resize-none transition-colors"
            />
            <button
              onClick={() => removeStep(idx)}
              className="mt-2.5 text-slate-300 hover:text-red-400 transition-colors shrink-0"
              aria-label="Remove step"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        <Button variant="ghost" size="sm" onClick={addStep}>
          <Plus size={13} /> Add Step
        </Button>
      </section>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <Button variant="secondary" fullWidth onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
        <Button fullWidth onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <><Loader size={14} className="animate-spin" /> Saving…</>
          ) : (
            'Save Recipe'
          )}
        </Button>
      </div>

      {coverCropSrc && (
        <ImageCropper
          src={coverCropSrc}
          onConfirm={handleCoverCropConfirm}
          onCancel={() => setCoverCropSrc(null)}
        />
      )}
    </div>
  );
}
