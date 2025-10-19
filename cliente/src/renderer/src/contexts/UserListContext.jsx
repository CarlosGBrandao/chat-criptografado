import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { socket } from '../socket';
import nacl from 'tweetnacl';
import { encodeBase64 } from 'tweetnacl-util';


export const UserListContext = createContext();

// Provedor
export function UserListProvider({ children, currentUser }) {
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [incomingRequests, setIncomingRequests] = useState(new Set());
  const [pendingRequests, setPendingRequests] = useState(new Set());
  const userKeys = useRef(null);

  const handleOpenChatWindow = useCallback((chatWithUser) => {
    if (!userKeys.current) return;
    const keyInfo = {
      publicKey: encodeBase64(userKeys.current.publicKey),
      secretKey: encodeBase64(userKeys.current.secretKey)
    };
    window.api.openChatWindow({ currentUser, chatWithUser, keyInfo });
  }, [currentUser]);

  const sendChatRequest = (user) => {
    socket.emit('send-chat-request', { to: user });
    setPendingRequests(prev => new Set(prev).add(user));
  };

  const acceptChatRequest = (user) => {
    socket.emit('accept-chat-request', { to: user });
    setIncomingRequests(prev => {
      const newSet = new Set(prev);
      newSet.delete(user);
      return newSet;
    });
    handleOpenChatWindow(user);
  };

  const declineChatRequest = (user) => {
    setIncomingRequests(prev => {
      const newSet = new Set(prev);
      newSet.delete(user);
      return newSet;
    });
  };

  useEffect(() => {
    if (!currentUser) return;

    if (!userKeys.current) userKeys.current = nacl.box.keyPair();
    if (!socket.connected) socket.connect();

    const onConnect = () => {
      socket.emit('register', currentUser);
      socket.emit('registerPublicKey', { publicKey: encodeBase64(userKeys.current.publicKey) });
    };

    const onUpdateUserList = (users) => setOnlineUsers(users);
    const onReceiveChatRequest = ({ from }) => setIncomingRequests(prev => new Set(prev).add(from));
    const onChatRequestAccepted = ({ from }) => {
      setPendingRequests(prev => {
        const newSet = new Set(prev);
        newSet.delete(from);
        return newSet;
      });
      handleOpenChatWindow(from);
    };

    socket.on('connect', onConnect);
    socket.on('updateUserList', onUpdateUserList);
    socket.on('receive-chat-request', onReceiveChatRequest);
    socket.on('chat-request-accepted', onChatRequestAccepted);

    return () => {
      socket.off('connect', onConnect);
      socket.off('updateUserList', onUpdateUserList);
      socket.off('receive-chat-request', onReceiveChatRequest);
      socket.off('chat-request-accepted', onChatRequestAccepted);
    };
  }, [currentUser, handleOpenChatWindow]);

  const otherUsers = onlineUsers.filter(u => u !== currentUser);

  const value = {
    otherUsers,
    incomingRequests,
    pendingRequests,
    sendChatRequest,
    acceptChatRequest,
    declineChatRequest,
  };

  return (
    <UserListContext.Provider value={value}>
      {children}
    </UserListContext.Provider>
  );
}

// O hook customizado 'useUserList' foi removido.