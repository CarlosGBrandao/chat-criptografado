// src/contexts/ChatGroupProvider.jsx

import React, { createContext, useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from 'react-router-dom';
import { socket } from '../socket';
import log from 'electron-log/renderer';
import nacl from 'tweetnacl';
import { decodeBase64, encodeBase64 } from 'tweetnacl-util';

export const ChatGroupContext = createContext();

export function ChatGroupProvider({ children }) {
    const [searchParams] = useSearchParams();
    const currentUser = searchParams.get('currentUser');
    const groupId = searchParams.get('groupId');
    const groupName = searchParams.get('groupName');
    const owner = searchParams.get('owner');
    // Membros vêm como string separada por vírgula, transformamos em array
    const initialMembers = searchParams.get('members')?.split(',') || [];

    const [members, setMembers] = useState(initialMembers);
    const [ownKeys, setOwnKeys] = useState(null);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    
    const [membersPublicKeys, setMembersPublicKeys] = useState(new Map());
    const [isChannelSecure, setIsChannelSecure] = useState(false);
    const groupSessionKey = useRef(null);

    const [isGroupTerminated, setIsGroupTerminated] = useState(false);

    useEffect(() => {
    // A função retornada será chamada apenas quando o componente for desmontado
    return () => {
        if (currentUser === owner) {
            log.info(`[DONO] Fechando a janela e encerrando o grupo ${groupId}.`);
            socket.emit('owner-left-group', { groupId });
        } else {
            log.info(`[MEMBRO] Fechando a janela e saindo do grupo ${groupId}.`);
            socket.emit('leave-group', { groupId });
        }
    };
}, [groupId, currentUser, owner]);

    // 1. Obter as chaves do próprio usuário via Electron preload
    useEffect(() => {
        window.api.onChatKeys((keys) => {
            setOwnKeys({
                publicKey: decodeBase64(keys.publicKey),
                secretKey: decodeBase64(keys.secretKey)
            });
        });
        log.info(`${currentUser}, ${groupId}, ${groupName}, ${owner}, ${initialMembers}`)
    }, []);

    // 2. Conectar, registrar, entrar na sala e buscar chaves públicas dos outros membros
    useEffect(() => {
  if (!ownKeys || !groupId) return;

  const handleConnect = () => {
    socket.emit('register', currentUser);
    socket.emit('join-group-room', groupId);
    members.forEach(member => {
      if (member !== currentUser) {
        log.info(`--> Solicitando chave pública para: ${member}`);
        socket.emit('getPublicKey', { username: member });
      }
    });
  };

  if (!socket.connected) socket.connect();
  socket.on('connect', handleConnect);
  if (socket.connected) handleConnect();

  const handlePublicKeyResponse = (data) => {
    if (data.publicKey) {
      setMembersPublicKeys(prevMap =>
        new Map(prevMap).set(data.username, decodeBase64(data.publicKey))
      );
    }
  };

  // 🔒 ALERTA controlado — só dispara uma vez
  const handleGroupTerminated = (data) => {
    if (data.groupId !== groupId) return;
    // Evita alert múltiplo ou falso
    if (!isGroupTerminated) {
      log.warn(`Grupo ${groupName} foi encerrado pelo dono.`);
      setIsGroupTerminated(true);
      // Só mostra alerta se o usuário atual NÃO for o dono
      if (currentUser !== owner) {
        alert(`O grupo "${groupName}" foi encerrado porque o dono saiu.`);
      }
    }
  };

  socket.on('publicKeyResponse', handlePublicKeyResponse);
  socket.on('group-terminated', handleGroupTerminated);

 /*
    return () => {
        socket.off('connect', handleConnect);
        socket.off('publicKeyResponse', handlePublicKeyResponse);
        socket.off('group-terminated', handleGroupTerminated);

        if (currentUser === owner) {
            log.info(`[DONO] Saindo e encerrando o grupo ${groupId}.`);
            socket.emit('owner-left-group', { groupId });
        } else {
            log.info(`[MEMBRO] Saindo do grupo ${groupId}.`);
            socket.emit('leave-group', { groupId });
        }
    };
    */

    return () => {
        socket.off('connect', handleConnect);
        socket.off('publicKeyResponse', handlePublicKeyResponse);
        socket.off('group-terminated', handleGroupTerminated);
    };

}, [ownKeys, groupId, currentUser, members, owner, isGroupTerminated]);


    // 3. Lógica de Geração e Distribuição de Chave (SOMENTE O DONO EXECUTA)
    const generateAndDistributeKey = useCallback(() => {
        if (currentUser !== owner) {
        return;
        }

        const hasOtherMembers = members.length > 1;
        if (hasOtherMembers && membersPublicKeys.size < members.length - 1) {
            log.info(`[DONO] Aguardando chaves públicas. Recebidas ${membersPublicKeys.size} de ${members.length - 1}.`);
            return;
        }
        log.info(`[DONO] Condições atendidas. Gerando e distribuindo nova chave de sessão para o grupo ${groupName}.`);
        const newKey = nacl.randomBytes(nacl.secretbox.keyLength);
        groupSessionKey.current = newKey; // O dono define a chave para si mesmo
        setIsChannelSecure(true); 

        log.info(`[DONO] Chave de sessao (secreta) gerada para o grupo: ${encodeBase64(newKey)}`);

        const publicKeysLog = Array.from(membersPublicKeys.entries())
        .map(([username, pubKey]) => `  - ${username}: ${encodeBase64(pubKey)}`)
        .join('\n');

    if (publicKeysLog) {
         log.info(`[DONO] Chaves publicas dos membros que serao usadas para criptografia:\n${publicKeysLog}`);
    }

        // Criptografa e envia a chave para cada membro individualmente
        members.forEach(member => {
            if (member !== currentUser) {
                const recipientPublicKey = membersPublicKeys.get(member);
                if (recipientPublicKey) {
                    const nonce = nacl.randomBytes(nacl.box.nonceLength);
                    const encryptedKey = nacl.box(newKey, nonce, recipientPublicKey, ownKeys.secretKey);

                    log.info(`[DONO] Criptografando chave para '${member}':\n` +
                         `  Box: ${encodeBase64(encryptedKey)}\n` +
                         `  Nonce: ${encodeBase64(nonce)}`);
                    
                    const keyPayload = {
                        box: encodeBase64(encryptedKey),
                        nonce: encodeBase64(nonce)
                    };

                    

                    socket.emit('distribute-new-group-key', {
                        to: member,
                        groupId,
                        keyPayload
                    });
                }
            }
        });
    }, [currentUser, owner, members, membersPublicKeys, ownKeys, groupId, groupName]);
    
    // Efeito que dispara a criação da chave quando as condições são atendidas
    useEffect(() => {
        generateAndDistributeKey();
    }, [generateAndDistributeKey]);


    
    // 4. Lógica para receber mensagens, chaves e atualizações de membros
    useEffect(() => {
        if (!ownKeys) return;

        // Recebe e decifra a chave de sessão enviada pelo dono
        const handleReceiveKey = (data) => {
            if (data.groupId !== groupId || currentUser === owner) return;

            const ownerPublicKey = membersPublicKeys.get(data.from);
            if(ownerPublicKey) {

              log.info(`[MEMBRO] Chave de sessao criptografada de '${data.from}' recebida:\n` +
                     `  Box: ${data.keyPayload.box}\n` +
                     `  Nonce: ${data.keyPayload.nonce}`);

                const receivedKey = nacl.box.open(
                    decodeBase64(data.keyPayload.box),
                    decodeBase64(data.keyPayload.nonce),
                    ownerPublicKey,
                    ownKeys.secretKey
                );
                if (receivedKey) {
                    groupSessionKey.current = receivedKey;
                    setIsChannelSecure(true);

                    log.info(`[MEMBRO] Chave de sessao decifrada: ${encodeBase64(receivedKey)}`);
                log.info(`✅ Canal seguro estabelecido para o grupo '${groupName}'!`);
                    log.info(`[MEMBRO] Nova chave de sessão decifrada com sucesso para o grupo ${groupName}. Canal seguro!`);
                } else { // NOVO LOG
                    log.error(`[MEMBRO] FALHA ao decifrar a chave de sessão recebida de '${data.from}'.`);
                }
            } else { // NOVO LOG
                log.warn(`[MEMBRO] Recebi uma chave de sessão, mas ainda não tenho a chave pública de '${data.from}'.`);
            }
        };

        // Recebe e decifra uma mensagem do grupo
        const handleReceiveMessage = (data) => {
            if (data.groupId !== groupId) return;
            const key = groupSessionKey.current;
            if(key && data.message.ciphertext){
              log.info(`[MSG] Recebendo mensagem cifrada de '${data.from}' no grupo '${groupName}'.`);
                const decryptedBytes = nacl.secretbox.open(
                    decodeBase64(data.message.ciphertext),
                    decodeBase64(data.message.nonce),
                    key
                );
                if(decryptedBytes){
                  log.info(`[MSG] Mensagem de '${data.from}' decifrada com sucesso.`);
                    setMessages(prev => [...prev, {from: data.from, message: new TextDecoder().decode(decryptedBytes)}]);
                } else {
                  log.error(`[MSG] FALHA ao decifrar mensagem de '${data.from}' no grupo '${groupName}'.`);
                }
            }
        };
        
        // Ouve por mudanças na lista de membros e dispara o rekeying se for o dono
        const handleMembershipChange = (data) => {
            if (data.groupId !== groupId) return;
            log.info(`Membros do grupo atualizados: ${data.message}`);
            setMembers(data.members); // Atualiza a lista de membros local
            setIsChannelSecure(false); // Canal fica inseguro até a nova chave chegar
            log.warn(`[SEGURANÇA] O canal do grupo '${groupName}' tornou-se INSEGURO devido a mudança de membros. Aguardando nova chave do dono.`);
            
            if (currentUser === owner) {
        log.info(`[DONO] A mudança de membros iniciou o processo de atualizacao da chave (re-keying).`);
    }

            // O callback 'generateAndDistributeKey' será re-executado pelo useEffect no passo 3
            // porque a dependência 'members' mudou.
        };

        socket.on('receive-new-group-key', handleReceiveKey);
        socket.on('receive-group-message', handleReceiveMessage);
        socket.on('group-membership-changed', handleMembershipChange);

        return () => {
            socket.off('receive-new-group-key', handleReceiveKey);
            socket.off('receive-group-message', handleReceiveMessage);
            socket.off('group-membership-changed', handleMembershipChange);
        };

    }, [ownKeys, groupId, currentUser, owner, membersPublicKeys, generateAndDistributeKey, groupName]);


    // 5. Função para enviar mensagem
    const handleSendMessage = useCallback(() => {
        if (newMessage.trim() === '' || !isChannelSecure || isGroupTerminated) return;

        log.info(`[MSG] Criptografando e enviando mensagem para o grupo '${groupName}'`);
    
        const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
        const key = groupSessionKey.current;
        const messageUint8 = new TextEncoder().encode(newMessage);

        const encryptedMessage = nacl.secretbox(messageUint8, nonce, key);
        
        const payload = {
          ciphertext: encodeBase64(encryptedMessage),
          nonce: encodeBase64(nonce)
        };

        socket.emit('group-message', { groupId, message: payload });
        setMessages(prev => [...prev, { from: currentUser, message: newMessage }]);
        setNewMessage('');
    }, [newMessage, isChannelSecure, currentUser, groupId, groupName, isGroupTerminated]); // checar essas dependencias


    const value = {
        currentUser,
        groupName,
        members,
        isChannelSecure,
        messages,
        newMessage,
        setNewMessage,
        handleSendMessage,
    };

    return (
        <ChatGroupContext.Provider value={value}>
            {children}
        </ChatGroupContext.Provider>
    );
}