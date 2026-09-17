import { WebSocketServer } from 'ws';
import { SHARED_PACKAGE_NAME } from '@happy-card-game/shared';

const PORT = Number(process.env.PORT ?? 8080);

export function createServer(port: number = PORT): WebSocketServer {
  const wss = new WebSocketServer({ port });

  wss.once('listening', () => {
    const address = wss.address();
    const boundPort = typeof address === 'object' && address ? address.port : port;
    console.log(
      `[${SHARED_PACKAGE_NAME}] server listening on port ${boundPort}`,
    );
  });

  return wss;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createServer();
}
