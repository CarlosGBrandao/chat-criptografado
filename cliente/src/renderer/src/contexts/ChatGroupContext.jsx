import React, { createContext, useState, useEffect, useRef, useContext, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import log from 'electron-log/renderer'
import nacl from 'tweetnacl'
import { decodeBase64, encodeBase64 } from 'tweetnacl-util'
import { SocketContext } from './SocketContext'
import { UserListContext } from './UserListContext'
import { useNavigate } from 'react-router-dom'
export const ChatGroupContext = createContext()

const toHex = (u8) => {
  if (!u8) return '';
  return Array.from(u8).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

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

  const [membersSignKeys, setMembersSignKeys] = useState(new Map())
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
  }, [socket, members])

  // Listener para receber as chaves públicas e atualizar membros
  useEffect(() => {
    if (!socket) return

    const handlePublicKeyResponse = (data) => {
      if (data.publicKey) {

        
        log.info(`[TODOS] Chave pública recebida para: ${data.username}`)
        setMembersPublicKeys((prevMap) =>
          new Map(prevMap).set(data.username, decodeBase64(data.publicKey))
        )

        const remoteSignKey = data.signKey || data.signaturePublicKey;
        if (remoteSignKey) {
             setMembersSignKeys((prev) => new Map(prev).set(data.username, decodeBase64(remoteSignKey)))
        }

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
  }, [socket, members])

  // Dono Criptografa e Distribui
  useEffect(() => {
    if (currentUser !== owner || !ownKeys || !socket || !members || isGroupTerminated || isChannelSecure) {
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
          const encryptedKey = nacl.box(newKey, nonce, recipientPublicKey, ownKeys.box.secretKey)
          // Converte para Uint8Array bruto
          const encrypted = encryptedKey;

          // MAC = últimos 16 bytes
          const mac = encrypted.slice(encrypted.length - 16);

          const cipher = encrypted.slice(0, encrypted.length - 16);

          log.info(`[INTEGRABILIDADE] Criptografia da chave de sessao:
  - Nonce (24b): ${encodeBase64(nonce)}
  - Ciphertext (sem MAC): ${encodeBase64(cipher)}
  - Poly1305 MAC (16b): ${encodeBase64(mac)}
  - Ciphertext+MAC final enviado: ${encodeBase64(encrypted)}
`);


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
            `[DONO] Ia enviar chave para '${member}', mas não encontrei sua chave publica no mapa.`
          )
        }
      }
    })
  }, [
    membersPublicKeys,
    members,
  ])

  //  Lógica para receber mensagens, chaves e atualizações de membros
  useEffect(() => {
    if (!ownKeys || !socket) return

    // Recebe e decifra a chave de sessão enviada pelo dono
    const handleReceiveKey = (data) => {
      if (data.groupId !== groupId || currentUser === owner || isGroupTerminated) return

      const ownerPublicKey = membersPublicKeys.get(owner)
      if (ownerPublicKey) {

        const encrypted = decodeBase64(data.keyPayload.box);
    const nonce = decodeBase64(data.keyPayload.nonce);

    // === SPLIT DIDÁTICO ===
    const mac = encrypted.slice(encrypted.length - 16);
    const cipher = encrypted.slice(0, encrypted.length - 16);


        log.info(
          `[MEMBRO] Chave de sessao criptografada de '${owner}' recebida:\n` +
            `  Box: ${data.keyPayload.box}\n` +
            `  Nonce: ${data.keyPayload.nonce}`
        )

        const receivedKey = nacl.box.open(
          decodeBase64(data.keyPayload.box),
          decodeBase64(data.keyPayload.nonce),
          ownerPublicKey,
          ownKeys.box.secretKey 
        )
        if (receivedKey) {
          groupSessionKey.current = receivedKey
          setIsChannelSecure(true)
          setPendingKeyPayload(null)

           log.info(
      `[INTEGRABILIDADE] Chave de sessão criptografada recebida de '${owner}':\n` +
      `  - Nonce (24b): ${data.keyPayload.nonce}\n` +
      `  - Ciphertext (sem MAC): ${encodeBase64(cipher)}\n` +
      `  - Poly1305 MAC (16b): ${encodeBase64(mac)}\n` +
      `  - Payload completo ciphertext+mac: ${data.keyPayload.box}\n`
    );

          log.info(
            `[MEMBRO] Nova chave de sessão decifrada com sucesso para o grupo ${groupName}.
            Session Key = ${encodeBase64(receivedKey)}

            Canal seguro!`
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

        const encrypted = decodeBase64(data.message.ciphertext);
        const nonce = decodeBase64(data.message.nonce);

    // === SPLIT DIDÁTICO ===
    const mac = encrypted.slice(encrypted.length - 16);
    const cipher = encrypted.slice(0, encrypted.length - 16);

     log.info(
      `[INTEGRABILIDADE] Pacote criptografico recebido:\n` +
      `  - Nonce (24b): ${data.message.nonce}\n` +
      `  - Ciphertext (sem MAC): ${encodeBase64(cipher)}\n` +
      `  - Poly1305 MAC (16b): ${encodeBase64(mac)}\n` +
      `  - Payload completo ciphertext+mac: ${data.message.ciphertext}\n`
    );


        const decryptedBytes = nacl.secretbox.open(
          decodeBase64(data.message.ciphertext),
          decodeBase64(data.message.nonce),
          key
        )


        if (decryptedBytes) {

          const signature = decryptedBytes.slice(0, nacl.sign.signatureLength);
           const messageContent = decryptedBytes.slice(nacl.sign.signatureLength);

           log.info(`[MSG GRUPO] Camada 2 (Auth): Assinatura=${toHex(signature).substring(0,20)}...`);

           // 4. Verifica Assinatura (Ed25519)
           const senderSignKey = membersSignKeys.get(data.from);


          log.info(`[MSG] Mensagem de '${data.from}' decifrada com sucesso.`)

          if (senderSignKey) {
               const verifiedMessage = nacl.sign.open(decryptedBytes, senderSignKey);

               if (verifiedMessage) {
                   log.info(`✅ Assinatura VERIFICADA de ${data.from}`);
                   setMessages((prev) => [
                        ...prev,
                        { from: data.from, message: new TextDecoder().decode(verifiedMessage) }
                   ])
               } else {
                   log.error(`❌ FRAUDE: Assinatura invalida de ${data.from}`);


          }
           } else {
               // Fallback: Sem chave de assinatura (assume legítimo mas avisa)
               log.warn(`⚠️ Sem chave de assinatura para ${data.from}. Ignorando verificacao.`);
               const textMsg = new TextDecoder().decode(messageContent);
               setMessages((prev) => [...prev, { from: data.from, message: textMsg }])
           }
        } else {
          log.error(`[MSG] Erro de integridade (Poly1305) na mensagem de '${data.from}'.`)

        }
      }
    }

    const handleMembershipChange = (data) => {
      log.info(`Membros do grupo atualizados: ${data.members}`)

      const newMembersList = data.members
      if (!newMembersList.includes(currentUser)) {
        log.warn(`[REMOVIDO] Voce foi removido do grupo '${groupName}' por um administrador.`)
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
      log.info(
          `[MEMBRO] Chave de sessao criptografada de '${owner}' recebida:\n` +
            `  Box: ${pendingKeyPayload.box}\n` +
            `  Nonce: ${pendingKeyPayload.nonce}`
        )
      const receivedKey = nacl.box.open(
        decodeBase64(pendingKeyPayload.box),
        decodeBase64(pendingKeyPayload.nonce),
        ownerPublicKey,
        ownKeys.box.secretKey 
      )

      if (receivedKey) {
        groupSessionKey.current = receivedKey
        setIsChannelSecure(true)
        setPendingKeyPayload(null) // Sucesso, limpa o payload
        log.info(`[MEMBRO] Chave de sessão PENDENTE decifrada com sucesso.
          Session Key = ${encodeBase64(receivedKey)}
          Canal Seguro.
          `)
      } else {
        log.error(`[MEMBRO] FALHA ao decifrar a chave de sessão PENDENTE de '${owner}'.`)
        // Limpa para não tentar de novo com uma chave ruim
        setPendingKeyPayload(null)
      }
    }
  }, [pendingKeyPayload, membersPublicKeys, isChannelSecure, currentUser, owner, ownKeys,members])

  // 5. Função para enviar mensagem
  const handleSendMessage = useCallback(() => {
    if (newMessage.trim() === '' || !isChannelSecure || isGroupTerminated) {
      if (isGroupTerminated)
        log.warn(`[ENVIO] Mensagem bloqueada. O grupo '${groupName}' foi encerrado.`)
      if (!isChannelSecure) log.warn(`[ENVIO] Mensagem bloqueada. O canal não é seguro.`)
      return
    }

    if (!ownKeys.sign) { log.error("Sem chave de assinatura!"); return; }

    log.info(`[MSG] Criptografando e enviando mensagem para o grupo '${groupName}'`)

    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength)
    const key = groupSessionKey.current
    const messageUint8 = new TextEncoder().encode(newMessage)

    const signedMessage = nacl.sign(messageUint8, ownKeys.sign.secretKey)

    const encryptedMessage = nacl.secretbox(signedMessage, nonce, key)

    

    const signaturePreview = signedMessage.slice(0, 64);
    log.info(`[ENVIO GRUPO] Assinado (${toHex(signaturePreview).substring(0,20)}...) e Criptografado.`);

    // MAC = últimos 16 bytes
const mac = encryptedMessage.slice(encryptedMessage.length - 16);

// Ciphertext = restante
const cipher = encryptedMessage.slice(0, encryptedMessage.length - 16);

log.info(`[INTEGRABILIDADE] Criptografia da MENSAGEM enviada:
  - Nonce (24b): ${encodeBase64(nonce)}
  - Ciphertext (sem MAC): ${encodeBase64(cipher)}
  - Poly1305 MAC (16b): ${encodeBase64(mac)}
  - Payload final ciphertext+MAC: ${encodeBase64(encryptedMessage)}
`);

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
