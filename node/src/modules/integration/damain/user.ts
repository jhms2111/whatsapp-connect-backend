
export class User {
    username: string;
    socketId: string;
    lastActive: number;

    constructor(username: string, socketId: string) {
        this.username = username;
        this.socketId = socketId;
        this.lastActive = Date.now();
    }
}

export const users: Map<string, User> = new Map();
export const userSockets: Map<string, string> = new Map(); 
export const userRoomConnections: Map<string, string[]> = new Map(); 

export function logConnectedUsers() {
    console.log('Usuários conectados:');
    users.forEach(user => {
        console.log(`Usuário: ${user.username}, Socket ID: ${user.socketId}`);
    });

}