// src/index.ts (ou arquivo de entrada)
import dotenv from 'dotenv';
dotenv.config();

import { Server } from 'socket.io';
import { setupRoutes } from './infraestructure/express/setupRoutes';
import { connectToMongoDB } from './infraestructure/mongo/models/mongoose';

(async () => {
  await connectToMongoDB();

  // 👇 io desacoplado; o setupRoutes vai dar attach(server)
  const io = new Server();

  setupRoutes(io);
})();
