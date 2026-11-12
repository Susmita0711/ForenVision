import React, { useState } from 'react';
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  Maximize2, 
  Grid, 
  Eye, 
  Layers, 
  Info,
  Hash
} from 'lucide-react';

interface ImageViewerProps {
  src: string;
  alt?: string;
  title?: string;
  sha256?: string;
  metadata?: Record<string, string | number>;
  regionsOfInterest?: Array<{ x: number; y: number; width: number; height: number; confidence: number; label?: string }>;
  className?: string;
}

export const ImageViewer: React.FC<ImageViewerProps> = ({
  src,
  alt = 'Forensic Evidence View',
  title,
  sha256,
  metadata,
  regionsOfInterest = [],
  className = '',
}) => {
  const [zoom, setZoom] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [showGrid, setShowGrid] = useState<boolean>(false);
  const [invertColors, setInvertColors] = useState<boolean>(false);
  const [highContrast, setHighContrast] = useState<boolean>(false);
  const [showRoi, setShowRoi] = useState<boolean>(true);
  const [showInfo, setShowInfo] = useState<boolean>(false);

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.25, 4));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.25, 0.5));
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);
  const handleReset = () => {
    setZoom(1);
    setRotation(0);
  };

  return (
    <div className={`flex flex-col rounded-xl border border-slate-800 bg-[#0F172A] overflow-hidden shadow-2xl ${className}`}>
      {/* Top Inspection Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/90 px-4 py-2.5 text-xs text-slate-300">
        <div className="flex items-center gap-2">
          {title && <span className="font-semibold text-white tracking-tight">{title}</span>}
          <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-800 text-cyan-400 border border-slate-700">
            {Math.round(zoom * 100)}%
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Zoom Controls */}
          <div className="flex items-center rounded-lg bg-slate-800/80 border border-slate-700 p-0.5">
            <button
              onClick={handleZoomOut}
              className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-700 transition-colors focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
              title="Zoom out"
              aria-label="Zoom out"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleReset}
              className="px-2 py-1 text-[10px] font-mono text-slate-300 hover:text-white rounded hover:bg-slate-700 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
              title="Reset view to 1:1"
              aria-label="Reset view to 1:1"
            >
              1:1
            </button>
            <button
              onClick={handleZoomIn}
              className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-700 transition-colors focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
              title="Zoom in"
              aria-label="Zoom in"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Rotate */}
          <button
            onClick={handleRotate}
            className="p-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
            title="Rotate 90 degrees clockwise"
            aria-label="Rotate 90 degrees clockwise"
          >
            <RotateCw className="h-3.5 w-3.5" />
          </button>

          {/* Forensic Layer Toggles */}
          <button
            onClick={() => setShowGrid((v) => !v)}
            className={`p-1.5 rounded-lg border transition-colors focus:outline-none focus:ring-1 focus:ring-cyan-500/50 ${
              showGrid
                ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-white'
            }`}
            title="Toggle Alignment Grid"
            aria-label="Toggle Alignment Grid"
          >
            <Grid className="h-3.5 w-3.5" />
          </button>

          <button
            onClick={() => setInvertColors((v) => !v)}
            className={`p-1.5 rounded-lg border transition-colors focus:outline-none focus:ring-1 focus:ring-cyan-500/50 ${
              invertColors
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-white'
            }`}
            title="Invert Colors (Forensic Negative)"
            aria-label="Invert Colors (Forensic Negative)"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>

          <button
            onClick={() => setHighContrast((v) => !v)}
            className={`p-1.5 rounded-lg border transition-colors focus:outline-none focus:ring-1 focus:ring-cyan-500/50 ${
              highContrast
                ? 'bg-purple-500/20 border-purple-500/50 text-purple-300'
                : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-white'
            }`}
            title="High Contrast Edge Enhancement"
            aria-label="High Contrast Edge Enhancement"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>

          {regionsOfInterest.length > 0 && (
            <button
              onClick={() => setShowRoi((v) => !v)}
              className={`p-1.5 rounded-lg border transition-colors focus:outline-none focus:ring-1 focus:ring-cyan-500/50 ${
                showRoi
                  ? 'bg-rose-500/20 border-rose-500/50 text-rose-300'
                  : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-white'
              }`}
              title="Toggle Suspicious Anomaly Bounding Boxes"
              aria-label="Toggle Suspicious Anomaly Bounding Boxes"
            >
              <Layers className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Metadata Inspector Drawer Toggle */}
          <button
            onClick={() => setShowInfo((v) => !v)}
            className={`p-1.5 rounded-lg border transition-colors focus:outline-none focus:ring-1 focus:ring-cyan-500/50 ${
              showInfo
                ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-white'
            }`}
            title="Evidence Metadata Inspector"
            aria-label="Evidence Metadata Inspector"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Main Canvas Viewport */}
      <div className="relative min-h-[360px] max-h-[560px] bg-[#070A11] flex items-center justify-center overflow-hidden select-none">
        {/* Alignment Grid Overlay */}
        {showGrid && (
          <div
            className="absolute inset-0 pointer-events-none z-10 opacity-25"
            style={{
              backgroundImage:
                'linear-gradient(to right, #06B6D4 1px, transparent 1px), linear-gradient(to bottom, #06B6D4 1px, transparent 1px)',
              backgroundSize: '32px 32px',
            }}
          />
        )}

        {/* Image Frame */}
        <div
          className="relative transition-transform duration-100 ease-out flex items-center justify-center p-4"
          style={{
            transform: `scale(${zoom}) rotate(${rotation}deg)`,
            filter: `${invertColors ? 'invert(1) hue-rotate(180deg)' : ''} ${
              highContrast ? 'contrast(200%) brightness(90%)' : ''
            }`,
          }}
        >
          <img
            src={src}
            alt={alt}
            className="max-h-[480px] max-w-full object-contain rounded shadow-2xl border border-slate-800"
          />

          {/* Bounding box overlays */}
          {showRoi &&
            regionsOfInterest.map((roi, idx) => (
              <div
                key={idx}
                className="absolute border-2 border-rose-500 bg-rose-500/20 rounded pointer-events-none transition-all"
                style={{
                  left: `${roi.x}px`,
                  top: `${roi.y}px`,
                  width: `${roi.width}px`,
                  height: `${roi.height}px`,
                }}
              >
                <div className="absolute -top-5 left-0 px-1 py-0.2 bg-rose-600 text-white font-mono text-[9px] rounded font-bold whitespace-nowrap shadow">
                  {roi.label || `ANOMALY ${roi.confidence}%`}
                </div>
              </div>
            ))}
        </div>

        {/* Metadata Inspector Drawer */}
        {showInfo && (
          <div className="absolute top-3 right-3 z-20 w-80 rounded-xl border border-slate-700/80 bg-slate-900/95 p-4 backdrop-blur shadow-2xl text-xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="font-semibold text-white flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5 text-cyan-400" />
                Technical Metadata
              </span>
              <button
                onClick={() => setShowInfo(false)}
                className="text-slate-400 hover:text-white text-xs"
              >
                &times;
              </button>
            </div>

            {sha256 && (
              <div>
                <p className="text-[10px] font-mono text-slate-400 uppercase flex items-center gap-1">
                  <Hash className="h-3 w-3 text-cyan-400" /> SHA-256 Digest
                </p>
                <p className="mt-1 font-mono text-[10px] text-cyan-300 break-all bg-slate-950 p-1.5 rounded border border-slate-800 select-all">
                  {sha256}
                </p>
              </div>
            )}

            {metadata && (
              <div className="space-y-1.5 pt-1">
                {Object.entries(metadata).map(([key, val]) => (
                  <div key={key} className="flex justify-between items-center text-[11px]">
                    <span className="text-slate-400 capitalize">{key.replace(/_/g, ' ')}:</span>
                    <span className="font-mono text-slate-200">{String(val)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer info bar */}
      <div className="border-t border-slate-800 bg-slate-900/80 px-4 py-2 flex items-center justify-between text-[11px] text-slate-400">
        <div className="flex items-center gap-3">
          <span>Mode: Forensic Lightbox</span>
          <span>&bull;</span>
          <span>Invert: {invertColors ? 'ON' : 'OFF'}</span>
          <span>&bull;</span>
          <span>Grid: {showGrid ? '32px' : 'OFF'}</span>
        </div>
        <span className="text-slate-500 font-mono text-[10px]">Pixel-Exact Precision Engine</span>
      </div>
    </div>
  );
};
