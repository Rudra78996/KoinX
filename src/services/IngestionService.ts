import * as csv from 'fast-csv';
import { Readable } from 'stream';
import IngestedTransaction from '../models/Transaction';
import { normalizeAsset, parseNumeric } from '../utils/helpers';

export interface IngestionResult {
  totalCount: number;
  validCount: number;
  invalidCount: number;
}

export class IngestionService {
  /**
   * Ingests a CSV file buffer, validates all rows, and saves them to the database.
   * @param buffer The uploaded file buffer
   * @param source 'user' or 'exchange'
   * @param runId Associated reconciliation run ID
   * @returns Ingestion summary counts
   */
  static async ingestCsv(buffer: Buffer, source: 'user' | 'exchange', runId: string): Promise<IngestionResult> {
    if (!buffer) {
      throw new Error(`No buffer provided for ingestion source: ${source}`);
    }

    const rows = await this.parseCsvBuffer(buffer);
    const documents = [];
    const seenIds = new Set<string>();
    
    let validCount = 0;
    let invalidCount = 0;

    for (const row of rows) {
      const validationErrors: string[] = [];
      const transactionId = row.transaction_id ? row.transaction_id.trim() : '';

      // 1. Validate Transaction ID
      if (!transactionId) {
        validationErrors.push('Missing transaction_id');
      } else if (seenIds.has(transactionId)) {
        validationErrors.push(`Duplicate transaction_id in file: ${transactionId}`);
      } else {
        seenIds.add(transactionId);
      }

      // 2. Validate Type
      const rawType = row.type ? row.type.trim().toUpperCase() : '';
      const allowedTypes = ['BUY', 'SELL', 'TRANSFER_IN', 'TRANSFER_OUT'];
      if (!rawType) {
        validationErrors.push('Missing transaction type');
      } else if (!allowedTypes.includes(rawType)) {
        validationErrors.push(`Invalid transaction type: ${rawType}`);
      }

      // 3. Validate Asset
      const rawAsset = row.asset ? row.asset.trim() : '';
      if (!rawAsset) {
        validationErrors.push('Missing asset');
      }

      // 4. Validate Quantity
      const rawQuantity = row.quantity;
      const parsedQuantity = parseNumeric(rawQuantity);
      if (rawQuantity === undefined || rawQuantity === null || rawQuantity.trim() === '') {
        validationErrors.push('Missing quantity');
      } else if (parsedQuantity === null) {
        validationErrors.push(`Malformed quantity: ${rawQuantity}`);
      } else if (parsedQuantity <= 0) {
        validationErrors.push(`Negative or zero quantity: ${parsedQuantity}`);
      }

      // 5. Validate Timestamp
      const rawTimestamp = row.timestamp ? row.timestamp.trim() : '';
      let parsedTimestamp: Date | null = null;
      if (!rawTimestamp) {
        validationErrors.push('Missing timestamp');
      } else {
        const timestampMs = Date.parse(rawTimestamp);
        // Additional check for malformed formats like "2024-03-09T" that yield NaN
        if (isNaN(timestampMs) || rawTimestamp.endsWith('T') || rawTimestamp.endsWith('-')) {
          validationErrors.push(`Malformed timestamp: ${rawTimestamp}`);
        } else {
          parsedTimestamp = new Date(timestampMs);
        }
      }

      const isValid = validationErrors.length === 0;
      
      const parsedData = isValid ? {
        timestamp: parsedTimestamp,
        type: rawType,
        asset: normalizeAsset(rawAsset),
        quantity: parsedQuantity,
        priceUsd: parseNumeric(row.price_usd),
        fee: parseNumeric(row.fee),
        note: row.note ? row.note.trim() : '',
      } : {
        timestamp: null,
        type: null,
        asset: null,
        quantity: null,
        priceUsd: null,
        fee: null,
        note: row.note ? row.note.trim() : '',
      };

      if (isValid) {
        validCount++;
      } else {
        invalidCount++;
      }

      documents.push({
        runId,
        source,
        transactionId: transactionId || `UNKNOWN_${source.toUpperCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        rawRow: row,
        parsedData,
        status: isValid ? 'VALID' : 'INVALID',
        validationErrors,
      });
    }

    if (documents.length > 0) {
      await IngestedTransaction.insertMany(documents);
    }

    return {
      totalCount: documents.length,
      validCount,
      invalidCount,
    };
  }

  /**
   * Helper to parse CSV buffer into array of row objects
   */
  private static parseCsvBuffer(buffer: Buffer): Promise<Record<string, string>[]> {
    return new Promise((resolve, reject) => {
      const rows: Record<string, string>[] = [];
      const readableStream = new Readable();
      readableStream.push(buffer);
      readableStream.push(null);

      csv.parseStream(readableStream, { headers: true, discardUnmappedColumns: false })
        .on('data', (row: Record<string, string>) => {
          // Trim whitespace from keys and values
          const cleanRow: Record<string, string> = {};
          Object.keys(row).forEach(key => {
            const trimmedKey = key.trim();
            const val = row[key];
            cleanRow[trimmedKey] = val ? val.trim() : '';
          });
          rows.push(cleanRow);
        })
        .on('end', () => resolve(rows))
        .on('error', (error) => reject(error));
    });
  }
}

export default IngestionService;
