import { Request, Response } from 'express';
import User from '../models/User';

export const register = async (req: Request, res: Response) => {
  try {

    console.log('-----------------------------------------------');
    console.log('📝 [REGISTER] Recebido do Frontend:');
    console.log(JSON.stringify(req.body, null, 2)); 
    console.log('-----------------------------------------------');
    

    // 1. Recebe o pacote completo de segurança do Frontend
    const { 
      username, 
      publicKeyBox, 
      publicKeySign, 
      salt,
      passwordVerifier 
    } = req.body;

    // 2. Verifica se usuário já existe
    const userExists = await User.findOne({ username });
    if (userExists) {
      console.log(`❌ Falha: Usuário ${username} já existe.`);
      return res.status(400).json({ message: 'Usuário já existe!' });
    }

    // 3. Cria o novo usuário
    const newUser = new User({
      username,
      publicKeyBox,
      publicKeySign,
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

    console.log('-----------------------------------------------');
    console.log('🔑 [LOGIN] Tentativa de login recebida:');
    console.log(req.body);
    console.log('-----------------------------------------------');

    const { username, passwordVerifier } = req.body;

    // 1. Busca o usuário
    const user = await User.findOne({ username });
    if (!user) {
      console.log(`❌ Login falhou: Usuário ${username} não encontrado.`);
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    // 2. Verifica a senha (simplificado para este projeto didático)
    // Comparamos o hash do verificador que o front mandou com o do banco
    if (user.passwordVerifier !== passwordVerifier) {
      console.log(`❌ Login falhou: Verifier incorreto para ${username}.`);
      return res.status(401).json({ message: 'Senha incorreta!' });
    }

    console.log(`🔓 Login realizado: ${username}. Enviando cofre criptografado...`);

    // 3. Retorna O COFRE (Salt + Chaves Criptografadas)
    // O servidor NÃO descriptografa nada. O React que se vire com a senha.
    res.json({
      username: user.username,
      salt: user.salt,
      publicKeyBox: user.publicKeyBox,
      publicKeySign: user.publicKeySign
    });

  } catch (error) {
    console.error("❌ Erro no login:", error);
    res.status(500).json({ message: 'Erro no login' });
  }
};

export const getSalt = async (req: Request, res: Response) => {
  try {

    console.log('-----------------------------------------------');
    console.log('🧂 [GET SALT] Parâmetros recebidos:');
    console.log(req.params);
    console.log('-----------------------------------------------');

    const { username } = req.params;
    const user = await User.findOne({ username });
    
    if (!user) {
      console.log(`❌ Salt não enviado: Usuário ${username} inexistente.`);
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    console.log(`✅ Salt encontrado para ${username}: ${user.salt}`);

    // Retorna apenas o Salt (não é secreto)
    res.json({ salt: user.salt });
    
  } catch (error) {
    console.error("❌ Erro ao buscar salt:", error);
    res.status(500).json({ message: 'Erro ao buscar salt' });
  }
};