const transientErrors = new Set(['AbortError', 'NotFoundError', 'NotReadableError', 'UnknownError']);

export function isDesktopPermissionError(error) {
  return error?.name === 'NotAllowedError' || error?.name === 'SecurityError';
}

export async function readDesktopFile(handle, { ask = false, isCurrent }) {
  // requestPermission can show Chrome's prompt, so only call it from the Retry click.
  if (ask && typeof handle.requestPermission === 'function') {
    if (await handle.requestPermission({ mode: 'read' }) !== 'granted') {
      throw new DOMException('Chrome did not grant read access.', 'NotAllowedError');
    }
  }
  for (const delay of [0, 250, 650]) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    if (!isCurrent()) throw new DOMException('A newer file request replaced this one.', 'AbortError');
    try {
      return await handle.getFile();
    } catch (error) {
      if (delay === 650 || !transientErrors.has(error?.name)) throw error;
    }
  }
}
