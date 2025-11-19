import React, { useState } from 'react';
import { decryptUserKeys, generateLoginVerifier } from './authCrypto';
import { Link } from 'react-router-dom';

export default function LoginNewView({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 1. Busca o SALT do usuário primeiro
      const saltRes = await fetch(`http://localhost:3001/api/salt/${username}`);
      if (!saltRes.ok) {
        throw new Error('Usuário não encontrado.');
      }
      const { salt } = await saltRes.json();

      // 2. Gera o verificador localmente
      const passwordVerifier = generateLoginVerifier(password, salt);

      // 3. Tenta logar no servidor
      const loginRes = await fetch('http://localhost:3001/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, passwordVerifier })
      });

      const data = await loginRes.json();

      if (!loginRes.ok) {
        throw new Error(data.message || 'Falha no login');
      }

      console.log("📦 Cofre recebido! Tentando destrancar com sua senha...");

      // 4. A Mágica: Descriptografa as chaves privadas na memória
      const unlockedKeys = decryptUserKeys(
        password, 
        data.salt, 
        data.encryptedPrivateKeyBox, 
        data.encryptedPrivateKeySign
      );

      if (unlockedKeys) {
        console.log("🔓 Cofre aberto com sucesso! Chaves restauradas.");
        
        // CHAMA O CALLBACK PARA O APP.JS GUARDAR AS CHAVES
        onLoginSuccess(data.username, unlockedKeys);
        
      } else {
        alert("Erro crítico: A senha validou no servidor, mas não conseguiu abrir o cofre localmente.");
      }

    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white">
      <div className="bg-gray-800 p-8 rounded-lg shadow-lg w-96">
        <h2 className="text-2xl font-bold mb-6 text-center">Login E2EE</h2>
        
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <input 
            className="p-2 rounded bg-gray-700 border border-gray-600 text-white"
            type="text" 
            placeholder="Usuário" 
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input 
            className="p-2 rounded bg-gray-700 border border-gray-600 text-white"
            type="password" 
            placeholder="Senha" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button 
            type="submit" 
            disabled={loading}
            className="bg-green-600 hover:bg-green-700 text-white p-2 rounded transition disabled:opacity-50"
          >
            {loading ? 'Abrindo Cofre...' : 'Entrar'}
          </button>
        </form>

        <div className="mt-4 text-center text-sm">
          <p className="text-gray-400">Não tem conta?</p>
          <Link to="/register" className="text-blue-400 hover:underline">Criar nova conta</Link>
        </div>
      </div>
    </div>
  );
}