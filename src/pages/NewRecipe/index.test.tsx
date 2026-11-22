import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { NewRecipePage } from './index';
import { useStore } from '../../store';
import { RecipeExtractionError } from '../../lib/recipeExtraction';

vi.mock('../../lib/firestore');
vi.mock('../../lib/idbStorage');

const extractRecipeFromUrl = vi.fn();
const extractRecipeFromText = vi.fn();
vi.mock('../../lib/recipeExtraction', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/recipeExtraction')>()),
  extractRecipeFromUrl: (...args: unknown[]) => extractRecipeFromUrl(...args),
  extractRecipeFromText: (...args: unknown[]) => extractRecipeFromText(...args),
}));

let online = true;
vi.mock('../../hooks/useOnlineStatus', () => ({ useOnlineStatus: () => ({ isOnline: online }) }));

const initialState = useStore.getState();
const BLOCKED = "This site doesn't allow automatic imports. Copy the recipe text and use Paste text, or take a screenshot and use Photo.";

beforeEach(() => {
  useStore.setState(initialState, true);
  useStore.setState({ hasGeminiApiKey: true });
  extractRecipeFromUrl.mockReset().mockRejectedValue(new RecipeExtractionError(BLOCKED));
  extractRecipeFromText.mockReset();
  online = true;
});
afterEach(() => vi.restoreAllMocks());

describe('NewRecipePage extraction errors', () => {
  it('shows a URL error only on the URL tab', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><NewRecipePage /></MemoryRouter>);

    await user.click(screen.getByRole('button', { name: 'URL' }));
    await user.type(screen.getByPlaceholderText(/^https:/), 'https://recipes.example.com/soup');
    await user.click(screen.getByRole('button', { name: /extract recipe/i }));
    expect(await screen.findByText(BLOCKED)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Photo' }));
    expect(screen.getByText('Add a recipe photo')).toBeInTheDocument();
    expect(screen.queryByText(BLOCKED)).not.toBeInTheDocument();

    // Going back to the tab that raised it still shows it.
    await user.click(screen.getByRole('button', { name: 'URL' }));
    expect(screen.getByText(BLOCKED)).toBeInTheDocument();
  });
});

describe('NewRecipePage URL field', () => {
  it('can be cleared, which also clears its error and refocuses the field', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><NewRecipePage /></MemoryRouter>);

    await user.click(screen.getByRole('button', { name: 'URL' }));
    const field = screen.getByPlaceholderText(/^https:/);
    expect(screen.queryByRole('button', { name: 'Clear URL' })).not.toBeInTheDocument();

    await user.type(field, 'https://recipes.example.com/soup');
    await user.click(screen.getByRole('button', { name: /extract recipe/i }));
    expect(await screen.findByText(BLOCKED)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear URL' }));
    expect(field).toHaveValue('');
    expect(field).toHaveFocus();
    expect(screen.queryByText(BLOCKED)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear URL' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /extract recipe/i })).toBeDisabled();
  });
});

describe('NewRecipePage Paste text tab', () => {
  const PASTED = 'Leek soup\nIngredients\n2 leeks\nMethod\n1. Boil';

  it('extracts pasted text, opens the form and saves it as a text import with the link as source', async () => {
    extractRecipeFromText.mockResolvedValue({
      title: 'Leek soup',
      source: 'recipes.example.com',
      servings: 4,
      ingredients: [],
      steps: ['Boil'],
      extractionMethod: 'text+gemini',
    });
    const addRecipe = vi.fn().mockResolvedValue(undefined);
    useStore.setState({ addRecipe });
    const user = userEvent.setup();
    render(<MemoryRouter><NewRecipePage /></MemoryRouter>);

    await user.click(screen.getByRole('button', { name: 'Paste text' }));
    await user.type(screen.getByLabelText('Recipe text'), PASTED);
    await user.type(screen.getByPlaceholderText('https://…'), 'https://recipes.example.com/soup');
    await user.click(screen.getByRole('button', { name: /extract recipe/i }));

    expect(extractRecipeFromText).toHaveBeenCalledWith(PASTED, true, 'https://recipes.example.com/soup');
    expect(await screen.findByDisplayValue('Leek soup')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save recipe' }));
    const saved = addRecipe.mock.calls[0][0];
    expect(saved.importMeta).toMatchObject({ method: 'text', extractionMethod: 'text+gemini' });
    expect(saved.sourceUrl).toBe('https://recipes.example.com/soup');
  });

  it('keeps its error on the Paste text tab', async () => {
    const message = "Couldn't find a recipe in that text. Check you copied the ingredients and method, or enter it manually.";
    extractRecipeFromText.mockRejectedValue(new RecipeExtractionError(message));
    const user = userEvent.setup();
    render(<MemoryRouter><NewRecipePage /></MemoryRouter>);

    await user.click(screen.getByRole('button', { name: 'Paste text' }));
    await user.type(screen.getByLabelText('Recipe text'), 'Cookie settings');
    await user.click(screen.getByRole('button', { name: /extract recipe/i }));
    expect(await screen.findByText(message)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'URL' }));
    expect(screen.queryByText(message)).not.toBeInTheDocument();
  });

  it('cannot extract until text is pasted', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><NewRecipePage /></MemoryRouter>);

    await user.click(screen.getByRole('button', { name: 'Paste text' }));
    expect(screen.getByRole('button', { name: /extract recipe/i })).toBeDisabled();
    await user.type(screen.getByLabelText('Recipe text'), '   ');
    expect(screen.getByRole('button', { name: /extract recipe/i })).toBeDisabled();
  });

  it('is disabled offline, like URL and Photo', () => {
    online = false;
    render(<MemoryRouter><NewRecipePage /></MemoryRouter>);

    expect(screen.getByRole('button', { name: 'Paste text' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'URL' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Manual' })).toBeEnabled();
  });
});
