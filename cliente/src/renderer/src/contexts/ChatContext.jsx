import React, { createContext, useState, useEffect, useRef, useCallback, useContext } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import log from 'electron-log/renderer'
import nacl from 'tweetnacl'
import { decodeBase64, encodeBase64 } from 'tweetnacl-util' // Removi encode/decodeUTF8 não usados
import { SocketContext } from './SocketContext'
import { UserListContext } from './UserListContext' // <<< 1. IMPORTAR O CONTEXTO DA LISTA

export const ChatContext = createContext()

const toHex = (u8) => Array.from(u8).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();

export function ChatProvider({ children }) {
  const navigate  = useNavigate();
  const [searchParams] = useSearchParams()
  const currentUser = searchParams.get('currentUser')
  const chatWithUser = searchParams.get('chatWithUser')
  const initiator = searchParams.get('initiator')

  // --- CONTEXTOS ---
  const { socket } = useContext(SocketContext)
  const { userKeys } = useContext(UserListContext)

  // --- ESTADO LOCAL ---
  const [ownKeys, setOwnKeys] = useState(userKeys)
  const [pendingSessionKey, setPendingSessionKey] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [recipientPublicKey, setRecipientPublicKey] = useState(null)
  const [isChannelSecure, setIsChannelSecure] = useState(false)
  const [partnerLeft, setPartnerLeft] = useState(false);
  const sessionKey = useRef(null)

  const roomName = React.useMemo(() => {
    if (!currentUser || !chatWithUser) return null
    return [currentUser, chatWithUser].sort().join('--')
  }, [currentUser, chatWithUser])

  useEffect(() => {
    log.info(`(ChatProvider) Iniciando chat com ${chatWithUser}. Resetando estado...`)
    setMessages([])
    setRecipientPublicKey(null)
    setIsChannelSecure(false)
    setPendingSessionKey(null)
    sessionKey.current = null
    setNewMessage('')
  }, [chatWithUser])

  //Conexão na Room
  useEffect(() => {
    if (!ownKeys || !socket || !roomName || !chatWithUser || !currentUser) {
      return
    }

    log.info(`${currentUser} Entrando na sala ${roomName} e buscando chave de ${chatWithUser}.`)
    socket.emit('joinChatRoom', { roomName: roomName, username: currentUser })
    socket.emit('getPublicKey', { username: chatWithUser })
  }, [socket])

  useEffect(() => {
    if (!ownKeys || !socket) return
    const handlePublicKeyResponse = (data) => {
      if (data.username === chatWithUser && data.publicKey) {
        log.info(`Chave pública de ${chatWithUser} recebida: ${data.publicKey} \n`)
        setRecipientPublicKey(decodeBase64(data.publicKey))
      }
    }

    const receiveMessageHandler = (data) => {
      log.info('Mensagem Recebida', data)
      const { type, ...payload } = data.message

      if (type === 'session-key') {
        if (recipientPublicKey) {
          decryptAndSetSessionKey(payload, recipientPublicKey)
        } else {
          console.warn('Chave de sessão recebida ANTES da chave pública. Guardando para depois.')
          setPendingSessionKey(payload)
        }
      }

      if (
        type === 'encrypted-message' &&
        payload.ciphertext &&
        payload.nonce &&
        sessionKey.current
      ) {

        const boxBytes = decodeBase64(payload.ciphertext);
    const nonceBytes = decodeBase64(payload.nonce);

   
    const polyTag = boxBytes.slice(0, nacl.secretbox.overheadLength); // 16 bytes
    const messageCiphertext = boxBytes.slice(nacl.secretbox.overheadLength); // O resto

    log.info("====== [MENSAGEM RECEBIDA] ======");
    log.info(`1. Pacote Completo: ${toHex(boxBytes)}`);
    log.info("--- DESMEMBRANDO ---");
    log.info(`   A. Poly1305 (Assinatura): [ ${toHex(polyTag)} ]`);
    log.info(`   B. Conteudo (Cifrado):    [ ${toHex(messageCiphertext)} ]`);
    log.info("========================================================");


        const decryptedBytes = nacl.secretbox.open(
          boxBytes,      
      nonceBytes,
      sessionKey.current
        )
        if (decryptedBytes) {
          log.info(`Mensagem Criptografada recebida: ${payload.ciphertext}`)
          log.info(` Integridade OK. Mensagem: "${textMessage}"`);
          setMessages((prev) => [
            ...prev,
            { from: data.from, message: new TextDecoder().decode(decryptedBytes) }
          ])
        }
      }
    }

    const handlePartnerDisconnect = () => {     
      log.warn(`${chatWithUser} saiu da conversa.`);
      setPartnerLeft(true);   
    };

    socket.on('publicKeyResponse', handlePublicKeyResponse)
    socket.on('receiveMessage', receiveMessageHandler)
    socket.on('partner-disconnected', handlePartnerDisconnect)
    socket.on("disconnecting", handlePartnerDisconnect)
    return () => {
      socket.off('publicKeyResponse', handlePublicKeyResponse)
      socket.off('receiveMessage', receiveMessageHandler)
      socket.off('partner-disconnected', handlePartnerDisconnect)
      socket.off("disconnecting", handlePartnerDisconnect)
    }
  }, [socket])

  useEffect(() => {
    if (pendingSessionKey && recipientPublicKey) {
      console.log('Processando a chave de sessão que estava guardada...')
      decryptAndSetSessionKey(pendingSessionKey, recipientPublicKey)
      setPendingSessionKey(null)
    }
  }, [pendingSessionKey])

  useEffect(() => {
    if (!ownKeys || !socket || !roomName || !recipientPublicKey) return

    if (recipientPublicKey && !isChannelSecure) {
      if (initiator === 'true') {
        log.info('Sou o iniciador. Gerando e enviando chave de sessão.')
        const newSessionKey = nacl.randomBytes(nacl.secretbox.keyLength)
        sessionKey.current = newSessionKey
        const nonce = nacl.randomBytes(nacl.box.nonceLength)
        const encryptedKey = nacl.box(newSessionKey, nonce, recipientPublicKey, ownKeys.secretKey)

        const polyTag = encryptedKey.slice(0, nacl.box.overheadLength); // Primeiros 16 bytes (Poly1305)
const realCiphertext = encryptedKey.slice(nacl.box.overheadLength); // O resto (Dados)

log.info("====== [ANALISE DE ENVIO DA CHAVE] ======");
log.info(`1. Chave Original: ${toHex(newSessionKey)}`);
log.info(`2. O QUE VAI PELA REDE (Box): ${toHex(encryptedKey)}`);
log.info("--- DECOMPOSICAO ---");
log.info(`   A. Poly1305 (Lacre): [ ${toHex(polyTag)} ]`);
log.info(`   B. Ciphertext (Dados): [ ${toHex(realCiphertext)} ]`);
log.info("=========================================");

        const payload = {
          type: 'session-key',
          box: encodeBase64(encryptedKey),
          nonce: encodeBase64(nonce)
        }

        socket.emit('messageToRoom', { roomName: roomName, message: payload })

        setIsChannelSecure(true)
        log.info(
          `Criando chave de sessao \n ${encodeBase64(newSessionKey)} \n e nonce: ${encodeBase64(nonce)} \n`
        )
        log.info(`Criptografando chave de sessao : ${encodeBase64(encryptedKey)}`)
        log.info(`Enviando para ${chatWithUser}... \n`)
        log.info('✅ Canal seguro estabelecido! Chave de sessão enviada.')
      }
    }
  }, [recipientPublicKey, isChannelSecure, socket])


  const handleSendMessage = useCallback(() => {
    if (newMessage.trim() === '' || !isChannelSecure || !socket || !roomName) {
      return
    }

    const messageUint8 = new TextEncoder().encode(newMessage)
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength)
    const key = sessionKey.current

    const encryptedMessage = nacl.secretbox(messageUint8, nonce, key)

    const polyTag = encryptedMessage.slice(0, nacl.secretbox.overheadLength)
    const messageCiphertext = encryptedMessage.slice(nacl.secretbox.overheadLength)

    log.info("====== [ENVIANDO MENSAGEM] ======")
    log.info(`0. Mensagem Original: "${newMessage}"`)
    log.info(`1. Pacote Completo (Box): ${toHex(encryptedMessage)}`)
    log.info("--- DECOMPOSIÇÃO ---")
    log.info(`   A. Poly1305 (Assinatura): [ ${toHex(polyTag)} ]`)
    log.info(`   B. Conteudo (Cifrado):    [ ${toHex(messageCiphertext)} ]`)
    log.info("======================================================")
    // =================================================================

    const payload = {
      type: 'encrypted-message',
      ciphertext: encodeBase64(encryptedMessage),
      nonce: encodeBase64(nonce)
    }
    socket.emit('messageToRoom', { roomName: roomName, message: payload })

    setMessages((prev) => [...prev, { from: currentUser, message: newMessage }])
    setNewMessage('')
  }, [newMessage, isChannelSecure, currentUser, socket, roomName]) 

  const decryptAndSetSessionKey = useCallback(
    (payload, senderPublicKey) => {
      if (!ownKeys) return
      log.info("====== [ANALISE DE RECEBIMENTO DA CHAVE] ======");
      // Adicione um log para ver qual chave pública está sendo usada
      log.info(`Tentando decifrar chave de sessão com a chave pública de ${chatWithUser}`)

      const boxBytes = decodeBase64(payload.box);
    const polyTag = boxBytes.slice(0, nacl.box.overheadLength);
    const realCiphertext = boxBytes.slice(nacl.box.overheadLength);
    
    log.info(`1. Box Recebido: ${toHex(boxBytes)}`);
    log.info(`   A. Lacre (Poly1305): [ ${toHex(polyTag)} ]`);
    log.info(`   B. Dados (Cifrados): [ ${toHex(realCiphertext)} ]`);

      const receivedSessionKey = nacl.box.open(
        decodeBase64(payload.box),
        decodeBase64(payload.nonce),
        senderPublicKey,
        ownKeys.secretKey
      )

      if (receivedSessionKey) {
        sessionKey.current = receivedSessionKey
        setIsChannelSecure(true)
        log.info(
          `Chave de sessão criptografada: \n ${payload.box} \n e nonce ${payload.nonce} recebidos`
        )
        log.info(`Chave de sessão descriptografada: ${encodeBase64(receivedSessionKey)} \n`)
        log.info('✅ Canal seguro estabelecido! Chave de sessão recebida e decifrada.')
      } else {
        log.error('!!!!!!!! FALHA AO DECIFRAR A CHAVE DE SESSÃO !!!!!!!')
      }
    },
    [ownKeys, chatWithUser]
  )

  const handleBack = () => {
    socket.emit('leave-room', {roomName: roomName})
    navigate(-1)
  }

  const value = {
    currentUser,
    chatWithUser,
    isChannelSecure,
    messages,
    newMessage,
    setNewMessage,
    handleSendMessage,
    handleBack,
    partnerLeft
  }

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}
