import React, { createContext, useState, useEffect, useRef, useCallback, useContext } from 'react'
import nacl from 'tweetnacl'
import { encodeBase64 } from 'tweetnacl-util'
import log from 'electron-log/renderer'
import { SocketContext } from './SocketContext'
import { useNavigate } from 'react-router-dom';
export const UserListContext = createContext()

export function UserListProvider({ children, currentUser }) {
  const [onlineUsers, setOnlineUsers] = useState([])
  const [incomingRequests, setIncomingRequests] = useState(new Set())
  const [pendingRequests, setPendingRequests] = useState(new Set())
  const [incomingGroupInvites, setIncomingGroupInvites] = useState([])
  const userKeys = useRef(null)
  const navigate = useNavigate();
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
      log.info(`${currentUser} desconectou`)
    }

    if (socket.connected) {
      registerUser()
    }

    socket.on('connect', registerUser)
    socket.on('disconnect', handleDisconnect)
    return () => {
      socket.off('connect', registerUser)
      socket.off('disconnect', handleDisconnect)
    }
  }, [currentUser, socket])

  // Atualizar lista de usuário e receber convites
  useEffect(() => {
    if (!socket || !currentUser) return

    const onUpdateUserList = (users) => setOnlineUsers(users)
    const handleIncomingRequest = ({ from }) => {
      setIncomingRequests((prev) => {
        const newSet = new Set(prev)
        newSet.add(from)
        return newSet
      })
      log.info(`Nova solicitação de chat de ${from}`)
    }
    const handleRequestAccepted = ({ from }) => {
      setPendingRequests((prev) => {
        const newSet = new Set(prev)
        newSet.delete(from)
        return newSet
      })
      navigate(`/chat?currentUser=${currentUser}&chatWithUser=${from}&initiator=true`);
    }
    const handleRequestRejected = ({from}) => {
      setPendingRequests((prev) => {
        const newSet = new Set(prev)
        newSet.delete(from)
        return newSet
      })
    }

    socket.on('receive-chat-request', handleIncomingRequest)
    socket.on('chat-request-accepted', handleRequestAccepted)
    socket.on('chat-request-reject', handleRequestRejected)
    socket.on('updateUserList', onUpdateUserList)
    return () => {
      socket.off('receive-chat-request', handleIncomingRequest)
      socket.off('chat-request-accepted', handleRequestAccepted)
      socket.off('chat-request-reject', handleRequestRejected)
      socket.off('updateUserList', onUpdateUserList)
    }
  }, [socket,currentUser])

  const sendChatRequest = (targetUserId) => {
    if (!socket || !currentUser) return

    setPendingRequests((prev) => {
      const newSet = new Set(prev) 
      newSet.delete(targetUserId) 
      return newSet
    })

    socket.emit('send-chat-request', {
      from: currentUser.id,
      to: targetUserId
    })
  }

  const acceptChatRequest = (targetUserId) => {
    if (!socket || !currentUser) return

    setIncomingRequests((prev) => {
      const newSet = new Set(prev) 
      newSet.delete(targetUserId) 
      return newSet
    })
    navigate(`/chat?currentUser=${currentUser}&chatWithUser=${targetUserId}&initiator=false`);

    socket.emit('accept-chat-request', {
      from: currentUser,
      to: targetUserId
    })

  }

  const declineChatRequest = (targetUserId) => {
    if (!socket || !currentUser) return

    setIncomingRequests((prev) => {
      const newSet = new Set(prev) 
      newSet.delete(targetUserId) 
      return newSet
    })
    
    socket.emit('reject-chat-request', {
      from: currentUser,
      to: targetUserId
    })
  }

  const otherUsers = onlineUsers.filter((u) => u !== currentUser)

  const value = {
    currentUser,
    otherUsers,
    sendChatRequest,
    acceptChatRequest,
    declineChatRequest,
    incomingRequests,
    pendingRequests,
    incomingGroupInvites,
    userKeys: userKeys.current
    // sendGroupInvitation,
    // acceptGroupInvite,
    // declineGroupInvite,
  }

  return <UserListContext.Provider value={value}>{children}</UserListContext.Provider>
}

// O hook customizado 'useUserList' foi removido.
