import express, { Request, Response } from 'express';
import http from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid'; // Importa o gerador de UUID

// --- TIPAGEM AUXILIAR ---
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

// --- CONFIGURAÇÃO INICIAL ---
const app = express();
const port = 3000;
const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: "*", // Em produção, restrinja para o seu domínio
    methods: ["GET", "POST"]
  }
});

// --- MIDDLEWARES ---
app.use(cors());

// --- ESTADO DO SERVIDOR EM MEMÓRIA ---
const onlineUsers = new Map<string, Set<string>>();
const publicKeys = new Map<string, string>();
const pendingGroups = new Map<string, PendingGroup>();
const activeGroups = new Map<string, ActiveGroup>();

// --- LÓGICA DO SOCKET.IO ---
io.on('connection', (socket: Socket) => {
  console.log(`✅ Um cliente conectou! ID: ${socket.id}`);
  
  let connectedUsername: string | null = null;

  // --- Handlers de Registro e Chaves ---
  socket.on('register', (username: string) => {
    connectedUsername = username;
    
    if (!onlineUsers.has(username)) {
      onlineUsers.set(username, new Set());
    }
    onlineUsers.get(username)!.add(socket.id);

    console.log(`Usuário '${username}' registrou a conexão ${socket.id}`);
    io.emit('updateUserList', Array.from(onlineUsers.keys()));
  });

  socket.on('registerPublicKey', (data: { publicKey: string }) => {
    if (connectedUsername) {
      console.log(`Chave pública registrada para '${connectedUsername}'`);
      publicKeys.set(connectedUsername, data.publicKey);
    }
  });

  socket.on('getPublicKey', (data: { username: string }) => {
    const publicKey = publicKeys.get(data.username);
    socket.emit('publicKeyResponse', { username: data.username, publicKey: publicKey || null });
  });

  // --- Handlers de Chat 1-para-1 ---
  socket.on('send-chat-request', (data: { to: string }) => {
    const senderUsername = connectedUsername;
    if (!senderUsername) return;

    const recipientSocketIds = onlineUsers.get(data.to);
    if (recipientSocketIds && recipientSocketIds.size > 0) {
      console.log(`➡️ Pedido de chat de '${senderUsername}' para '${data.to}'`);
      recipientSocketIds.forEach(socketId => {
        io.to(socketId).emit('receive-chat-request', { from: senderUsername });
      });
    }
  });

  socket.on('accept-chat-request', (data: { to: string }) => {
    const senderUsername = connectedUsername; // Quem aceitou
    if (!senderUsername) return;

    const recipientSocketIds = onlineUsers.get(data.to); // O solicitante original
    if (recipientSocketIds && recipientSocketIds.size > 0) {
      console.log(`✅ Pedido de chat de '${data.to}' aceito por '${senderUsername}'`);
      recipientSocketIds.forEach(socketId => {
        io.to(socketId).emit('chat-request-accepted', { from: senderUsername });
      });
    }
  });

  socket.on('privateMessage', (data: { to: string; message: any }) => {
    const senderUsername = connectedUsername;
    if (!senderUsername) return;

    const recipientSocketIds = onlineUsers.get(data.to);
    if (recipientSocketIds && recipientSocketIds.size > 0) {
      console.log(`Encaminhando mensagem segura de '${senderUsername}' para '${data.to}'`);
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

  // --- Handlers de Lógica de Grupo ---
  socket.on('send-group-invite', (data: { groupName: string; members: string[] }) => {
    const creator = connectedUsername;
    if (!creator) return;

    const groupId = uuidv4();
    const { groupName, members } = data;
    
    const newPendingGroup: PendingGroup = {
      groupId,
      groupName,
      createdBy: creator,
      allMembers: [creator, ...members],
      membersStatus: new Map(members.map(m => [m, 'pending'])),
    };
    
    pendingGroups.set(groupId, newPendingGroup);
   console.log(`⏳ Grupo pendente '${groupName}' (ID: ${groupId}) criado por ${creator}. Convidando: [${members.join(', ')}]`);
    
    members.forEach(memberUsername => {
      const recipientSocketIds = onlineUsers.get(memberUsername);
      if (recipientSocketIds && recipientSocketIds.size > 0) {
        console.log(`- Enviando convite do grupo '${groupName}' para ${memberUsername}`);
        recipientSocketIds.forEach(socketId => {
          io.to(socketId).emit('group-invitation-received', {
            groupId,
            groupName,
            from: creator,
          });
        });
      }
    });
  });

  socket.on('accept-group-invite', (data: { groupId: string }) => {
    const user = connectedUsername;
    if (!user) return;
    const group = pendingGroups.get(data.groupId);
    if (!group || group.membersStatus.get(user) !== 'pending') return;

    console.log(` Usuário '${user}' aceitou o convite para o grupo '${group.groupName}' (ID: ${data.groupId})`);

    group.membersStatus.set(user, 'accepted');
    const allAccepted = Array.from(group.membersStatus.values()).every(status => status === 'accepted');

    if (allAccepted) {
      console.log(` Todos aceitaram! Criando grupo ativo "${group.groupName}"`);
      
      const newActiveGroup: ActiveGroup = {
        groupId: group.groupId,
        groupName: group.groupName,
        owner: group.createdBy,
        members: new Set(group.allMembers),
      };
      activeGroups.set(group.groupId, newActiveGroup);

      const groupData = {
        groupId: group.groupId,
        groupName: group.groupName,
        owner: group.createdBy,
        members: group.allMembers,
      };

      console.log(` Notificando [${group.allMembers.join(', ')}] para iniciar o chat do grupo '${group.groupName}'`);

      group.allMembers.forEach(member => {
        const memberSockets = onlineUsers.get(member);
        if (memberSockets) {
          memberSockets.forEach(socketId => {
            io.to(socketId).emit('group-chat-starting', groupData);
          });
        }
      });
      pendingGroups.delete(data.groupId);
    }
  });

  socket.on('join-group-room', (groupId: string) => {
    socket.join(groupId);
    console.log(`Usuário ${connectedUsername} entrou na sala do grupo ${groupId}`);
  });

  socket.on('group-message', (data: { groupId: string, message: any }) => {
    const sender = connectedUsername;
    if (!sender) return;

    console.log(` Mensagem de '${sender}' sendo encaminhada para a sala do grupo ${data.groupId}`);

    socket.to(data.groupId).emit('receive-group-message', {
        from: sender,
        groupId: data.groupId,
        message: data.message
    });
  });

  socket.on('distribute-new-group-key', (data: { to: string, groupId: string, keyPayload: any }) => {
    const owner = connectedUsername;
    if (!owner) return;

    console.log(` [KEY] Dono '${owner}' está distribuindo uma nova chave de sessão para '${data.to}' no grupo ${data.groupId}`);

    const recipientSocketIds = onlineUsers.get(data.to);
    if(recipientSocketIds){
        recipientSocketIds.forEach(socketId => {
            io.to(socketId).emit('receive-new-group-key', {
                from: owner,
                groupId: data.groupId,
                keyPayload: data.keyPayload
            });
        });
    }
  });

  // ======= CORREÇÃO: proteger OWNER-LEFT para só encerrar quando dono realmente estiver offline =======
  socket.on('owner-left-group', ({ groupId }: { groupId: string }) => {
    const owner = connectedUsername;
    if (!owner) return;

    // 1) Se o grupo não existe mais, ignora (idempotência)
    const group = activeGroups.get(groupId);
    if (!group) {
      console.log(`owner-left-group: grupo ${groupId} não encontrado (já encerrado?). Ignorando.`);
      return;
    }

    // 2) Verifica se quem emitiu realmente é o dono
    if (group.owner !== owner) {
      console.log(`owner-left-group: usuário ${owner} não é dono do grupo ${groupId}. Ignorando.`);
      return;
    }

    // 3) Verifica se o dono ainda tem outras conexões ativas. 
    // Se tiver, não encerra o grupo — possivelmente o owner só fechou uma aba.
    const ownerSockets = onlineUsers.get(owner);
    if (ownerSockets && ownerSockets.size > 1) {
      console.log(`owner-left-group: dono ${owner} tem ${ownerSockets.size} conexão(ões) ativas. Não encerra o grupo ${groupId}.`);
      return;
    }

    // 4) Se chegou até aqui, o dono realmente saiu — encerra o grupo e notifica membros.
    console.log(`Dono do grupo ${groupId} saiu (owner-left-group). Encerrando o grupo.`);
    io.to(groupId).emit('group-terminated', { groupId });
    activeGroups.delete(groupId);
  });

  socket.on('leave-group', (data: { groupId: string }) => {
    const user = connectedUsername;
    if (!user) return;

    const group = activeGroups.get(data.groupId);
    if (group && group.members.has(user)) {
      group.members.delete(user);
      socket.leave(data.groupId);
      console.log(` Usuário '${user}' saiu voluntariamente do grupo '${group.groupName}' (${data.groupId})`);

      // Notifica os membros restantes sobre a mudança para que o dono possa criar uma nova chave
      console.log(` Notificando membros restantes do grupo ${data.groupId} sobre a mudança.`);
      io.to(data.groupId).emit('group-membership-changed', {
        groupId: data.groupId,
        members: Array.from(group.members),
        message: `${user} saiu do grupo.`,
      });
    }
  });

  socket.on('decline-group-invite', (data: { groupId: string }) => {
    const user = connectedUsername;
    if (!user) return;

    const group = pendingGroups.get(data.groupId);
    if (!group) return;

    console.log(`👎 ${user} recusou o convite para o grupo "${group.groupName}"`);
    const reason = `${user} recusou o convite.`;

    group.allMembers.forEach(member => {
      const memberSockets = onlineUsers.get(member);
      if (memberSockets) {
        memberSockets.forEach(socketId => {
          io.to(socketId).emit('group-creation-failed', {
            groupName: group.groupName,
            reason,
          });
        });
      }
    });
    pendingGroups.delete(data.groupId); // Limpa o grupo da lista de pendentes
  });

  // --- Handler de Desconexão (CORRIGIDO e com Tipagem Segura) ---
  socket.on('disconnect', () => {
    console.log(`❌ O cliente ${socket.id} desconectou.`);
    
    if (!connectedUsername) {
        return;
    }

    const user: string = connectedUsername;

    const userSockets = onlineUsers.get(user);
    if (userSockets) {
        userSockets.delete(socket.id);
    }

    // Se ainda existe alguma conexão ativa para esse usuário, não considera-o offline
    if (userSockets && userSockets.size > 0) {
        console.log(`Usuário '${user}' ainda tem ${userSockets.size} conexão(ões) ativa(s). Nenhuma ação de grupo será tomada.`);
        return;
    }

    // Usuário ficou completamente offline
    console.log(`Usuário '${user}' ficou completamente offline. Processando saída de grupos...`);

    // Itera sobre grupos ativos para lidar com a saída do usuário
    activeGroups.forEach((group, groupId) => {
        if (group.owner === user) {
            // Só encerra se o grupo ainda existir (idempotência)
            if (activeGroups.has(groupId)) {
                console.log(`[DONO] Dono do grupo ${groupId} desconectou. Encerrando o grupo.`);
                io.to(groupId).emit('group-terminated', { groupId });
                activeGroups.delete(groupId);
            }
        } else if (group.members.has(user)) {
            group.members.delete(user);
            io.to(groupId).emit('group-membership-changed', {
                groupId,
                members: Array.from(group.members),
                message: `${user} se desconectou.`
            });
        }
    });

    // Itera sobre grupos pendentes para cancelar convites
    pendingGroups.forEach((group, groupId) => {
        if (group.allMembers.includes(user)) {
            console.log(`👎 Usuário ${user} desconectou durante convite. Cancelando grupo "${group.groupName}".`);
            const reason = `${user} se desconectou antes de responder.`;
            group.allMembers.forEach(member => {
                if (member !== user) {
                    const memberSockets = onlineUsers.get(member);
                    if (memberSockets) {
                        memberSockets.forEach(socketId => {
                            io.to(socketId).emit('group-creation-failed', { groupName: group.groupName, reason });
                        });
                    }
                }
            });
            pendingGroups.delete(groupId);
        }
    });

    // Lógica final de limpeza do usuário
    onlineUsers.delete(user);
    publicKeys.delete(user);
    io.emit('updateUserList', Array.from(onlineUsers.keys()));
  });
});

// --- ROTAS DO EXPRESS E INICIALIZAÇÃO ---
app.get('/', (req: Request, res: Response) => {
  res.send('Servidor de Chat - Node.js e TypeScript');
});

app.get('/api/status', (req: Request, res: Response) => {
  res.json({ status: 'online', users: onlineUsers.size });
});

httpServer.listen(port, () => {
  console.log(`🚀 Servidor rodando e ouvindo em http://localhost:${port}`);
});
