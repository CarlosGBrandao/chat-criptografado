// src/views/ChatView.jsx

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { socket } from '../socket';

import nacl from 'tweetnacl';
import { decodeBase64, encodeBase64, encodeUTF8, decodeUTF8 } from 'tweetnacl-util';

const StatusIndicator = ({ isSecure }) => (
  <div className="flex items-center text-xs text-gray-400">
    <div className={`w-2 h-2 rounded-full mr-2 ${isSecure ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
    {isSecure ? 'Canal Seguro Estabelecido' : 'Estabelecendo canal seguro...'}
  </div>
);

export function ChatView() {
  const [searchParams] = useSearchParams();
  const currentUser = searchParams.get('currentUser');
  const chatWithUser = searchParams.get('chatWithUser');
  const ownPublicKey = decodeBase64(searchParams.get('publicKey'));
  const ownSecretKey = decodeBase64(searchParams.get('secretKey'));

  const [pendingSessionKey, setPendingSessionKey] = useState(null);

  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');

  const [recipientPublicKey, setRecipientPublicKey] = useState(null);
  const [isChannelSecure, setIsChannelSecure] = useState(false);
  const sessionKey = useRef(null);

  // ATUALIZADO: Envolvemos a função de envio em useCallback para garantir
  // que ela sempre tenha acesso à versão mais recente de 'isChannelSecure'.
  const handleSendMessage = useCallback(() => {
    if (newMessage.trim() === '' || !isChannelSecure) {
      return;
    }
    
    // SOLUÇÃO DEFINITIVA: Usando a API nativa TextEncoder para converter a string em Uint8Array.
    // Isso remove a dependência da função 'encodeUTF8' que estava causando o problema.
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

  // --- ESTRUTURA CORRIGIDA COM useEffects SEPARADOS ---

  // Efeito 1: Lida APENAS com a conexão inicial e a solicitação da chave pública.
  // Roda apenas uma vez quando o componente é montado.
  useEffect(() => {
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
  }, [currentUser, chatWithUser]); // Dependências estáveis, roda uma vez.


  // Efeito 2: Lida APENAS com o recebimento de mensagens e respostas.
  // Este hook se re-inscreve nos eventos se as dependências mudarem, sem causar um novo pedido de conexão.
  useEffect(() => {
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
  }, [chatWithUser, ownSecretKey, recipientPublicKey]); // Depender de recipientPublicKey é crucial aqui

  // NOVO: Efeito 4 - Processa a chave de sessão guardada assim que a chave pública chegar.
  useEffect(() => {
    // Se temos uma chave de sessão pendente E a chave pública finalmente chegou...
    if (pendingSessionKey && recipientPublicKey) {
      console.log("[EFEITO 4] Processando a chave de sessão que estava guardada...");
      // ...processamos a chave pendente...
      decryptAndSetSessionKey(pendingSessionKey, recipientPublicKey);
      // ...e limpamos o buffer.
      setPendingSessionKey(null);
    }
  }, [pendingSessionKey, recipientPublicKey, ownSecretKey]);

  // Efeito 3: Lida APENAS com o envio da chave de sessão (o iniciador).
  // Este não mudou e já estava correto.
useEffect(() => {
    // Só executa se tivermos a chave do outro e o canal AINDA não for seguro.
    if (recipientPublicKey && !isChannelSecure) {
      
      // A única lógica que resta é: se eu sou o iniciador criptográfico, eu envio a chave.
      if (currentUser < chatWithUser) {
        console.log('[EFEITO 3] Sou o iniciador. Gerando e enviando chave de sessão.');
        const newSessionKey = nacl.randomBytes(nacl.secretbox.keyLength);
        sessionKey.current = newSessionKey;
        const nonce = nacl.randomBytes(nacl.box.nonceLength);
        const encryptedKey = nacl.box(newSessionKey, nonce, recipientPublicKey, ownSecretKey);
        const payload = {
          type: 'session-key',
          box: encodeBase64(encryptedKey),
          nonce: encodeBase64(nonce)
        };
        socket.emit('privateMessage', { to: chatWithUser, message: payload });
        setIsChannelSecure(true);
        console.log('✅ Canal seguro estabelecido! Chave de sessão ENVIADA.');
      }
      // Se eu NÃO sou o iniciador, este useEffect agora não faz NADA.
      // O componente simplesmente espera passivamente pela mensagem 'session-key',
      // que será tratada pelo listener no Efeito 2.
    }
  }, [recipientPublicKey, isChannelSecure, currentUser, chatWithUser, ownSecretKey]);

  const decryptAndSetSessionKey = useCallback((payload, senderPublicKey) => {
    const receivedSessionKey = nacl.box.open(
      decodeBase64(payload.box),
      decodeBase64(payload.nonce),
      senderPublicKey,
      ownSecretKey
    );

    if (receivedSessionKey) {
      sessionKey.current = receivedSessionKey;
      setIsChannelSecure(true);
      console.log('✅ Canal seguro estabelecido! Chave de sessão recebida e decifrada.');
    } else {
      console.error("Falha ao decifrar a chave de sessão!");
    }
  }, [ownSecretKey]);

  // O JSX para renderizar a tela continua o mesmo
  return (
    <div className="bg-gray-900 min-h-screen flex justify-center items-center p-4 font-sans">
      <div className="bg-gray-800 rounded-lg shadow-2xl w-full h-full flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-700 flex-shrink-0">
          <div className="flex items-center">
            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center mr-3 text-white font-bold">
              {chatWithUser.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-lg font-semibold text-white">Conversando com {chatWithUser}</p>
              <StatusIndicator isSecure={isChannelSecure} />
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-grow p-4 overflow-y-auto text-white">
          {messages.map((msg, index) => (
            <div key={index} className={`mb-4 flex ${msg.from === currentUser ? 'justify-end' : 'justify-start'}`}>
              <div className={`rounded-lg px-4 py-2 max-w-xs lg:max-w-md ${msg.from === currentUser ? 'bg-blue-600' : 'bg-gray-700'}`}>
                {msg.message}
              </div>
            </div>
          ))}
        </div>

        {/* Input */}
        <div className="p-4 border-t border-gray-700 flex-shrink-0">
          <div className="flex">
            <input
              type="text"
              className="w-full px-4 py-2 bg-gray-700 rounded-l-lg text-white border-2 border-gray-600 focus:outline-none focus:border-blue-500 disabled:opacity-50"
              placeholder={isChannelSecure ? "Digite sua mensagem..." : "Aguardando canal seguro..."}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              disabled={!isChannelSecure}
            />
            <button
              onClick={handleSendMessage}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-r-lg disabled:opacity-50"
              disabled={!isChannelSecure}
            >
              Enviar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}