import mongoose from 'mongoose';

export async function connectToMongoDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error("❌ ERRO: MONGODB_URI não foi definido nas variáveis da Render!");
    process.exit(1);
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });

    console.log("✅ Conectado ao MongoDB Atlas com sucesso!");
  } catch (err) {
    console.error("❌ ERRO AO CONECTAR AO MONGODB ATLAS:", err);
    process.exit(1);
  }
}


/*
import mongoose from 'mongoose';

export async function connectToMongoDB() {
  try {
    await mongoose.connect('mongodb://localhost:27017/ChatSocket');
    console.log('✅ Conectado ao MongoDB via Mongoose');
  } catch (error) {
    console.error('❌ Erro na conexão com MongoDB:', error);
  }
}
*/