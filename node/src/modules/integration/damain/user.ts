// src/modules/integration/domain/user.ts

export class User {
  username: string;
  socketId: string;
  lastActive: number;
  roomId?: string; // ✅ adicionamos roomId

  constructor(username: string, socketId: string, roomId?: string) {
    this.username = username;
    this.socketId = socketId;
    this.lastActive = Date.now();
    this.roomId = roomId;
  }
}

export const users: Map<string, User> = new Map();
export const userSockets: Map<string, string> = new Map();
export const userRoomConnections: Map<string, string[]> = new Map();

export function logConnectedUsers() {
  console.log('Usuários conectados:');
  users.forEach(user => {
    console.log(`Usuário: ${user.username}, Socket ID: ${user.socketId}`);
  });
}
