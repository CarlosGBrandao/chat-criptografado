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
    origin: "*", // Em desenvolvimento. Para produção, especifique o endereço do cliente.
    methods: ["GET", "POST"]
  }
});

// --- MIDDLEWARES ---
app.use(cors());

// --- GERENCIAMENTO DE ESTADO DO CHAT ---
// Usamos um Map para associar o NOME do usuário ao seu ID de socket.
const onlineUsers = new Map<string, string>();

// --- LÓGICA DO SOCKET.IO ---
io.on('connection', (socket: Socket) => {
  console.log(`✅ Um cliente conectou! ID: ${socket.id}`);

  // MELHORIA: Associamos uma propriedade 'username' ao socket
  // para identificar facilmente quem ele é em outros eventos.
  let connectedUsername: string | null = null;

  socket.on('register', (username: string) => {
    connectedUsername = username; // Guardamos o nome do usuário neste socket
    console.log(`Usuário '${username}' se registrou com o socket ID ${socket.id}`);
    onlineUsers.set(username, socket.id);
    
    // Envia a lista de usuários atualizada para TODOS os clientes
    io.emit('updateUserList', Array.from(onlineUsers.keys()));
  });

  socket.on('privateMessage', (data: { to: string; message: string }) => {
    // MELHORIA: Agora sabemos quem é o remetente instantaneamente, sem precisar de um loop.
    const senderUsername = connectedUsername;
    
    if (!senderUsername) {
      console.error(`Recebida privateMessage de um socket não registrado: ${socket.id}`);
      return; // Aborta se o remetente não estiver registrado
    }
    
    console.log('✅ Evento "privateMessage" recebido!');
    console.log(`   - De: ${senderUsername} (ID: ${socket.id})`);
    console.log(`   - Para: ${data.to}`);
    console.log(`   - Mensagem: "${data.message}"`);

    const recipientSocketId = onlineUsers.get(data.to);

    if (recipientSocketId) {
      // Envia a mensagem apenas para o socket específico do destinatário
      io.to(recipientSocketId).emit('receiveMessage', {
        from: senderUsername,
        message: data.message,
      });
    } else {
      console.warn(`Tentativa de enviar mensagem para usuário offline: ${data.to}`);
    }
  });

  socket.on('disconnect', () => {
    console.log(`❌ O cliente ${socket.id} desconectou.`);
    // MELHORIA: A lógica de desconexão agora é muito mais simples.
    if (connectedUsername) {
      onlineUsers.delete(connectedUsername);
      // Envia a lista atualizada para todos após a remoção
      io.emit('updateUserList', Array.from(onlineUsers.keys()));
      console.log(`Usuário '${connectedUsername}' foi removido da lista.`);
    }
  });
});

// --- ROTAS DO EXPRESS ---
app.get('/', (req: Request, res: Response) => {
  res.send('Olá, mundo com Node.js e TypeScript!'); // Corrigido: "munde" -> "mundo"
});

app.get('/api/status', (req: Request, res: Response) => {
  res.json({ 
    status: 'online', 
    mensagem: 'Servidor está funcionando perfeitamente!' 
  });
});

// --- INICIALIZAÇÃO DO SERVIDOR ---
httpServer.listen(port, () => {
  console.log(`🚀 Servidor rodando e ouvindo em http://localhost:${port}`);
});