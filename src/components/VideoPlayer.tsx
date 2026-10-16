import React, { useEffect, useState } from 'react';
import { Loader2, Film, AlertCircle, Cloud, HardDrive, ExternalLink } from 'lucide-react';
import { resolvePlayableVideoUrl, parseVideoSource, ParsedVideoSource } from '../lib/utils/videoUpload';

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
  const [parsedSource, setParsedSource] = useState<ParsedVideoSource | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    if (!videoUrl) {
      setPlayableSrc(null);
      setParsedSource(null);
      setLoading(false);
      setError(null);
      return;
    }

    const parsed = parseVideoSource(videoUrl);
    setParsedSource(parsed);

    // If it's a YouTube video, use its secure embedUrl directly
    if (parsed?.sourceType === 'youtube' && parsed.embedUrl) {
      setPlayableSrc(parsed.embedUrl);
      setLoading(false);
      setError(null);
      return;
    }

    // If it's a Google Drive video, use its preview embedUrl directly
    if (parsed?.sourceType === 'google-drive' && parsed.embedUrl) {
      setPlayableSrc(parsed.embedUrl);
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
        setError('Unable to load video stream. Please verify the URL or permissions.');
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [videoUrl]);

  if (!videoUrl) return null;

  const isYouTube = parsedSource?.sourceType === 'youtube';
  const isGoogleDrive = parsedSource?.sourceType === 'google-drive';
  const isIframeEmbed = isYouTube || (isGoogleDrive && Boolean(parsedSource?.embedUrl));

  return (
    <div className={`w-full flex flex-col items-center ${className}`}>
      {loading ? (
        <div className="w-full py-8 px-4 rounded-2xl bg-slate-950/80 border border-slate-800 flex flex-col items-center justify-center gap-2 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin text-[#00A191]" />
          <span className="text-xs font-medium">Loading video stream...</span>
        </div>
      ) : error ? (
        <div className="w-full py-4 px-4 rounded-2xl bg-rose-950/30 border border-rose-500/30 flex items-center justify-center gap-2 text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      ) : playableSrc ? (
        <div className="w-full flex flex-col items-center gap-1.5">
          <div className="relative w-full flex justify-center rounded-2xl overflow-hidden bg-slate-950/90 border border-slate-700/80 p-1.5 shadow-lg">
            {isIframeEmbed ? (
              <div className="w-full aspect-video min-h-[190px] max-h-80 rounded-xl overflow-hidden bg-black flex items-center justify-center">
                <iframe
                  src={playableSrc}
                  title={videoFileName || (isYouTube ? 'YouTube Video Player' : 'Google Drive Video Player')}
                  className="w-full h-full border-0 rounded-xl"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                  allowFullScreen
                />
              </div>
            ) : (
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
                Your browser does not support HTML5 video playback.
              </video>
            )}
          </div>

          {/* Badges for Cloud Provider and Filename */}
          <div className="flex flex-wrap items-center justify-center gap-2 mt-0.5">
            {parsedSource && (
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                parsedSource.sourceType === 'youtube'
                  ? 'bg-red-500/15 border-red-500/40 text-red-300'
                  : parsedSource.sourceType === 'google-cloud-storage'
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                  : parsedSource.sourceType === 'google-drive'
                  ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                  : parsedSource.sourceType === 'direct-url'
                  ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300'
                  : 'bg-slate-800 border-slate-700 text-slate-300'
              }`}>
                {parsedSource.sourceType === 'youtube' ? (
                  <svg className="w-3.5 h-3.5 text-red-500 fill-current" viewBox="0 0 24 24">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                  </svg>
                ) : parsedSource.sourceType === 'google-cloud-storage' ? (
                  <Cloud className="w-3 h-3 text-emerald-400" />
                ) : parsedSource.sourceType === 'google-drive' ? (
                  <HardDrive className="w-3 h-3 text-sky-400" />
                ) : (
                  <Film className="w-3 h-3 text-indigo-400" />
                )}
                <span>{parsedSource.displayBadge}</span>
                {parsedSource.sourceType === 'google-drive' && (
                  <a
                    href={parsedSource.streamUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-1 inline-flex items-center text-sky-300 hover:text-white"
                    title="Open original video in Google Drive in new tab"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
              </span>
            )}

            {showFileNameBadge && (videoFileName || parsedSource?.inferredFileName) && (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-[11px] text-slate-300 font-mono max-w-[280px] truncate">
                <Film className="w-3 h-3 text-[#00A191] shrink-0" />
                <span className="truncate">{videoFileName || parsedSource?.inferredFileName}</span>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};
