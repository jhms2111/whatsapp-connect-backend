
import dotenv from 'dotenv';
dotenv.config(); // <-- Isso carrega o .env

import { setupRoutes } from './infraestructure/express/setupRoutes';
import { startSocketServer } from './infraestructure/express/serverSetup';
import { connectToMongoDB } from './infraestructure/mongo/models/mongoose'; 


(async () => {

    await connectToMongoDB();

    const io = startSocketServer();

    setupRoutes(io);
})();




