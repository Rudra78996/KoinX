import IngestedTransaction, { IIngestedTransaction } from '../models/Transaction';
import ReconciliationRecord from '../models/Record';
import ReconciliationRun, { IReconciliationRun } from '../models/Run';
import {
  typesMatch,
  isIdMatch
} from '../utils/helpers';

export interface ReconcileOptions {
  timestampToleranceSeconds?: number;
  quantityTolerancePct?: number;
  proximityWindowSeconds?: number;
}

export class MatchingService {
  /**
   * Reconciles user and exchange transactions for a given run ID.
   * @param runId Associated reconciliation run ID
   * @param options Configuration overrides for tolerances
   * @returns Run summary results
   */
  static async reconcile(runId: string, options: ReconcileOptions = {}): Promise<IReconciliationRun> {
    const run = await ReconciliationRun.findOne({ runId });
    if (!run) {
      throw new Error(`Reconciliation run not found: ${runId}`);
    }

    const timestampToleranceSeconds = options.timestampToleranceSeconds ?? run.config.timestampToleranceSeconds;
    const quantityTolerancePct = options.quantityTolerancePct ?? run.config.quantityTolerancePct;
    const proximityWindowSeconds = options.proximityWindowSeconds ?? run.config.proximityWindowSeconds;

    // Fetch all VALID transactions for this run
    const userTxs = await IngestedTransaction.find({ runId, source: 'user', status: 'VALID' });
    const exchangeTxs = await IngestedTransaction.find({ runId, source: 'exchange', status: 'VALID' });

    // Fetch INVALID transaction counts for the summary
    const invalidUserCount = await IngestedTransaction.countDocuments({ runId, source: 'user', status: 'INVALID' });
    const invalidExchangeCount = await IngestedTransaction.countDocuments({ runId, source: 'exchange', status: 'INVALID' });

    const matchedExchangeIds = new Set<string>();
    const matchedUserIds = new Set<string>();
    const records = [];

    // Helper interface for candidate matches
    interface MatchCandidate {
      exchangeTx: IIngestedTransaction;
      timeDiff: number;
      percentDiff: number;
      isId: boolean;
    }

    // --- PHASE 1: STRICT MATCHING ---
    for (const userTx of userTxs) {
      const candidates: MatchCandidate[] = [];

      for (const exchangeTx of exchangeTxs) {
        if (matchedExchangeIds.has((exchangeTx._id as any).toString())) {
          continue;
        }

        // Must match asset and type
        if (userTx.parsedData.asset !== exchangeTx.parsedData.asset) {
          continue;
        }
        if (!typesMatch(userTx.parsedData.type, exchangeTx.parsedData.type)) {
          continue;
        }

        const userTime = userTx.parsedData.timestamp?.getTime();
        const excTime = exchangeTx.parsedData.timestamp?.getTime();

        if (userTime === undefined || excTime === undefined || userTime === null || excTime === null) {
          continue;
        }

        // Must satisfy tolerances
        const timeDiff = Math.abs(userTime - excTime) / 1000;
        const isTimeMatch = timeDiff <= timestampToleranceSeconds;

        const userQty = userTx.parsedData.quantity;
        const excQty = exchangeTx.parsedData.quantity;

        if (userQty === null || excQty === null) {
          continue;
        }

        const qtyDiff = Math.abs(userQty - excQty);
        const percentDiff = (qtyDiff / Math.abs(userQty)) * 100;
        const isQtyMatch = percentDiff <= quantityTolerancePct;

        if (isTimeMatch && isQtyMatch) {
          candidates.push({
            exchangeTx,
            timeDiff,
            percentDiff,
            isId: isIdMatch(userTx.transactionId, exchangeTx.transactionId)
          });
        }
      }

      if (candidates.length > 0) {
        // Sort candidates:
        // 1. Prioritize ID-mapped suffix matches
        // 2. Sort by lowest timestamp difference
        candidates.sort((a, b) => {
          if (a.isId && !b.isId) return -1;
          if (!a.isId && b.isId) return 1;
          return a.timeDiff - b.timeDiff;
        });

        const bestMatch = candidates[0].exchangeTx;
        const bestCandidate = candidates[0];

        matchedExchangeIds.add((bestMatch._id as any).toString());
        matchedUserIds.add((userTx._id as any).toString());

        const qtyDetails = bestCandidate.percentDiff === 0 ? '0%' : `${bestCandidate.percentDiff.toFixed(4)}%`;
        const reason = `Matched successfully on asset ${userTx.parsedData.asset}, type, timestamp (diff ${bestCandidate.timeDiff}s, tolerance ±${timestampToleranceSeconds}s), and quantity (diff ${qtyDetails}, tolerance ±${quantityTolerancePct}%).`;

        records.push({
          runId,
          category: 'MATCHED' as const,
          userTransactionId: userTx.transactionId,
          exchangeTransactionId: bestMatch.transactionId,
          userTransaction: userTx._id,
          exchangeTransaction: bestMatch._id,
          reason
        });
      }
    }

    // Helper interface for Phase 2 candidate
    interface ConflictCandidate {
      exchangeTx: IIngestedTransaction;
      timeDiff: number;
      isId: boolean;
    }

    // --- PHASE 2: CONFLICTING DETECTION ---
    for (const userTx of userTxs) {
      if (matchedUserIds.has((userTx._id as any).toString())) {
        continue;
      }

      const candidates: ConflictCandidate[] = [];

      for (const exchangeTx of exchangeTxs) {
        if (matchedExchangeIds.has((exchangeTx._id as any).toString())) {
          continue;
        }

        // Must match asset and type
        if (userTx.parsedData.asset !== exchangeTx.parsedData.asset) {
          continue;
        }
        if (!typesMatch(userTx.parsedData.type, exchangeTx.parsedData.type)) {
          continue;
        }

        const userTime = userTx.parsedData.timestamp?.getTime();
        const excTime = exchangeTx.parsedData.timestamp?.getTime();

        if (userTime === undefined || excTime === undefined || userTime === null || excTime === null) {
          continue;
        }

        const isId = isIdMatch(userTx.transactionId, exchangeTx.transactionId);
        const timeDiff = Math.abs(userTime - excTime) / 1000;
        const isWithinProximity = timeDiff <= proximityWindowSeconds;

        if (isId || isWithinProximity) {
          candidates.push({
            exchangeTx,
            timeDiff,
            isId
          });
        }
      }

      if (candidates.length > 0) {
        // Sort candidates: ID matches first, then closest timestamp difference
        candidates.sort((a, b) => {
          if (a.isId && !b.isId) return -1;
          if (!a.isId && b.isId) return 1;
          return a.timeDiff - b.timeDiff;
        });

        const conflictingMatch = candidates[0].exchangeTx;
        matchedExchangeIds.add((conflictingMatch._id as any).toString());
        matchedUserIds.add((userTx._id as any).toString());

        const userQty = userTx.parsedData.quantity;
        const excQty = conflictingMatch.parsedData.quantity;

        if (userQty === null || excQty === null) {
          continue;
        }

        const qtyDiff = Math.abs(userQty - excQty);
        const percentDiff = (qtyDiff / Math.abs(userQty)) * 100;

        const userTime = userTx.parsedData.timestamp?.getTime() || 0;
        const excTime = conflictingMatch.parsedData.timestamp?.getTime() || 0;
        const timeDiff = Math.abs(userTime - excTime) / 1000;

        const isQtyMatch = percentDiff <= quantityTolerancePct;
        const isTimeMatch = timeDiff <= timestampToleranceSeconds;

        let conflictReason = '';
        if (candidates[0].isId) {
          conflictReason += 'Matched by transaction ID suffix';
        } else {
          conflictReason += `Matched by proximity (timestamp diff ${timeDiff}s)`;
        }

        const conflicts: string[] = [];
        if (!isQtyMatch) {
          conflicts.push(`quantity diff of ${percentDiff.toFixed(4)}% exceeds tolerance of ±${quantityTolerancePct}% (User: ${userQty}, Exchange: ${excQty})`);
        }
        if (!isTimeMatch) {
          conflicts.push(`timestamp diff of ${timeDiff}s exceeds tolerance of ±${timestampToleranceSeconds}s`);
        }

        const reason = `${conflictReason}, but key fields differ beyond tolerance: ${conflicts.join(' and ')}.`;

        records.push({
          runId,
          category: 'CONFLICTING' as const,
          userTransactionId: userTx.transactionId,
          exchangeTransactionId: conflictingMatch.transactionId,
          userTransaction: userTx._id,
          exchangeTransaction: conflictingMatch._id,
          reason
        });
      }
    }

    // --- PHASE 3: UNMATCHED USER TRANSACTIONS ---
    for (const userTx of userTxs) {
      if (matchedUserIds.has((userTx._id as any).toString())) {
        continue;
      }

      records.push({
        runId,
        category: 'UNMATCHED_USER' as const,
        userTransactionId: userTx.transactionId,
        exchangeTransactionId: null,
        userTransaction: userTx._id,
        exchangeTransaction: null,
        reason: 'Transaction present in user file, but no matching transaction found in exchange file.'
      });
    }

    // --- PHASE 4: UNMATCHED EXCHANGE TRANSACTIONS ---
    for (const exchangeTx of exchangeTxs) {
      if (matchedExchangeIds.has((exchangeTx._id as any).toString())) {
        continue;
      }

      records.push({
        runId,
        category: 'UNMATCHED_EXCHANGE' as const,
        userTransactionId: null,
        exchangeTransactionId: exchangeTx.transactionId,
        userTransaction: null,
        exchangeTransaction: exchangeTx._id,
        reason: 'Transaction present in exchange file, but no matching transaction found in user file.'
      });
    }

    // Save all records to the database
    if (records.length > 0) {
      await ReconciliationRecord.insertMany(records);
    }

    // Calculate summary counts
    const matchedCount = records.filter(r => r.category === 'MATCHED').length;
    const conflictingCount = records.filter(r => r.category === 'CONFLICTING').length;
    const unmatchedUserCount = records.filter(r => r.category === 'UNMATCHED_USER').length;
    const unmatchedExchangeCount = records.filter(r => r.category === 'UNMATCHED_EXCHANGE').length;

    // Update the run record in DB
    run.status = 'COMPLETED';
    run.summary = {
      matchedCount,
      conflictingCount,
      unmatchedUserCount,
      unmatchedExchangeCount,
      invalidUserCount,
      invalidExchangeCount
    };
    
    await run.save();

    return run;
  }
}

export default MatchingService;
