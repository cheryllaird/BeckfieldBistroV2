import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Recipe, MealEntry, ShoppingItem, AppState } from '../types';

const DEFAULT_SOURCES = ['NYT Cooking', 'Family Notes', 'Bon Appétit', 'Smitten Kitchen'];

const SAMPLE_RECIPES: Recipe[] = [
  {
    id: 'r1',
    title: 'Classic Roast Chicken',
    source: 'Family Notes',
    coverImage: 'https://images.unsplash.com/photo-1598103442097-8b74394b95c3?w=600&q=80',
    servings: 4,
    totalTimeMinutes: 90,
    ingredients: [
      { id: 'i1', name: 'Whole chicken', quantity: 1, unit: 'kg (1.8kg)' },
      { id: 'i2', name: 'Butter', quantity: 50, unit: 'g' },
      { id: 'i3', name: 'Garlic', quantity: 4, unit: 'cloves' },
      { id: 'i4', name: 'Lemon', quantity: 1, unit: '' },
      { id: 'i5', name: 'Fresh thyme', quantity: 4, unit: 'sprigs' },
      { id: 'i6', name: 'Olive oil', quantity: 2, unit: 'tbsp' },
      { id: 'i7', name: 'Salt', quantity: 1, unit: 'tsp' },
      { id: 'i8', name: 'Black pepper', quantity: 0.5, unit: 'tsp' },
    ],
    steps: [
      'Preheat oven to 220°C (425°F). Pat the chicken dry with paper towels.',
      'Mix softened butter with minced garlic, thyme leaves, salt and pepper.',
      'Carefully loosen skin over the breast and rub butter mixture underneath.',
      'Stuff the cavity with lemon halves and remaining thyme sprigs.',
      'Drizzle with olive oil, season generously, and tie legs with twine.',
      'Roast for 20 minutes at high heat, then reduce to 190°C and roast 60 more minutes.',
      'Rest for 15 minutes before carving.',
    ],
    createdAt: '2026-03-01T10:00:00Z',
    updatedAt: '2026-03-01T10:00:00Z',
  },
  {
    id: 'r2',
    title: 'Spaghetti Carbonara',
    source: 'NYT Cooking',
    coverImage: 'https://images.unsplash.com/photo-1612874742237-6526221588e3?w=600&q=80',
    servings: 2,
    totalTimeMinutes: 25,
    ingredients: [
      { id: 'i9', name: 'Spaghetti', quantity: 200, unit: 'g' },
      { id: 'i10', name: 'Guanciale or pancetta', quantity: 100, unit: 'g' },
      { id: 'i11', name: 'Eggs', quantity: 2, unit: '' },
      { id: 'i12', name: 'Egg yolks', quantity: 2, unit: '' },
      { id: 'i13', name: 'Pecorino Romano', quantity: 60, unit: 'g', notes: 'finely grated' },
      { id: 'i14', name: 'Black pepper', quantity: 1, unit: 'tsp', notes: 'coarsely ground' },
    ],
    steps: [
      'Bring a large pot of salted water to a boil and cook pasta until al dente.',
      'While pasta cooks, fry guanciale in a dry pan until crisp. Remove from heat.',
      'Whisk together eggs, yolks, and most of the cheese. Season with black pepper.',
      'Reserve 1 cup of pasta water, then drain pasta.',
      'Add hot pasta to the pan with guanciale (off heat). Add egg mixture, tossing rapidly.',
      'Thin with pasta water as needed to create a silky, creamy sauce.',
      'Serve immediately topped with remaining cheese and extra pepper.',
    ],
    createdAt: '2026-03-05T12:00:00Z',
    updatedAt: '2026-03-05T12:00:00Z',
  },
  {
    id: 'r3',
    title: 'Lemon Blueberry Muffins',
    source: 'Bon Appétit',
    coverImage: 'https://images.unsplash.com/photo-1607958996333-41aef7caefaa?w=600&q=80',
    servings: 12,
    totalTimeMinutes: 40,
    ingredients: [
      { id: 'i15', name: 'All-purpose flour', quantity: 300, unit: 'g' },
      { id: 'i16', name: 'Caster sugar', quantity: 150, unit: 'g' },
      { id: 'i17', name: 'Baking powder', quantity: 2, unit: 'tsp' },
      { id: 'i18', name: 'Salt', quantity: 0.5, unit: 'tsp' },
      { id: 'i19', name: 'Eggs', quantity: 2, unit: '' },
      { id: 'i20', name: 'Whole milk', quantity: 240, unit: 'ml' },
      { id: 'i21', name: 'Vegetable oil', quantity: 80, unit: 'ml' },
      { id: 'i22', name: 'Lemon zest', quantity: 1, unit: 'lemon' },
      { id: 'i23', name: 'Fresh blueberries', quantity: 200, unit: 'g' },
    ],
    steps: [
      'Preheat oven to 190°C. Line a 12-hole muffin tin with paper cases.',
      'Whisk together flour, sugar, baking powder and salt in a large bowl.',
      'In a separate bowl, whisk eggs, milk, oil and lemon zest.',
      'Fold wet ingredients into dry until just combined — do not overmix.',
      'Gently fold in blueberries.',
      'Fill muffin cases three-quarters full. Bake 20–22 minutes until golden.',
      'Cool in tin for 5 minutes then transfer to a wire rack.',
    ],
    createdAt: '2026-03-10T09:00:00Z',
    updatedAt: '2026-03-10T09:00:00Z',
  },
];

interface Store extends AppState {
  // Recipe actions
  addRecipe: (recipe: Recipe) => void;
  updateRecipe: (recipe: Recipe) => void;
  deleteRecipe: (id: string) => void;

  // Meal plan actions
  addMealEntry: (entry: MealEntry) => void;
  updateMealEntry: (entry: MealEntry) => void;
  deleteMealEntry: (id: string) => void;

  // Shopping list actions
  setShoppingItems: (items: ShoppingItem[]) => void;
  toggleShoppingItem: (id: string) => void;
  addShoppingItem: (item: ShoppingItem) => void;
  removeShoppingItem: (id: string) => void;
  reorderShoppingItems: (items: ShoppingItem[]) => void;
  clearCheckedItems: () => void;

  // Auth actions
  signIn: (user: { name: string; email: string; avatar?: string }) => void;
  signOut: () => void;
  setSplashDone: () => void;

  // Source actions
  addSource: (source: string) => void;
}

export const useStore = create<Store>()(
  persist(
    (set) => ({
      recipes: SAMPLE_RECIPES,
      mealEntries: [],
      shoppingItems: [],
      knownSources: DEFAULT_SOURCES,
      isAuthenticated: false,
      user: null,
      splashDone: false,

      addRecipe: (recipe) =>
        set((s) => ({
          recipes: [recipe, ...s.recipes],
          knownSources: s.knownSources.includes(recipe.source)
            ? s.knownSources
            : [...s.knownSources, recipe.source],
        })),

      updateRecipe: (recipe) =>
        set((s) => ({
          recipes: s.recipes.map((r) => (r.id === recipe.id ? recipe : r)),
        })),

      deleteRecipe: (id) =>
        set((s) => ({ recipes: s.recipes.filter((r) => r.id !== id) })),

      addMealEntry: (entry) =>
        set((s) => ({ mealEntries: [...s.mealEntries, entry] })),

      updateMealEntry: (entry) =>
        set((s) => ({
          mealEntries: s.mealEntries.map((e) => (e.id === entry.id ? entry : e)),
        })),

      deleteMealEntry: (id) =>
        set((s) => ({ mealEntries: s.mealEntries.filter((e) => e.id !== id) })),

      setShoppingItems: (items) => set({ shoppingItems: items }),

      toggleShoppingItem: (id) =>
        set((s) => ({
          shoppingItems: s.shoppingItems.map((item) =>
            item.id === id ? { ...item, checked: !item.checked } : item
          ),
        })),

      addShoppingItem: (item) =>
        set((s) => ({ shoppingItems: [...s.shoppingItems, item] })),

      removeShoppingItem: (id) =>
        set((s) => ({ shoppingItems: s.shoppingItems.filter((i) => i.id !== id) })),

      reorderShoppingItems: (items) => set({ shoppingItems: items }),

      clearCheckedItems: () =>
        set((s) => ({ shoppingItems: s.shoppingItems.filter((i) => !i.checked) })),

      signIn: (user) => set({ isAuthenticated: true, user }),
      signOut: () => set({ isAuthenticated: false, user: null }),
      setSplashDone: () => set({ splashDone: true }),

      addSource: (source) =>
        set((s) => ({
          knownSources: s.knownSources.includes(source)
            ? s.knownSources
            : [...s.knownSources, source],
        })),
    }),
    { name: 'bistro-storage' }
  )
);
