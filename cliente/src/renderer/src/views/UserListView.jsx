// src/views/UserListView.jsx

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { UserIcon } from '../components/UserIcon';
import { socket } from '../socket';
import nacl from 'tweetnacl';
import { encodeBase64 } from 'tweetnacl-util';

export function UserListView({ currentUser }) {
  const [onlineUsers, setOnlineUsers] = useState([]);
  const userKeys = useRef(null);

  // NOVO: Estados para gerenciar o fluxo de pedidos
  const [incomingRequests, setIncomingRequests] = useState(new Set());
  const [pendingRequests, setPendingRequests] = useState(new Set());

  // A função para abrir a janela de chat permanece a mesma, pois é o passo final.
  const handleOpenChatWindow = useCallback((chatWithUser) => {
    if (!userKeys.current) return;
    const keyInfo = {
      publicKey: encodeBase64(userKeys.current.publicKey),
      secretKey: encodeBase64(userKeys.current.secretKey)
    };
    window.api.openChatWindow({ currentUser, chatWithUser, keyInfo });
  }, [currentUser]);

  // NOVO: Funções para o fluxo de pedido/aceitação
  const sendChatRequest = (user) => {
    socket.emit('send-chat-request', { to: user });
    setPendingRequests(prev => new Set(prev).add(user));
  };

  const acceptChatRequest = (user) => {
    socket.emit('accept-chat-request', { to: user });
    // Remove o pedido da lista de recebidos
    setIncomingRequests(prev => {
      const newSet = new Set(prev);
      newSet.delete(user);
      return newSet;
    });
    // Abre a janela de chat imediatamente para quem aceitou
    handleOpenChatWindow(user);
  };

  const declineChatRequest = (user) => {
    setIncomingRequests(prev => {
      const newSet = new Set(prev);
      newSet.delete(user);
      return newSet;
    });
    // Opcional: emitir um evento para notificar o outro usuário da recusa
  };

  useEffect(() => {
    if (!userKeys.current) userKeys.current = nacl.box.keyPair();
    if (!socket.connected) socket.connect();

    const onConnect = () => {
      socket.emit('register', currentUser);
      socket.emit('registerPublicKey', { publicKey: encodeBase64(userKeys.current.publicKey) });
    };

    const onUpdateUserList = (users) => setOnlineUsers(users);

    // NOVO: Listener para quando recebemos um pedido de chat
    const onReceiveChatRequest = ({ from }) => {
      setIncomingRequests(prev => new Set(prev).add(from));
    };

    // NOVO: Listener para quando nosso pedido é aceito
    const onChatRequestAccepted = ({ from }) => {
      // Remove o pedido da lista de pendentes
      setPendingRequests(prev => {
        const newSet = new Set(prev);
        newSet.delete(from);
        return newSet;
      });
      // Abre a janela de chat para o solicitante original
      handleOpenChatWindow(from);
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

  const otherUsers = onlineUsers.filter(u => u !== currentUser);

  return (
    <div className="bg-gray-900 min-h-screen text-white flex flex-col items-center justify-center font-sans gap-10">
      <div>
        <h1 className='text-5xl font-bold'>Bem-vindo, {currentUser}!</h1>
        <p className='text-lg'>Usuários online:</p>
      </div>
      
      <div className='flex flex-col gap-4 w-full justify-center min-h-[100px] items-center'>
        {otherUsers.length > 0 ? (
          otherUsers.map(user => {
            // Lógica de renderização condicional
            if (incomingRequests.has(user)) {
              return (
                <div key={user} className="flex items-center gap-4 bg-gray-700 p-3 rounded-lg">
                  <p className="text-white">{user} quer conversar com você.</p>
                  <button onClick={() => acceptChatRequest(user)} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg">Aceitar</button>
                  <button onClick={() => declineChatRequest(user)} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg">Recusar</button>
                </div>
              );
            } else if (pendingRequests.has(user)) {
              return (
                <div key={user} className="flex items-center gap-4">
                  <UserIcon currentUser={user} />
                  <p className="text-gray-400">Pedido enviado...</p>
                </div>
              );
            } else {
              return <UserIcon key={user} currentUser={user} onClick={() => sendChatRequest(user)} />;
            }
          })
        ) : (
          <p className="text-gray-400">Nenhum outro usuário online.</p>
        )}
      </div>
    </div>
  );
}