import React, { createContext, useState, useEffect, useRef, useCallback, useContext } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import log from 'electron-log/renderer'
import nacl from 'tweetnacl'
import { decodeBase64, encodeBase64 } from 'tweetnacl-util' // Removi encode/decodeUTF8 não usados
import { SocketContext } from './SocketContext'
import { UserListContext } from './UserListContext' // <<< 1. IMPORTAR O CONTEXTO DA LISTA

export const ChatContext = createContext()

const toHex = (u8) => {
  if (!u8) return '';
  return Array.from(u8).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

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
  const [recipientSignKey, setRecipientSignKey] = useState(null)
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
  }, [])

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
      if(recipientPublicKey){
        return
      }
      log.info("Recipiente", recipientPublicKey)
      log.info("Recipeiten SIng", recipientSignKey)
      log.info("[DEBUG HANDSHAKE] Dados recebidos do servidor:", data);

      const isSameUser = data.username === chatWithUser || 
                         data.username.toLowerCase() === chatWithUser?.toLowerCase();

      if (isSameUser && data.publicKey) {
        log.info(` Usuario confirmado. Salvando chaves de ${data.username}...`)
        setRecipientPublicKey(decodeBase64(data.publicKey))

        const remoteSignKey = data.signKey || data.signaturePublicKey;

        if (remoteSignKey) {
            log.info(`🔑 Chave de Assinatura SALVA com sucesso: ${remoteSignKey.substring(0,10)}...`);
            setRecipientSignKey(decodeBase64(remoteSignKey));
        } else {
            log.warn(`⚠️ O objeto chegou, mas sem 'signKey'.`);
        }
      } else {
         log.warn(` Ignorando chaves: O usuario '${data.username}' não é o chat atual '${chatWithUser}'`);
      }



      if (data.username === chatWithUser && data.publicKey) {
        log.info(`Chave pública de ${chatWithUser} recebida: ${data.publicKey} \n`)
        setRecipientPublicKey(decodeBase64(data.publicKey))

        if (data.signKey) {
        log.info(`Chave de Assinatura (Sign) recebida: ${data.signKey}`)
        setRecipientSignKey(decodeBase64(data.signKey))
    } else {
        log.warn("O parceiro nao enviou chave de assinatura (versão antiga?)")
    }

      }
    }

    const receiveMessageHandler = (data) => {
      log.info('Mensagem Recebida', data)
      const { type, ...payload } = data.message

      // --- 1. TRATAMENTO DA CHAVE DE SESSÃO ---
      if (type === 'session-key') {
        const encrypted = decodeBase64(payload.box);
        // O nonce não precisa ser splitado, mas decodificamos para log
        const nonce = decodeBase64(payload.nonce); 

        const { cipher, mac } = splitCryptoPayload(encrypted);

        log.info(
          `[INTEGRABILIDADE] CHAVE DE SESSAO RECEBIDA:\n` +
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

      // --- 2. TRATAMENTO DA MENSAGEM CRIPTOGRAFADA E ASSINADA ---
      if (
        type === 'encrypted-message' &&
        payload.ciphertext &&
        payload.nonce &&
        sessionKey.current
      ) {
        
        // A. LOG DIDÁTICO DA CRIPTOGRAFIA (Salsa20 + Poly1305)
        const encrypted = decodeBase64(payload.ciphertext);
        const { cipher, mac } = splitCryptoPayload(encrypted);

        log.info(
          `[INTEGRABILIDADE]  MENSAGEM CIFRADA RECEBIDA (Camada Externa):\n` +
          `  - Nonce (24b): ${payload.nonce}\n` +
          `  - Cipher (sem MAC): ${encodeBase64(cipher)}\n` +
          `  - Poly1305 MAC (16b): ${encodeBase64(mac)}\n` +
          `  - Payload completo: ${payload.ciphertext}\n`
        );

        // B. DESCRIPTOGRAFAR (Remove a camada de Sigilo)
        const decryptedSignedMessage = nacl.secretbox.open(
          decodeBase64(payload.ciphertext),
          decodeBase64(payload.nonce),
          sessionKey.current
        )

        // Se decryptedSignedMessage existir, a integridade (Poly1305) está OK.
        if (decryptedSignedMessage) {
          
          // C. LOG DIDÁTICO DA ASSINATURA (Ed25519)
          // A mensagem descriptografada contém [Assinatura (64 bytes) + Texto]
          const signature = decryptedSignedMessage.slice(0, nacl.sign.signatureLength); // 64 bytes
          const messageContent = decryptedSignedMessage.slice(nacl.sign.signatureLength); // O resto

          log.info(
            `[INTEGRABILIDADE] CONTEÚDO DECIFRADO (Camada Interna):\n` +
            `  - Assinatura Digital (64b): ${encodeBase64(signature)}\n` +
            `  - Mensagem Textual (Bytes): ${encodeBase64(messageContent)}\n` 
          );

          // D. VERIFICAR ASSINATURA (Remove a camada de Identidade)
          if (recipientSignKey) {
             // nacl.sign.open retorna o texto APENAS se a assinatura for válida
             const verifiedMessage = nacl.sign.open(decryptedSignedMessage, recipientSignKey);
             
             if (verifiedMessage) {
                 log.info(`✅ Assinatura VALIDA! Autor confirmado: ${chatWithUser}`);
                 
                 setMessages((prev) => [
                    ...prev,
                    { from: data.from, message: new TextDecoder().decode(verifiedMessage) }
                  ])
             } else {
                 log.error(`❌ PERIGO: A mensagem foi decifrada, mas a ASSINATURA É FALSA!`);
                 // Não exibimos a mensagem ou mostramos um alerta de segurança
             }

          } else {
              // Fallback caso a chave de assinatura não tenha chegado (para não quebrar o app)
              // Nesse caso, lemos manualmente ignorando os primeiros 64 bytes
              const textBytes = decryptedSignedMessage.slice(nacl.sign.signatureLength);
              setMessages((prev) => [
                ...prev,
                { from: data.from, message: new TextDecoder().decode(textBytes) }
              ])
          }

        } else {
           log.error(" Falha na descriptografia (Poly1305 invalido ou chave errada).");
        }
      }
    }

    const handlePartnerDisconnect = () => {     
      setPartnerLeft(true);   
    };

    socket.once('publicKeyResponse', handlePublicKeyResponse)
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
        const encryptedKey = nacl.box(newSessionKey, nonce, recipientPublicKey, ownKeys.box.secretKey)

   
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

    if (!ownKeys || !ownKeys.sign || !ownKeys.sign.secretKey) {
        log.error("❌ ERRO CRITICO: Tentando enviar mensagem sem chave de assinatura!");
        return;
    }
   

    // --- CAMADA DE ASSINATURA DIGITAL (Ed25519) ---
    // A função nacl.sign pega a mensagem e retorna: [Assinatura (64b) + Mensagem]
    const signedMessage = nacl.sign(messageUint8, ownKeys.sign.secretKey)
    log.info(` Assinando mensagem... Tamanho do pacote assinado: ${signedMessage.length} bytes`);
    const signature = signedMessage.slice(0, nacl.sign.signatureLength) // 64 bytes
    
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength)
    const key = sessionKey.current
    
        log.info(` [ASSINATURA DIGITAL] Gerada!`)
        log.info(`   - Assinatura (Base64): ${encodeBase64(signature)}`)
        log.info(`   - Mensagem envelopada: ${toHex(signedMessage)}`)

    const encryptedMessage = nacl.secretbox(signedMessage, nonce, key)

    const { cipher, mac } = splitCryptoPayload(encryptedMessage);

    log.info(
  `[INTEGRABILIDADE] MENSAGEM ENVIADA (CIFRADA):\n` +
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
  }, [newMessage, isChannelSecure, currentUser, socket, roomName, ownKeys]) 

  const decryptAndSetSessionKey = useCallback(
    (payload, senderPublicKey) => {
      if (!ownKeys) return

      const encrypted = decodeBase64(payload.box);
    const nonce = decodeBase64(payload.nonce);

    const { cipher, mac } = splitCryptoPayload(encrypted);

     log.info(
      `[INTEGRABILIDADE] Tentando decifrar chave de sessão:\n` +
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
        ownKeys.box.secretKey
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
