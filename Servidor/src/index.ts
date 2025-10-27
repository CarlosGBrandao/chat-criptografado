import express, { Request, Response } from "express";
import http from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";

type PendingGroup = {
  groupId: string;
  groupName: string;
  createdBy: string;
  allMembers: string[];
  membersStatus: Map<string, "pending" | "accepted" | "declined">;
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
  cors: { origin: "*", methods: ["GET", "POST"] },
});

app.use(cors());

const onlineUsers = new Map<string, string>(); // username -> socket.id
const publicKeys = new Map<string, string>();
const pendingGroups = new Map<string, PendingGroup>();
const activeGroups = new Map<string, ActiveGroup>();

io.on("connection", (socket: Socket) => {
  console.log(`✅ Cliente conectado: ${socket.id}`);
  let connectedUsername: string | null = null;

  // --- Registro ---
  socket.on("register", (username: string) => {
    connectedUsername = username;
    if (!onlineUsers.has(username)) {
      onlineUsers.set(username, socket.id);
      console.log(`Usuário '${username}' registrado com socket ${socket.id}`);
      io.emit("updateUserList", Array.from(onlineUsers.keys()));
    }
  });

  socket.on("registerPublicKey", (data: { publicKey: string }) => {
    if (!connectedUsername || publicKeys.has(connectedUsername)) return;
    publicKeys.set(connectedUsername, data.publicKey);
    console.log(`Chave pública registrada para '${connectedUsername}'`);
  });

  socket.on("getPublicKey", (data: { username: string }) => {
    const publicKey = publicKeys.get(data.username) || null;
    socket.emit("publicKeyResponse", { username: data.username, publicKey });
  });

  // --- Chat 1-para-1 ---
  socket.on("send-chat-request", (data: { to: string }) => {
    if (!connectedUsername) return;
    const recipientSocketId = onlineUsers.get(data.to);
    if (recipientSocketId) {
      console.log(
        `➡️ Chat request de '${connectedUsername}' para '${data.to}'`
      );
      io.to(recipientSocketId).emit("receive-chat-request", {
        from: connectedUsername,
      });
    }
  });

  socket.on("accept-chat-request", (data: { to: string }) => {
    if (!connectedUsername) return;
    const recipientSocketId = onlineUsers.get(data.to);
    if (recipientSocketId) {
      console.log(
        `✅ Chat request aceito por '${connectedUsername}' para '${data.to}'`
      );
      io.to(recipientSocketId).emit("chat-request-accepted", {
        from: connectedUsername,
      });
    }
  });

  socket.on("reject-chat-request", (data: { to: string }) => {
    if (!connectedUsername) return;
    const recipientSocketId = onlineUsers.get(data.to);
    if (recipientSocketId) {
      console.log(
        `✅ Chat request rejeitado por '${connectedUsername}' para '${data.to}'`
      );
      io.to(recipientSocketId).emit("chat-request-reject", {
        from: connectedUsername,
      });
    }
  });

  /// --- Chat Group

  socket.on("create-pending-group", (data: { groupId: string; groupName: string; invitedUsers: string[] }) => {
    if (!connectedUsername) return;

    const { groupId, groupName, invitedUsers } = data;
    socket.join(groupId);
    console.log(data)
    const membersStatus = new Map<string, "pending" | "accepted" | "declined">();
    for (const user of invitedUsers) {
      membersStatus.set(user, "pending");
    }
    membersStatus.set(connectedUsername, "accepted");

    const newGroup: PendingGroup = {
      groupId,
      groupName,
      createdBy: connectedUsername,
      allMembers: [connectedUsername, ...invitedUsers],
      membersStatus,
    };

    pendingGroups.set(groupId, newGroup);

    // Enviar convite a cada membro
    invitedUsers.forEach((user) => {
      const targetSocketId = onlineUsers.get(user);
      if (targetSocketId) {
        io.to(targetSocketId).emit("receive-group-invite", {
          groupId,
          groupName,
          from: connectedUsername,
        });
      }
    });

    console.log(`📨 Grupo pendente '${groupName}' criado por ${connectedUsername}`);
  });

  socket.on("accept-group-invite", (data: { groupId: string; user: string }) => {
  const { groupId, user } = data;

  // 1️⃣ Lógica para GRUPO PENDENTE (primeira criação)
  const pendingGroup = pendingGroups.get(groupId);
  if (pendingGroup) {
    pendingGroup.membersStatus.set(user, "accepted");
    socket.join(groupId);
    console.log(`👍 ${user} aceitou o convite para o grupo pendente '${pendingGroup.groupName}'.`);

    // Verifica se todos os convidados já responderam (aceitaram ou recusaram)
    const allResolved = Array.from(pendingGroup.membersStatus.values()).every(
      (status) => status === "accepted" || status === "declined"
    );

    if (allResolved) {
      // Se todos responderam, vamos criar o grupo com quem aceitou
      const acceptedMembers = Array.from(pendingGroup.membersStatus.entries())
        .filter(([, status]) => status === "accepted")
        .map(([username]) => username);

      if (acceptedMembers.length > 1) {
        // Crie o grupo ativo
        activeGroups.set(pendingGroup.groupId, {
          groupId: pendingGroup.groupId,
          groupName: pendingGroup.groupName,
          owner: pendingGroup.createdBy,
          members: new Set(acceptedMembers),
        });

        // Notifica todos que aceitaram que o grupo foi criado
        acceptedMembers.forEach((member) => {
          const targetSocketId = onlineUsers.get(member);
          if (targetSocketId) {
            io.to(targetSocketId).emit("group-created", {
              groupId: pendingGroup.groupId,
              groupName: pendingGroup.groupName,
              owner: pendingGroup.createdBy,
              members: acceptedMembers,
            });
          }
        });
        console.log(`✅ Grupo '${pendingGroup.groupName}' criado com ${acceptedMembers.length} membros.`);
      
      } else {
        // Falha na criação do grupo (membros insuficientes)
        console.log(`❌ Grupo '${pendingGroup.groupName}' falhou, membros insuficientes.`);
        const creatorSocketId = onlineUsers.get(pendingGroup.createdBy);
        if (creatorSocketId) {
          // Notifica o criador que o grupo falhou
          io.to(creatorSocketId).emit("group-creation-failed", {
            groupId: pendingGroup.groupId,
            groupName: pendingGroup.groupName,
            reason: "Membros insuficientes aceitaram."
          });
        }
      }
      
      // Limpa o grupo da lista de pendentes
      pendingGroups.delete(groupId);
    }
    // Se nem todos responderam, não fazemos nada. Apenas esperamos.
    return;
  }

  // 2️⃣ Lógica para GRUPO ATIVO (adicionando novo membro por um admin)
  const activeGroup = activeGroups.get(groupId);
  if (activeGroup) {
    activeGroup.members.add(user);
    socket.join(groupId);

    // Notifica o novo membro para entrar no grupo
    const userSocketId = onlineUsers.get(user);
    if (userSocketId) {
      io.to(userSocketId).emit("joined-existing-group", {
        groupId: activeGroup.groupId,
        groupName: activeGroup.groupName,
        owner: activeGroup.owner,
        members: Array.from(activeGroup.members),
      });
    }

    // Notifica os outros membros do grupo que alguém novo entrou
    activeGroup.members.forEach((member) => {
      const socketId = onlineUsers.get(member);
      if (socketId && member !== user) {
        io.to(socketId).emit("group-membership-changed", {
          members: Array.from(activeGroup.members)
        });
      }
    });

    console.log(`👥 ${user} aceitou o convite e entrou no grupo ATIVO '${activeGroup.groupName}'`);
  }
});

  
  socket.on("decline-group-invite", (data: { groupId: string; user: string }) => {
    const { groupId, user } = data;
    const pendingGroup = pendingGroups.get(groupId);

    // 1. Verifica se o grupo pendente ainda existe
    if (!pendingGroup) {
      console.log(`Tentativa de recusar convite para grupo ${groupId} que não está pendente.`);
      return;
    }

    // 2. Atualiza o status do usuário para "recusado"
    pendingGroup.membersStatus.set(user, "declined");
    console.log(`❌ ${user} recusou o convite para o grupo '${pendingGroup.groupName}'.`);

    // 3. Notifica APENAS o criador sobre a recusa específica
    const creatorSocketId = onlineUsers.get(pendingGroup.createdBy);
    if (creatorSocketId) {
      io.to(creatorSocketId).emit("group-invite-rejected", {
        groupId: groupId,
        rejectedUserId: user 
      });
    }

    // 4. Verifica se todos os convidados já responderam (aceitaram ou recusaram)
    const allResolved = Array.from(pendingGroup.membersStatus.values()).every(
      (status) => status === "accepted" || status === "declined"
    );

    if (allResolved) {
      // Se todos responderam, vamos criar o grupo com quem aceitou
      const acceptedMembers = Array.from(pendingGroup.membersStatus.entries())
        .filter(([, status]) => status === "accepted")
        .map(([username]) => username);

      if (acceptedMembers.length > 1) {
        // Crie o grupo ativo se houver pelo menos 2 pessoas (incluindo o criador)
        activeGroups.set(pendingGroup.groupId, {
          groupId: pendingGroup.groupId,
          groupName: pendingGroup.groupName,
          owner: pendingGroup.createdBy,
          members: new Set(acceptedMembers),
        });

        // Notifica todos que aceitaram que o grupo foi criado
        acceptedMembers.forEach((member) => {
          const targetSocketId = onlineUsers.get(member);
          if (targetSocketId) {
            io.to(targetSocketId).emit("group-created", {
              groupId: pendingGroup.groupId,
              groupName: pendingGroup.groupName,
              owner: pendingGroup.createdBy,
              members: acceptedMembers,
            });
          }
        });
        console.log(`✅ Grupo '${pendingGroup.groupName}' criado com ${acceptedMembers.length} membros.`);
      
      } else {
        // Falha na criação do grupo (membros insuficientes)
        console.log(`❌ Grupo '${pendingGroup.groupName}' falhou, membros insuficientes.`);
        if (creatorSocketId) {
          // Notifica o criador que o grupo falhou
          io.to(creatorSocketId).emit("group-creation-failed", {
            groupId: pendingGroup.groupId,
            groupName: pendingGroup.groupName,
            reason: "Membros insuficientes aceitaram."
          });
        }
      }
      
      // 5. Limpa o grupo da lista de pendentes
      pendingGroups.delete(groupId);
    }
  });

  // Distribuição de Chave Simetrica no Grupo
  socket.on("distribute-new-group-key", (data: {to: string, groupId: string,keyPayload: any}) => {
    if(!data) return;
    const {to, groupId, keyPayload} = data;
    const targetSocketId = onlineUsers.get(to);

    io.to(targetSocketId as string).emit("receive-new-group-key", {
          groupId,
          keyPayload
    });
  })
  
  socket.on("admin-add-member", (data : {memberName: string, groupId: string}) => {
    if(!data) return;

    const {memberName, groupId} = data;
    const userSocketId = onlineUsers.get(memberName);
    const group = activeGroups.get(groupId);
    if(!userSocketId || !group) return;
    io.to(userSocketId).emit("receive-group-invite", {
          groupId,
          groupName: group.groupName,
          from: connectedUsername,
        });
  })

  socket.on("admin-remove-member", (data : {memberName: string, groupId: string}) => {
    if(!data) return;

    const {memberName, groupId} = data;
    const group = activeGroups.get(groupId);

    if(!group) {console.log("Group nao existe"); return};

    group.members.delete(memberName);
    activeGroups.set(groupId, group);

    console.log(`Membro ${memberName} removido do grupo ${groupId}`);

    [...group.members, memberName].forEach((member) => {
      const socketId = onlineUsers.get(member);
      if (socketId) {
        io.to(socketId).emit("group-membership-changed", {
          members: Array.from(group.members)
        });
      }
    });
  })


  socket.on("joinChatRoom", (data: { roomName: string; username: string }) => {
    if(socket.rooms.has(data.roomName)) return;
    socket.join(data.roomName);
    console.log(
      `Usuário '${data.username}' (socket ${socket.id}) entrou na sala de chat: ${data.roomName}`
    );
  });

  socket.on("messageToRoom", (data: { roomName: string; message: any, from: string }) => {
    const { roomName, message, from } = data;
    console.log(from,"enviando Mensagem", message);

    socket.to(roomName).emit("receiveMessage", {
      message: message,
      from
    });
  });

  // --- Desconexão ---

  socket.on("leave-room", (data: { roomName: string }) => {
    socket.leave(data.roomName);
    console.log(`${socket.id} saiu da room ${data.roomName}`);
    socket.to(data.roomName).emit("partner-disconnected");
  });

  socket.on('admin-leave', (data: { groupId: string }) => {
    socket.leave(data.groupId);
    console.log(`${socket.id} saiu do grupo ${data.groupId}`);
    socket.to(data.groupId).emit('group-terminated');
  })

  socket.on('member-leave', (data: { groupId: string , memberName: string}) => {
    const {memberName, groupId} = data;
    const group = activeGroups.get(groupId);

    if(!group) {console.log("Group nao existe"); return};

    group.members.delete(memberName);
    activeGroups.set(groupId, group);

    console.log(`Membro ${memberName} saiu do grupo ${groupId}`);

    [...group.members, memberName].forEach((member) => {
      const socketId = onlineUsers.get(member);
      if (socketId) {
        io.to(socketId).emit("group-membership-changed", {
          members: Array.from(group.members)
        });
      }
    });
  })

  socket.on("disconnecting", () => {
    console.log(socket.rooms);
    for (const room of socket.rooms) {
      if (room !== socket.id) {
        console.log(`   ...avisando sala ${room} que saiu.`);
        socket.to(room).emit("partner-disconnected");
      }
    }
  });

  socket.on("disconnect", () => {
    if (!connectedUsername) return;

    console.log(`❌ Usuário desconectou: ${connectedUsername} (${socket.id})`);
    onlineUsers.delete(connectedUsername);
    publicKeys.delete(connectedUsername);

    // Limpar grupos ativos
    activeGroups.forEach((group, groupId) => {
      if (group.owner === connectedUsername) {
        io.to(groupId).emit("group-terminated", { groupId });
        activeGroups.delete(groupId);
      } else if (group.members.has(connectedUsername as string)) {
        group.members.delete(connectedUsername as string);
        io.to(groupId).emit("group-membership-changed", {
          groupId,
          members: Array.from(group.members),
          message: `${connectedUsername} se desconectou`,
        });
      }
    });

    // Limpar grupos pendentes
    pendingGroups.forEach((group, groupId) => {
      if (group.allMembers.includes(connectedUsername as string)) {
        const reason = `${connectedUsername} se desconectou antes de aceitar o convite`;
        group.allMembers.forEach((member) => {
          if (member !== connectedUsername) {
            const memberSocketId = onlineUsers.get(member);
            if (memberSocketId) {
              io.to(memberSocketId).emit("group-creation-failed", {
                groupName: group.groupName,
                reason,
              });
            }
          }
        });
        pendingGroups.delete(groupId);
      }
    });

    io.emit("updateUserList", Array.from(onlineUsers.keys()));
  });
});

// --- Rotas Express ---
app.get("/", (req: Request, res: Response) =>
  res.send("Servidor de Chat Online")
);
app.get("/api/status", (req: Request, res: Response) => {
  res.json({ status: "online", users: onlineUsers.size });
});

httpServer.listen(port, () =>
  console.log(`🚀 Servidor rodando em http://localhost:${port}`)
);
