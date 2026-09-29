import { WebSocketServer } from 'ws';
import { SHARED_PACKAGE_NAME } from '@happy-card-game/shared';
import type { BotTurnOptions } from './game/botRunner.js';
import { RoomManager } from './rooms/roomManager.js';
import { handleConnection } from './ws/connection.js';

const PORT = Number(process.env.PORT ?? 8080);

export function createServer(port: number = PORT, botTurns?: Partial<BotTurnOptions>): WebSocketServer {
  const wss = new WebSocketServer({ port });
  const roomManager = new RoomManager(botTurns);

  wss.once('listening', () => {
    const address = wss.address();
    const boundPort = typeof address === 'object' && address ? address.port : port;
    console.log(
      `[${SHARED_PACKAGE_NAME}] server listening on port ${boundPort}`,
    );
  });

  wss.on('connection', (ws) => {
    handleConnection(roomManager, ws);
  });

  return wss;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createServer();
}
