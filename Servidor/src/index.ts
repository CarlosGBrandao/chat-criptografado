import express, { Request, Response } from 'express';
import http from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';

type PendingGroup = {
  groupId: string;
  groupName: string;
  createdBy: string;
  allMembers: string[];
  membersStatus: Map<string, 'pending' | 'accepted'>;
};

type ActiveGroup = {
  groupId: string;
  groupName: string;
  owner: string;
  members: Set<string>;
};

const app = express();
const port = 3000;
const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(cors());

const onlineUsers = new Map<string, string>(); // username -> socket.id
const publicKeys = new Map<string, string>();
const pendingGroups = new Map<string, PendingGroup>();
const activeGroups = new Map<string, ActiveGroup>();

io.on('connection', (socket: Socket) => {
  console.log(`✅ Cliente conectado: ${socket.id}`);
  let connectedUsername: string | null = null;

  // --- Registro ---
  socket.on('register', (username: string) => {
    connectedUsername = username;
    if (!onlineUsers.has(username)) {
      onlineUsers.set(username, socket.id);
      console.log(`Usuário '${username}' registrado com socket ${socket.id}`);
      io.emit('updateUserList', Array.from(onlineUsers.keys()));
    }
  });

  socket.on('registerPublicKey', (data: { publicKey: string }) => {
    if (!connectedUsername || publicKeys.has(connectedUsername)) return;
    publicKeys.set(connectedUsername, data.publicKey);
    console.log(`Chave pública registrada para '${connectedUsername}'`);
  });

  socket.on('getPublicKey', (data: { username: string }) => {
    const publicKey = publicKeys.get(data.username) || null;
    socket.emit('publicKeyResponse', { username: data.username, publicKey });
  });

  // --- Chat 1-para-1 ---
  socket.on('send-chat-request', (data: { to: string }) => {
    if (!connectedUsername) return;
    const recipientSocketId = onlineUsers.get(data.to);
    if (recipientSocketId) {
      console.log(`➡️ Chat request de '${connectedUsername}' para '${data.to}'`);
      io.to(recipientSocketId).emit('receive-chat-request', { from: connectedUsername });
    }
  });

  socket.on('accept-chat-request', (data: { to: string }) => {
    if (!connectedUsername) return;
    const recipientSocketId = onlineUsers.get(data.to);
    if (recipientSocketId) {
      console.log(`✅ Chat request aceito por '${connectedUsername}' para '${data.to}'`);
      io.to(recipientSocketId).emit('chat-request-accepted', { from: connectedUsername });
    }
  });

  socket.on('reject-chat-request', (data: { to: string }) => {
    if (!connectedUsername) return;
    const recipientSocketId = onlineUsers.get(data.to);
    if (recipientSocketId) {
      console.log(`✅ Chat request rejeitado por '${connectedUsername}' para '${data.to}'`);
      io.to(recipientSocketId).emit('chat-request-reject', { from: connectedUsername });
    }
  });

  socket.on('privateMessage', (data: { to: string; message: any }) => {
    if (!connectedUsername) return;
    const recipientSocketId = onlineUsers.get(data.to);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('receiveMessage', { from: connectedUsername, message: data.message });
    } else {
      console.warn(`Usuário offline: ${data.to}`);
    }
  });

  // --- Desconexão ---
  socket.on('disconnect', () => {
    if (!connectedUsername) return;

    console.log(`❌ Usuário desconectou: ${connectedUsername} (${socket.id})`);
    onlineUsers.delete(connectedUsername);
    publicKeys.delete(connectedUsername);

    // Limpar grupos ativos
    activeGroups.forEach((group, groupId) => {
      if (group.owner === connectedUsername) {
        io.to(groupId).emit('group-terminated', { groupId });
        activeGroups.delete(groupId);
      } else if (group.members.has(connectedUsername as string)) {
        group.members.delete(connectedUsername as string);
        io.to(groupId).emit('group-membership-changed', {
          groupId,
          members: Array.from(group.members),
          message: `${connectedUsername} se desconectou`
        });
      }
    });

    // Limpar grupos pendentes
    pendingGroups.forEach((group, groupId) => {
      if (group.allMembers.includes(connectedUsername as string)) {
        const reason = `${connectedUsername} se desconectou antes de aceitar o convite`;
        group.allMembers.forEach(member => {
          if (member !== connectedUsername) {
            const memberSocketId = onlineUsers.get(member);
            if (memberSocketId) {
              io.to(memberSocketId).emit('group-creation-failed', { groupName: group.groupName, reason });
            }
          }
        });
        pendingGroups.delete(groupId);
      }
    });

    io.emit('updateUserList', Array.from(onlineUsers.keys()));
  });
});

// --- Rotas Express ---
app.get('/', (req: Request, res: Response) => res.send('Servidor de Chat Online'));
app.get('/api/status', (req: Request, res: Response) => {
  res.json({ status: 'online', users: onlineUsers.size });
});

httpServer.listen(port, () => console.log(`🚀 Servidor rodando em http://localhost:${port}`));
