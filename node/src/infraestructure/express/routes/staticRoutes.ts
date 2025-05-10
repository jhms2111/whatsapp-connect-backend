
import express, { Express, Request, Response } from 'express'; // Importa o framework Express e os tipos Request, Response para lidar com requisições e respostas
import path from 'path'; // Importa o módulo path para manipulação de caminhos de arquivos
import cors from 'cors'; // Importa o middleware cors para habilitar CORS
import { Server } from 'socket.io'; // Importa o Server do Socket.IO
import http from 'http'; // Importa o módulo http para criar o servidor

// Inicializa o aplicativo Express
const app: Express = express();
// Cria um servidor HTTP usando o aplicativo Express
const server = http.createServer(app);
// Inicializa o Socket.IO com o servidor HTTP
const io = new Server(server, {
    cors: {
        origin: 'http://localhost:3000', // Substitua pela URL do seu cliente React em produção
        methods: ['GET', 'POST'],
    },
});

// Função para configurar rotas estáticas
export function setupStaticRoutes(app: Express): void {
    // Habilita o CORS para todas as origens
    app.use(cors());

    // Define o caminho do diretório de uploads
    const uploadDir = path.resolve(__dirname, '..', '..','..','..', 'uploads'); 

    // Configura o middleware para servir arquivos estáticos do diretório 'public'
    app.use(express.static(path.resolve(__dirname, '..', '..', '..','..','..','..','client', 'build')));

    // Configura uma rota para servir arquivos estáticos do diretório de uploads
    app.use('/uploads', express.static(uploadDir));

    // Rota para servir o arquivo 'index.html' quando acessar a raiz '/'
    app.get('/', (req: Request, res: Response) => {
        res.sendFile(path.resolve(__dirname, '..', '..', '..','..','..','..','client', 'build', 'index.html'));
    });
}

// Chama a função para configurar as rotas
setupStaticRoutes(app);

// Eventos do Socket.IO
io.on('connection', (socket) => {
    console.log('Novo cliente conectado: ' + socket.id);

    socket.on('registerUser', (username) => {
        console.log(`Usuário registrado: ${username}`);
    });

    socket.on('disconnect', () => {
        console.log('Cliente desconectado: ' + socket.id);
    });

    // Outros eventos do Socket.IO podem ser adicionados aqui

});