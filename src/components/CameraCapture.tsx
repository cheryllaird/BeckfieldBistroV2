import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface Props {
  onCapture: (dataUrl: string) => void;
  onCancel: () => void;
}

export function CameraCapture({ onCapture, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera not supported in this browser.');
      return;
    }

    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      })
      .catch((err) => {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setError('Camera permission denied. Please allow camera access in your browser settings.');
        } else {
          setError('Could not access camera. Try uploading a photo from your gallery instead.');
        }
      });

    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onCapture(canvas.toDataURL('image/jpeg', 0.92));
  };

  const ui = error ? (
    <div className="fixed inset-0 z-[200] bg-black/90 flex flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-white text-sm">{error}</p>
      <button
        type="button"
        onClick={onCancel}
        className="px-6 py-2.5 bg-white text-black rounded-full text-sm font-medium"
      >
        Go Back
      </button>
    </div>
  ) : (
    <div className="fixed inset-0 z-[200] bg-black overflow-hidden">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
        onCanPlay={() => setReady(true)}
      />
      <div className="absolute bottom-0 inset-x-0 flex items-center justify-between px-8 py-8">
        <button
          type="button"
          onClick={onCancel}
          className="text-white w-12 h-12 flex items-center justify-center rounded-full bg-black/40"
          aria-label="Cancel"
        >
          <X size={24} />
        </button>
        <button
          type="button"
          onClick={handleCapture}
          disabled={!ready}
          className="w-18 h-18 rounded-full bg-white disabled:opacity-50 ring-4 ring-white/40 flex-shrink-0"
          aria-label="Take photo"
        />
        <div className="w-12 h-12" />
      </div>
    </div>
  );

  return createPortal(ui, document.body);
}
