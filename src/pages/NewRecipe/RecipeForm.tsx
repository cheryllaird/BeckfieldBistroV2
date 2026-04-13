import { useState } from 'react';
import { Plus, Trash2, Loader } from 'lucide-react';
import type { Recipe, Ingredient } from '../../types';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

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
  const [ingredients, setIngredients] = useState<Ingredient[]>(
    initial.ingredients?.length
      ? initial.ingredients
      : [{ name: '', quantity: 0, unit: '', originalText: '' }]
  );
  const [steps, setSteps] = useState<string[]>(
    initial.steps?.length ? initial.steps : ['']
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = 'Title is required';
    if (servings < 1) e.servings = 'Servings must be at least 1';
    return e;
  };

  const handleSave = () => {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    const filledIngredients = ingredients
      .filter((i) => i.name.trim())
      .map((i) => ({
        ...i,
        originalText: i.originalText.trim() || `${i.quantity}${i.unit} ${i.name}`.trim(),
      }));
    onSave({
      title: title.trim(),
      source: source.trim() || 'Unknown',
      servings,
      prepTime: prepTime.trim(),
      totalTime: totalTime.trim(),
      coverImage: coverImage.trim() || undefined,
      originalImage: initial.originalImage,
      ingredients: filledIngredients,
      steps: steps.filter((s) => s.trim()),
    });
  };

  const addIngredient = () =>
    setIngredients((prev) => [
      ...prev,
      { name: '', quantity: 0, unit: '', originalText: '' },
    ]);

  const updateIngredient = (index: number, field: keyof Ingredient, value: string | number) =>
    setIngredients((prev) =>
      prev.map((ing, i) => (i === index ? { ...ing, [field]: value } : ing))
    );

  const removeIngredient = (index: number) =>
    setIngredients((prev) => prev.filter((_, i) => i !== index));

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

        <Input
          label="Cover Image URL"
          type="url"
          placeholder="https://…"
          value={coverImage}
          onChange={(e) => setCoverImage(e.target.value)}
          hint="Paste an image URL or leave blank"
        />
        {coverImage && (
          <img
            src={coverImage}
            alt="Cover preview"
            className="w-full aspect-video object-cover rounded-xl"
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
        )}
      </section>

      {/* Ingredients */}
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Ingredients</h3>
        {ingredients.map((ing, index) => (
          <div key={index} className="flex gap-2 items-start">
            <div className="grid grid-cols-[1fr_70px_60px] gap-1.5 flex-1">
              <Input
                placeholder="Ingredient"
                value={ing.name}
                onChange={(e) => updateIngredient(index, 'name', e.target.value)}
              />
              <Input
                placeholder="Qty"
                type="number"
                min={0}
                step={0.1}
                value={ing.quantity || ''}
                onChange={(e) => updateIngredient(index, 'quantity', parseFloat(e.target.value) || 0)}
              />
              <Input
                placeholder="Unit"
                value={ing.unit}
                onChange={(e) => updateIngredient(index, 'unit', e.target.value)}
              />
            </div>
            <button
              onClick={() => removeIngredient(index)}
              className="mt-2 text-slate-300 hover:text-red-400 transition-colors shrink-0"
              aria-label="Remove ingredient"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        <Button variant="ghost" size="sm" onClick={addIngredient}>
          <Plus size={13} /> Add Ingredient
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
    </div>
  );
}
