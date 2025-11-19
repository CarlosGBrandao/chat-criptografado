// src/utils/authCrypto.js
import nacl from 'tweetnacl';
import { encodeBase64 } from 'tweetnacl-util';
import CryptoJS from 'crypto-js';
import { decodeBase64 } from 'tweetnacl-util';

// 1. Gera chaves novas (Box e Sign)
export const generateNewUserKeys = () => {
  return {
    box: nacl.box.keyPair(),
    sign: nacl.sign.keyPair()
  };
};

// 2. Prepara o pacote seguro para enviar ao servidor
export const prepareRegistrationPayload = (username, password, keys) => {
  // A. Gera um Salt aleatório (tempero para a senha)
  const salt = CryptoJS.lib.WordArray.random(16).toString();

  // B. Deriva uma chave forte da senha (PBKDF2)
  // Isso transforma "123456" em uma chave hash gigante e única
  // Essa chave NUNCA vai para o servidor.
  const derivedKey = CryptoJS.PBKDF2(password, salt, { 
    keySize: 256 / 32, 
    iterations: 1000 
  }).toString();

  // C. Prepara as chaves privadas para serem trancadas
  const privateBoxKey = encodeBase64(keys.box.secretKey);
  const privateSignKey = encodeBase64(keys.sign.secretKey);

  // D. Tranca as chaves privadas com a senha derivada (AES)
  const encryptedPrivateKeyBox = CryptoJS.AES.encrypt(privateBoxKey, derivedKey).toString();
  const encryptedPrivateKeySign = CryptoJS.AES.encrypt(privateSignKey, derivedKey).toString();

  // E. Cria o verificador de senha (um hash simples para o servidor saber se a senha tá certa no login)
  // O servidor guarda isso, mas não consegue voltar para a senha original.
  const passwordVerifier = CryptoJS.SHA256(password + salt).toString();

  // Retorna o pacote pronto para a API
  return {
    username,
    publicKeyBox: encodeBase64(keys.box.publicKey),
    publicKeySign: encodeBase64(keys.sign.publicKey),
    encryptedPrivateKeyBox,
    encryptedPrivateKeySign,
    salt,
    passwordVerifier
  };
};

export const decryptUserKeys = (password, salt, encryptedBox, encryptedSign) => {
  // A. Refaz a chave derivada (exatamente igual ao registro)
  const derivedKey = CryptoJS.PBKDF2(password, salt, { 
    keySize: 256 / 32, 
    iterations: 1000 
  }).toString();

  try {
    // B. Descriptografa a Chave Privada (Box)
    const decryptedBoxBytes = CryptoJS.AES.decrypt(encryptedBox, derivedKey);
    const privateBoxKeyB64 = decryptedBoxBytes.toString(CryptoJS.enc.Utf8);
    
    if (!privateBoxKeyB64) throw new Error("Senha incorreta (falha AES)");

    // C. Descriptografa a Chave Privada (Sign)
    const decryptedSignBytes = CryptoJS.AES.decrypt(encryptedSign, derivedKey);
    const privateSignKeyB64 = decryptedSignBytes.toString(CryptoJS.enc.Utf8);

    // D. Reconstrói os objetos originais do TweetNaCl
    const boxKeyPair = nacl.box.keyPair.fromSecretKey(decodeBase64(privateBoxKeyB64));
    const signKeyPair = nacl.sign.keyPair.fromSecretKey(decodeBase64(privateSignKeyB64));

    return {
      box: boxKeyPair,
      sign: signKeyPair
    };

  } catch (error) {
    console.error("Erro na descriptografia local:", error);
    return null; // Senha errada ou dados corrompidos
  }
};

// 4. Gera o verificador (para enviar ao servidor no login)
export const generateLoginVerifier = (password, salt) => {
    return CryptoJS.SHA256(password + salt).toString();
}