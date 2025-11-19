import React, { useState } from 'react';
import { generateNewUserKeys, prepareRegistrationPayload } from './authCrypto.js';
import { useNavigate } from 'react-router-dom';

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
      // 1. Gera as chaves na memória RAM do navegador
      const keys = generateNewUserKeys();

      console.log("🔒 Criptografando chaves com sua senha...");
      // 2. Prepara o pacote criptografado
      const payload = prepareRegistrationPayload(username, password, keys);

      console.log("📤 Enviando para o servidor...", payload);
      
      // 3. Envia para a API que criamos
      const response = await fetch('http://localhost:3001/api/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok) {
        alert('✅ Usuário registrado com sucesso! Agora faça login.');
        // Aqui você redirecionaria para o Login (que faremos a seguir)
        // navigate('/login');
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
    <div style={{ padding: 20, maxWidth: 400, margin: 'auto' }}>
      <h2>Criar Conta Segura (E2EE)</h2>
      <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input 
          type="text" 
          placeholder="Nome de Usuário" 
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <input 
          type="password" 
          placeholder="Senha Forte" 
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Criptografando e Registrando...' : 'Registrar'}
        </button>
      </form>
    </div>
  );
}