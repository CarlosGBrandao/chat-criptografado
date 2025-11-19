import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';
import CryptoJS from 'crypto-js';

// --- CONFIGURAÇÃO DE SEGURANÇA (Manter alto) ---
const PBKDF2_ITERATIONS = 100000; // Número alto para dificultar ataque de força bruta
const KEY_SIZE_BYTES = nacl.secretbox.keyLength;

// --- FUNÇÕES COMPARTILHADAS (Novas) ---

const masterKeyToUint8 = (wordArray) => {
    const result = new Uint8Array(KEY_SIZE_BYTES);
    const words = wordArray.words;
    
    for (let i = 0; i < KEY_SIZE_BYTES; i++) {
        // Esta lógica de bit-shifting é a forma correta e padronizada de extrair bytes do CryptoJS
        result[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xFF;
    }
    return result;
};

// 1. Gera a Chave Mestra Determinística (Master Key)
// Essa chave de 32 bytes sempre será a mesma para a mesma senha e salt.
const generateMasterKey = (password, salt) => {
    return CryptoJS.PBKDF2(password, salt, { 
        keySize: KEY_SIZE_BYTES / 4, // keySize é em Words (8 words = 32 bytes)
        iterations: PBKDF2_ITERATIONS 
    });
};

// 2. Cria os pares de chaves (pública/privada) a partir da Master Key
// A Chave Privada é DETERMINÍSTICA, ou seja, sempre a mesma.
export const generateDeterministicKeys = (password, salt) => {
    // 1. Gera a Master Key (Word Array)
    const masterKeyCrypto = generateMasterKey(password, salt);
    
    // 2. Converte de forma segura (Garante 32 bytes, tipo confiável)
    const masterKeyUint8 = masterKeyToUint8(masterKeyCrypto); // <--- Usa a utility

    // 3. Usa a Master Key de 32 bytes
    const boxKeyPair = nacl.box.keyPair.fromSecretKey(masterKeyUint8);
    
    const signKeyCrypto = CryptoJS.PBKDF2(password, salt + "_sign", { 
    keySize: 64 / 4, 
    iterations: PBKDF2_ITERATIONS 
});

const signKeyUint8 = masterKeyToUint8(signKeyCrypto); // 64 bytes
const signKeyPair = nacl.sign.keyPair.fromSeed(signKeyUint8);

    return {
        box: boxKeyPair,
        sign: signKeyPair
    };
};

// --- FUNÇÕES DE REGISTRO E LOGIN (Antigas, mas limpas) ---

// 3. Função de Registro (limpa)
export const generateKeysAndVerifier = (password) => {
    const salt = nacl.util.encodeBase64(nacl.randomBytes(16)); // Gera um salt aleatório
    
    // GERA CHAVES DETERMINÍSTICAS
    const keyPair = generateDeterministicKeys(password, salt);

    // Gera o verificador de senha (hash da senha + salt)
    const passwordVerifier = CryptoJS.SHA256(password + salt).toString();

    // O servidor SÓ precisa da chave PÚBLICA e do SALT.
    return {
        salt,
        passwordVerifier,
        publicKeyBox: encodeBase64(keyPair.box.publicKey),
        publicKeySign: encodeBase64(keyPair.sign.publicKey),
        // Chaves Privadas NÃO serão enviadas!
    };
};

// 4. Gera o verificador para o Login
export const generateLoginVerifier = (password, salt) => {
    return CryptoJS.SHA256(password + salt).toString();
};

// 5. Função de Login (limpa)
// Não precisa mais de descriptografia. Apenas regenera a chave.
export const restoreKeysFromPassword = (password, salt) => {
    return generateDeterministicKeys(password, salt);
};