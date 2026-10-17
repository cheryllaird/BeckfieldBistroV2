import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Markdown } from './Markdown';
import { parseMarkdown } from './parseMarkdown';
import terms from './terms.md?raw';
import privacy from './privacy.md?raw';
import copyright from './copyright.md?raw';

const renderMd = (source: string) =>
  render(<MemoryRouter><Markdown source={source} /></MemoryRouter>);

describe('parseMarkdown', () => {
  it('splits headings, paragraphs, lists and tables', () => {
    const blocks = parseMarkdown(
      '# Title\n\nOne line\nsame paragraph.\n\n- a\n- b\n\n1. first\n2. second\n\n| H1 | H2 |\n| --- | --- |\n| x | y |\n',
    );
    expect(blocks).toEqual([
      { kind: 'heading', level: 1, text: 'Title' },
      { kind: 'paragraph', text: 'One line same paragraph.' },
      { kind: 'list', ordered: false, items: ['a', 'b'] },
      { kind: 'list', ordered: true, items: ['first', 'second'] },
      { kind: 'table', header: ['H1', 'H2'], rows: [['x', 'y']] },
    ]);
  });
});

describe('Markdown', () => {
  it('renders inline formatting, links and email addresses', () => {
    renderMd('**Bold** and *italic*, see [Terms](/terms) or [ICO](https://ico.org.uk). Email me@example.com.');

    expect(screen.getByText('Bold').tagName).toBe('STRONG');
    expect(screen.getByText('italic').tagName).toBe('EM');
    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms');
    expect(screen.getByRole('link', { name: 'ICO' })).toHaveAttribute('href', 'https://ico.org.uk');
    expect(screen.getByRole('link', { name: 'me@example.com' })).toHaveAttribute('href', 'mailto:me@example.com');
  });

  it.each([
    ['terms', terms, 'Terms of Service'],
    ['privacy', privacy, 'Privacy Policy'],
    ['copyright', copyright, 'Copyright and Takedown Policy'],
  ])('renders the %s page with no unfilled placeholders', (_name, source, title) => {
    renderMd(source);
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument();
    expect(source).not.toMatch(/\[[A-Z][^\]]*\](?!\()/); // e.g. [Contact email]
  });
});
