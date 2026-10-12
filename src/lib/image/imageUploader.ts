import { processUploadedQuestionImage as sanitizeAndProcessImage } from '../utils/imageUpload';

/**
 * Compresses, validates magic bytes, and converts an uploaded image File into a sanitized JPEG Data URL
 * suitable for storing in Firestore question documents without hitting document size limits.
 */
export async function processUploadedQuestionImage(
  file: File,
  maxWidth = 880,
  maxHeight = 560,
  quality = 0.8
): Promise<string> {
  return sanitizeAndProcessImage(file, maxWidth, maxHeight, quality);
}
