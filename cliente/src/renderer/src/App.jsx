// src/App.jsx
import React from 'react';
import { Routes, Route, useSearchParams } from 'react-router-dom';
import { LoginView } from './views/LoginView';
import { UserListView } from './views/UserListView';
import { ChatView } from './views/ChatView';

// Componente para o fluxo principal (Login -> Lista de Usuários)
const MainFlow = () => {
  const [currentUser, setCurrentUser] = React.useState(null);

  if (!currentUser) {
    return <LoginView onLogin={setCurrentUser} />;
  }
  return <UserListView currentUser={currentUser} />;
};

// Componente que prepara a página de chat lendo a URL
const ChatPage = () => {
  const [searchParams] = useSearchParams();
  const currentUser = searchParams.get('currentUser');
  const chatWithUser = searchParams.get('chatWithUser');

  if (!currentUser || !chatWithUser) {
    return <div>Informações do chat ausentes.</div>;
  }
  
  // O botão de voltar não é mais necessário, pois o usuário fecha a janela
  return <ChatView currentUser={currentUser} chatWithUser={chatWithUser} />;
};

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<MainFlow />} />
      <Route path="/chat" element={<ChatPage />} />
    </Routes>
  );
}