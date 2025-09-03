// scripts/seedAdmin.ts (rode uma vez: ts-node scripts/seedAdmin.ts)
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from '../mongo/models/userModel';
dotenv.config();

(async () => {
  await mongoose.connect(process.env.MONGO_URL || 'mongodb://localhost:27017/ChatSocket');
  const username = process.env.ADMIN_USERNAME || 'joaohenrique';
  const password = process.env.ADMIN_PASSWORD || '123456';

  const exists = await User.findOne({ username });
  if (!exists) {
    const passwordHash = await bcrypt.hash(password, 10);
    await User.create({ username, passwordHash, role: 'admin' });
    console.log('✅ Admin criado');
  } else {
    console.log('ℹ️ Admin já existe');
  }
  await mongoose.disconnect();
})();
