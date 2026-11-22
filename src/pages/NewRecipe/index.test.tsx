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
vi.mock('../../lib/recipeExtraction', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/recipeExtraction')>()),
  extractRecipeFromUrl: (...args: unknown[]) => extractRecipeFromUrl(...args),
}));

const initialState = useStore.getState();
const BLOCKED = "This site doesn't allow automatic imports. Take a screenshot and use Photo, or add it with Manual.";

beforeEach(() => {
  useStore.setState(initialState, true);
  useStore.setState({ hasGeminiApiKey: true });
  extractRecipeFromUrl.mockReset().mockRejectedValue(new RecipeExtractionError(BLOCKED));
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
