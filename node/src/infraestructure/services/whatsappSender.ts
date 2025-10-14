// src/services/whatsappSender.ts
import User from '../mongo/models/userModel';

export async function sendWhatsAppMessage(params: { username: string; to: string; body: string }) {
  const u = await User.findOne({ username: params.username }, { status: 1 }).lean();
  if (!u || u.status === 'blocked') {
    throw new Error('ACCOUNT_BLOCKED');
  }
  // … chamada ao provedor (Twilio/Meta)
}
