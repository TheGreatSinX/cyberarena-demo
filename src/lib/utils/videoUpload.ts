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
 * Uploads an .mp4 video file into chunked Firestore documents (`mediaAssets/{mediaId}/chunks/{idx}`)
 * so it works reliably across all sessions and participants without exceeding Firestore's 1 MiB per-doc limit.
 */
export async function processUploadedMp4Video(
  file: File,
  onProgress?: (percent: number) => void
): Promise<UploadedVideoResult> {
  onProgress?.(5);
  const { durationSeconds, safeFileName } = await validateMp4File(file);
  onProgress?.(12);

  const base64Data = await readFileAsBase64(file);
  onProgress?.(25);

  const totalChars = base64Data.length;
  const chunks: string[] = [];
  for (let offset = 0; offset < totalChars; offset += CHUNK_SIZE_CHARS) {
    chunks.push(base64Data.slice(offset, offset + CHUNK_SIZE_CHARS));
  }

  const mediaRef = doc(collection(db, 'mediaAssets'));
  const mediaId = mediaRef.id;
  const nowIso = new Date().toISOString();

  // Save metadata document first with sanitized filename
  await setDoc(mediaRef, {
    fileName: safeFileName,
    mimeType: 'video/mp4',
    sizeBytes: file.size,
    durationSeconds,
    chunkCount: chunks.length,
    createdAt: nowIso,
  });

  // Upload chunks in batches of 4 to stay well within Firestore batch payload limits and report smooth progress
  const BATCH_GROUP_SIZE = 4;
  for (let i = 0; i < chunks.length; i += BATCH_GROUP_SIZE) {
    const batch = writeBatch(db);
    const slice = chunks.slice(i, i + BATCH_GROUP_SIZE);
    slice.forEach((chunkStr, idx) => {
      const chunkIndex = i + idx;
      const chunkDocRef = doc(db, `mediaAssets/${mediaId}/chunks`, `chunk_${String(chunkIndex).padStart(4, '0')}`);
      batch.set(chunkDocRef, {
        index: chunkIndex,
        data: chunkStr,
      });
    });
    await batch.commit();

    const completedChunks = Math.min(chunks.length, i + slice.length);
    const pct = 25 + Math.round((completedChunks / chunks.length) * 75);
    onProgress?.(pct);
  }

  const videoUrl = `${FIRESTORE_MEDIA_PREFIX}${mediaId}`;

  // Cache local Blob URL immediately so preview playback is instantaneous
  const localBlobUrl = URL.createObjectURL(new Blob([file], { type: 'video/mp4' }));
  resolvedVideoBlobCache.set(videoUrl, localBlobUrl);

  onProgress?.(100);
  return {
    videoUrl,
    videoFileName: safeFileName,
    sizeBytes: file.size,
    durationSeconds,
  };
}

/**
 * Resolves a stored `videoUrl` (either `firestore-media://{mediaId}`, `data:video/mp4;base64,...`, or `https://...`)
 * into a playable HTML5 `<video>` URL.
 */
export async function resolvePlayableVideoUrl(videoUrl?: string | null): Promise<string | null> {
  if (!videoUrl) return null;

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
