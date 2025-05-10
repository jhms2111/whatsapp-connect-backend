import mongoose from 'mongoose';

export async function connectToMongoDB() {
  try {
    await mongoose.connect('mongodb://localhost:27017/ChatSocket');
    console.log('✅ Conectado ao MongoDB via Mongoose');
  } catch (error) {
    console.error('❌ Erro na conexão com MongoDB:', error);
  }
}
