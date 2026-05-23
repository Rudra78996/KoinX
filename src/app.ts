import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import apiRoutes from './routes/api';

const app = express();

// Standard middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Welcome message at base route
app.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    message: 'Welcome to the Transaction Reconciliation Engine API in TypeScript!',
    documentation: 'See the project README for usage details.'
  });
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'UP', timestamp: new Date() });
});

// Register API routes
app.use('/api', apiRoutes);

// 404 Route handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// Global error handling middleware with strong typing
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({
    success: false,
    error: err.message || 'An unexpected error occurred on the server.'
  });
});

export default app;
