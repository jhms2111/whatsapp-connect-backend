// src/infraestructure/socket/index.ts (exemplo)
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

const userSockets = new Map<string, Set<string>>(); // username -> set de socket ids
const JWT_SECRET = process.env.JWT_SECRET || 'secret123';

export function setupSocket(server: import('http').Server) {
  const io = new Server(server, {
    cors: { origin: '*' },
  });

  io.use((socket, next) => {
    const { token, force } = socket.handshake.auth as { token?: string; force?: boolean };
    if (!token) return next(new Error('Missing token'));

    try {
      const payload = jwt.verify(token, JWT_SECRET) as any;
      (socket as any).user = {
        username: payload.username,
        role: payload.role,
        imp: !!payload.imp,
        sid: payload.sid || null,
      };
      (socket as any).force = !!force;
      return next();
    } catch (e) {
      return next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const user = (socket as any).user;
    const force = (socket as any).force;

    if (!user?.username) {
      socket.disconnect(true);
      return;
    }

    // se existir sessão(s) anterior(es)
    const set = userSockets.get(user.username) || new Set<string>();

    if (set.size > 0 && (user.imp || force)) {
      // derruba todas as antigas e aceita esta
      for (const oldId of set) {
        const old = io.sockets.sockets.get(oldId);
        old?.disconnect(true);
      }
      set.clear();
    } else if (set.size > 0 && !user.imp && !force) {
      // mantém a sua lógica antiga: negar duplicadas
      socket.emit('session_conflict', { message: 'Outra sessão já está ativa' });
      socket.disconnect(true);
      return;
    }

    // registra nova conexão
    set.add(socket.id);
    userSockets.set(user.username, set);

    console.log(`✅ Socket conectado: ${socket.id} • ${user.username} • imp=${user.imp}`);

    socket.on('disconnect', () => {
      const s = userSockets.get(user.username);
      if (s) {
        s.delete(socket.id);
        if (s.size === 0) userSockets.delete(user.username);
      }
      console.log(`🔌 Socket desconectado: ${socket.id} • ${user.username}`);
    });
  });

  return io;
}
