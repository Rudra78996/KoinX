import mongoose from 'mongoose';
import config from './index';

export const connectDB = async (): Promise<typeof mongoose> => {
  try {
    const conn = await mongoose.connect(config.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error: any) {
    console.error(`Database connection error: ${error.message}`);
    // If not in test environment, exit process on failure
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
    throw error;
  }
};

export const disconnectDB = async (): Promise<void> => {
  try {
    await mongoose.connection.close();
    console.log('MongoDB Disconnected successfully.');
  } catch (error: any) {
    console.error(`Error disconnecting from MongoDB: ${error.message}`);
  }
};
