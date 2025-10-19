import React, { createContext, useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from 'react-router-dom';
import { socket } from '../socket';

import nacl from 'tweetnacl';
import { decodeBase64, encodeBase64, encodeUTF8, decodeUTF8 } from 'tweetnacl-util';

export const ChatContext = createContext();

export function ChatProvider({children}){
    const [searchParams] = useSearchParams();
    const currentUser = searchParams.get('currentUser');
    const chatWithUser = searchParams.get('chatWithUser');
    const [ownKeys, setOwnKeys] = useState(null);


    const [pendingSessionKey, setPendingSessionKey] = useState(null);

    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');

    const [recipientPublicKey, setRecipientPublicKey] = useState(null);
    const [isChannelSecure, setIsChannelSecure] = useState(false);
    const sessionKey = useRef(null);


    useEffect(() => {
    // A API 'window.api.onChatKeys' virá do nosso ficheiro de preload do Electron.
    window.api.onChatKeys((keys) => {
        console.log("🔑 Chaves recebidas do processo principal de forma segura.");
        setOwnKeys({
        publicKey: decodeBase64(keys.publicKey),
        secretKey: decodeBase64(keys.secretKey)
        });
    });
    }, []);

    //  Envolvemos a função de envio em useCallback para garantir
    // que ela sempre tenha acesso à versão mais recente de 'isChannelSecure'.
    const handleSendMessage = useCallback(() => {
        if (newMessage.trim() === '' || !isChannelSecure) {
        return;
        }
    
 
    const messageUint8 = new TextEncoder().encode(newMessage);
    
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    const key = sessionKey.current;

    // Agora, todos os inputs para a função de criptografia estão corretos.
    const encryptedMessage = nacl.secretbox(
      messageUint8,
      nonce,
      key
    );
    
    const payload = {
      type: 'encrypted-message',
      ciphertext: encodeBase64(encryptedMessage),
      nonce: encodeBase64(nonce)
    };
    socket.emit('privateMessage', { to: chatWithUser, message: payload });
    setMessages(prev => [...prev, { from: currentUser, message: newMessage }]);
    setNewMessage('');
    }, [newMessage, isChannelSecure, currentUser, chatWithUser]);



  //  Lida APENAS com a conexão inicial e a solicitação da chave pública.
  
    useEffect(() => {
    if (!ownKeys) return;

        const handleConnect = () => {
        console.log(`[EFEITO 1] Conectado! Registrando ${currentUser} e solicitando chave de ${chatWithUser}.`);
        socket.emit('register', currentUser);
        socket.emit('getPublicKey', { username: chatWithUser });
        };

        if (!socket.connected) {
        socket.connect();
        }

        socket.on('connect', handleConnect);
        
        // Se já estiver conectado quando o componente abrir, executa a lógica manualmente.
        if (socket.connected) {
        handleConnect();
        }

        return () => {
        socket.off('connect', handleConnect);
        };
    }, [currentUser, chatWithUser, ownKeys]); // Dependências estáveis, roda uma vez.


    //  Lida  com o recebimento de mensagens e respostas.
    //
    useEffect(() => {

        if (!ownKeys) return;

    
    const handlePublicKeyResponse = (data) => {
      if (data.username === chatWithUser && data.publicKey) {
        setRecipientPublicKey(decodeBase64(data.publicKey));
      }
    };

    const receiveMessageHandler = (data) => {
      if (data.from !== chatWithUser) return;
      const { type, ...payload } = data.message;
      
      if (type === 'session-key') {
        // Se a chave pública JÁ chegou, processamos imediatamente.
        if (recipientPublicKey) {
          decryptAndSetSessionKey(payload, recipientPublicKey);
        } else {
          // Se NÃO chegou, guardamos a session-key para processar depois.
          console.warn("Chave de sessão recebida ANTES da chave pública. Guardando para depois.");
          setPendingSessionKey(payload);
        }
      }
      
      if (type === 'encrypted-message' && payload.ciphertext && payload.nonce && sessionKey.current) {
        const decryptedBytes = nacl.secretbox.open(decodeBase64(payload.ciphertext), decodeBase64(payload.nonce), sessionKey.current);
        if (decryptedBytes) {
          setMessages(prev => [...prev, { from: data.from, message: new TextDecoder().decode(decryptedBytes) }]);
        }
      }
    };
    
    socket.on('publicKeyResponse', handlePublicKeyResponse);
    socket.on('receiveMessage', receiveMessageHandler);
    return () => {
      socket.off('publicKeyResponse', handlePublicKeyResponse);
      socket.off('receiveMessage', receiveMessageHandler);
    };
    }, [chatWithUser, recipientPublicKey, ownKeys]); // Depender de recipientPublicKey é crucial aqui

  // Processa a chave de sessão guardada assim que a chave pública chegar.
    useEffect(() => {
        // Se temos uma chave de sessão pendente E a chave pública finalmente chegou...
        if (pendingSessionKey && recipientPublicKey) {
        console.log("[EFEITO 4] Processando a chave de sessão que estava guardada...");
        // ...processamos a chave pendente...
        decryptAndSetSessionKey(pendingSessionKey, recipientPublicKey);
        // ...e limpamos o buffer.
        setPendingSessionKey(null);
        }
    }, [pendingSessionKey, recipientPublicKey, ownKeys]);

  // Lida com o envio da chave de sessão (o iniciador).

    useEffect(() => {

    if (!ownKeys) return;

    // Só executa se tivermos a chave do outro e o canal AINDA não for seguro.
    if (recipientPublicKey && !isChannelSecure) {
      
      // A única lógica que resta é: se eu sou o iniciador criptográfico, eu envio a chave.
      if (currentUser < chatWithUser) {
        console.log('[EFEITO 3] Sou o iniciador. Gerando e enviando chave de sessão.');
        const newSessionKey = nacl.randomBytes(nacl.secretbox.keyLength);
        sessionKey.current = newSessionKey;
        const nonce = nacl.randomBytes(nacl.box.nonceLength);
        const encryptedKey = nacl.box(newSessionKey, nonce, recipientPublicKey, ownKeys.secretKey);
        const payload = {
          type: 'session-key',
          box: encodeBase64(encryptedKey),
          nonce: encodeBase64(nonce)
        };
        socket.emit('privateMessage', { to: chatWithUser, message: payload });
        setIsChannelSecure(true);
        console.log('✅ Canal seguro estabelecido! Chave de sessão ENVIADA.');
      }
     
    }
  }, [recipientPublicKey, isChannelSecure, currentUser, chatWithUser, ownKeys]);

  const decryptAndSetSessionKey = useCallback((payload, senderPublicKey) => {

    if (!ownKeys) return;

    const receivedSessionKey = nacl.box.open(
      decodeBase64(payload.box),
      decodeBase64(payload.nonce),
      senderPublicKey,
      ownKeys.secretKey
    );

    if (receivedSessionKey) {
      sessionKey.current = receivedSessionKey;
      setIsChannelSecure(true);
      console.log('✅ Canal seguro estabelecido! Chave de sessão recebida e decifrada.');
    } else {
      console.error("Falha ao decifrar a chave de sessão!");
    }
  }, [ownKeys]);

  const value = {
    currentUser,
    chatWithUser,
    isChannelSecure,
    messages,
    newMessage,
    setNewMessage,
    handleSendMessage,
  };

  return (
    <ChatContext.Provider value={value} >
        {children}
    </ChatContext.Provider>
  )
}
