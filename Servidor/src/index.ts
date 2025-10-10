import express, { Request, Response } from 'express';
import http from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import cors from 'cors';

// --- CONFIGURAÇÃO INICIAL ---
const app = express();
const port = 3000;
const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// --- MIDDLEWARES ---
app.use(cors());


// CORREÇÃO: Agora um username mapeia para um CONJUNTO (Set) de socket IDs.
const onlineUsers = new Map<string, Set<string>>();

const rooms = new Map<string, {
  owner: string;     
  admins: Set<string>;
  members: Set<string>; 
}>();

// --- LÓGICA DO SOCKET.IO ---
io.on('connection', (socket: Socket) => {
  console.log(`✅ Um cliente conectou! ID: ${socket.id}`);
  
  let connectedUsername: string | null = null;

  socket.on('register', (username: string) => {
    connectedUsername = username;
    
    // Se for a primeira conexão deste usuário, crie um novo Set para ele.
    if (!onlineUsers.has(username)) {
      onlineUsers.set(username, new Set());
    }
    // Adicione o novo socket ID ao Set de conexões do usuário.
    onlineUsers.get(username)!.add(socket.id);

    console.log(`Usuário '${username}' registrou a conexão ${socket.id}`);
    io.emit('updateUserList', Array.from(onlineUsers.keys()));
  });

  socket.on('privateMessage', (data: { to: string; message: string }) => {
    const senderUsername = connectedUsername;
    if (!senderUsername) return;

    // Pega o CONJUNTO de sockets do destinatário.
    const recipientSocketIds = onlineUsers.get(data.to);

    if (recipientSocketIds && recipientSocketIds.size > 0) {
      console.log(`Mensagem de '${senderUsername}' para '${data.to}': ${data.message}`);
      
      // Envia a mensagem para CADA socket ativo do destinatário.
      recipientSocketIds.forEach(socketId => {
        io.to(socketId).emit('receiveMessage', {
          from: senderUsername,
          message: data.message,
        });
      });
    } else {
      console.warn(`Tentativa de enviar mensagem para usuário offline: ${data.to}`);
    }
  });

  socket.on('createGroup', (data: { groupName: string }) => {
  const creatorUsername = connectedUsername; 
  if (!creatorUsername) return;

  const groupId = `group-${Date.now()}`; 


  rooms.set(groupId, {
    owner: creatorUsername,
    admins: new Set([creatorUsername]), 
    members: new Set([creatorUsername]),
  });

 
  socket.join(groupId);


  socket.emit('groupCreated', { groupId, groupName: data.groupName });


  io.emit('updateGroupList', /* enviar a lista de todas as salas */);
});

  socket.on('disconnect', () => {
    console.log(`❌ O cliente ${socket.id} desconectou.`);
    if (connectedUsername) {
      const userSockets = onlineUsers.get(connectedUsername);
      if (userSockets) {
        // Remove este socket específico do Set do usuário.
        userSockets.delete(socket.id);
        
        // Se o usuário não tem mais nenhuma conexão ativa, remova-o da lista.
        if (userSockets.size === 0) {
          onlineUsers.delete(connectedUsername);
          console.log(`Usuário '${connectedUsername}' ficou completamente offline.`);
        }
      }
      io.emit('updateUserList', Array.from(onlineUsers.keys()));
    }
  });
});

// --- ROTAS DO EXPRESS E INICIALIZAÇÃO ---
app.get('/', (req: Request, res: Response) => {
  res.send('Olá, mundo com Node.js e TypeScript!');
});

app.get('/api/status', (req: Request, res: Response) => {
  res.json({ status: 'online', mensagem: 'Servidor está funcionando perfeitamente!' });
});

httpServer.listen(port, () => {
  console.log(`🚀 Servidor rodando e ouvindo em http://localhost:${port}`);
});