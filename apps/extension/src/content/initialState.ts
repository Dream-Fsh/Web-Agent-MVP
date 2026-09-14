/** Status is read-only; never retry start, stop, or captured events here. */
export async function readInitialState<T>(read: () => Promise<T>, pause: () => Promise<void> = () => new Promise(resolve => setTimeout(resolve, 200))): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await read(); }
    catch (error) {
      if (attempt >= 9 || !(error instanceof Error) || error.message !== 'Could not establish connection. Receiving end does not exist.') throw error;
      await pause();
    }
  }
}
