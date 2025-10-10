// src/App.jsx
import React, { useState, useEffect } from 'react'; 
import { Routes, Route, useSearchParams } from 'react-router-dom';
import { LoginView } from './views/LoginView';
import { UserListView } from './views/UserListView';
import { ChatView } from './views/ChatView';

// Componente para o fluxo principal (Login -> Lista de Usuários)
const MainFlow = () => {
  const [currentUser, setCurrentUser] = React.useState(null);

  const [serverStatus, setServerStatus] = useState({ 
    online: false, 
    message: 'Conectando ao servidor...' 
  });

  // 3. Usar useEffect para fazer a chamada à API quando o componente carregar
  useEffect(() => {
    fetch('http://localhost:3000/api/status')
      .then(response => {
        if (!response.ok) {
          // Se a resposta não for 2xx, lança um erro para cair no .catch()
          throw new Error('Servidor respondeu, mas com um erro.');
        }
        return response.json();
      })
      .then(data => {
        // 4. Lógica para lidar com a resposta de SUCESSO do servidor
        console.log('Resposta do servidor:', data);
        setServerStatus({ online: true, message: data.mensagem });
      })
      .catch(error => {
        // 5. Lógica para lidar com ERROS de conexão
        console.error('Erro ao conectar com o servidor:', error);
        setServerStatus({ 
          online: false, 
          message: 'Não foi possível conectar ao servidor. Verifique se ele está rodando e tente novamente.' 
        });
      });
  }, []); // O array vazio [] garante que isso só rode uma vez

  // 6. Renderização condicional: Mostrar status ANTES da tela de login
  if (!serverStatus.online) {
    // Se o servidor não estiver online, mostra a mensagem de status e para aqui
    return <div>{serverStatus.message}</div>;
  }

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