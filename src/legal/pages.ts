// The public legal pages and their paths. pages/Legal renders them outside the
// sign-in gate (see App.tsx), so they can be read before signing up and linked
// to from anywhere.

import terms from './terms.md?raw';
import privacy from './privacy.md?raw';
import copyright from './copyright.md?raw';

export const LEGAL_PAGES = {
  '/terms': { title: 'Terms of Service', source: terms },
  '/privacy': { title: 'Privacy Policy', source: privacy },
  '/copyright': { title: 'Copyright', source: copyright },
} as const;

export type LegalPath = keyof typeof LEGAL_PAGES;

export function legalPathOf(pathname: string): LegalPath | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  return path in LEGAL_PAGES ? (path as LegalPath) : null;
}
