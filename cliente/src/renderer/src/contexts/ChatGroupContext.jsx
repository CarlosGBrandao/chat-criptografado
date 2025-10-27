import React, { createContext, useState, useEffect, useRef, useContext, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import log from 'electron-log/renderer'
import nacl from 'tweetnacl'
import { decodeBase64, encodeBase64 } from 'tweetnacl-util'
import { SocketContext } from './SocketContext'
import { UserListContext } from './UserListContext'
import { useNavigate } from 'react-router-dom'
export const ChatGroupContext = createContext()

export function ChatGroupProvider({ children }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const currentUser = searchParams.get('currentUser')
  const groupId = searchParams.get('groupId')
  const groupName = searchParams.get('groupName')
  const owner = searchParams.get('owner')
  const initialMembers = searchParams.get('members')?.split(',') || []

  const { socket } = useContext(SocketContext)
  const { userKeys, otherUsers } = useContext(UserListContext)

  const [members, setMembers] = useState(initialMembers)
  const [ownKeys, setOwnKeys] = useState(userKeys)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')

  const [membersPublicKeys, setMembersPublicKeys] = useState(new Map())
  const [isChannelSecure, setIsChannelSecure] = useState(false)

  const groupSessionKey = useRef(null)

  const [isGroupTerminated, setIsGroupTerminated] = useState(false)
  const [pendingKeyPayload, setPendingKeyPayload] = useState(null)
  /// Se conectar na Room, SOLICITA AS CHAVES
  useEffect(() => {
    if (!ownKeys || !socket || !groupId || !currentUser || !members) return

    log.info(`${currentUser} Entrando na sala ${groupId} e buscando chaves.`)
    socket.emit('joinChatRoom', { roomName: groupId, username: currentUser })

    members.forEach((member) => {
      if (member !== currentUser) {
        log.info(`--> Solicitando chave pública para: ${member}`)
        socket.emit('getPublicKey', { username: member })
      }
    })
  }, [socket, members, currentUser, groupId, ownKeys])

  // Listener para receber as chaves públicas e atualizar membros
  useEffect(() => {
    if (!socket) return

    const handlePublicKeyResponse = (data) => {
      if (data.publicKey) {
        log.info(`[TODOS] Chave pública recebida para: ${data.username}`)
        setMembersPublicKeys((prevMap) =>
          new Map(prevMap).set(data.username, decodeBase64(data.publicKey))
        )
      } else {
        log.warn(`[TODOS] Resposta de chave pública vazia para: ${data.username}`)
      }
    }

    const handleAdminLeave = () => {
        setIsGroupTerminated(true);
    }

    socket.on('publicKeyResponse', handlePublicKeyResponse)
    socket.on('group-terminated',handleAdminLeave)
    return () => {
        socket.off('publicKeyResponse', handlePublicKeyResponse)
        socket.off('group-terminated',handleAdminLeave)

    }
  }, [socket])

  // Dono Criptografa e Distribui
  useEffect(() => {
    if (currentUser !== owner || !ownKeys || !socket || !members || isGroupTerminated) {
      return
    }

    const hasOtherMembers = members.length > 1
    if (!hasOtherMembers && members.includes(currentUser)) {
      log.info(`[DONO] Dono é o único membro. Canal seguro.`)
      setIsChannelSecure(true)
      return
    }

    const expectedKeyCount = members.length - 1
    if (membersPublicKeys.size < expectedKeyCount) {
      log.info(
        `[DONO] Aguardando chaves públicas. Recebidas ${membersPublicKeys.size} de ${expectedKeyCount}.`
      )
      return
    }

    log.info(
      `[DONO] Todas as ${expectedKeyCount} chaves recebidas. Gerando e distribuindo nova chave de sessão para o grupo ${groupName}.`
    )

    const newKey = nacl.randomBytes(nacl.secretbox.keyLength)
    groupSessionKey.current = newKey
    setIsChannelSecure(true)

    log.info(`[DONO] Chave de sessao (secreta) gerada para o grupo: ${encodeBase64(newKey)}`)

    const publicKeysLog = Array.from(membersPublicKeys.entries())
      .map(([username, pubKey]) => `  - ${username}: ${encodeBase64(pubKey)}`)
      .join('\n')

    if (publicKeysLog) {
      log.info(
        `[DONO] Chaves publicas dos membros que serao usadas para criptografia:\n${publicKeysLog}`
      )
    }

    members.forEach((member) => {
      if (member !== currentUser) {
        const recipientPublicKey = membersPublicKeys.get(member)
        if (recipientPublicKey) {
          const nonce = nacl.randomBytes(nacl.box.nonceLength)
          const encryptedKey = nacl.box(newKey, nonce, recipientPublicKey, ownKeys.secretKey)

          log.info(
            `[DONO] Criptografando chave para '${member}':\n` +
              `  Box: ${encodeBase64(encryptedKey)}\n` +
              `  Nonce: ${encodeBase64(nonce)}`
          )

          const keyPayload = {
            box: encodeBase64(encryptedKey),
            nonce: encodeBase64(nonce)
          }

          socket.emit('distribute-new-group-key', {
            to: member,
            groupId,
            keyPayload
          })
        } else {
          log.warn(
            `[DONO] Ia enviar chave para '${member}', mas não encontrei sua chave pública no mapa.`
          )
        }
      }
    })
  }, [
    socket,
    membersPublicKeys,
    members,
    ownKeys,
    currentUser,
    owner,
    groupId,
    groupName,
    isGroupTerminated
  ])

  //  Lógica para receber mensagens, chaves e atualizações de membros
  useEffect(() => {
    if (!ownKeys || !socket) return

    // Recebe e decifra a chave de sessão enviada pelo dono
    const handleReceiveKey = (data) => {
      if (data.groupId !== groupId || currentUser === owner || isGroupTerminated) return

      const ownerPublicKey = membersPublicKeys.get(owner)
      if (ownerPublicKey) {
        log.info(
          `[MEMBRO] Chave de sessao criptografada de '${owner}' recebida:\n` +
            `  Box: ${data.keyPayload.box}\n` +
            `  Nonce: ${data.keyPayload.nonce}`
        )

        const receivedKey = nacl.box.open(
          decodeBase64(data.keyPayload.box),
          decodeBase64(data.keyPayload.nonce),
          ownerPublicKey,
          ownKeys.secretKey
        )
        if (receivedKey) {
          groupSessionKey.current = receivedKey
          setIsChannelSecure(true)
          setPendingKeyPayload(null)
          log.info(
            `[MEMBRO] Nova chave de sessão decifrada com sucesso para o grupo ${groupName}. Canal seguro!`
          )
        } else {
          log.error(`[MEMBRO] FALHA ao decifrar a chave de sessão recebida de '${owner}'.`)
        }
      } else {
        log.warn(
          `[MEMBRO] Recebi uma chave de sessão, mas ainda não tenho a chave pública de '${owner}'.`
        )
        setPendingKeyPayload(data.keyPayload)
      }
    }

    const handleReceiveMessage = (data) => {
      if (isGroupTerminated) return

      log.info(data)
      const key = groupSessionKey.current
      if (key && data.message.ciphertext) {
        log.info(`[MSG] Recebendo mensagem cifrada de '${data.from}' no grupo '${groupName}'.`)
        const decryptedBytes = nacl.secretbox.open(
          decodeBase64(data.message.ciphertext),
          decodeBase64(data.message.nonce),
          key
        )
        if (decryptedBytes) {
          log.info(`[MSG] Mensagem de '${data.from}' decifrada com sucesso.`)
          setMessages((prev) => [
            ...prev,
            { from: data.from, message: new TextDecoder().decode(decryptedBytes) }
          ])
        } else {
          log.error(`[MSG] FALHA ao decifrar mensagem de '${data.from}' no grupo '${groupName}'.`)
        }
      }
    }

    const handleMembershipChange = (data) => {
      log.info(`Membros do grupo atualizados: ${data.members}`)

      const newMembersList = data.members
      if (!newMembersList.includes(currentUser)) {
        log.warn(`[REMOVIDO] Você foi removido do grupo '${groupName}' por um administrador.`)
        setIsGroupTerminated(true);
        return
      }
      setMembers(newMembersList)

      setIsChannelSecure(false)
      log.warn(
        `[SEGURANÇA] O canal do grupo '${groupName}' tornou-se INSEGURO devido a mudança de membros. Aguardando nova chave do dono.`
      )

      if (currentUser === owner) {
        log.info(
          `[DONO] A mudança de membros iniciou o processo de atualizacao da chave (re-keying).`
        )
      }
    }

    socket.on('receive-new-group-key', handleReceiveKey)
    socket.on('receiveMessage', handleReceiveMessage)
    socket.on('group-membership-changed', handleMembershipChange)

    return () => {
      socket.off('receive-new-group-key', handleReceiveKey)
      socket.off('receiveMessage', handleReceiveMessage)
      socket.off('group-membership-changed', handleMembershipChange)
    }
  }, [
    ownKeys,
    socket,
    membersPublicKeys,
    groupId,
    currentUser,
    owner,
    groupName,
    isGroupTerminated
  ])

  useEffect(() => {
    // Só roda se:
    // 1. Houver um payload pendente
    // 2. O canal AINDA estiver inseguro
    // 3. Não formos o dono
    if (!pendingKeyPayload || isChannelSecure || currentUser === owner) return

    // Tenta pegar a chave do dono (que pode ter acabado de chegar)
    const ownerPublicKey = membersPublicKeys.get(owner)

    if (ownerPublicKey) {
      log.info(`[MEMBRO] Processando chave de sessão PENDENTE de '${owner}'.`)

      const receivedKey = nacl.box.open(
        decodeBase64(pendingKeyPayload.box),
        decodeBase64(pendingKeyPayload.nonce),
        ownerPublicKey,
        ownKeys.secretKey
      )

      if (receivedKey) {
        groupSessionKey.current = receivedKey
        setIsChannelSecure(true)
        setPendingKeyPayload(null) // Sucesso, limpa o payload
        log.info(`[MEMBRO] Chave de sessão PENDENTE decifrada com sucesso. Canal seguro!`)
      } else {
        log.error(`[MEMBRO] FALHA ao decifrar a chave de sessão PENDENTE de '${owner}'.`)
        // Limpa para não tentar de novo com uma chave ruim
        setPendingKeyPayload(null)
      }
    }
  }, [pendingKeyPayload, membersPublicKeys, isChannelSecure, currentUser, owner, ownKeys])

  // 5. Função para enviar mensagem
  const handleSendMessage = useCallback(() => {
    if (newMessage.trim() === '' || !isChannelSecure || isGroupTerminated) {
      if (isGroupTerminated)
        log.warn(`[ENVIO] Mensagem bloqueada. O grupo '${groupName}' foi encerrado.`)
      if (!isChannelSecure) log.warn(`[ENVIO] Mensagem bloqueada. O canal não é seguro.`)
      return
    }

    log.info(`[MSG] Criptografando e enviando mensagem para o grupo '${groupName}'`)

    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength)
    const key = groupSessionKey.current
    const messageUint8 = new TextEncoder().encode(newMessage)

    const encryptedMessage = nacl.secretbox(messageUint8, nonce, key)

    const payload = {
      ciphertext: encodeBase64(encryptedMessage),
      nonce: encodeBase64(nonce)
    }

    socket.emit('messageToRoom', { roomName: groupId, message: payload, from: currentUser })
    setMessages((prev) => [...prev, { from: currentUser, message: newMessage }])
    setNewMessage('')
  }, [
    newMessage,
    isChannelSecure,
    isGroupTerminated,
    socket,
    groupId,
    currentUser,
    groupName,
    groupSessionKey
  ])

  const addMember = useCallback(
    (usernameToAdd) => {
      if (currentUser !== owner || !usernameToAdd) {
        log.warn("[ADMIN] Ação 'addMember' falhou. Usuário não é dono ou nome está vazio.")
        return
      }
      if (members.includes(usernameToAdd)) {
        log.warn(`[ADMIN] Usuário '${usernameToAdd}' já está no grupo.`)
        return
      }

      log.info(`[ADMIN] ${currentUser} está adicionando '${usernameToAdd}' ao grupo ${groupId}`)
      socket.emit('admin-add-member', {
        groupId,
        memberName: usernameToAdd
      })
    },
    [socket, currentUser, owner, groupId, members]
  )

  const removeMember = useCallback(
    (usernameToRemove) => {
      if (currentUser !== owner) {
        log.warn("[ADMIN] Ação 'removeMember' falhou. Usuário não é dono.")
        return
      }
      if (usernameToRemove === owner) {
        log.warn('[ADMIN] Dono não pode remover a si mesmo.')
        return // O dono sair termina o grupo, é outra lógica
      }

      log.info(`[ADMIN] ${currentUser} está removendo '${usernameToRemove}' do grupo ${groupId}`)
      socket.emit('admin-remove-member', {
        groupId,
        memberName: usernameToRemove
      })
    },
    [socket, currentUser, owner, groupId]
  )

  const handleLeaveGroup = ({currentUser}) =>{
    if(currentUser === owner){
        socket.emit('admin-leave', {groupId})
    }else{
        socket.emit('member-leave', {groupId, memberName: currentUser})
    }
  }

  const onlineUsers = otherUsers.filter((u) => !members.includes(u))

  const value = {
    currentUser,
    onlineUsers,
    groupName,
    members,
    isChannelSecure,
    messages,
    newMessage,
    setNewMessage,
    handleSendMessage,
    owner,
    isGroupTerminated,
    addMember,
    removeMember,
    handleLeaveGroup
  }

  return <ChatGroupContext.Provider value={value}>{children}</ChatGroupContext.Provider>
}
