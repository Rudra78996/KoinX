import MatchingService from '../src/services/MatchingService';
import IngestedTransaction from '../src/models/Transaction';
import ReconciliationRecord from '../src/models/Record';
import ReconciliationRun from '../src/models/Run';

jest.mock('../src/models/Transaction');
jest.mock('../src/models/Record');
jest.mock('../src/models/Run');

describe('Matching Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should successfully pair MATCHED, CONFLICTING, and UNMATCHED transactions', async () => {
    // Setup Mock Run
    const mockSave = jest.fn().mockResolvedValue(true);
    const mockRun = {
      runId: 'test-run-123',
      config: {
        timestampToleranceSeconds: 300,
        quantityTolerancePct: 0.01,
        proximityWindowSeconds: 3600
      },
      summary: {},
      status: 'PENDING',
      save: mockSave
    };
    (ReconciliationRun.findOne as jest.Mock).mockResolvedValue(mockRun);

    // Setup Mock Ingested Transactions
    const userTx1 = {
      _id: 'user-tx-1-id',
      transactionId: 'USR-001',
      source: 'user',
      status: 'VALID',
      parsedData: {
        timestamp: new Date('2024-03-01T09:00:00Z'),
        type: 'BUY',
        asset: 'BTC',
        quantity: 0.5,
        priceUsd: 62000,
        fee: 0.0005
      }
    };
    const exchangeTx1 = {
      _id: 'exchange-tx-1-id',
      transactionId: 'EXC-1001',
      source: 'exchange',
      status: 'VALID',
      parsedData: {
        timestamp: new Date('2024-03-01T09:00:32Z'),
        type: 'BUY',
        asset: 'BTC',
        quantity: 0.5,
        priceUsd: 62000,
        fee: 0.0005
      }
    };

    const userTx2 = {
      _id: 'user-tx-2-id',
      transactionId: 'USR-012',
      source: 'user',
      status: 'VALID',
      parsedData: {
        timestamp: new Date('2024-03-06T13:30:00Z'),
        type: 'BUY',
        asset: 'BTC',
        quantity: 0.3,
        priceUsd: 62500,
        fee: 0.0003
      }
    };
    const exchangeTx2 = {
      _id: 'exchange-tx-2-id',
      transactionId: 'EXC-1012',
      source: 'exchange',
      status: 'VALID',
      parsedData: {
        timestamp: new Date('2024-03-06T13:30:00Z'),
        type: 'BUY',
        asset: 'BTC',
        quantity: 0.3001, // 0.0333% difference (> 0.01%)
        priceUsd: 62500,
        fee: 0.0003
      }
    };

    const userTx3 = {
      _id: 'user-tx-3-id',
      transactionId: 'USR-999',
      source: 'user',
      status: 'VALID',
      parsedData: {
        timestamp: new Date('2024-03-10T12:00:00Z'),
        type: 'SELL',
        asset: 'SOL',
        quantity: 5.0,
        priceUsd: 140,
        fee: 0.01
      }
    };

    const exchangeTx3 = {
      _id: 'exchange-tx-3-id',
      transactionId: 'EXC-1024',
      source: 'exchange',
      status: 'VALID',
      parsedData: {
        timestamp: new Date('2024-03-13T18:00:00Z'),
        type: 'BUY',
        asset: 'ETH',
        quantity: 0.6,
        priceUsd: 3490,
        fee: 0.0006
      }
    };

    // Mock DB queries for matching engine
    (IngestedTransaction.find as jest.Mock).mockImplementation((query) => {
      if (query.source === 'user') {
        return Promise.resolve([userTx1, userTx2, userTx3]);
      }
      if (query.source === 'exchange') {
        return Promise.resolve([exchangeTx1, exchangeTx2, exchangeTx3]);
      }
      return Promise.resolve([]);
    });

    (IngestedTransaction.countDocuments as jest.Mock).mockResolvedValue(0);
    (ReconciliationRecord.insertMany as jest.Mock).mockResolvedValue([]);

    // Run reconciliation
    await MatchingService.reconcile('test-run-123');

    // Verify DB insert record calls
    expect(ReconciliationRecord.insertMany).toHaveBeenCalledTimes(1);
    const records = (ReconciliationRecord.insertMany as jest.Mock).mock.calls[0][0];

    expect(records.length).toBe(4);

    // 1. Assert MATCHED record
    const matchRec = records.find((r: any) => r.category === 'MATCHED');
    expect(matchRec).toBeDefined();
    expect(matchRec.userTransactionId).toBe('USR-001');
    expect(matchRec.exchangeTransactionId).toBe('EXC-1001');
    expect(matchRec.reason).toContain('Matched successfully');

    // 2. Assert CONFLICTING record
    const conflictRec = records.find((r: any) => r.category === 'CONFLICTING');
    expect(conflictRec).toBeDefined();
    expect(conflictRec.userTransactionId).toBe('USR-012');
    expect(conflictRec.exchangeTransactionId).toBe('EXC-1012');
    expect(conflictRec.reason).toContain('exceeds tolerance of ±0.01%');

    // 3. Assert UNMATCHED_USER
    const unmatchedUserRec = records.find((r: any) => r.category === 'UNMATCHED_USER');
    expect(unmatchedUserRec).toBeDefined();
    expect(unmatchedUserRec.userTransactionId).toBe('USR-999');

    // 4. Assert UNMATCHED_EXCHANGE
    const unmatchedExcRec = records.find((r: any) => r.category === 'UNMATCHED_EXCHANGE');
    expect(unmatchedExcRec).toBeDefined();
    expect(unmatchedExcRec.exchangeTransactionId).toBe('EXC-1024');

    // Assert summary updates on the run document
    expect(mockRun.status).toBe('COMPLETED');
    expect((mockRun.summary as any).matchedCount).toBe(1);
    expect((mockRun.summary as any).conflictingCount).toBe(1);
    expect((mockRun.summary as any).unmatchedUserCount).toBe(1);
    expect((mockRun.summary as any).unmatchedExchangeCount).toBe(1);
    expect(mockSave).toHaveBeenCalledTimes(1);
  });
});
