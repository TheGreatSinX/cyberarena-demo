import { auth } from './config';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map((provider) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function getUserFriendlyErrorMessage(
  error: unknown,
  fallbackMessage = 'An unexpected database error occurred.'
): { message: string; isQuotaError: boolean; quotaUpgradeUrl?: string } {
  const rawMsg = error instanceof Error ? error.message : String(error || '');
  const rawMsgLower = rawMsg.toLowerCase();

  // Detect quota exhaustion (case-insensitive for code=resource-exhausted, quota limit exceeded, etc.)
  if (
    rawMsgLower.includes('resource_exhausted') ||
    rawMsgLower.includes('resource-exhausted') ||
    rawMsgLower.includes('quota exceeded') ||
    rawMsgLower.includes('quota limit exceeded') ||
    rawMsgLower.includes('free daily write units') ||
    rawMsgLower.includes('daily write units') ||
    rawMsgLower.includes('quota metric') ||
    rawMsgLower.includes('free tier database') ||
    rawMsgLower.includes('maximum backoff delay')
  ) {
    const upgradeUrl =
      'https://console.firebase.google.com/project/csam-2026/firestore/databases/ai-studio-cyberarena-9cdfe991-12a4-42ed-9ed9-c2f76bf84138/data?openUpgradeDialog=true';
    return {
      message:
        'Google Cloud Firestore daily free write quota exceeded. Database write operations (adding/modifying quizzes or chunk uploads) are temporarily paused by Google Cloud until the daily quota resets (24-hour cycle). All existing quizzes, questions, and player game sessions remain fully intact and operational for reads.',
      isQuotaError: true,
      quotaUpgradeUrl: upgradeUrl,
    };
  }

  // Detect permission denied
  if (
    rawMsgLower.includes('permission-denied') ||
    rawMsgLower.includes('missing or insufficient permissions')
  ) {
    return {
      message: 'Permission denied: Please ensure you are logged in as an authorized administrator.',
      isQuotaError: false,
    };
  }

  // Detect timeout
  if (rawMsgLower.includes('timed out') || rawMsgLower.includes('timeout_exceeded')) {
    const upgradeUrl =
      'https://console.firebase.google.com/project/csam-2026/firestore/databases/ai-studio-cyberarena-9cdfe991-12a4-42ed-9ed9-c2f76bf84138/data?openUpgradeDialog=true';
    return {
      message:
        'The database operation timed out. This typically occurs when Google Cloud Firestore daily free write quota is reached or network connectivity is slow. Existing quizzes and gameplay remain intact.',
      isQuotaError: true,
      quotaUpgradeUrl: upgradeUrl,
    };
  }

  return {
    message: rawMsg.length > 0 && !rawMsg.startsWith('{') ? rawMsg : fallbackMessage,
    isQuotaError: false,
  };
}
