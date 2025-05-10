
import Message from './models/messageModel';
import Cliente from './models/clienteModel';

export async function saveMessage(
  roomId: string,
  sender: string,
  message: string,
  sent: boolean,
  fileUrl?: string,
  fileName?: string,
  to?: string
) {
  try {
    const msg = new Message({
      roomId,
      sender,
      message,
      sent,
      fileUrl,
      fileName,
      to,
    });
    await msg.save();
    console.log('✅ Mensagem salva com sucesso');
  } catch (error) {
    console.error('❌ Erro ao salvar mensagem:', error);
  }
}

export async function getFilteredMessages(roomId: string, username: string) {
  try {
    return await Message.find({
      roomId,
      $or: [{ sender: username }, { to: username }],
    }).sort({ timestamp: 1 });
  } catch (error) {
    console.error('❌ Erro ao recuperar mensagens:', error);
    return [];
  }
}

export async function createOrUpdateCliente(username: string) {
  try {
    const now = new Date();
    const cliente = await Cliente.findOne({ username });

    if (cliente) {
      cliente.lastLogin = now;
      await cliente.save();
    } else {
      const newCliente = new Cliente({
        username,
        createdAt: now,
        lastLogin: now,
      });
      await newCliente.save();
    }
  } catch (error) {
    console.error('❌ Erro ao criar/atualizar cliente:', error);
  }
}
