// src/types/ExtendedIO.ts
import { Server } from 'socket.io';

export interface Sala {
  roomId: string;
  currentUser: string | null;
  lastActivity: Date | null;
}

export interface CustomIO extends Server {
  salas: Map<string, Sala>;
}
