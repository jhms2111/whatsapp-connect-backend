
import express, { Express, Request, Response } from 'express';
import { Server } from 'socket.io';
import { handleTwilioWebhook } from '../../../modules/twilio/adapter/handleTwilioWebhook';

export function setupTwilioRoutes(app: Express, io: Server): void {
    // Rota para lidar com mensagens enviadas pelo Twilio
    app.post('/webhooks/messages/send', (req: Request, res: Response) => {
        handleTwilioWebhook(req, res, io); // Chama a função handleTwilioWebhook para lidar com a mensagem
    });

    // Rota para a nova rota
    app.post('/webhooks/messages/received', (req: Request, res: Response) => {
        res.send('Esta é outra rota!'); // Retorna uma resposta simples para a nova rota
    });
}