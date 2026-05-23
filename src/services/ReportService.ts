import ReconciliationRecord from '../models/Record';
import IngestedTransaction, { IIngestedTransaction } from '../models/Transaction';
import * as csv from 'fast-csv';

export interface FormattedReportRecord {
  _id: any;
  runId: string;
  category: string;
  userTransactionId: string | null;
  exchangeTransactionId: string | null;
  userTransaction: IIngestedTransaction | null;
  exchangeTransaction: IIngestedTransaction | null;
  reason: string;
}

export class ReportService {
  /**
   * Fetches the full JSON report for a reconciliation run
   * @param runId Associated run ID
   * @returns List of reconciliation records populated with transaction details
   */
  static async getFullReport(runId: string): Promise<FormattedReportRecord[]> {
    const records = await ReconciliationRecord.find({ runId })
      .populate<{ userTransaction: IIngestedTransaction | null }>('userTransaction')
      .populate<{ exchangeTransaction: IIngestedTransaction | null }>('exchangeTransaction')
      .exec();

    // Include Ingestion errors at the end of the JSON report to ensure complete visibility
    const invalidTxs = await IngestedTransaction.find({ runId, status: 'INVALID' });
    const formattedInvalid = invalidTxs.map(tx => {
      const isUser = tx.source === 'user';
      return {
        _id: tx._id,
        runId,
        category: isUser ? 'INGESTION_ERROR_USER' : 'INGESTION_ERROR_EXCHANGE',
        userTransactionId: isUser ? tx.transactionId : null,
        exchangeTransactionId: isUser ? null : tx.transactionId,
        userTransaction: isUser ? tx : null,
        exchangeTransaction: isUser ? null : tx,
        reason: `Failed Ingestion: ${tx.validationErrors.join('; ')}`
      };
    });

    return [...(records as any), ...formattedInvalid];
  }

  /**
   * Generates a paired side-by-side CSV report for the run
   * @param runId 
   * @returns CSV text
   */
  static async generateCsvReport(runId: string): Promise<string> {
    const reportData = await this.getFullReport(runId);
    const csvRows: string[][] = [];

    // Header row
    csvRows.push([
      'Category',
      'Reconciliation Reason',
      'User Transaction ID',
      'User Timestamp',
      'User Type',
      'User Asset',
      'User Quantity',
      'User Price USD',
      'User Fee',
      'User Note',
      'Exchange Transaction ID',
      'Exchange Timestamp',
      'Exchange Type',
      'Exchange Asset',
      'Exchange Quantity',
      'Exchange Price USD',
      'Exchange Fee',
      'Exchange Note'
    ]);

    for (const record of reportData) {
      const u = (record.userTransaction || {}) as Partial<IIngestedTransaction>;
      const e = (record.exchangeTransaction || {}) as Partial<IIngestedTransaction>;

      const uRaw = (u.rawRow || {}) as Record<string, string>;
      const eRaw = (e.rawRow || {}) as Record<string, string>;

      // If valid, use parsed values for consistency; if invalid, fallback to raw fields
      const userTxId = record.userTransactionId || u.transactionId || uRaw.transaction_id || '';
      const userTime = u.parsedData?.timestamp ? u.parsedData.timestamp.toISOString() : (uRaw.timestamp || '');
      const userType = u.parsedData?.type || uRaw.type || '';
      const userAsset = u.parsedData?.asset || uRaw.asset || '';
      const userQty = u.parsedData?.quantity !== null && u.parsedData?.quantity !== undefined 
        ? String(u.parsedData.quantity) 
        : (uRaw.quantity || '');
      const userPrice = u.parsedData?.priceUsd !== null && u.parsedData?.priceUsd !== undefined 
        ? String(u.parsedData.priceUsd) 
        : (uRaw.price_usd || '');
      const userFee = u.parsedData?.fee !== null && u.parsedData?.fee !== undefined 
        ? String(u.parsedData.fee) 
        : (uRaw.fee || '');
      const userNote = u.parsedData?.note || uRaw.note || '';

      const exchangeTxId = record.exchangeTransactionId || e.transactionId || eRaw.transaction_id || '';
      const exchangeTime = e.parsedData?.timestamp ? e.parsedData.timestamp.toISOString() : (eRaw.timestamp || '');
      const exchangeType = e.parsedData?.type || eRaw.type || '';
      const exchangeAsset = e.parsedData?.asset || eRaw.asset || '';
      const exchangeQty = e.parsedData?.quantity !== null && e.parsedData?.quantity !== undefined 
        ? String(e.parsedData.quantity) 
        : (eRaw.quantity || '');
      const exchangePrice = e.parsedData?.priceUsd !== null && e.parsedData?.priceUsd !== undefined 
        ? String(e.parsedData.priceUsd) 
        : (eRaw.price_usd || '');
      const exchangeFee = e.parsedData?.fee !== null && e.parsedData?.fee !== undefined 
        ? String(e.parsedData.fee) 
        : (eRaw.fee || '');
      const exchangeNote = e.parsedData?.note || eRaw.note || '';

      csvRows.push([
        record.category,
        record.reason,
        userTxId,
        userTime,
        userType,
        userAsset,
        userQty,
        userPrice,
        userFee,
        userNote,
        exchangeTxId,
        exchangeTime,
        exchangeType,
        exchangeAsset,
        exchangeQty,
        exchangePrice,
        exchangeFee,
        exchangeNote
      ]);
    }

    return new Promise((resolve, reject) => {
      const output: Buffer[] = [];
      const writeStream = csv.format({ headers: false, quote: true });
      
      writeStream.on('data', (chunk: Buffer) => output.push(chunk));
      writeStream.on('end', () => resolve(Buffer.concat(output).toString('utf8')));
      writeStream.on('error', (err) => reject(err));

      for (const row of csvRows) {
        writeStream.write(row);
      }
      writeStream.end();
    });
  }
}

export default ReportService;
