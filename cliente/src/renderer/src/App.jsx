import React, { useState, useEffect } from 'react';
import { Routes, Route, useSearchParams } from 'react-router-dom';

// --- VIEWS EXISTENTES ---
import { LoginView } from './views/LoginView';
import  LoginNewView  from './views/LoginNewView';
import { UserListView } from './views/UserListView';
import { ChatView } from './views/ChatView';
import { ChatGroupView } from './views/ChatGroupView';

// --- NOVO COMPONENTE ---
import Register from './views/Register'; // <--- IMPORTANTE: Importe o registro

// --- CONTEXTOS ---
import { UserListProvider } from './contexts/UserListContext';
import { ChatProvider } from './contexts/ChatContext';
import { ChatGroupProvider } from './contexts/ChatGroupContext';
import { SocketProvider } from './contexts/SocketContext';

// Componente para o fluxo principal (Login -> Lista de Usuários)
const MainFlow = ({ currentUser, onLogin }) => {
  const [serverStatus, setServerStatus] = useState({
    online: false,
    message: 'Conectando ao servidor...'
  });

  useEffect(() => {
    fetch('http://localhost:3001/api/status') // Certifique-se que essa rota existe ou use a de register para testar ping
      .then(response => {
        // Se não tiver rota de status, pode ignorar esse bloco ou criar uma rota GET / no express
        // Mas vamos assumir que o socket conecta, então ok.
        setServerStatus({ online: true, message: 'Servidor Online' });
      })
      .catch(error => {
        // O fetch pode falhar se não tiver rota GET, mas o socket pode estar on.
        // Para simplificar, vamos assumir online se o socket conectar, ou manter sua logica se tiver endpoint.
        console.log("Check de status HTTP falhou (normal se não criou rota GET), seguindo...");
        setServerStatus({ online: true, message: 'Online' }); 
      });
  }, []);

  // Removi o bloqueio visual de serverStatus para não travar se você não tiver criado a rota GET /api/status
  // Se quiser manter, certifique-se de criar app.get('/api/status', ...) no backend.

  if (!currentUser) {
    // Aqui usamos o NOVO Login, passando o callback onLoginSuccess
    // O 'keys' são as chaves destrancadas que vieram do Login.jsx
    return <LoginNewView onLoginSuccess={(user, keys) => onLogin(user, keys)} />;
  }

  return (
    <UserListView />
  );
};

// Componente que prepara a página de chat lendo a URL
const ChatPage = () => {
  const [searchParams] = useSearchParams();
  const currentUser = searchParams.get('currentUser');
  const chatWithUser = searchParams.get('chatWithUser');
  const initiator = searchParams.get('initiator');

  if (!currentUser || !chatWithUser || !initiator) {
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

  return (
    <ChatGroupProvider>
      <ChatGroupView />
    </ChatGroupProvider>
  )
};

export default function App() {
  const [currentUser, setCurrentUser] = React.useState(null);
  const [restoredKeys, setRestoredKeys] = useState(null);

  const handleLogin = (user, keys) => {
      setCurrentUser(user);
      setRestoredKeys(keys);
  };

  return (
    <SocketProvider>
      <UserListProvider currentUser={currentUser} restoredKeys={restoredKeys}>
        <Routes>
          {/* Rota Principal (Login ou Lista) */}
          <Route path="/" element={<MainFlow currentUser={currentUser} onLogin={handleLogin} />} />
          
          {/* --- NOVA ROTA DE REGISTRO --- */}
          <Route path="/register" element={<Register />} />
          
          {/* Rotas de Chat */}
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/chatGroup" element={<ChatGroupPage />} />
        </Routes>
      </UserListProvider>
    </SocketProvider>
  );
}