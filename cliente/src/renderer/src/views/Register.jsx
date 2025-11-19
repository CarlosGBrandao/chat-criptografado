import React, { useState } from 'react';
import { generateNewUserKeys, prepareRegistrationPayload } from './authCrypto.js';
import { useNavigate, Link } from 'react-router-dom';

export default function Register() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      console.log("🔐 Gerando par de chaves localmente...");
      const keys = generateNewUserKeys();

      console.log("🔒 Criptografando chaves com sua senha...");
      const payload = prepareRegistrationPayload(username, password, keys);

      console.log("📤 Enviando para o servidor...", payload);

      const response = await fetch('http://localhost:3001/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok) {
        alert('✅ Usuário registrado com sucesso! Agora faça login.');
        navigate('/');
      } else {
        alert(`❌ Erro: ${data.message}`);
      }

    } catch (error) {
      console.error(error);
      alert('Erro ao conectar com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white">
      <div className="bg-gray-800 p-8 rounded-lg shadow-lg w-96">
        <h2 className="text-2xl font-bold mb-6 text-center">Criar Conta Segura (E2EE)</h2>
        
        <form onSubmit={handleRegister} className="flex flex-col gap-4">
          <input 
            className="p-2 rounded bg-gray-700 border border-gray-600 text-white"
            type="text" 
            placeholder="Nome de Usuário" 
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <input 
            className="p-2 rounded bg-gray-700 border border-gray-600 text-white"
            type="password" 
            placeholder="Senha Forte" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <button 
            type="submit" 
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded transition disabled:opacity-50"
          >
            {loading ? 'Registrando...' : 'Registrar'}
          </button>
        </form>

        <div className="mt-4 text-center text-sm">
          <p className="text-gray-400">Já tem conta?</p>
          <Link to="/" className="text-blue-400 hover:underline">Entrar</Link>
        </div>
      </div>
    </div>
  );
}
