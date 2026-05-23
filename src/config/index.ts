import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

export interface AppConfig {
  PORT: number;
  NODE_ENV: string;
  MONGODB_URI: string;
  DEFAULT_TIMESTAMP_TOLERANCE_SECONDS: number;
  DEFAULT_QUANTITY_TOLERANCE_PCT: number;
  DEFAULT_PROXIMITY_WINDOW_SECONDS: number;
}

const config: AppConfig = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/reconciliation_db',
  
  // Matching Engine Defaults
  DEFAULT_TIMESTAMP_TOLERANCE_SECONDS: parseInt(process.env.TIMESTAMP_TOLERANCE_SECONDS || '300', 10),
  DEFAULT_QUANTITY_TOLERANCE_PCT: parseFloat(process.env.QUANTITY_TOLERANCE_PCT || '0.01'),
  DEFAULT_PROXIMITY_WINDOW_SECONDS: parseInt(process.env.PROXIMITY_WINDOW_SECONDS || '3600', 10),
};

export default config;
