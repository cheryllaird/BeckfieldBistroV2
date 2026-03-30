import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Recipe, Ingredient } from '../../types';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { generateId } from '../../lib/utils';

interface Props {
  initial: Partial<Recipe>;
  knownSources: string[];
  onSave: (recipe: Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onCancel: () => void;
}

export function RecipeForm({ initial, knownSources, onSave, onCancel }: Props) {
  const [title, setTitle] = useState(initial.title ?? '');
  const [source, setSource] = useState(initial.source ?? '');
  const [servings, setServings] = useState(initial.servings ?? 4);
  const [totalTime, setTotalTime] = useState(initial.totalTimeMinutes ?? '');
  const [coverImage, setCoverImage] = useState(initial.coverImage ?? '');
  const [ingredients, setIngredients] = useState<Ingredient[]>(
    initial.ingredients?.length
      ? initial.ingredients
      : [{ id: generateId(), name: '', quantity: 0, unit: '' }]
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
    onSave({
      title: title.trim(),
      source: source.trim() || 'Unknown',
      servings,
      totalTimeMinutes: totalTime ? Number(totalTime) : undefined,
      coverImage: coverImage.trim() || undefined,
      ingredients: ingredients.filter((i) => i.name.trim()),
      steps: steps.filter((s) => s.trim()),
    });
  };

  const addIngredient = () =>
    setIngredients((prev) => [
      ...prev,
      { id: generateId(), name: '', quantity: 0, unit: '' },
    ]);

  const updateIngredient = (id: string, field: keyof Ingredient, value: string | number) =>
    setIngredients((prev) =>
      prev.map((i) => (i.id === id ? { ...i, [field]: value } : i))
    );

  const removeIngredient = (id: string) =>
    setIngredients((prev) => prev.filter((i) => i.id !== id));

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

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Servings *"
            type="number"
            min={1}
            value={servings}
            onChange={(e) => setServings(Number(e.target.value))}
            error={errors.servings}
          />
          <Input
            label="Total Time (min)"
            type="number"
            min={0}
            placeholder="e.g. 45"
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
        {ingredients.map((ing) => (
          <div key={ing.id} className="flex gap-2 items-start">
            <div className="grid grid-cols-[1fr_70px_60px] gap-1.5 flex-1">
              <Input
                placeholder="Ingredient"
                value={ing.name}
                onChange={(e) => updateIngredient(ing.id, 'name', e.target.value)}
              />
              <Input
                placeholder="Qty"
                type="number"
                min={0}
                step={0.1}
                value={ing.quantity || ''}
                onChange={(e) => updateIngredient(ing.id, 'quantity', parseFloat(e.target.value) || 0)}
              />
              <Input
                placeholder="Unit"
                value={ing.unit}
                onChange={(e) => updateIngredient(ing.id, 'unit', e.target.value)}
              />
            </div>
            <button
              onClick={() => removeIngredient(ing.id)}
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
        <Button variant="secondary" fullWidth onClick={onCancel}>
          Cancel
        </Button>
        <Button fullWidth onClick={handleSave}>
          Save Recipe
        </Button>
      </div>
    </div>
  );
}
