import React, { useState } from 'react';

// Este componente recebe uma função `onLogin` como propriedade (props)
export function LoginView({ onLogin }) {
  const [username, setUsername] = useState('');
  // Função para lidar com o login ao clicar no botão ou pressionar Enter
  const handleLogin = () => {
    // Verifica se o username não está vazio (após remover espaços em branco)
    if (username.trim()) {
      onLogin(username); // Chama a função do componente pai para atualizar o estado
    }
  };

  // Permite que o usuário pressione "Enter" para fazer login
  const handleKeyPress = (event) => {
    if (event.key === 'Enter') {
      handleLogin();
    }
  };

  return (
    <div className="bg-gray-900 min-h-screen flex items-center justify-center font-sans">
      
      <div className="bg-gray-800 p-8 rounded-lg shadow-2xl w-full max-w-sm">
        
        <h1 className="text-3xl font-bold text-white text-center mb-6 flex flex-col gap-5">
          <div>
            Chat criptografado
          </div>
        </h1>
        
        <div className="space-y-6">
          <label className='text-white'>Nome de Usuário</label>
          <input
            className="w-full px-4 py-3 bg-gray-700 rounded-lg text-white border-2 border-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyPress={handleKeyPress} // Adiciona o evento para a tecla Enter
            placeholder="Digite seu nome de usuário"
          />
          
          <button 
            onClick={handleLogin}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition-transform transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
          >
            Entrar
          </button>
        </div>
      </div>
    </div>
  );
}