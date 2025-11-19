import React, { useState } from 'react';
import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';
// Importe as funções corretas para o Modelo Determinístico
import { generateDeterministicKeys, generateLoginVerifier } from './authCrypto.js'; 
import { useNavigate, Link } from 'react-router-dom';
import log from 'electron-log/renderer'


export default function Register() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 1. Gera o Salt
     const salt = encodeBase64(nacl.randomBytes(16));
      
      // 2. Gera Chaves Determinísticas (Privada + Pública)
      const keys = generateDeterministicKeys(password, salt); // Gera as chaves mestras
      
      // 3. Gera o Verificador de Senha
      const passwordVerifier = generateLoginVerifier(password, salt);

      log.info("🔐 Chaves geradas e verificador criado localmente.");
      
      // 4. Prepara o payload para o servidor
      // O servidor recebe APENAS as chaves públicas e o salt.
      const payload = {
        username,
        salt,
        passwordVerifier,
        publicKeyBox: encodeBase64(keys.box.publicKey),
        publicKeySign: encodeBase64(keys.sign.publicKey),
        // Chaves Privadas (secretKey) NÃO SÃO ENVIADAS AO SERVIDOR
      };

      log.info("📤 Enviando para o servidor (Sem chaves privadas)...", payload);
      
      // 5. Envia para a API
      const response = await fetch('http://localhost:3001/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok) {
        alert('✅ Usuário registrado com sucesso! Agora faça login.');
        navigate('/'); // Redireciona para o fluxo principal (Login)
      } else {
        alert(`❌ Erro: ${data.message}`);
      }

    } catch (error) {
      console.error(error);
      alert('Erro ao conectar com o servidor ou problema na criptografia.');
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
