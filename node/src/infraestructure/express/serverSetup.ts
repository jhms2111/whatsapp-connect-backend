import { Server } from "socket.io";
import { createServer } from "http";
import express from "express";

export function startSocketServer() { 
  const app = express();
  const server = createServer(app);
  const io = new Server(server);

  const socketRoomMap = new Map();
  return io;
}

