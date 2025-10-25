import React, { createContext, useState, useEffect, useRef, useCallback, useContext } from 'react'
import nacl from 'tweetnacl'
import { encodeBase64 } from 'tweetnacl-util'
import log from 'electron-log/renderer'
import { SocketContext } from './SocketContext'

export const UserListContext = createContext()

export function UserListProvider({ children, currentUser }) {
  const [onlineUsers, setOnlineUsers] = useState([])
  const [incomingRequests, setIncomingRequests] = useState(new Set())
  const [pendingRequests, setPendingRequests] = useState(new Set())
  const [incomingGroupInvites, setIncomingGroupInvites] = useState([])
  const userKeys = useRef(null)
  const { socket } = useContext(SocketContext)

  // Conexão, Registro e Desconexão
  useEffect(() => {
    if (!currentUser || !socket) return

    if (!userKeys.current) {
      userKeys.current = nacl.box.keyPair()
    log.info(`Criando Par de  Chaves de ${currentUser} 

    -Public key: ${encodeBase64(userKeys.current.publicKey)} 
    -Secret Key: ${encodeBase64(userKeys.current.secretKey)}
    `)
    }

    const registerUser = () => {
      socket.emit('register', currentUser)
      socket.emit('registerPublicKey', { publicKey: encodeBase64(userKeys.current.publicKey) })
    }

    const handleDisconnect = () => {
      log.info(`${currentUser} desconectou`);
    };

    if (socket.connected) {
    registerUser();
    }

    socket.on('connect', registerUser)
    socket.on('disconnect', handleDisconnect)
    return () => {
      socket.off('connect', registerUser)
      socket.on('disconnect', handleDisconnect)
    }
  }, [currentUser, socket])

  // Atualizar lista de usuário e receber convites
  useEffect(() => {
    if (!socket) return

    const onUpdateUserList = (users) => setOnlineUsers(users);
    const handleIncomingRequest = ({ from }) => {
      setIncomingRequests((prev) => new Set(prev).add(from))
      log.info(`Nova solicitação de chat de ${from}`)
    }

    socket.on('receive-chat-request', handleIncomingRequest)
    socket.on('updateUserList', onUpdateUserList);

    return () => {
      socket.off('receive-chat-request', handleIncomingRequest)
      socket.off('updateUserList', onUpdateUserList);
    }
  }, [socket])

  const sendChatRequest = (targetUserId) => {
    if (!socket || !currentUser) return;

    setPendingRequests(prev => new Set(prev).add(targetUserId));

    socket.emit('send-chat-request', {
      from: currentUser.id,
      to: targetUserId,
    });
  };

  const otherUsers = onlineUsers.filter((u) => u !== currentUser)

  const value = {
    currentUser,
    otherUsers,
    sendChatRequest,
    acceptChatRequest,
    // declineChatRequest,
    incomingRequests,
    pendingRequests,
    incomingGroupInvites,
    // sendGroupInvitation,
    // acceptGroupInvite,
    // declineGroupInvite,
  }

  return <UserListContext.Provider value={value}>{children}</UserListContext.Provider>
}

// O hook customizado 'useUserList' foi removido.
