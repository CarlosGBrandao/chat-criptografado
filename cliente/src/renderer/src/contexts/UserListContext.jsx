import React, { createContext, useState, useEffect, useRef, useCallback, useContext } from 'react'
import nacl from 'tweetnacl'
import { encodeBase64 } from 'tweetnacl-util'
import log from 'electron-log/renderer'
import { SocketContext } from './SocketContext'
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';

export const UserListContext = createContext()

export function UserListProvider({ children, currentUser }) {
  const [onlineUsers, setOnlineUsers] = useState([])
  const [incomingRequests, setIncomingRequests] = useState(new Set())
  const [pendingRequests, setPendingRequests] = useState(new Set())
  const [incomingGroupInvites, setIncomingGroupInvites] = useState([])
  const [pendingSentGroupInvites, setPendingSentGroupInvites] = useState([])
  const userKeys = useRef(null)
  const navigate = useNavigate();
  const { socket } = useContext(SocketContext)

  // Conexão, Registro e Desconexão
  useEffect(() => {
    if (!currentUser || !socket) return

    // 1. AQUI É A CORREÇÃO CRÍTICA DA ESTRUTURA
    if (!userKeys.current) {
      userKeys.current = {
        box: nacl.box.keyPair(),  // Chave para Criptografia (Salsa20/Curve25519)
        sign: nacl.sign.keyPair() // Chave para Assinatura (Ed25519)
      }
      
      log.info(`🔐 Par de chaves gerado para ${currentUser}`)
      log.info(`→ Box Public Key: ${encodeBase64(userKeys.current.box.publicKey)}`)
      log.info(`→ Sign Public Key: ${encodeBase64(userKeys.current.sign.publicKey)}`)
    }

    const registerUser = () => {
      socket.emit('register', currentUser)
      
      // 2. AQUI ENVIAMOS A CHAVE PÚBLICA CORRETA (.box)
      // Se o backend esperar também a chave de assinatura, adicione: signKey: ...
      socket.emit('registerPublicKey', { 
        publicKey: encodeBase64(userKeys.current.box.publicKey),
        signKey: encodeBase64(userKeys.current.sign.publicKey) // Enviando ambas por precaução
      })
    }

    if (socket.connected) {
      registerUser()
    }

    socket.on('connect', registerUser)
    return () => {
      socket.off('connect', registerUser)
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
    }
    const handleIncomingGroupRequest = (dataGroup) => {
      setIncomingGroupInvites((prev) => [...prev, dataGroup]);
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
    const handleRequestCreateGroup = (data) => {
      setPendingSentGroupInvites((prev) => 
        prev.filter(group => group.groupId !== data.groupId)
      );
      
      navigate(
        `/chatGroup?groupId=${data.groupId}&groupName=${encodeURIComponent(data.groupName)}&owner=${data.owner}&members=${data.members.join(',')}&currentUser=${currentUser}`
      );
    }

    const handleGroupInviteRejected = ({ groupId, rejectedUserId }) => {
      setPendingSentGroupInvites(prevInvites => 
        prevInvites.map(group => {
          if (group.groupId === groupId) {
            const updatedPendingMembers = group.pendingMembers.filter(
              memberId => memberId !== rejectedUserId
            );
            return {
              ...group,
              pendingMembers: updatedPendingMembers
            };
          }
          return group;
        })
        
        .filter(group => group.pendingMembers.length > 0)
      );
    };

    const handleGroupCreationFailed = ({ groupId }) => {
      setPendingSentGroupInvites((prev) => 
        prev.filter(group => group.groupId !== groupId)
      );
    };

    socket.on('receive-chat-request', handleIncomingRequest)
    socket.on("receive-group-invite", handleIncomingGroupRequest)
    socket.on('chat-request-accepted', handleRequestAccepted)
    socket.on('chat-request-reject', handleRequestRejected)
    socket.on("group-created",handleRequestCreateGroup)
    socket.on("joined-existing-group", handleRequestCreateGroup)
    socket.on('updateUserList', onUpdateUserList)
    socket.on("group-invite-rejected", handleGroupInviteRejected)
    socket.on("group-creation-failed", handleGroupCreationFailed) 
    return () => {
      socket.off('receive-chat-request', handleIncomingRequest)
      socket.off('chat-request-accepted', handleRequestAccepted)
      socket.off('chat-request-reject', handleRequestRejected)
      socket.off("group-created",handleRequestCreateGroup)
      socket.off('updateUserList', onUpdateUserList)
      socket.off("group-invite-rejected", handleGroupInviteRejected)
      socket.off("group-creation-failed", handleGroupCreationFailed) 
    }
  }, [socket,currentUser])

  const sendChatRequest = (targetUserId) => {
    if (!socket || !currentUser) return

    setPendingRequests((prev) => {
      const newSet = new Set(prev) 
      newSet.add(targetUserId) 
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

  const sendGroupInvitation = (groupName, selectedUsers) => {
    const newGroupId = uuidv4();
    const newPendingGroup = {
      groupId: newGroupId,
      groupName: groupName,
      pendingMembers: selectedUsers 
    };

    setPendingSentGroupInvites((prev) => [...prev, newPendingGroup]);

    socket.emit("create-pending-group", {
      groupId: newGroupId,
      groupName,
      invitedUsers: selectedUsers,
    });
  }

  const acceptGroupInvite = (groupId) => {
  if (!socket || !currentUser) return;
  socket.emit("accept-group-invite", { groupId, user: currentUser });
    
    // Remove convite aceito da lista
    setIncomingGroupInvites((prev) => prev.filter(invite => invite.groupId !== groupId));
  };

  const declineGroupInvite = (groupId) => {
  if (!socket || !currentUser) return;
  socket.emit("decline-group-invite", { groupId, user: currentUser });

  // Remove convite recusado da lista
    setIncomingGroupInvites((prev) => prev.filter(invite => invite.groupId !== groupId));
  };

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
    userKeys: userKeys.current,
    pendingSentGroupInvites,
    sendGroupInvitation,
    acceptGroupInvite,
    declineGroupInvite,
  }

  return <UserListContext.Provider value={value}>{children}</UserListContext.Provider>
}

// O hook customizado 'useUserList' foi removido.
