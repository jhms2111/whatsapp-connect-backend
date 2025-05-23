
import { users, userRoomConnections } from '../damain/user';
import { Server as IOServer, Socket } from 'socket.io';
import { getFilteredMessages } from '../../../infraestructure/mongo/mongodbAdapter';

// Mapeia o ID da sala para o socketId
export const rooms: Map<string, string> = new Map();

// Usuário preferencial de cada sala (quem pegou a sala primeiro)
export const preferredSockets: Map<string, string> = new Map();

// Salas que estão ocupadas
export const occupiedRooms: Set<string> = new Set();

// Simulação de sockets do Twilio por sala
export const twilioSockets: Map<string, string> = new Map();

export const pausedRooms = new Set<string>();


/**
 * Conecta o socket a uma sala, com verificação de sessão duplicada e recuperação de mensagens antigas.
 */
export async function connectSocketToRoom(io: IOServer, socket: Socket, roomId: string): Promise<void> {
    const user = users.get(socket.id);
    if (user) {
        const userId = user.username;

        if (userRoomConnections.has(userId) && userRoomConnections.get(userId)?.length) {
            console.log(`Usuário ${userId} já está conectado a uma sala. Não pode se conectar a ${roomId}`);
            socket.emit('notification', 'Você já está conectado a uma sala e não pode se conectar a outra.');
            return;
        }

        socket.join(roomId);
        rooms.set(roomId, socket.id);

        if (!userRoomConnections.has(userId)) {
            userRoomConnections.set(userId, []);
        }
        userRoomConnections.get(userId)?.push(roomId);
        console.log(`Usuário ${userId} agora está conectado à sala ${roomId}`);

        if (!preferredSockets.has(roomId)) {
            preferredSockets.set(roomId, user.username);
            console.log(`Usuário ${user.username} agora é o usuário preferencial da sala ${roomId}`);
        } else {
            console.log(`Sala ${roomId} já tem um usuário preferencial.`);
        }

        if (!occupiedRooms.has(roomId)) {
            occupiedRooms.add(roomId);
        }

        const previousMessages = await getFilteredMessages(roomId, user.username);
        console.log(`Mensagens anteriores para a sala ${roomId} e usuário ${user.username}:`, previousMessages);
        socket.emit('previousMessages', previousMessages); 

        socket.emit('roomMessage', `Você entrou na sala ${roomId}`);
        socket.emit('roomJoined', roomId);
        console.log(`Socket ${socket.id} conectado à sala ${roomId}`);
    } else {
        console.log(`Nenhum usuário associado ao socket ${socket.id}`);
    }
}

/**
 * Simula a criação de um identificador de socket para o Twilio, que "fala" com a sala.
 */
export function simulateTwilioSocket(io: IOServer, roomId: string): string {
    const twilioId = `Socket-twilio-${roomId}`;
    twilioSockets.set(roomId, twilioId);
    console.log(`Socket de Twilio criado para a sala: ${roomId}`);
    return twilioId;
}
