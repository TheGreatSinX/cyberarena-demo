/**
 * Enterprise Input & Upload Sanitization Utilities for CYBER|ARENA
 *
 * Defends against:
 * - Cross-Site Scripting (XSS) & HTML/Script tag injection
 * - Dangerous URI schemes (javascript:, vbscript:, data:text/html, etc.)
 * - CSV / Spreadsheet Formula Injection (=, +, -, @, \t, \r)
 * - Prototype pollution & dangerous object keys
 * - Malformed or polyglot file uploads (strict MIME, extension, and magic-byte signature verification)
 * - Path traversal & control character injection in filenames
 */

const CONTROL_CHARS_EXCEPT_NEWLINE_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const ALL_CONTROL_CHARS_REGEX = /[\u0000-\u001F\u007F]/g;

/**
 * Strips dangerous HTML/script payloads, event handlers, and control characters from plain text inputs.
 * Note: React already escapes text nodes by default, and this provides defense-in-depth before persistence
 * in Firestore, exports, or email templates.
 */
export function sanitizePlainText(
  input: string | null | undefined,
  options?: { maxLength?: number; allowNewlines?: boolean; trim?: boolean }
): string {
  if (!input) return '';
  const maxLength = options?.maxLength ?? 500;
  const allowNewlines = options?.allowNewlines ?? false;
  const shouldTrim = options?.trim ?? true;

  let cleaned = String(input).normalize('NFC');

  // Remove null bytes and control characters
  cleaned = cleaned.replace(
    allowNewlines ? CONTROL_CHARS_EXCEPT_NEWLINE_REGEX : ALL_CONTROL_CHARS_REGEX,
    ''
  );

  // Strip <script>, <iframe>, <object>, <embed>, <style>, <link>, <meta>, <svg>, <math> blocks and tags
  cleaned = cleaned
    .replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '')
    .replace(/<\s*(iframe|object|embed|style|svg|math|applet|base|link|meta)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*\/?\s*(script|iframe|object|embed|style|svg|math|applet|base|link|meta|form|input|button|textarea)[^>]*>/gi, '');

  // Strip any remaining HTML tags while keeping normal mathematical comparisons if spaced
  cleaned = cleaned.replace(/<\/?[a-zA-Z][^>]*>/g, '');

  // Neutralize inline event handler patterns or dangerous URI protocols typed into text fields
  cleaned = cleaned
    .replace(/\bon[a-z]{2,20}\s*=/gi, '')
    .replace(/(javascript|vbscript|data\s*:\s*text\/html)\s*:/gi, '');

  if (shouldTrim) {
    cleaned = cleaned.trim();
  }

  return cleaned.slice(0, maxLength);
}

/**
 * Live input sanitizer for controlled React inputs (preserves trailing space while typing).
 */
export function sanitizeLiveInput(
  input: string | null | undefined,
  maxLength = 250,
  allowNewlines = false
): string {
  return sanitizePlainText(input, {
    maxLength,
    allowNewlines,
    trim: false,
  });
}

/**
 * Strictly sanitizes a 6-digit numeric PIN or TOTP code.
 */
export function sanitizeNumericCode(input: string | null | undefined, maxLength = 6): string {
  if (!input) return '';
  return String(input).replace(/\D/g, '').slice(0, maxLength);
}

/**
 * Strictly sanitizes a participant or employee display name / full name.
 */
export function sanitizePersonName(input: string | null | undefined, maxLength = 80): string {
  const base = sanitizePlainText(input, { maxLength, allowNewlines: false, trim: true });
  // Remove angle brackets, backticks, and script punctuation
  return base.replace(/[<>"'`\\]/g, '').slice(0, maxLength);
}

/**
 * Strictly sanitizes and normalizes an email address.
 */
export function sanitizeEmail(input: string | null | undefined, maxLength = 160): string {
  if (!input) return '';
  const cleaned = String(input)
    .normalize('NFC')
    .replace(ALL_CONTROL_CHARS_REGEX, '')
    .replace(/[\s<>"'`();,\\]/g, '')
    .trim()
    .toLowerCase();
  return cleaned.slice(0, maxLength);
}

/**
 * Validates that a sanitized email matches standard RFC email format.
 */
export function isValidEmailAddress(email: string): boolean {
  if (!email || email.length < 3 || email.length > 160) return false;
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email);
}

/**
 * Sanitizes URL query parameters (such as gameId, questionnaireId, inviteToken).
 * Allows only safe alphanumeric, hyphen, and underscore characters.
 */
export function sanitizeSafeIdentifier(input: string | null | undefined, maxLength = 128): string {
  if (!input) return '';
  return String(input)
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, maxLength);
}

/**
 * Sanitizes a date string in YYYY-MM-DD format.
 */
export function sanitizeIsoDate(input: string | null | undefined): string {
  if (!input) return '';
  const cleaned = String(input).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return cleaned;
  }
  return '';
}

/**
 * Sanitizes a filename to prevent path traversal, null bytes, and special shell/HTML characters.
 */
export function sanitizeFileName(fileName: string | null | undefined, maxLength = 120): string {
  if (!fileName) return 'file';
  const baseName = String(fileName)
    .replace(/\\/g, '/')
    .split('/')
    .pop() || 'file';

  const cleaned = baseName
    .normalize('NFC')
    .replace(ALL_CONTROL_CHARS_REGEX, '')
    .replace(/[^a-zA-Z0-9._ -]/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+/, '')
    .trim();

  return (cleaned || 'file').slice(0, maxLength);
}

/**
 * Escapes HTML special characters for safe interpolation into HTML templates (e.g., email templates).
 */
export function escapeHtmlEntities(input: string | null | undefined): string {
  if (!input) return '';
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Sanitizes custom HTML email templates by stripping executable scripts, event handlers,
 * javascript:/vbscript:/data:text/html URIs, and dangerous embedded objects while preserving safe email table layout.
 */
export function sanitizeEmailHtml(rawHtml: string | null | undefined): string {
  if (!rawHtml) return '';
  let html = String(rawHtml).replace(CONTROL_CHARS_EXCEPT_NEWLINE_REGEX, '');

  // Remove executable / dangerous containers
  html = html
    .replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '')
    .replace(/<\s*(iframe|frame|frameset|object|embed|applet|form|input|button|textarea|select|base|meta)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*\/?\s*(script|iframe|frame|frameset|object|embed|applet|form|input|button|textarea|select|base|meta)[^>]*>/gi, '');

  // Strip all inline on* event handlers (e.g. onclick=, onerror=, onload=)
  html = html.replace(/\s+on[a-z0-9_-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  // Neutralize javascript:, vbscript:, and data:text/html in href/src/background/style attributes
  html = html.replace(
    /((?:href|src|background|action|formaction)\s*=\s*["']?\s*)(?:javascript|vbscript|data\s*:\s*text\/html)\s*:[^"'\s>]*/gi,
    '$1#'
  );
  html = html.replace(/expression\s*\([^)]*\)/gi, '');
  html = html.replace(/url\s*\(\s*["']?\s*(?:javascript|vbscript|data\s*:\s*text\/html)\s*:[^)]*\)/gi, 'none');

  return html.slice(0, 150_000);
}

/**
 * Sanitizes a URL or Data URL for safe use in img/href attributes.
 */
export function sanitizeSafeUrl(url: string | null | undefined): string {
  if (!url) return '';
  const trimmed = String(url).trim();
  if (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('data:image/jpeg;base64,') ||
    trimmed.startsWith('data:image/png;base64,') ||
    trimmed.startsWith('data:image/webp;base64,') ||
    trimmed.startsWith('firestore-media://')
  ) {
    return trimmed.replace(/["'<>\\]/g, '');
  }
  return '';
}

/**
 * Prevents CSV / Spreadsheet Formula Injection (DDE / Excel / Google Sheets execution)
 * by prefixing cells starting with =, +, -, @, Tab, or CR with a single quote, and escaping quotes.
 */
export function sanitizeCsvCell(val: unknown): string {
  let str = String(val ?? '')
    .replace(CONTROL_CHARS_EXCEPT_NEWLINE_REGEX, '')
    .trim();

  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Reads the first N bytes of a File to verify its cryptographic / binary magic number signature.
 */
async function readFileHeaderBytes(file: File, numBytes = 16): Promise<Uint8Array> {
  const slice = file.slice(0, numBytes);
  const buffer = await slice.arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Verifies that an uploaded image file is a genuine raster image (JPEG, PNG, GIF, or WEBP)
 * by checking file size, extension, MIME type (explicitly blocking SVG/HTML), and magic-byte header.
 */
export async function validateSafeImageUpload(
  file: File,
  maxSizeBytes = 10 * 1024 * 1024 // 10 MB max raw upload before canvas re-encoding
): Promise<{ safeFileName: string }> {
  if (!file) {
    throw new Error('No image file selected.');
  }

  if (file.size <= 0) {
    throw new Error('The selected image file is empty.');
  }

  if (file.size > maxSizeBytes) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    const maxMb = Math.round(maxSizeBytes / (1024 * 1024));
    throw new Error(`Image file is too large (${sizeMb} MB). Maximum allowed size is ${maxMb} MB.`);
  }

  const allowedMimeTypes = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']);
  const lowerName = file.name.toLowerCase();
  const hasAllowedExt = /\.(jpe?g|png|webp|gif)$/i.test(lowerName);

  // Explicitly block SVG and HTML files which can embed executable <script> tags
  if (
    file.type.includes('svg') ||
    file.type.includes('html') ||
    file.type.includes('xml') ||
    lowerName.endsWith('.svg') ||
    lowerName.endsWith('.html') ||
    lowerName.endsWith('.htm')
  ) {
    throw new Error('SVG and HTML files are blocked for security reasons. Please upload a PNG, JPG, WEBP, or GIF image.');
  }

  if (!hasAllowedExt || (file.type && !allowedMimeTypes.has(file.type.toLowerCase()))) {
    throw new Error('Unsupported image format. Please upload a valid PNG, JPG, WEBP, or GIF file.');
  }

  // Inspect binary magic bytes to prevent renamed scripts/executables
  const bytes = await readFileHeaderBytes(file, 16);
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng =
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  const isGif =
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61;
  const isWebp =
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50;

  if (!isJpeg && !isPng && !isGif && !isWebp) {
    throw new Error('Security check failed: File header does not match a valid PNG, JPG, WEBP, or GIF image.');
  }

  return {
    safeFileName: sanitizeFileName(file.name),
  };
}

/**
 * Verifies that an uploaded .mp4 file has a valid ISO Base Media File Format ('ftyp' / 'moov' / 'mdat')
 * magic-byte box header and safe filename.
 */
export async function validateSafeMp4Header(file: File): Promise<{ safeFileName: string }> {
  const bytes = await readFileHeaderBytes(file, 16);
  if (bytes.length < 8) {
    throw new Error('Security check failed: .mp4 file is truncated or corrupted.');
  }

  // In ISO Base Media / MP4 files, bytes 4..7 represent the atom/box type (typically 'ftyp', 'moov', 'mdat', 'wide', 'free')
  const boxType = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
  const validMp4Boxes = new Set(['ftyp', 'moov', 'mdat', 'wide', 'free', 'skip', 'pnot']);

  if (!validMp4Boxes.has(boxType)) {
    throw new Error('Security check failed: File signature is not a valid MP4 video container.');
  }

  return {
    safeFileName: sanitizeFileName(file.name),
  };
}
