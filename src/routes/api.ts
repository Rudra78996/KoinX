import { Router } from 'express';
import multer from 'multer';
import { ReconcileController } from '../controllers/ReconcileController';

const router = Router();

// Configure multer for memory storage file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Reconcile endpoint - handles dual file upload
router.post(
  '/reconcile',
  upload.fields([
    { name: 'user_transactions', maxCount: 1 },
    { name: 'exchange_transactions', maxCount: 1 }
  ]),
  ReconcileController.reconcile
);

// Report endpoints
router.get('/report/:runId', ReconcileController.getReport);
router.get('/report/:runId/summary', ReconcileController.getSummary);
router.get('/report/:runId/unmatched', ReconcileController.getUnmatched);

export default router;
