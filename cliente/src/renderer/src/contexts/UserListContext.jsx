import React, { createContext, useState, useEffect, useRef, useCallback } from 'react';
import { socket } from '../socket';
import nacl from 'tweetnacl';
import { encodeBase64 } from 'tweetnacl-util';
import log from 'electron-log/renderer';


export const UserListContext = createContext();

// Provedor
export function UserListProvider({ children, currentUser }) {
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [incomingRequests, setIncomingRequests] = useState(new Set());
  const [pendingRequests, setPendingRequests] = useState(new Set());
  const [incomingGroupInvites, setIncomingGroupInvites] = useState([]);
  const userKeys = useRef(null);

  const handleOpenChatWindow = useCallback((chatWithUser, initiator = false) => {
    if (!userKeys.current) return;
    const keyInfo = {
      publicKey: encodeBase64(userKeys.current.publicKey),
      secretKey: encodeBase64(userKeys.current.secretKey)
    };
    window.api.openChatWindow({ currentUser, chatWithUser, keyInfo, initiator});
  }, [currentUser]);

  const sendChatRequest = (user) => {
    socket.emit('send-chat-request', { to: user });
    setPendingRequests(prev => new Set(prev).add(user));
  };

  const acceptChatRequest = (user) => {
    socket.emit('accept-chat-request', { to: user });
    setIncomingRequests(prev => {
      const newSet = new Set(prev);
      newSet.delete(user);
      return newSet;
    });
    handleOpenChatWindow(user);
  };

  const declineChatRequest = (user) => {
    setIncomingRequests(prev => {
      const newSet = new Set(prev);
      newSet.delete(user);
      return newSet;
    });
  };

  useEffect(() => {
    if (!currentUser) return;

    if (!userKeys.current) {
      userKeys.current = nacl.box.keyPair()
      log.info(`Criando Par de  Chaves de ${currentUser} 

      -Public key: ${encodeBase64(userKeys.current.publicKey)} 
      -Secret Key: ${encodeBase64(userKeys.current.secretKey)}
      `)
    };
    if (!socket.connected) socket.connect();

    const onConnect = () => {
      socket.emit('register', currentUser);
      socket.emit('registerPublicKey', { publicKey: encodeBase64(userKeys.current.publicKey) });
    };

    const onUpdateUserList = (users) => setOnlineUsers(users);
    const onReceiveChatRequest = ({ from }) => setIncomingRequests(prev => new Set(prev).add(from));
    const onChatRequestAccepted = ({ from }) => {
      setPendingRequests(prev => {
        const newSet = new Set(prev);
        newSet.delete(from);
        return newSet;
      });
      handleOpenChatWindow(from, true);
    };

    socket.on('connect', onConnect);
    socket.on('updateUserList', onUpdateUserList);
    socket.on('receive-chat-request', onReceiveChatRequest);
    socket.on('chat-request-accepted', onChatRequestAccepted);

    return () => {
      socket.off('connect', onConnect);
      socket.off('updateUserList', onUpdateUserList);
      socket.off('receive-chat-request', onReceiveChatRequest);
      socket.off('chat-request-accepted', onChatRequestAccepted);
    };
  }, [currentUser, handleOpenChatWindow]);

  useEffect(() => {
    if (!socket) return; // Não faz nada se o socket não estiver conectado

    // Listener para receber um convite de grupo
    const handleGroupInvitation = (inviteData) => {
      log.info(`[CONVITE] Convite recebido de '${inviteData.from}' para o grupo '${inviteData.groupName}' (ID: ${inviteData.groupId})`);
      // inviteData deve ser um objeto como: { groupId, groupName, from }
      setIncomingGroupInvites(prevInvites => [...prevInvites, inviteData]);
    };

    // Listener para quando um grupo é finalmente criado e a janela de chat deve ser aberta
    const handleGroupChatStart = (groupData) => {
      console.log('Iniciando chat de grupo:', groupData);
      // groupData deve ser algo como: { groupId, groupName, members }
      if (!userKeys.current) return;
      const keyInfo = {
        publicKey: encodeBase64(userKeys.current.publicKey),
        secretKey: encodeBase64(userKeys.current.secretKey)
      };
      // Abre a janela de chat do grupo usando a API do preload
      if (window.api && window.api.openChatGroupWindow) {
        window.api.openChatGroupWindow({...groupData, currentUser,keyInfo});
      } else {
        console.error('API openChatGroupWindow não encontrada no preload!');
      }

      // Opcional: Limpa o convite correspondente da UI
      setIncomingGroupInvites(prevInvites => 
        prevInvites.filter(invite => invite.groupId !== groupData.groupId)
      );
    };
    
    // Listener para caso a criação do grupo falhe (alguém recusou)
    const handleGroupCreationFailed = ({ groupName, reason }) => {
        alert(`A criação do grupo "${groupName}" falhou. Motivo: ${reason}`);
        // Aqui você pode implementar uma lógica para remover convites pendentes que você enviou
    };

    // Registrar os listeners
    socket.on('group-invitation-received', handleGroupInvitation);
    socket.on('group-chat-starting', handleGroupChatStart);
    socket.on('group-creation-failed', handleGroupCreationFailed);

    // Função de limpeza para remover os listeners quando o componente desmontar
    return () => {
      socket.off('group-invitation-received', handleGroupInvitation);
      socket.off('group-chat-starting', handleGroupChatStart);
      socket.off('group-creation-failed', handleGroupCreationFailed);
    };
  }, [socket]);

  /**
   * Envia convites para um novo grupo para o servidor.
   * @param {string} groupName - O nome do grupo desejado.
   * @param {string[]} selectedUsers - Um array com os usernames dos usuários convidados.
   */
  const sendGroupInvitation = (groupName, selectedUsers) => {
    if (!socket) return alert('Conexão não estabelecida.');
    
    log.info(`[GRUPO] Enviando convites para o grupo '${groupName}' para: [${selectedUsers.join(', ')}]`);
    socket.emit('send-group-invite', { groupName, members: selectedUsers });
  };

  const acceptGroupInvite = (groupId) => {
    if (!socket) return alert('Conexão não estabelecida.');

    log.info(`[CONVITE] Aceitando convite para o grupo ID: ${groupId}`);
    
    socket.emit('accept-group-invite', { groupId });
    
    // Remove o convite da UI imediatamente para o usuário não clicar duas vezes
    setIncomingGroupInvites(prevInvites => 
      prevInvites.filter(invite => invite.groupId !== groupId)
    );
  };

  /**
   * Recusa um convite de grupo.
   * @param {string} groupId - O ID do convite/grupo que está sendo recusado.
   */
  const declineGroupInvite = (groupId) => {
    if (!socket) return alert('Conexão não estabelecida.');

    log.info(`[CONVITE] Recusando convite para o grupo ID: ${groupId}`);
    
    socket.emit('decline-group-invite', { groupId });

    // Remove o convite da UI
    setIncomingGroupInvites(prevInvites => 
      prevInvites.filter(invite => invite.groupId !== groupId)
    );
  };

  const otherUsers = onlineUsers.filter(u => u !== currentUser);

  const value = {
    currentUser,
    otherUsers,
    incomingRequests,
    pendingRequests,
    incomingGroupInvites,
    sendChatRequest,
    acceptChatRequest,
    declineChatRequest,
    sendGroupInvitation,
    acceptGroupInvite,
    declineGroupInvite,
  };

  return (
    <UserListContext.Provider value={value}>
      {children}
    </UserListContext.Provider>
  );
}

// O hook customizado 'useUserList' foi removido.