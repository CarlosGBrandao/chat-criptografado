import express, { Request, Response } from 'express';
import http from 'http'; // 1. Importe o módulo http do Node
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';

const app = express();
const port = 3000;
app.use(cors());

// 3. Crie um servidor HTTP a partir do seu app Express
const httpServer = http.createServer(app);

// 4. Crie uma instância do Socket.IO e conecte-a ao servidor HTTP
//    É CRUCIAL configurar o CORS aqui também para o Socket.IO
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: "*", // Em produção, mude para o endereço do seu cliente
    methods: ["GET", "POST"]
  }
});

//    Usamos um Map para associar o NOME do usuário ao seu ID de socket.
const onlineUsers = new Map<string, string>();

io.on('connection', (socket) => {
  console.log(`✅ Um cliente conectou! ID: ${socket.id}`);

  // 2. Ouvimos um evento 'register' do cliente.
  //    Quando o cliente se identifica, nós o adicionamos à nossa lista.
  socket.on('register', (username) => {
    console.log(`Usuário '${username}' se registrou com o socket ID ${socket.id}`);
    onlineUsers.set(username, socket.id);
    
    // 3. AVISO GLOBAL: Enviamos a lista de usuários ATUALIZADA para TODOS.
    //    Enviamos apenas os nomes (as chaves do Map).
    io.emit('updateUserList', Array.from(onlineUsers.keys()));
  });

  // 4. Lidamos com a desconexão.
  socket.on('disconnect', () => {
    console.log(` O cliente ${socket.id} desconectou.`);
    // Precisamos descobrir qual usuário era dono desse socket.id
    for (const [username, id] of onlineUsers.entries()) {
      if (id === socket.id) {
        onlineUsers.delete(username); // Removemos o usuário da lista
        // E enviamos a lista atualizada para todos novamente
        io.emit('updateUserList', Array.from(onlineUsers.keys()));
        break;
      }
    }
  });

   socket.on('privateMessage', (data) => {
    // data deve ser um objeto como { to: 'nomeDoDestinatario', message: 'Olá!' }

    // 1. Encontrar o ID do socket do DESTINATÁRIO
    const recipientSocketId = onlineUsers.get(data.to);

    // 2. Encontrar o NOME do REMETENTE (quem está enviando)
    let senderUsername = '';
    for (const [username, id] of onlineUsers.entries()) {
      if (id === socket.id) {
        senderUsername = username;
        break;
      }
    }

    // 3. Se o destinatário estiver online, envie a mensagem apenas para ele
    if (recipientSocketId && senderUsername) {
      console.log(`Mensagem de '${senderUsername}' para '${data.to}': ${data.message}`);
      // io.to(socketId).emit(...) envia uma mensagem para um cliente específico
      io.to(recipientSocketId).emit('receiveMessage', {
        from: senderUsername,
        message: data.message,
      });
    }
  });

});


httpServer.listen(port, () => {
  console.log(` Servidor rodando e ouvindo em http://localhost:${port}`);
});


// Sua rota original
app.get('/', (req: Request, res: Response) => {
  res.send('Olá, munde com Node.js e TypeScript!');
});

// ===== NOVA ROTA DE TESTE =====
// Este é o endpoint que o seu cliente React vai acessar
app.get('/api/status', (req: Request, res: Response) => {
  res.json({ 
    status: 'online', 
    mensagem: 'Servidor está funcionando perfeitamente!' 
  });
});
// =============================

