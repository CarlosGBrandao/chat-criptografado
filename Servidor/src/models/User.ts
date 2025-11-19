import mongoose, { Schema, Document } from 'mongoose';

// 1. Interface: Define os tipos para o TypeScript entender
export interface IUser extends Document {
  username: string;
  publicKeyBox: string;
  publicKeySign: string;
  encryptedPrivateKeyBox: string;
  encryptedPrivateKeySign: string;
  salt: string;
  passwordVerifier: string;
  createdAt: Date;
  updatedAt: Date;
}

// 2. Schema: Define a estrutura para o MongoDB
const UserSchema: Schema = new Schema({
  username: { 
    type: String, 
    required: true, 
    unique: true, 
    trim: true 
  },
  
  // Chaves Públicas
  publicKeyBox: { type: String, required: true },
  publicKeySign: { type: String, required: true },

  // Chaves Privadas (Cifradas com AES pelo Cliente)
  encryptedPrivateKeyBox: { type: String, required: true },
  encryptedPrivateKeySign: { type: String, required: true },

  // Segurança da Senha
  salt: { type: String, required: true },
  passwordVerifier: { type: String, required: true }

}, { timestamps: true });

// 3. Exporta o modelo tipado
export default mongoose.model<IUser>('User', UserSchema);