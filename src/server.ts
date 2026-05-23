import app from './app';
import { connectDB } from './config/database';
import config from './config';

const startServer = async (): Promise<void> => {
  try {
    // Connect to Database
    await connectDB();

    // Start Listening
    app.listen(config.PORT, () => {
      console.log(`Server is running in ${config.NODE_ENV} mode on port ${config.PORT}`);
    });
  } catch (error: any) {
    console.error(`Fatal error starting server: ${error.message}`);
    process.exit(1);
  }
};

startServer();
