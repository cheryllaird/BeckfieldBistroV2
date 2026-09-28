import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ApiKeyCard } from './ApiKeyCard';
import { BistroCard } from './BistroCard';

export function SettingsPage() {
  const navigate = useNavigate();

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

      <BistroCard />
      <ApiKeyCard />
    </div>
  );
}
