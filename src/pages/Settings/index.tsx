import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Check } from 'lucide-react';
import { useStore } from '../../store';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';

export function SettingsPage() {
  const navigate = useNavigate();
  const { geminiApiKey, setGeminiApiKey } = useStore();
  const [keyInput, setKeyInput] = useState(geminiApiKey);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    setSaved(false);
    try {
      await setGeminiApiKey(keyInput.trim());
      setSaved(true);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 animate-in">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="text-slate-500 hover:text-slate-800 transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-xl font-bold text-slate-800">Settings</h2>
      </div>

      <Card className="flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Gemini API Key</h3>
          <p className="text-xs text-slate-500 mt-1">
            Recipe extraction from photos and URLs runs on your own Gemini API key, so usage
            is billed to you, not shared with other users. Google offers a free tier with no
            billing required.
          </p>
        </div>

        <a
          href="https://aistudio.google.com/apikey"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 text-xs font-medium text-amber-600 hover:text-amber-700 w-fit"
        >
          Get a free API key at aistudio.google.com
          <ExternalLink size={12} />
        </a>

        <Input
          label="API Key"
          type="password"
          placeholder="AIza…"
          value={keyInput}
          onChange={(e) => { setKeyInput(e.target.value); setSaved(false); }}
          autoComplete="off"
        />

        <Button
          onClick={handleSave}
          disabled={isSaving || keyInput.trim() === geminiApiKey}
          fullWidth
        >
          {saved ? (
            <>
              <Check size={14} /> Saved
            </>
          ) : isSaving ? (
            'Saving…'
          ) : (
            'Save'
          )}
        </Button>

        <p className="text-xs text-slate-400">
          Free-tier keys have rate limits (roughly 10–15 requests per minute and a daily cap).
          If extraction fails with a quota error, wait a bit and try again, or upgrade your key.
        </p>
      </Card>
    </div>
  );
}
