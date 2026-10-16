import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { sanitizeSafeIdentifier } from './sanitize';

const FIRESTORE_MEDIA_PREFIX = 'firestore-media://';

// In-memory cache mapping mediaId or video URL -> resolved playable string
const resolvedVideoBlobCache = new Map<string, string>();
const inflightResolutions = new Map<string, Promise<string>>();

export interface UploadedVideoResult {
  videoUrl: string;
  videoFileName: string;
  sizeBytes: number;
  durationSeconds: number;
}

/**
 * File-based MP4 upload has been disabled to preserve Google Cloud Firestore daily write quotas.
 * Users must provide YouTube links or public cloud video stream URLs.
 */
export async function validateMp4File(_file: File): Promise<{ durationSeconds: number; safeFileName: string }> {
  throw new Error('Local .mp4 file uploads are disabled to preserve Firebase quotas. Please use a YouTube link or public video URL.');
}

export async function processUploadedMp4Video(
  _file: File,
  _onProgress?: (percent: number) => void
): Promise<UploadedVideoResult> {
  throw new Error('Local .mp4 file uploads are disabled to preserve Firebase quotas. Please use a YouTube link or public video URL.');
}

export type VideoSourceType =
  | 'youtube'
  | 'google-drive'
  | 'google-cloud-storage'
  | 'direct-url'
  | 'firestore-media';

export interface ParsedVideoSource {
  sourceType: VideoSourceType;
  rawUrl: string;
  streamUrl: string;
  embedUrl?: string | null;
  displayBadge: string;
  inferredFileName: string;
  videoId?: string;
  isEmbedBlocked?: boolean;
}

export interface ExtractedYouTubeDetails {
  videoId: string;
  startTime?: number;
  canonicalUrl: string;
  embedUrl: string;
}

/**
 * Robust YouTube details extractor that handles:
 * - Direct watch URLs (youtube.com/watch?v=...)
 * - Short links (youtu.be/...)
 * - Embed URLs (youtube.com/embed/... or youtube-nocookie.com/embed/...)
 * - Shorts (youtube.com/shorts/...)
 * - Live streams (youtube.com/live/...)
 * - Mobile web links (m.youtube.com/watch?v=...)
 * - IFRAME embed snippets (<iframe ... src="https://www.youtube.com/embed/..." ... allowfullscreen></iframe>)
 * - Plain 11-character video IDs
 * - Timestamps (?t=30s, ?t=1m20s, ?start=90)
 */
export function extractYouTubeVideoDetails(input?: string | null): ExtractedYouTubeDetails | null {
  if (!input) return null;
  let text = String(input).trim();
  if (!text) return null;

  // 1. If an iframe snippet was pasted (e.g. from YouTube's "Share -> Embed" modal)
  const iframeSrcMatch = text.match(/src=["']([^"']+)["']/i);
  if (iframeSrcMatch) {
    text = iframeSrcMatch[1];
  }

  // Strip wrapping quotes, angles, or markdown characters
  let clean = text.replace(/^['"<]+|['">]+$/g, '').trim();

  // If bare 11-char ID was entered
  if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) {
    const videoId = clean;
    return {
      videoId,
      canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1&enablejsapi=1`,
    };
  }

  if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
    clean = 'https://' + clean;
  }

  // Verify domain belongs to YouTube
  const isYouTubeDomain =
    clean.includes('youtube.com') ||
    clean.includes('youtu.be') ||
    clean.includes('youtube-nocookie.com');

  if (!isYouTubeDomain) {
    return null;
  }

  let videoId: string | null = null;

  // Pattern 1: youtu.be/VIDEO_ID
  const shortMatch = clean.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/i);
  if (shortMatch) {
    videoId = shortMatch[1];
  }

  // Pattern 2: youtube.com/watch?v=VIDEO_ID or &v=VIDEO_ID
  if (!videoId) {
    const watchMatch = clean.match(/[?&]v=([a-zA-Z0-9_-]{11})/i);
    if (watchMatch) {
      videoId = watchMatch[1];
    }
  }

  // Pattern 3: /embed/VIDEO_ID
  if (!videoId) {
    const embedMatch = clean.match(/\/embed\/([a-zA-Z0-9_-]{11})/i);
    if (embedMatch) {
      videoId = embedMatch[1];
    }
  }

  // Pattern 4: /shorts/VIDEO_ID
  if (!videoId) {
    const shortsMatch = clean.match(/\/shorts\/([a-zA-Z0-9_-]{11})/i);
    if (shortsMatch) {
      videoId = shortsMatch[1];
    }
  }

  // Pattern 5: /live/VIDEO_ID
  if (!videoId) {
    const liveMatch = clean.match(/\/live\/([a-zA-Z0-9_-]{11})/i);
    if (liveMatch) {
      videoId = liveMatch[1];
    }
  }

  // Pattern 6: /(?:v|e)/VIDEO_ID
  if (!videoId) {
    const veMatch = clean.match(/\/(?:v|e)\/([a-zA-Z0-9_-]{11})/i);
    if (veMatch) {
      videoId = veMatch[1];
    }
  }

  if (!videoId) return null;

  // Extract start time if provided (e.g., ?t=45, ?t=1m15s, ?start=75)
  let startTime: number | undefined;
  const timeMatch = clean.match(/[?&](?:t|start)=([0-9mhjs]+)/i);
  if (timeMatch) {
    const rawTime = timeMatch[1].toLowerCase();
    if (/^\d+$/.test(rawTime)) {
      startTime = parseInt(rawTime, 10);
    } else {
      let totalSeconds = 0;
      const hours = rawTime.match(/(\d+)h/);
      const minutes = rawTime.match(/(\d+)m/);
      const seconds = rawTime.match(/(\d+)s/);
      if (hours) totalSeconds += parseInt(hours[1], 10) * 3600;
      if (minutes) totalSeconds += parseInt(minutes[1], 10) * 60;
      if (seconds) totalSeconds += parseInt(seconds[1], 10);
      if (totalSeconds > 0) startTime = totalSeconds;
    }
  }

  const startParam = startTime ? `&start=${startTime}` : '';
  const timeQuery = startTime ? `&t=${startTime}` : '';

  return {
    videoId,
    startTime,
    canonicalUrl: `https://www.youtube.com/watch?v=${videoId}${timeQuery}`,
    embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1&enablejsapi=1${startParam}`,
  };
}

/**
 * Parses any video URL to identify its origin (YouTube, Google Cloud Storage, Google Drive,
 * generic HTTPS streaming URL, or Firestore chunked media).
 */
export function parseVideoSource(rawUrl?: string | null): ParsedVideoSource | null {
  if (!rawUrl) return null;
  const trimmed = String(rawUrl).trim();
  if (!trimmed) return null;

  // 1. YouTube Video (any valid format or embed code)
  const ytDetails = extractYouTubeVideoDetails(trimmed);
  if (ytDetails) {
    return {
      sourceType: 'youtube',
      rawUrl: ytDetails.canonicalUrl,
      streamUrl: ytDetails.embedUrl,
      embedUrl: ytDetails.embedUrl,
      displayBadge: 'YouTube',
      inferredFileName: `YouTube (${ytDetails.videoId})`,
      videoId: ytDetails.videoId,
    };
  }

  // 2. Google Drive share link (e.g. https://drive.google.com/file/d/FILE_ID/view?usp=sharing)
  // NOTE: Google Drive enforces "frame-ancestors https://drive.google.com" CSP headers,
  // which blocks iframe embedding from external origins.
  if (trimmed.includes('drive.google.com')) {
    const fileIdMatch =
      trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/i) ||
      trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/i) ||
      trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/i);

    const fileId = fileIdMatch ? fileIdMatch[1] : '';
    return {
      sourceType: 'google-drive',
      rawUrl: trimmed,
      streamUrl: `https://drive.google.com/file/d/${fileId || ''}/view`,
      embedUrl: null, // intentionally null: Google Drive CSP blocks framing!
      isEmbedBlocked: true,
      displayBadge: 'Google Drive',
      inferredFileName: fileId ? `Drive Video (${fileId.slice(0, 8)}...)` : 'Drive Video',
    };
  }

  // 3. Google Cloud Storage URL (e.g. https://storage.googleapis.com/<bucket>/<file.mp4>)
  if (
    trimmed.includes('storage.googleapis.com') ||
    trimmed.includes('storage.cloud.google.com')
  ) {
    const cleanUrl = trimmed.split('?')[0];
    const fileName = cleanUrl.split('/').pop() || 'Cloud-Video.mp4';
    return {
      sourceType: 'google-cloud-storage',
      rawUrl: trimmed,
      streamUrl: trimmed,
      embedUrl: null,
      displayBadge: 'Google Cloud Storage',
      inferredFileName: decodeURIComponent(fileName),
    };
  }

  // 4. Legacy Firestore Chunked Media (for existing assets)
  if (trimmed.startsWith(FIRESTORE_MEDIA_PREFIX)) {
    return {
      sourceType: 'firestore-media',
      rawUrl: trimmed,
      streamUrl: trimmed,
      embedUrl: null,
      displayBadge: 'Database Media Asset',
      inferredFileName: 'Uploaded Asset.mp4',
    };
  }

  // 5. Generic Direct HTTPS / HTTP video (S3, Cloudflare R2, CDN, raw MP4 link)
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    const cleanUrl = trimmed.split('?')[0];
    const fileName = cleanUrl.split('/').pop() || 'Video-Stream.mp4';
    return {
      sourceType: 'direct-url',
      rawUrl: trimmed,
      streamUrl: trimmed,
      embedUrl: null,
      displayBadge: 'Cloud Video Stream',
      inferredFileName: decodeURIComponent(fileName),
    };
  }

  return null;
}

/**
 * Resolves a stored `videoUrl` (YouTube, Google Cloud Storage, Google Drive,
 * `firestore-media://{mediaId}`, or `https://...`) into a playable URL.
 */
export async function resolvePlayableVideoUrl(videoUrl?: string | null): Promise<string | null> {
  if (!videoUrl) return null;

  const parsed = parseVideoSource(videoUrl);
  if (parsed?.sourceType === 'youtube') {
    return parsed.embedUrl || parsed.streamUrl;
  }
  if (parsed?.sourceType === 'google-drive') {
    return parsed.streamUrl;
  }

  const cached = resolvedVideoBlobCache.get(videoUrl);
  if (cached) return cached;

  if (!videoUrl.startsWith(FIRESTORE_MEDIA_PREFIX)) {
    if (videoUrl.startsWith('https://') || videoUrl.startsWith('http://')) {
      return videoUrl;
    }
    return null;
  }

  const inflight = inflightResolutions.get(videoUrl);
  if (inflight) return inflight;

  const mediaId = sanitizeSafeIdentifier(videoUrl.slice(FIRESTORE_MEDIA_PREFIX.length).trim());
  if (!mediaId) return null;

  const promise = (async () => {
    const chunksQuery = query(
      collection(db, `mediaAssets/${mediaId}/chunks`),
      orderBy('index', 'asc')
    );
    const snap = await getDocs(chunksQuery);
    if (snap.empty) {
      throw new Error('Video chunks not found in database.');
    }

    const combinedBase64 = snap.docs.map((d) => (d.data().data as string) || '').join('');
    const binaryString = atob(combinedBase64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'video/mp4' });
    const objectUrl = URL.createObjectURL(blob);
    resolvedVideoBlobCache.set(videoUrl, objectUrl);
    inflightResolutions.delete(videoUrl);
    return objectUrl;
  })();

  inflightResolutions.set(videoUrl, promise);
  try {
    return await promise;
  } catch (err) {
    inflightResolutions.delete(videoUrl);
    throw err;
  }
}

/**
 * Deletes a stored Firestore chunked video asset if needed.
 */
export async function deleteUploadedMp4Video(videoUrl?: string | null): Promise<void> {
  if (!videoUrl || !videoUrl.startsWith(FIRESTORE_MEDIA_PREFIX)) return;
  const mediaId = sanitizeSafeIdentifier(videoUrl.slice(FIRESTORE_MEDIA_PREFIX.length).trim());
  if (!mediaId) return;

  try {
    const cached = resolvedVideoBlobCache.get(videoUrl);
    if (cached) {
      URL.revokeObjectURL(cached);
      resolvedVideoBlobCache.delete(videoUrl);
    }
    const chunksSnap = await getDocs(collection(db, `mediaAssets/${mediaId}/chunks`));
    for (const cDoc of chunksSnap.docs) {
      await deleteDoc(cDoc.ref);
    }
    const metaRef = doc(db, 'mediaAssets', mediaId);
    const metaSnap = await getDoc(metaRef);
    if (metaSnap.exists()) {
      await deleteDoc(metaRef);
    }
  } catch (err) {
    console.warn('Could not clean up video chunks:', err);
  }
}
