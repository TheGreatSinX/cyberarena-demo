/**
 * Wraps an asynchronous operation with an explicit timeout.
 * Prevents UI freezes caused by Firestore SDK exponential backoff loops
 * when offline or when encountering RESOURCE_EXHAUSTED quota limits.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs = 7000,
  operationName = 'Database operation'
): Promise<T> {
  let timerId: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timerId = setTimeout(() => {
      reject(
        new Error(
          `${operationName} timed out after ${timeoutMs / 1000}s. The request may have stalled due to connection issues or Google Cloud Firestore write quota limits.`
        )
      );
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    return result;
  } finally {
    if (timerId) {
      clearTimeout(timerId);
    }
  }
}
