import React, { useState, useEffect } from 'react'; 
import { Routes, Route, useSearchParams } from 'react-router-dom';
import { LoginView } from './views/LoginView';
import { UserListView } from './views/UserListView';
import { ChatView } from './views/ChatView';
// 1. Importar o UserListProvider que criamos
import { UserListProvider } from './contexts/UserListContext';
import { ChatContext, ChatProvider } from './contexts/ChatContext';

// Componente para o fluxo principal (Login -> Lista de Usuários)
const MainFlow = () => {
  const [currentUser, setCurrentUser] = React.useState(null);
  const [serverStatus, setServerStatus] = useState({ 
    online: false, 
    message: 'Conectando ao servidor...' 
  });

  useEffect(() => {
    fetch('http://localhost:3000/api/status')
      .then(response => {
        if (!response.ok) {
          throw new Error('Servidor respondeu, mas com um erro.');
        }
        return response.json();
      })
      .then(data => {
        console.log('Resposta do servidor:', data);
        setServerStatus({ online: true, message: data.mensagem });
      })
      .catch(error => {
        console.error('Erro ao conectar com o servidor:', error);
        setServerStatus({ 
          online: false, 
          message: 'Não foi possível conectar ao servidor. Verifique se ele está rodando e tente novamente.' 
        });
      });
  }, []);

  if (!serverStatus.online) {
    return (
      <div className="bg-gray-900 min-h-screen text-white flex flex-col items-center justify-center font-sans">
        <p className="text-xl">{serverStatus.message}</p>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginView onLogin={setCurrentUser} />;
  }

  // Envolver o UserListView com o Provider
 
  return (
    <UserListProvider currentUser={currentUser}>
      <UserListView/>
    </UserListProvider>
  );
};

// Componente que prepara a página de chat lendo a URL
const ChatPage = () => {
  const [searchParams] = useSearchParams();
  const currentUser = searchParams.get('currentUser');
  const chatWithUser = searchParams.get('chatWithUser');

  if (!currentUser || !chatWithUser) {
    return <div>Informações do chat ausentes.</div>;
  }
  
  return (
    <ChatProvider currentUser={currentUser} chatWithUser={chatWithUser}>
      <ChatView />
    </ChatProvider>
  )
};

// Componente que prepara a página de chat em grupo
const ChatGroupPage = () => {
  const [searchParams] = useSearchParams();
  const currentUser = searchParams.get('currentUser');

  if (!currentUser) {
    return <div>Informações do chat ausentes.</div>;
  }

  return <p>Bem vindo ao chat em grupo { currentUser} </p>
};

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<MainFlow />} />
      <Route path="/chat" element={<ChatPage />} />
      <Route path="/chatGroup" element={<ChatGroupPage />} />
    </Routes>
  );
}