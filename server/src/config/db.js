import mongoose from 'mongoose';
import env from './env.js';

mongoose.set('strictQuery', true);

export async function connectDB(uri = env.mongoUri) {
  try {
    const conn = await mongoose.connect(uri);
    console.log(`[scorehub] MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
    return conn;
  } catch (err) {
    console.error('[scorehub] MongoDB connection failed:', err.message);
    process.exit(1);
  }
}

export default connectDB;
