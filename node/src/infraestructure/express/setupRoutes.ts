
import express, { Express, Request, Response } from 'express';
import { Server } from 'socket.io';
import cors from 'cors';
import jwt from 'jsonwebtoken';

import { setupStaticRoutes } from './routes/staticRoutes';
import { setupTwilioRoutes } from './routes/twilioRoutes';
import { setupUploadRoutes } from './routes/uploadRoutes';
import { setupAudioRoutes, ensureUploadDirExists } from './routes/audioRoutes';
import { handleSocketConnection } from './handleSocketConnection';
import { authenticateJWT } from './middleware/authMiddleware';
import messageRoutes from './routes/messageRoutes';
import roomRoutes from '../express/routes/roomRoutes'; 
import chatMessageRoutes from './routes/chatMessageRoutes';






import { userSockets } from '../../modules/integration/damain/user';
import { createOrUpdateCliente } from '../mongo/mongodbAdapter'; // ✅ Função que usa Mongoose agora

// **Importando as novas rotas para Produtos, Bots e Interação de Bots**
import productRoutes from './routes/productRoutes';
import botRoutes from './routes/botRoutes';
import { router as botInteractionRoutes } from './routes/botInteractionRoutes';

// ✅ Rota para gerenciamento de números Twilio por cliente
import twilioNumberRoutes from './routes/twilioNumberRoutes';

const JWT_SECRET = process.env.JWT_SECRET || 'secret123';

const USERS = [
    { username: 'admin', password: 'admin123' },
    { username: 'cliente1', password: 'senha123' },
];

export function setupRoutes(io: Server): Express {
    const app = express();

    app.use(cors({
        origin: 'http://localhost:3000',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // ✅ Liberar todos os métodos
        credentials: true
    }));

    ensureUploadDirExists();

    app.use(express.urlencoded({ extended: true }));
    app.use(express.json());

    app.use('/api', messageRoutes);

    // 🔐 Login com JWT
    app.post('/login', async (req, res) => {
        const { username, password } = req.body;

        const user = USERS.find(u => u.username === username && u.password === password);
        if (!user) return res.status(401).json({ error: 'Usuário ou senha inválidos' });

        const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '1h' });

        await createOrUpdateCliente(username); // Registra login no banco

        res.json({ token });
    });

    // ✅ Rota protegida (exemplo)
    app.get('/rota-protegida', authenticateJWT, (req: Request, res: Response) => {
        const user = (req as any).user;
        res.json({ message: 'Você acessou uma rota protegida!', usuario: user.username });
    });

    // ✅ Verificar se usuário já está com sessão socket ativa
    app.get('/check-session', (req, res) => {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'Token não fornecido' });

        try {
            const decoded = jwt.verify(token, JWT_SECRET) as { username: string };
            const alreadyConnected = userSockets.has(decoded.username);

            if (alreadyConnected) {
                return res.status(409).json({ error: 'Sessão já ativa para este usuário' });
            }

            return res.status(200).json({ message: 'Sessão liberada' });
        } catch (error) {
            return res.status(401).json({ error: 'Token inválido' });
        }
    });

    // ⛓️ Integrando novas rotas
    app.use('/api', chatMessageRoutes);
    app.use('/api', roomRoutes);
    app.use('/api', productRoutes);           // Rota para produtos
    app.use('/api', botRoutes);               // Rota para bots
    app.use('/api', botInteractionRoutes);    // Rota para interação com o bot
    app.use('/api', twilioNumberRoutes);      // ✅ Rota para números Twilio (por cliente)

    // Rotas de recursos existentes
    setupStaticRoutes(app);
    setupTwilioRoutes(app, io);
    setupUploadRoutes(app, io);
    setupAudioRoutes(app, io);

    const PORT = process.env.PORT || 4000;
    const server = app.listen(PORT, () => {
        console.log(`Servidor escutando em http://localhost:${PORT}`);
    });

    // 🔐 Middleware do socket.io com JWT
    io.use(async (socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token) {
            console.warn('Socket sem token: conectado como Anônimo');
            return next();
        }

        try {
            const decoded = jwt.verify(token, JWT_SECRET) as { username: string };
            socket.data.username = decoded.username;

            await createOrUpdateCliente(decoded.username);
            next();
        } catch (err) {
            console.error('JWT inválido:', err);
            next();
        }
    });

    io.attach(server, {
        cors: {
            origin: 'http://localhost:3000',
            methods: ['GET', 'POST'],
            credentials: true
        }
    });

    io.on('connection', (socket) => {
        handleSocketConnection(socket, io);
    });

    return app;
}

