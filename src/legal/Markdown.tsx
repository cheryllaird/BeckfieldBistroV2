import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { parseMarkdown } from './parseMarkdown';

// Renders the legal pages' Markdown (see parseMarkdown.ts), plus inline
// **bold**, *italic*, [links](url) and bare email addresses.

const INLINE = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\)|[\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g;
const linkClass = 'text-amber-700 underline hover:text-amber-800';

function renderInline(text: string): ReactNode[] {
  return text.split(INLINE).filter(Boolean).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const [, label, href] = link;
      return href.startsWith('/') ? (
        <Link key={i} to={href} className={linkClass}>{label}</Link>
      ) : (
        <a key={i} href={href} target="_blank" rel="noreferrer" className={linkClass}>{label}</a>
      );
    }
    // The pattern stops before a sentence's closing full stop.
    if (part.includes('@')) {
      return <a key={i} href={`mailto:${part}`} className={linkClass}>{part}</a>;
    }
    return part;
  });
}

export function Markdown({ source }: { source: string }) {
  return (
    <>
      {parseMarkdown(source).map((block, i) => {
        switch (block.kind) {
          case 'heading':
            if (block.level === 1) return <h1 key={i} className="text-2xl font-bold text-slate-900">{block.text}</h1>;
            if (block.level === 2) return <h2 key={i} className="text-lg font-semibold text-slate-900 mt-6">{block.text}</h2>;
            return <h3 key={i} className="text-base font-semibold text-slate-900 mt-5">{block.text}</h3>;
          case 'paragraph':
            return <p key={i} className="text-sm leading-relaxed text-slate-700">{renderInline(block.text)}</p>;
          case 'list': {
            const Tag = block.ordered ? 'ol' : 'ul';
            return (
              <Tag key={i} className={`text-sm leading-relaxed text-slate-700 pl-5 flex flex-col gap-1 ${block.ordered ? 'list-decimal' : 'list-disc'}`}>
                {block.items.map((item, j) => <li key={j}>{renderInline(item)}</li>)}
              </Tag>
            );
          }
          case 'table':
            return (
              <div key={i} className="overflow-x-auto -mx-4 px-4">
                <table className="w-full text-xs text-slate-700 border-collapse">
                  <thead>
                    <tr>
                      {block.header.map((h, j) => (
                        <th key={j} className="text-left font-semibold text-slate-900 border-b border-slate-200 py-2 pr-3 align-bottom">{renderInline(h)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, j) => (
                      <tr key={j}>
                        {row.map((c, k) => (
                          <td key={k} className="border-b border-slate-100 py-2 pr-3 align-top">{renderInline(c)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </>
  );
}
