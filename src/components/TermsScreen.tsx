import { useState } from 'react';
import { useStore } from '../store';
import { LEGAL } from '../lib/legal';
import { Button } from './ui/Button';

// Shown after sign-in until the user accepts the current Terms (see
// needsTermsAcceptance in lib/legal.ts). Also shown again when the Terms change.

const link = 'text-amber-400 underline hover:text-amber-300';

export function TermsScreen() {
  const accepted = useStore((s) => s.termsAcceptedVersion);
  const acceptTerms = useStore((s) => s.acceptTerms);
  const signOut = useStore((s) => s.signOut);
  const [agreed, setAgreed] = useState(false);

  return (
    <div className="fixed inset-0 bg-ink-950 flex flex-col items-center justify-center gap-5 px-6 text-center z-50">
      <img src="/logo-icon.png" alt="Beckfield Bistro" className="w-20 h-20" />
      <div className="flex flex-col items-center gap-4 max-w-xs">
        <div>
          <h1 className="text-xl font-bold text-white">
            {accepted ? 'Our terms have changed' : 'Before you start'}
          </h1>
          <p className="text-sm text-slate-300 mt-2">
            Beckfield Bistro is a private recipe box. Please only save recipes for your own
            household's use, and share them only with people you know.
          </p>
        </div>

        <label className="flex items-start gap-2 text-left text-sm text-slate-200 cursor-pointer">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 accent-amber-500"
          />
          <span>
            I agree to the{' '}
            <a href={LEGAL.termsUrl} target="_blank" rel="noreferrer" className={link}>
              Terms of Service
            </a>{' '}
            and have read the{' '}
            <a href={LEGAL.privacyUrl} target="_blank" rel="noreferrer" className={link}>
              Privacy Policy
            </a>
            .
          </span>
        </label>

        <Button fullWidth onClick={acceptTerms} disabled={!agreed}>
          Continue
        </Button>
        <Button fullWidth variant="ghost" className="text-slate-300 hover:bg-white/10" onClick={() => signOut()}>
          Sign out
        </Button>
      </div>
    </div>
  );
}
