import MessageModel from '../infraestructure/mongo/models/messageModel';

export const initRoomsFromMessages = async (io: any) => {
  try {
    const roomIds = await MessageModel.distinct('roomId');

    if (!io.salas) io.salas = new Map();

    for (const roomId of roomIds) {
      if (!io.salas.has(roomId)) {
        io.salas.set(roomId, {
          roomId,
          currentUser: null,
          lastActivity: null, // Você pode buscar a última mensagem se quiser
        });
        console.log(`💾 Sala restaurada do histórico: ${roomId}`);
      }
    }
  } catch (err) {
    console.error('❌ Erro ao inicializar salas do histórico:', err);
  }
};
