const {
  normalizeAsset,
  typesMatch,
  isWithinQuantityTolerance,
  isWithinTimestampTolerance,
  isIdMatch
} = require('../src/utils/helpers');
import IngestionService from '../src/services/IngestionService';
import IngestedTransaction from '../src/models/Transaction';

jest.mock('../src/models/Transaction');

describe('Helper Utilities', () => {
  test('normalizeAsset should standardize common coin names and casing', () => {
    expect(normalizeAsset('bitcoin')).toBe('BTC');
    expect(normalizeAsset('Bitcoin')).toBe('BTC');
    expect(normalizeAsset('ETH')).toBe('ETH');
    expect(normalizeAsset('ethereum')).toBe('ETH');
    expect(normalizeAsset('SOL')).toBe('SOL');
    expect(normalizeAsset('solana')).toBe('SOL');
    expect(normalizeAsset('matic')).toBe('MATIC');
    expect(normalizeAsset('unknown_token')).toBe('UNKNOWN_TOKEN');
  });

  test('typesMatch should correctly evaluate exact and mapped transactions', () => {
    expect(typesMatch('BUY', 'BUY')).toBe(true);
    expect(typesMatch('SELL', 'SELL')).toBe(true);
    expect(typesMatch('TRANSFER_OUT', 'TRANSFER_IN')).toBe(true);
    expect(typesMatch('TRANSFER_IN', 'TRANSFER_OUT')).toBe(true);
    
    expect(typesMatch('BUY', 'SELL')).toBe(false);
    expect(typesMatch('TRANSFER_OUT', 'BUY')).toBe(false);
  });

  test('isWithinQuantityTolerance should evaluate percentages correctly', () => {
    // 0.3 vs 0.3001 is a 0.0333% difference.
    // Tolerance is 0.01%
    expect(isWithinQuantityTolerance(0.3, 0.3001, 0.01)).toBe(false);
    // Tolerance is 0.05%
    expect(isWithinQuantityTolerance(0.3, 0.3001, 0.05)).toBe(true);
    
    // Equal values
    expect(isWithinQuantityTolerance(1.0, 1.0, 0.01)).toBe(true);
    // Diff within tolerance
    expect(isWithinQuantityTolerance(100.0, 100.005, 0.01)).toBe(true);
  });

  test('isWithinTimestampTolerance should evaluate second windows correctly', () => {
    const t1 = '2024-03-01T09:00:00Z';
    const t2 = '2024-03-01T09:00:32Z';
    const t3 = '2024-03-01T09:10:00Z';

    expect(isWithinTimestampTolerance(t1, t2, 300)).toBe(true);
    expect(isWithinTimestampTolerance(t1, t3, 300)).toBe(false);
    expect(isWithinTimestampTolerance(t1, t3, 600)).toBe(true);
  });

  test('isIdMatch should mathematically map user IDs to exchange IDs', () => {
    expect(isIdMatch('USR-012', 'EXC-1012')).toBe(true);
    expect(isIdMatch('USR-001', 'EXC-1001')).toBe(true);
    expect(isIdMatch('USR-020', 'EXC-1020')).toBe(true);
    expect(isIdMatch('USR-012', 'EXC-1013')).toBe(false);
  });
});

describe('Ingestion Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should successfully ingest and parse valid CSV rows', async () => {
    const csvContent = 
      'transaction_id,timestamp,type,asset,quantity,price_usd,fee,note\n' +
      'USR-001,2024-03-01T09:00:00Z,BUY,BTC,0.5,62000.00,0.0005,Monthly DCA\n' +
      'USR-002,2024-03-01T11:30:00Z,BUY,ETH,2.0,3400.00,0.002,\n';

    const buffer = Buffer.from(csvContent, 'utf-8');
    
    (IngestedTransaction.insertMany as jest.Mock).mockResolvedValue([]);

    const result = await IngestionService.ingestCsv(buffer, 'user', 'test-run-id');

    expect(result.totalCount).toBe(2);
    expect(result.validCount).toBe(2);
    expect(result.invalidCount).toBe(0);
    expect(IngestedTransaction.insertMany).toHaveBeenCalledTimes(1);
    
    const insertedDocs = (IngestedTransaction.insertMany as jest.Mock).mock.calls[0][0];
    expect(insertedDocs[0].transactionId).toBe('USR-001');
    expect(insertedDocs[0].parsedData.asset).toBe('BTC');
    expect(insertedDocs[0].parsedData.quantity).toBe(0.5);
    expect(insertedDocs[0].status).toBe('VALID');
  });

  test('should detect and flag data quality errors without throwing', async () => {
    const csvContent = 
      'transaction_id,timestamp,type,asset,quantity,price_usd,fee,note\n' +
      'USR-018,2024-03-09T,SELL,ETH,0.3,3510.00,0.0003,Malformed timestamp\n' +
      'USR-019,2024-03-10T08:00:00Z,BUY,BTC,-0.1,62000.00,0.0001,Negative qty\n' +
      'USR-001,2024-03-01T09:00:00Z,BUY,BTC,0.5,62000.00,0.0005,Duplicate ID\n' +
      'USR-001,2024-03-01T09:00:00Z,BUY,BTC,0.5,62000.00,0.0005,Duplicate ID\n';

    const buffer = Buffer.from(csvContent, 'utf-8');
    (IngestedTransaction.insertMany as jest.Mock).mockResolvedValue([]);

    const result = await IngestionService.ingestCsv(buffer, 'user', 'test-run-id');

    expect(result.totalCount).toBe(4);
    expect(result.validCount).toBe(1);
    expect(result.invalidCount).toBe(3);
    
    const insertedDocs = (IngestedTransaction.insertMany as jest.Mock).mock.calls[0][0];
    
    const malformedTimeRow = insertedDocs.find((d: any) => d.transactionId === 'USR-018');
    expect(malformedTimeRow.status).toBe('INVALID');
    expect(malformedTimeRow.validationErrors).toContain('Malformed timestamp: 2024-03-09T');

    const negativeQtyRow = insertedDocs.find((d: any) => d.transactionId === 'USR-019');
    expect(negativeQtyRow.status).toBe('INVALID');
    expect(negativeQtyRow.validationErrors).toContain('Negative or zero quantity: -0.1');

    const dupIdRows = insertedDocs.filter((d: any) => d.transactionId === 'USR-001');
    expect(dupIdRows[0].status).toBe('VALID');
    expect(dupIdRows[1].status).toBe('INVALID');
    expect(dupIdRows[1].validationErrors[0]).toBe('Duplicate transaction_id in file: USR-001');
  });
});
