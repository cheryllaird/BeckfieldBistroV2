import { useEffect, useState } from 'react';
import { X, ExternalLink, ImageOff } from 'lucide-react';
import { ModalPortal } from '../../components/ui/ModalPortal';

interface Props {
  src: string;
  title: string;
  onClose: () => void;
}

/**
 * Full-screen viewer for a recipe image. Renders the image inline rather than
 * linking to it, so data-URL images (photos captured in-app) open the same way
 * as hosted ones — browsers block navigating to a data: URL.
 */
export function ImageViewerModal({ src, title, onClose }: Props) {
  const [imgError, setImgError] = useState(false);
  const isRemote = /^https?:\/\//i.test(src);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex flex-col">
        <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={onClose} />

        <div className="relative z-10 flex items-center justify-between gap-3 px-4 py-3">
          <h3 className="text-sm font-medium text-white/90 truncate">{title}</h3>
          <div className="flex items-center gap-1 shrink-0">
            {isRemote && (
              <a
                href={src}
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-full text-white/70 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
                aria-label="Open image in a new tab"
              >
                <ExternalLink size={18} />
              </a>
            )}
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full text-white/70 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
              aria-label="Close image"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Scrollable so a tall recipe page can be panned when zoomed in */}
        <div className="relative z-10 flex-1 overflow-auto p-4 pt-0" onClick={onClose}>
          {imgError ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-white/60">
              <ImageOff size={40} />
              <p className="text-sm">This image is no longer available.</p>
            </div>
          ) : (
            <img
              src={src}
              alt={title}
              onClick={(e) => e.stopPropagation()}
              onError={() => setImgError(true)}
              className="mx-auto max-w-full rounded-xl shadow-2xl animate-in"
            />
          )}
        </div>
      </div>
    </ModalPortal>
  );
}
