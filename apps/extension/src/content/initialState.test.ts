import { expect, it, vi } from 'vitest';
import { readInitialState } from './initialState.js';

it('retries only read-only status when the upgraded worker listener is not ready', async () => {
  const read = vi.fn().mockRejectedValueOnce(new Error('Could not establish connection. Receiving end does not exist.')).mockResolvedValue({ recording: false });
  const pause = vi.fn().mockResolvedValue(undefined);
  expect(await readInitialState(read, pause)).toEqual({ recording: false });
  expect(read).toHaveBeenCalledTimes(2);
  expect(pause).toHaveBeenCalledTimes(1);
});

it('bounds retries and never retries protocol or authentication errors', async () => {
  const read = vi.fn().mockRejectedValue(new Error('Could not establish connection. Receiving end does not exist.'));
  await expect(readInitialState(read, async () => {})).rejects.toThrow('Receiving end');
  expect(read).toHaveBeenCalledTimes(10);
  const denied = vi.fn().mockRejectedValue(new Error('Invalid session'));
  await expect(readInitialState(denied, async () => {})).rejects.toThrow('Invalid session');
  expect(denied).toHaveBeenCalledTimes(1);
});
