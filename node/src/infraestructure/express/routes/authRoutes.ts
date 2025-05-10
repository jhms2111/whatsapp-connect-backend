// routes/authRoutes.ts
import { Express, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'secret123'; // Coloca isso no .env depois

export function setupAuthRoutes(app: Express) {
    app.post('/login', (req: Request, res: Response) => {
        const { username } = req.body;
        if (!username) return res.status(400).json({ error: 'Usuário é obrigatório' });

        const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '1h' });
        res.json({ token });
    });
}
