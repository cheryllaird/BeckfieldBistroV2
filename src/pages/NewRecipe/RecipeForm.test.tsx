import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RecipeForm } from './RecipeForm';

vi.mock('../../lib/recipeExtraction', () => ({
  resizeImage: vi.fn(async (src: string) => `${src}#resized`),
}));
vi.mock('../../components/CameraCapture', () => ({
  CameraCapture: ({ onCapture }: { onCapture: (d: string) => void }) => (
    <button type="button" onClick={() => onCapture('data:image/png;base64,cam')}>Fake capture</button>
  ),
}));
vi.mock('../../components/ImageCropper', () => ({
  ImageCropper: ({ src, onConfirm }: { src: string; onConfirm: (d: string) => void }) => (
    <button type="button" onClick={() => onConfirm(`${src}#cropped`)}>Fake crop</button>
  ),
}));

function renderForm(initial = {}) {
  const onSave = vi.fn();
  render(<RecipeForm initial={{ title: 'Soup', ...initial }} knownSources={[]} onSave={onSave} onCancel={vi.fn()} />);
  return { onSave, user: userEvent.setup() };
}

describe('RecipeForm cover image', () => {
  it('saves a pasted image URL as the cover', async () => {
    const { onSave, user } = renderForm();
    await user.click(screen.getByRole('button', { name: 'Add cover photo / URL' }));
    await user.click(screen.getByRole('button', { name: /enter url/i }));
    await user.type(screen.getByPlaceholderText('Paste an image URL…'), 'https://img.example.com/a.jpg');
    expect(screen.getByAltText('Cover preview')).toHaveAttribute('src', 'https://img.example.com/a.jpg');

    await user.click(screen.getByRole('button', { name: 'Clear URL' }));
    expect(screen.queryByAltText('Cover preview')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Paste an image URL…')).toHaveFocus();

    await user.type(screen.getByPlaceholderText('Paste an image URL…'), 'https://img.example.com/b.jpg');
    await user.click(screen.getByRole('button', { name: 'Save recipe' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ coverImage: 'https://img.example.com/b.jpg' }));
  });

  it('closes the URL entry with Done and can cancel the choices', async () => {
    const { user } = renderForm();
    await user.click(screen.getByRole('button', { name: 'Add cover photo / URL' }));
    // The icon-only cancel sits beside the two choices; the form's own Cancel comes last.
    await user.click(screen.getAllByRole('button', { name: 'Cancel' })[0]);
    expect(screen.queryByRole('button', { name: /take photo/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add cover photo / URL' }));
    await user.click(screen.getByRole('button', { name: /enter url/i }));
    await user.click(screen.getByRole('button', { name: 'Done entering URL' }));
    expect(screen.queryByPlaceholderText('Paste an image URL…')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add cover photo / URL' })).toBeInTheDocument();
  });

  it('takes, crops and resizes a photo as the cover', async () => {
    const { onSave, user } = renderForm();
    await user.click(screen.getByRole('button', { name: 'Add cover photo / URL' }));
    await user.click(screen.getByRole('button', { name: /take photo/i }));
    await user.click(screen.getByRole('button', { name: 'Fake capture' }));
    await user.click(screen.getByRole('button', { name: 'Fake crop' }));

    const resized = 'data:image/png;base64,cam#cropped#resized';
    expect(await screen.findByAltText('Cover preview')).toHaveAttribute('src', resized);
    expect(screen.getByRole('button', { name: 'Replace photo / URL' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save recipe' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ coverImage: resized }));
  });

  it('removing the cover opens the URL entry and saves no cover', async () => {
    const { onSave, user } = renderForm({ coverImage: 'https://img.example.com/old.jpg' });
    expect(screen.getByAltText('Cover preview')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove cover image' }));
    expect(screen.queryByAltText('Cover preview')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Paste an image URL…')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save recipe' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ coverImage: undefined }));
  });

  it('shows a placeholder when the cover fails to load', async () => {
    renderForm({ coverImage: 'https://img.example.com/broken.jpg' });
    const img = screen.getByAltText('Cover preview');
    img.dispatchEvent(new Event('error'));
    expect(await screen.findByRole('button', { name: 'Remove cover image' })).toBeInTheDocument();
    expect(screen.queryByAltText('Cover preview')).not.toBeInTheDocument();
  });
});
