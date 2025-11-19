import React, { createContext, useState, useEffect, useRef, useCallback, useContext } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import log from 'electron-log/renderer'
import nacl from 'tweetnacl'
import { decodeBase64, encodeBase64 } from 'tweetnacl-util' // Removi encode/decodeUTF8 não usados
import { SocketContext } from './SocketContext'
import { UserListContext } from './UserListContext' // <<< 1. IMPORTAR O CONTEXTO DA LISTA

export const ChatContext = createContext()

export function ChatProvider({ children }) {

  const splitCryptoPayload = (encryptedUint8) => {
  const mac = encryptedUint8.slice(encryptedUint8.length - 16);
  const cipher = encryptedUint8.slice(0, encryptedUint8.length - 16);
  return {
    cipher,
    mac,
  };
}


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

        const encrypted = decodeBase64(payload.box);
    const nonce = decodeBase64(payload.nonce);

    const { cipher, mac } = splitCryptoPayload(encrypted);

    log.info(
      `[DIDATICO] CHAVE DE SESSAO RECEBIDA:\n` +
      `  - Nonce (24b): ${payload.nonce}\n` +
      `  - Ciphertext (sem MAC): ${encodeBase64(cipher)}\n` +
      `  - Poly1305 (16b): ${encodeBase64(mac)}\n` +
      `  - Payload completo ciphertext+mac: ${payload.box}\n`
    );


        if (recipientPublicKey) {
          decryptAndSetSessionKey(payload, recipientPublicKey)
        } else {
          setPendingSessionKey(payload)
        }
      }

      if (
        type === 'encrypted-message' &&
        payload.ciphertext &&
        payload.nonce &&
        sessionKey.current
      ) {

        const encrypted = decodeBase64(payload.ciphertext);
    const nonce = decodeBase64(payload.nonce);

    const { cipher, mac } = splitCryptoPayload(encrypted);

    log.info(
      `[DIDATICO]  MENSAGEM CIFRADA RECEBIDA:\n` +
      `  - Nonce (24b): ${payload.nonce}\n` +
      `  - Cipher (sem MAC): ${encodeBase64(cipher)}\n` +
      `  - Poly1305 MAC (16b): ${encodeBase64(mac)}\n` +
      `  - Payload completo ciphertext+mac: ${payload.ciphertext}\n`
    );


        const decryptedBytes = nacl.secretbox.open(
          decodeBase64(payload.ciphertext),
          decodeBase64(payload.nonce),
          sessionKey.current
        )
        if (decryptedBytes) {
          log.info(`Mensagem Criptografada recebida: ${payload.ciphertext}`)
          setMessages((prev) => [
            ...prev,
            { from: data.from, message: new TextDecoder().decode(decryptedBytes) }
          ])
        }
      }
    }

    const handlePartnerDisconnect = () => {     
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
      decryptAndSetSessionKey(pendingSessionKey, recipientPublicKey)
      setPendingSessionKey(null)
    }
  }, [pendingSessionKey])

  useEffect(() => {
    if (!ownKeys || !socket || !roomName || !recipientPublicKey) return

    if (recipientPublicKey && !isChannelSecure) {
      if (initiator === 'true') {
        log.info('Sou o iniciador. Gerando e enviando chave de sessao.')
        const newSessionKey = nacl.randomBytes(nacl.secretbox.keyLength)
        sessionKey.current = newSessionKey
        const nonce = nacl.randomBytes(nacl.box.nonceLength)
        const encryptedKey = nacl.box(newSessionKey, nonce, recipientPublicKey, ownKeys.secretKey)

   
        const corruptedEncryptedKey = new Uint8Array(encryptedKey);
        corruptedEncryptedKey[0] ^= 0xFF; // muda o primeiro byte 


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
        log.info('✅ Canal seguro estabelecido! Chave de sessao enviada.')
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

    const { cipher, mac } = splitCryptoPayload(encryptedMessage);

    log.info(
  `[DIDATICO] MENSAGEM ENVIADA (CIFRADA):\n` +
  `  - Nonce: ${encodeBase64(nonce)}\n` +
  `  - Cipher (sem MAC): ${encodeBase64(cipher)}\n` +
  `  - Poly1305 MAC: ${encodeBase64(mac)}\n` +
  `  - Payload completo (ciphertext+mac): ${encodeBase64(encryptedMessage)}\n`
);

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

      const encrypted = decodeBase64(payload.box);
    const nonce = decodeBase64(payload.nonce);

    const { cipher, mac } = splitCryptoPayload(encrypted);

     log.info(
      `[DIDATICO] Tentando decifrar chave de sessão:\n` +
      `  - Nonce: ${payload.nonce}\n` +
      `  - Cipher (sem MAC): ${encodeBase64(cipher)}\n` +
      `  - Poly1305 MAC: ${encodeBase64(mac)}\n` +
      `  - Payload completo: ${payload.box}\n`
    );




      log.info(`Tentando decifrar chave de sessão com a chave pública de ${chatWithUser}`)

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
          `Chave de sessao criptografada: \n ${payload.box} \n e nonce ${payload.nonce} recebidos`
        )
        log.info(`Chave de sessao descriptografada: ${encodeBase64(receivedSessionKey)} \n`)
        log.info('✅ Canal seguro estabelecido! Chave de sessao recebida e decifrada.')
      } else {
        log.error('!!!!!!!! FALHA AO DECIFRAR A CHAVE DE SESSAO !!!!!!!')
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
