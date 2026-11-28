import { useEffect, useRef, useState } from 'react';
import { Loader, Camera, X, Link, UtensilsCrossed } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { resizeImage } from '../../lib/recipeExtraction';
import { ImageCropper } from '../../components/ImageCropper';
import { CameraCapture } from '../../components/CameraCapture';

interface Props {
  /** An image URL or a resized data: URL; '' when there is no cover. */
  value: string;
  onChange: (value: string) => void;
}

/** Cover image preview plus "take photo" / "enter URL" choices for the recipe form. */
export function CoverImagePicker({ value: coverImage, onChange: setCoverImage }: Props) {
  const [coverPhotoLoading, setCoverPhotoLoading] = useState(false);
  const [coverCropSrc, setCoverCropSrc] = useState<string | null>(null);
  const [showCoverActions, setShowCoverActions] = useState(false);
  const [showCoverCamera, setShowCoverCamera] = useState(false);
  const [showUrlEntry, setShowUrlEntry] = useState(false);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const [imgError, setImgError] = useState(false);
  useEffect(() => { setImgError(false); }, [coverImage]);

  const handleCoverCropConfirm = async (croppedDataUrl: string) => {
    setCoverCropSrc(null);
    setCoverPhotoLoading(true);
    try {
      const resized = await resizeImage(croppedDataUrl);
      setCoverImage(resized);
      setShowCoverActions(false);
      setShowUrlEntry(false);
    } finally {
      setCoverPhotoLoading(false);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-slate-600 uppercase tracking-wide">Cover image</span>

        {coverImage && (
          <div className="relative">
            {imgError ? (
              <div className="w-full aspect-video rounded-xl bg-slate-100 flex items-center justify-center text-slate-300">
                <UtensilsCrossed size={48} />
              </div>
            ) : (
              <img
                src={coverImage}
                alt="Cover preview"
                className="w-full aspect-video object-cover rounded-xl"
                onError={() => setImgError(true)}
              />
            )}
            <button
              type="button"
              onClick={() => {
                setCoverImage('');
                setShowCoverActions(false);
                setShowUrlEntry(true);
              }}
              className="absolute top-2 right-2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1.5 transition-colors"
              aria-label="Remove cover image"
            >
              <X size={13} />
            </button>
          </div>
        )}

        {/* Main action button — expands to two choices */}
        {!showCoverActions && !showUrlEntry && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setShowCoverActions(true)}
            disabled={coverPhotoLoading}
          >
            {coverPhotoLoading ? (
              <><Loader size={13} className="animate-spin" /> Processing…</>
            ) : (
              coverImage ? 'Replace photo / URL' : 'Add cover photo / URL'
            )}
          </Button>
        )}

        {/* Two inline choices */}
        {showCoverActions && (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="flex-1"
              onClick={() => {
                setShowCoverActions(false);
                setShowCoverCamera(true);
              }}
            >
              <Camera size={13} /> Take photo
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="flex-1"
              onClick={() => {
                setShowCoverActions(false);
                setShowUrlEntry(true);
              }}
            >
              <Link size={13} /> Enter URL
            </Button>
            <button
              type="button"
              onClick={() => setShowCoverActions(false)}
              className="text-slate-400 hover:text-slate-600 transition-colors px-1"
              aria-label="Cancel"
            >
              <X size={15} />
            </button>
          </div>
        )}

        {/* URL entry */}
        {showUrlEntry && (
          <div className="flex gap-2 items-start">
            <div className="flex-1">
              <Input
                type="url"
                placeholder="Paste an image URL…"
                value={coverImage.startsWith('data:') ? '' : coverImage}
                onChange={(e) => setCoverImage(e.target.value)}
                inputRef={urlInputRef}
                autoFocus
              />
            </div>
            {coverImage && !coverImage.startsWith('data:') ? (
              <button
                type="button"
                onClick={() => {
                  setCoverImage('');
                  urlInputRef.current?.focus();
                }}
                className="mt-2.5 text-slate-400 hover:text-slate-600 transition-colors"
                aria-label="Clear URL"
              >
                <X size={15} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowUrlEntry(false)}
                className="mt-2.5 text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors whitespace-nowrap"
                aria-label="Done entering URL"
              >
                Done
              </button>
            )}
          </div>
        )}
      </div>

      {showCoverCamera && (
        <CameraCapture
          onCapture={(dataUrl) => {
            setShowCoverCamera(false);
            setCoverCropSrc(dataUrl);
          }}
          onCancel={() => setShowCoverCamera(false)}
        />
      )}
      {coverCropSrc && (
        <ImageCropper
          src={coverCropSrc}
          onConfirm={handleCoverCropConfirm}
          onCancel={() => setCoverCropSrc(null)}
        />
      )}
    </>
  );
}
