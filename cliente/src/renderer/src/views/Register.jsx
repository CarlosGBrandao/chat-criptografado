import React, { useState } from 'react';
import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';
// Importe as funções corretas para o Modelo Determinístico
import { generateDeterministicKeys, generateLoginVerifier } from './authCrypto.js'; 
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
      // 1. Gera o Salt
     const salt = encodeBase64(nacl.randomBytes(16));
      
      // 2. Gera Chaves Determinísticas (Privada + Pública)
      const keys = generateDeterministicKeys(password, salt); // Gera as chaves mestras
      
      // 3. Gera o Verificador de Senha
      const passwordVerifier = generateLoginVerifier(password, salt);

      console.log("🔐 Chaves geradas e verificador criado localmente.");
      
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

      console.log("📤 Enviando para o servidor (Sem chaves privadas)...", payload);
      
      // 5. Envia para a API
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
          {loading ? 'Gerando Chaves Determinísticas...' : 'Registrar'}
        </button>
      </form>
    </div>
  );
}