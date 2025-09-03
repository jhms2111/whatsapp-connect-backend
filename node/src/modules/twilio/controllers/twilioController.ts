// src/modules/twilio/controllers/twilioController.ts
import { Request, Response } from 'express';
import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID!;
const authToken = process.env.TWILIO_AUTH_TOKEN!;
const client = twilio(accountSid, authToken);

export async function buscarNumerosDisponiveis(req: Request, res: Response) {
  try {
    const { country = 'BR', areaCode } = req.query;

    const numeros = await client
      .availablePhoneNumbers(country as string)
      .local.list({
        smsEnabled: true,
        voiceEnabled: true,
        areaCode: areaCode ? Number(areaCode) : undefined,
        limit: 10,
      });

    const resultado = numeros.map((n) => ({
      phoneNumber: n.phoneNumber,
      friendlyName: n.friendlyName,
    }));

    res.json(resultado);
  } catch (error: any) {
    console.error('Erro ao buscar números:', error);
    res.status(500).json({ error: 'Erro ao buscar números', details: error.message });
  }
}
