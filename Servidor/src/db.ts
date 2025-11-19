import mongoose from 'mongoose';

const connectDB = async (): Promise<void> => {
  try {
    // O "!" garante ao TS que a variável existe (verifique seu .env)
    const uri = process.env.MONGO_URI || "mongodb://localhost:27017/chat-e2ee";
    
    await mongoose.connect(uri);
    
    console.log('🍃 MongoDB Conectado com Sucesso!', uri);
  } catch (error) {
    if (error instanceof Error) {
        console.error('❌ Erro ao conectar no MongoDB:', error.message);
    } else {
        console.error('❌ Erro desconhecido no MongoDB');
    }
    process.exit(1);
  }
};

export default connectDB;