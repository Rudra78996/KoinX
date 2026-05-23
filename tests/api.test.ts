import request from 'supertest';
import app from '../src/app';
import ReconciliationRun from '../src/models/Run';
import IngestionService from '../src/services/IngestionService';
import MatchingService from '../src/services/MatchingService';
import ReportService from '../src/services/ReportService';

jest.mock('../src/models/Run');
jest.mock('../src/services/IngestionService');
jest.mock('../src/services/MatchingService');
jest.mock('../src/services/ReportService');

describe('API Integrations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET / and /health', () => {
    test('GET / should return welcome message', async () => {
      const res = await request(app).get('/');
      expect(res.statusCode).toBe(200);
      expect(res.body.message).toContain('Welcome to the Transaction Reconciliation Engine');
    });

    test('GET /health should return status UP', async () => {
      const res = await request(app).get('/health');
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('UP');
    });
  });

  describe('POST /api/reconcile', () => {
    test('should return 400 if files are missing', async () => {
      const res = await request(app)
        .post('/api/reconcile')
        .send();
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('CSV files are required');
    });

    test('should successfully trigger reconciliation when valid files are uploaded', async () => {
      // Mock Ingestion and Matching Services
      (IngestionService.ingestCsv as jest.Mock).mockResolvedValue({ totalCount: 10, validCount: 10, invalidCount: 0 });
      (MatchingService.reconcile as jest.Mock).mockResolvedValue({
        config: { timestampToleranceSeconds: 300, quantityTolerancePct: 0.01, proximityWindowSeconds: 3600 },
        summary: { matchedCount: 5, conflictingCount: 0, unmatchedUserCount: 2, unmatchedExchangeCount: 3 }
      });

      // Mock DB save
      ReconciliationRun.prototype.save = jest.fn().mockResolvedValue(true);

      const res = await request(app)
        .post('/api/reconcile')
        .attach('user_transactions', Buffer.from('raw,csv,data'), 'user.csv')
        .attach('exchange_transactions', Buffer.from('raw,csv,data'), 'exchange.csv')
        .field('timestampToleranceSeconds', '300')
        .field('quantityTolerancePct', '0.01');

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.runId).toBeDefined();
      expect(res.body.summary.matchedCount).toBe(5);
      
      expect(IngestionService.ingestCsv).toHaveBeenCalledTimes(2);
      expect(MatchingService.reconcile).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /api/report/:runId', () => {
    test('should return 404 if run not found', async () => {
      (ReconciliationRun.findOne as jest.Mock).mockResolvedValue(null);
      const res = await request(app).get('/api/report/nonexistent-run');
      expect(res.statusCode).toBe(404);
    });

    test('should return JSON report if run is completed', async () => {
      const mockRun = {
        runId: 'completed-run',
        status: 'COMPLETED',
        config: { timestampToleranceSeconds: 300, quantityTolerancePct: 0.01 },
        summary: { matchedCount: 1 }
      };
      (ReconciliationRun.findOne as jest.Mock).mockResolvedValue(mockRun);
      (ReportService.getFullReport as jest.Mock).mockResolvedValue([{ category: 'MATCHED', reason: 'Ok' }]);

      const res = await request(app).get('/api/report/completed-run');
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.records.length).toBe(1);
    });

    test('should return CSV format if format=csv is queried', async () => {
      const mockRun = {
        runId: 'completed-run',
        status: 'COMPLETED',
        config: {},
        summary: {}
      };
      (ReconciliationRun.findOne as jest.Mock).mockResolvedValue(mockRun);
      (ReportService.generateCsvReport as jest.Mock).mockResolvedValue('Category,Reason\nMATCHED,Ok');

      const res = await request(app).get('/api/report/completed-run?format=csv');
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text).toContain('Category,Reason');
    });
  });
});
