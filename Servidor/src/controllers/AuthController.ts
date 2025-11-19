import { Request, Response } from 'express';
import User from '../models/User';

export const register = async (req: Request, res: Response) => {
  try {
    // 1. Recebe o pacote completo de segurança do Frontend
    const { 
      username, 
      publicKeyBox, 
      publicKeySign, 
      encryptedPrivateKeyBox, 
      encryptedPrivateKeySign,
      salt,
      passwordVerifier 
    } = req.body;

    // 2. Verifica se usuário já existe
    const userExists = await User.findOne({ username });
    if (userExists) {
      return res.status(400).json({ message: 'Usuário já existe!' });
    }

    // 3. Cria o novo usuário
    const newUser = new User({
      username,
      publicKeyBox,
      publicKeySign,
      encryptedPrivateKeyBox,
      encryptedPrivateKeySign,
      salt,
      passwordVerifier
    });

    // 4. Salva no MongoDB
    await newUser.save();

    console.log(`✨ Novo usuário registrado no banco: ${username}`);
    
    res.status(201).json({ message: 'Usuário registrado com sucesso!' });
    
  } catch (error) {
    console.error("Erro no registro:", error);
    res.status(500).json({ message: 'Erro interno ao registrar usuário.' });
  }

  
};



export const login = async (req: Request, res: Response) => {
  try {
    const { username, passwordVerifier } = req.body;

    // 1. Busca o usuário
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    // 2. Verifica a senha (simplificado para este projeto didático)
    // Comparamos o hash do verificador que o front mandou com o do banco
    if (user.passwordVerifier !== passwordVerifier) {
      return res.status(401).json({ message: 'Senha incorreta!' });
    }

    console.log(`🔓 Login realizado: ${username}. Enviando cofre criptografado...`);

    // 3. Retorna O COFRE (Salt + Chaves Criptografadas)
    // O servidor NÃO descriptografa nada. O React que se vire com a senha.
    res.json({
      username: user.username,
      salt: user.salt,
      encryptedPrivateKeyBox: user.encryptedPrivateKeyBox,
      encryptedPrivateKeySign: user.encryptedPrivateKeySign,
      publicKeyBox: user.publicKeyBox,
      publicKeySign: user.publicKeySign
    });

  } catch (error) {
    res.status(500).json({ message: 'Erro no login' });
  }
};

export const getSalt = async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const user = await User.findOne({ username });
    
    if (!user) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    // Retorna apenas o Salt (não é secreto)
    res.json({ salt: user.salt });
    
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar salt' });
  }
};