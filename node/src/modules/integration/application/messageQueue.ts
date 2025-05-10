
import { connectSocketToRoom, occupiedRooms, simulateTwilioSocket, rooms } from "./roomManagement";
import { saveMessage } from "../../../infraestructure/mongo/mongodbAdapter";
import { Server as IOServer, Socket } from 'socket.io';


export const messageQueue: Map<string, { message: string, preferredUsername?: string }[]> = new Map();

export async function processMessageQueue(io: IOServer) {
    for (const [roomId, messages] of messageQueue.entries()) {
        if (!occupiedRooms.has(roomId)) {
            const availableSocket = Array.from(io.sockets.sockets.values())
                .find(socket => !Array.from(socket.rooms).some(room => rooms.has(room)));

            if (availableSocket) {
                console.log(`Conectando socket ${availableSocket.id} à sala ${roomId}`);
                await connectSocketToRoom(io, availableSocket, roomId);

                const twilioSocketId = simulateTwilioSocket(io, roomId);
                for (const { message } of messages) {
                    io.to(roomId).emit('twilio message', { sender: twilioSocketId, message });
                    await saveMessage(roomId, twilioSocketId, message, false);
                }

                occupiedRooms.add(roomId);
            }
        }
    }
    messageQueue.clear();
}

export function addMessageToQueue(roomId: string, message: string, preferredUsername?: string) {
    if (!messageQueue.has(roomId)) {
        messageQueue.set(roomId, []);
    }
    messageQueue.get(roomId)?.push({ message, preferredUsername });
    console.log(`Mensagem adicionada à fila para a sala ${roomId}`);

}