import { describe, expect, it, afterEach } from 'vitest';
import type { WebSocketServer } from 'ws';
import { createServer } from './index.js';

describe('server module', () => {
  let wss: WebSocketServer | undefined;

  afterEach(() => {
    wss?.close();
    wss = undefined;
  });

  it('loads and starts a WebSocketServer on a given port', async () => {
    await new Promise<void>((resolve, reject) => {
      wss = createServer(0);
      wss.once('listening', () => resolve());
      wss.once('error', reject);
    });

    expect(wss).toBeDefined();
  });
});
