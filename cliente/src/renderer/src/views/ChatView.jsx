// src/views/ChatView.jsx

// ... (código do ChatView continua o mesmo, apenas remova 'onBack' da desestruturação das props)
export function ChatView({ currentUser, chatWithUser }) {

  // ... (toda a lógica de useState e useEffect continua igual)

  return (
    <div className="bg-gray-900 min-h-screen flex justify-center items-center p-4 font-sans">
      {/* O container agora não precisa ter altura fixa, pode preencher a janela */}
      <div className="bg-gray-800 rounded-lg shadow-2xl w-full h-full flex flex-col">
        
        {/* Cabeçalho do Chat - Remova o botão de voltar */}
        <div className="flex items-center p-4 border-b border-gray-700 flex-shrink-0">
          {/* BOTÃO DE VOLTAR REMOVIDO DAQUI */}
          <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center mr-3">
             {/* ... */}
          </div>
          <div>
            {/* ... */}
          </div>
        </div>

        {/* O resto do JSX continua exatamente igual */}

      </div>
    </div>
  );
}