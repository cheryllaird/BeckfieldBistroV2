import { useRef, useState, useCallback } from 'react';
import { Check, X } from 'lucide-react';
import { Button } from './ui/Button';

interface CropRect {
  x: number; // percentage 0–100 of displayed image
  y: number;
  w: number;
  h: number;
}

type HandleMode = 'move' | 'nw' | 'ne' | 'sw' | 'se';

interface DragState {
  mode: HandleMode;
  startClientX: number;
  startClientY: number;
  startCrop: CropRect;
}

interface Props {
  src: string;
  onConfirm: (croppedDataUrl: string) => void;
  onCancel: () => void;
}

const MIN_PCT = 10;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const CORNERS = [
  { id: 'nw' as const, style: { top: -8, left: -8 }, cursor: 'nw-resize' },
  { id: 'ne' as const, style: { top: -8, right: -8 }, cursor: 'ne-resize' },
  { id: 'sw' as const, style: { bottom: -8, left: -8 }, cursor: 'sw-resize' },
  { id: 'se' as const, style: { bottom: -8, right: -8 }, cursor: 'se-resize' },
];

export function ImageCropper({ src, onConfirm, onCancel }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const cropRef = useRef<CropRect>({ x: 5, y: 5, w: 90, h: 90 });
  const [crop, setCrop] = useState<CropRect>({ x: 5, y: 5, w: 90, h: 90 });
  cropRef.current = crop;

  const onHandleDown = useCallback((e: React.PointerEvent, mode: HandleMode) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = {
      mode,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startCrop: { ...cropRef.current },
    };
  }, []);

  const onMove = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const el = containerRef.current;
    if (!el) return;
    const { width: cw, height: ch } = el.getBoundingClientRect();
    const dx = ((e.clientX - drag.startClientX) / cw) * 100;
    const dy = ((e.clientY - drag.startClientY) / ch) * 100;
    const { x, y, w, h } = drag.startCrop;

    setCrop(() => {
      switch (drag.mode) {
        case 'move':
          return { x: clamp(x + dx, 0, 100 - w), y: clamp(y + dy, 0, 100 - h), w, h };
        case 'nw': {
          const nx = clamp(x + dx, 0, x + w - MIN_PCT);
          const ny = clamp(y + dy, 0, y + h - MIN_PCT);
          return { x: nx, y: ny, w: w - (nx - x), h: h - (ny - y) };
        }
        case 'ne': {
          const ny = clamp(y + dy, 0, y + h - MIN_PCT);
          return { x, y: ny, w: clamp(w + dx, MIN_PCT, 100 - x), h: h - (ny - y) };
        }
        case 'sw': {
          const nx = clamp(x + dx, 0, x + w - MIN_PCT);
          return { x: nx, y, w: w - (nx - x), h: clamp(h + dy, MIN_PCT, 100 - y) };
        }
        case 'se':
          return { x, y, w: clamp(w + dx, MIN_PCT, 100 - x), h: clamp(h + dy, MIN_PCT, 100 - y) };
      }
    });
  }, []);

  const onUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const applyCrop = () => {
    const img = imgRef.current;
    if (!img) return;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round((crop.w / 100) * nw);
    canvas.height = Math.round((crop.h / 100) * nh);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(
      img,
      (crop.x / 100) * nw,
      (crop.y / 100) * nh,
      (crop.w / 100) * nw,
      (crop.h / 100) * nh,
      0,
      0,
      canvas.width,
      canvas.height
    );
    onConfirm(canvas.toDataURL('image/jpeg', 0.92));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-4 gap-4">
      <p className="text-white text-sm font-medium text-center">
        Drag handles to crop — keep just the recipe
      </p>

      <div
        ref={containerRef}
        className="relative w-full max-w-lg select-none touch-none"
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
      >
        <img
          ref={imgRef}
          src={src}
          alt="Crop preview"
          className="w-full rounded-xl block"
          draggable={false}
        />

        {/* Dimmed areas outside crop */}
        <div className="absolute inset-0 pointer-events-none rounded-xl overflow-hidden">
          <div className="absolute bg-black/55" style={{ top: 0, left: 0, right: 0, height: `${crop.y}%` }} />
          <div className="absolute bg-black/55" style={{ bottom: 0, left: 0, right: 0, top: `${crop.y + crop.h}%` }} />
          <div className="absolute bg-black/55" style={{ top: `${crop.y}%`, left: 0, width: `${crop.x}%`, height: `${crop.h}%` }} />
          <div className="absolute bg-black/55" style={{ top: `${crop.y}%`, right: 0, left: `${crop.x + crop.w}%`, height: `${crop.h}%` }} />
        </div>

        {/* Crop rectangle */}
        <div
          className="absolute border-2 border-white cursor-move"
          style={{ left: `${crop.x}%`, top: `${crop.y}%`, width: `${crop.w}%`, height: `${crop.h}%` }}
          onPointerDown={(e) => onHandleDown(e, 'move')}
        >
          {/* Rule-of-thirds grid */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute left-0 right-0 border-t border-white/30" style={{ top: '33.33%' }} />
            <div className="absolute left-0 right-0 border-t border-white/30" style={{ top: '66.66%' }} />
            <div className="absolute top-0 bottom-0 border-l border-white/30" style={{ left: '33.33%' }} />
            <div className="absolute top-0 bottom-0 border-l border-white/30" style={{ left: '66.66%' }} />
          </div>

          {/* Corner handles */}
          {CORNERS.map(({ id, style, cursor }) => (
            <div
              key={id}
              className="absolute w-5 h-5 bg-white rounded-sm shadow-md"
              style={{ ...style, cursor, position: 'absolute' }}
              onPointerDown={(e) => onHandleDown(e, id)}
            />
          ))}
        </div>
      </div>

      <div className="flex gap-3 w-full max-w-lg">
        <Button variant="secondary" fullWidth onClick={onCancel}>
          <X size={14} /> Cancel
        </Button>
        <Button fullWidth onClick={applyCrop}>
          <Check size={14} /> Crop & Use
        </Button>
      </div>
    </div>
  );
}
