import React, { useEffect, useState } from 'react';
import { Loader2, Film, AlertCircle } from 'lucide-react';
import { resolvePlayableVideoUrl } from '../lib/utils/videoUpload';

interface VideoPlayerProps {
  videoUrl?: string | null;
  videoFileName?: string | null;
  className?: string;
  maxHeightClass?: string;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  showFileNameBadge?: boolean;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  videoUrl,
  videoFileName,
  className = '',
  maxHeightClass = 'max-h-56 sm:max-h-72',
  autoPlay = false,
  muted = false,
  loop = false,
  showFileNameBadge = false,
}) => {
  const [playableSrc, setPlayableSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    if (!videoUrl) {
      setPlayableSrc(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    resolvePlayableVideoUrl(videoUrl)
      .then((resolved) => {
        if (!isMounted) return;
        setPlayableSrc(resolved);
        setLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error('Failed to load video:', err);
        setError('Unable to load .mp4 video stream.');
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [videoUrl]);

  if (!videoUrl) return null;

  return (
    <div className={`w-full flex flex-col items-center ${className}`}>
      {loading ? (
        <div className="w-full py-8 px-4 rounded-2xl bg-slate-950/80 border border-slate-800 flex flex-col items-center justify-center gap-2 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin text-[#00A191]" />
          <span className="text-xs font-medium">Loading .mp4 video...</span>
        </div>
      ) : error ? (
        <div className="w-full py-4 px-4 rounded-2xl bg-rose-950/30 border border-rose-500/30 flex items-center justify-center gap-2 text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      ) : playableSrc ? (
        <div className="w-full flex flex-col items-center gap-1.5">
          <div className="relative w-full flex justify-center rounded-2xl overflow-hidden bg-slate-950/90 border border-slate-700/80 p-1.5 shadow-lg">
            <video
              key={playableSrc}
              src={playableSrc}
              controls
              playsInline
              preload="metadata"
              autoPlay={autoPlay}
              muted={muted}
              loop={loop}
              className={`${maxHeightClass} w-auto max-w-full rounded-xl object-contain bg-black`}
            >
              Your browser does not support HTML5 MP4 video playback.
            </video>
          </div>
          {showFileNameBadge && videoFileName && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-[11px] text-slate-300 font-mono max-w-full truncate">
              <Film className="w-3 h-3 text-[#00A191] shrink-0" />
              <span className="truncate">{videoFileName}</span>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};
