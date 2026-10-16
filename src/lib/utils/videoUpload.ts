import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  writeBatch,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { validateSafeMp4Header, sanitizeSafeIdentifier } from './sanitize';

const FIRESTORE_MEDIA_PREFIX = 'firestore-media://';
// 600 KB base64 per chunk keeps each Firestore document well under the 1 MiB (1,048,576 bytes) limit
const CHUNK_SIZE_CHARS = 600_000;
const MAX_VIDEO_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB max .mp4 upload size

// In-memory cache mapping mediaId orfirestore-media:// URL -> Blob Object URL for instant playback
const resolvedVideoBlobCache = new Map<string, string>();
const inflightResolutions = new Map<string, Promise<string>>();

export interface UploadedVideoResult {
  videoUrl: string;
  videoFileName: string;
  sizeBytes: number;
  durationSeconds: number;
}

/**
 * Validates that a File is a genuine .mp4 video (including binary ISO BMFF magic-byte signature)
 * and extracts its duration using an HTML5 <video> element.
 */
export async function validateMp4File(file: File): Promise<{ durationSeconds: number; safeFileName: string }> {
  const fileNameLower = file.name.toLowerCase();
  const isMp4Mime = file.type === 'video/mp4' || file.type === 'application/mp4' || file.type === '';
  const isMp4Ext = fileNameLower.endsWith('.mp4');

  if (!isMp4Ext || (!isMp4Mime && !file.type.includes('mp4'))) {
    throw new Error('Invalid format. Please upload a video file in .mp4 format.');
  }

  if (file.size <= 0) {
    throw new Error('The selected .mp4 file is empty.');
  }

  if (file.size > MAX_VIDEO_SIZE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    throw new Error(`Video file is too large (${sizeMb} MB). Maximum allowed size is 25 MB.`);
  }

  const { safeFileName } = await validateSafeMp4Header(file);

  return new Promise((resolve, reject) => {
    const tempUrl = URL.createObjectURL(file);
    const videoEl = document.createElement('video');
    videoEl.preload = 'metadata';

    const cleanup = () => {
      videoEl.removeAttribute('src');
      videoEl.load();
      URL.revokeObjectURL(tempUrl);
    };

    const timeoutId = setTimeout(() => {
      cleanup();
      resolve({ durationSeconds: 0, safeFileName });
    }, 6000);

    videoEl.onloadedmetadata = () => {
      clearTimeout(timeoutId);
      const duration = Number.isFinite(videoEl.duration) ? Math.round(videoEl.duration) : 0;
      cleanup();
      resolve({ durationSeconds: duration, safeFileName });
    };

    videoEl.onerror = () => {
      clearTimeout(timeoutId);
      cleanup();
      reject(new Error('Unable to decode .mp4 file. Please ensure the file is a valid MP4 video.'));
    };

    videoEl.src = tempUrl;
  });
}

/**
 * Reads a File as a base64 string (without the data:video/mp4;base64, prefix).
 */
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read .mp4 video file.'));
    reader.onload = () => {
      const result = reader.result as string;
      if (!result) {
        reject(new Error('Empty video file data.'));
        return;
      }
      const commaIndex = result.indexOf(',');
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Converts a raw base64 string back into a Blob.
 */
function base64ToMp4Blob(base64Data: string): Blob {
  const binaryString = atob(base64Data);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], { type: 'video/mp4' });
}

/**
 * Processes an .mp4 video file for instant local preview without writing binary chunks to Firestore.
 * This completely prevents exhausting Google Cloud Firestore daily write quotas.
 * Administrators are recommended to use Google Cloud Storage or Google Drive public URLs
 * for permanent, zero-quota cross-device playback.
 */
export async function processUploadedMp4Video(
  file: File,
  onProgress?: (percent: number) => void
): Promise<UploadedVideoResult> {
  onProgress?.(25);
  const { durationSeconds, safeFileName } = await validateMp4File(file);
  onProgress?.(70);

  // Generate an in-memory Blob Object URL for immediate preview and testing
  const localBlobUrl = URL.createObjectURL(new Blob([file], { type: 'video/mp4' }));
  resolvedVideoBlobCache.set(localBlobUrl, localBlobUrl);

  onProgress?.(100);
  return {
    videoUrl: localBlobUrl,
    videoFileName: safeFileName,
    sizeBytes: file.size,
    durationSeconds,
  };
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
}

/**
 * Extracts a YouTube Video ID and optional start time in seconds from various YouTube URL formats
 * (standard watch, youtu.be short links, embed URLs, Shorts, live streams, and music links).
 */
export function extractYouTubeVideoDetails(url?: string | null): { videoId: string; startTime?: number } | null {
  if (!url) return null;
  const trimmed = url.trim();

  // Check if domain is youtube or youtu.be
  if (
    !trimmed.includes('youtube.com') &&
    !trimmed.includes('youtu.be') &&
    !trimmed.includes('youtube-nocookie.com')
  ) {
    return null;
  }

  let videoId: string | null = null;

  // 1. youtu.be/VIDEO_ID
  const shortMatch = trimmed.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/i);
  if (shortMatch) {
    videoId = shortMatch[1];
  }

  // 2. youtube.com/watch?v=VIDEO_ID
  if (!videoId) {
    const watchMatch = trimmed.match(/[?&]v=([a-zA-Z0-9_-]{11})/i);
    if (watchMatch) {
      videoId = watchMatch[1];
    }
  }

  // 3. youtube.com/embed/VIDEO_ID or youtube-nocookie.com/embed/VIDEO_ID
  if (!videoId) {
    const embedMatch = trimmed.match(/\/embed\/([a-zA-Z0-9_-]{11})/i);
    if (embedMatch) {
      videoId = embedMatch[1];
    }
  }

  // 4. youtube.com/shorts/VIDEO_ID
  if (!videoId) {
    const shortsMatch = trimmed.match(/\/shorts\/([a-zA-Z0-9_-]{11})/i);
    if (shortsMatch) {
      videoId = shortsMatch[1];
    }
  }

  // 5. youtube.com/live/VIDEO_ID
  if (!videoId) {
    const liveMatch = trimmed.match(/\/live\/([a-zA-Z0-9_-]{11})/i);
    if (liveMatch) {
      videoId = liveMatch[1];
    }
  }

  if (!videoId) return null;

  // Extract start time if present (e.g. ?t=90, ?t=1m30s, ?start=90)
  let startTime: number | undefined;
  const timeMatch = trimmed.match(/[?&](?:t|start)=([0-9mhjs]+)/i);
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

  return { videoId, startTime };
}

/**
 * Parses any video URL to identify its origin (YouTube, Google Cloud Storage, Google Drive,
 * generic HTTPS streaming URL, or Firestore chunked media), providing embed and stream endpoints.
 */
export function parseVideoSource(rawUrl?: string | null): ParsedVideoSource | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  // YouTube Video (e.g. https://www.youtube.com/watch?v=..., https://youtu.be/..., https://youtube.com/shorts/...)
  const ytDetails = extractYouTubeVideoDetails(trimmed);
  if (ytDetails) {
    const { videoId, startTime } = ytDetails;
    const timeParam = startTime ? `&start=${startTime}` : '';
    const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1&enablejsapi=1${timeParam}`;
    return {
      sourceType: 'youtube',
      rawUrl: trimmed,
      streamUrl: embedUrl,
      embedUrl,
      displayBadge: 'YouTube',
      inferredFileName: `YouTube (${videoId})`,
      videoId,
    };
  }

  // Google Drive share link (e.g. https://drive.google.com/file/d/FILE_ID/view?usp=sharing)
  if (trimmed.includes('drive.google.com')) {
    const fileIdMatch =
      trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/i) ||
      trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/i) ||
      trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/i);

    const fileId = fileIdMatch ? fileIdMatch[1] : '';
    if (fileId) {
      return {
        sourceType: 'google-drive',
        rawUrl: trimmed,
        streamUrl: `https://drive.google.com/uc?export=download&id=${fileId}`,
        embedUrl: `https://drive.google.com/file/d/${fileId}/preview`,
        displayBadge: 'Google Drive',
        inferredFileName: `Drive Video (${fileId.slice(0, 8)}...).mp4`,
      };
    }
  }

  // Google Cloud Storage URL (e.g. https://storage.googleapis.com/<bucket>/<file.mp4>)
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

  // Legacy Firestore Chunked Media
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

  // Generic Direct HTTPS / HTTP video (S3, Cloudflare R2, CDN, raw MP4 link)
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    const cleanUrl = trimmed.split('?')[0];
    const fileName = cleanUrl.split('/').pop() || 'Video-Stream.mp4';
    return {
      sourceType: 'direct-url',
      rawUrl: trimmed,
      streamUrl: trimmed,
      embedUrl: null,
      displayBadge: 'External Cloud Video',
      inferredFileName: decodeURIComponent(fileName),
    };
  }

  return null;
}

/**
 * Resolves a stored `videoUrl` (YouTube, Google Cloud Storage, Google Drive,
 * `firestore-media://{mediaId}`, `data:video/mp4;base64,...`, or `https://...`)
 * into a playable URL.
 */
export async function resolvePlayableVideoUrl(videoUrl?: string | null): Promise<string | null> {
  if (!videoUrl) return null;

  const parsed = parseVideoSource(videoUrl);
  if (parsed?.sourceType === 'youtube') {
    return parsed.embedUrl || parsed.streamUrl;
  }
  if (parsed?.sourceType === 'google-drive') {
    return parsed.embedUrl || parsed.streamUrl;
  }

  const cached = resolvedVideoBlobCache.get(videoUrl);
  if (cached) return cached;

  if (!videoUrl.startsWith(FIRESTORE_MEDIA_PREFIX)) {
    // If it's a data:video/mp4 URL, convert to a Blob Object URL for reliable seeking/playback
    if (videoUrl.startsWith('data:video/mp4;base64,')) {
      const commaIdx = videoUrl.indexOf(',');
      if (commaIdx >= 0) {
        try {
          const blob = base64ToMp4Blob(videoUrl.slice(commaIdx + 1));
          const objUrl = URL.createObjectURL(blob);
          resolvedVideoBlobCache.set(videoUrl, objUrl);
          return objUrl;
        } catch {
          return null;
        }
      }
    }
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
    const blob = base64ToMp4Blob(combinedBase64);
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
