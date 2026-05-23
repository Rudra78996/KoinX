import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import ReconciliationRun from '../models/Run';
import IngestionService from '../services/IngestionService';
import MatchingService from '../services/MatchingService';
import ReportService from '../services/ReportService';
import IngestedTransaction from '../models/Transaction';
import ReconciliationRecord from '../models/Record';
import config from '../config';

export class ReconcileController {
  /**
   * POST /api/reconcile
   * Triggers reconciliation for uploaded user and exchange CSV files.
   */
  static async reconcile(req: Request, res: Response): Promise<Response> {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
      
      // 1. Verify files are uploaded
      if (!files || !files['user_transactions'] || !files['exchange_transactions']) {
        return res.status(400).json({
          success: false,
          error: 'Both user_transactions and exchange_transactions CSV files are required.'
        });
      }

      const userFile = files['user_transactions'][0];
      const exchangeFile = files['exchange_transactions'][0];

      // 2. Parse configuration overrides from request body or query params
      const timestampToleranceSeconds = req.body.timestampToleranceSeconds !== undefined
        ? parseInt(req.body.timestampToleranceSeconds, 10)
        : config.DEFAULT_TIMESTAMP_TOLERANCE_SECONDS;

      const quantityTolerancePct = req.body.quantityTolerancePct !== undefined
        ? parseFloat(req.body.quantityTolerancePct)
        : config.DEFAULT_QUANTITY_TOLERANCE_PCT;

      const proximityWindowSeconds = req.body.proximityWindowSeconds !== undefined
        ? parseInt(req.body.proximityWindowSeconds, 10)
        : config.DEFAULT_PROXIMITY_WINDOW_SECONDS;

      if (isNaN(timestampToleranceSeconds) || timestampToleranceSeconds < 0) {
        return res.status(400).json({ success: false, error: 'Invalid timestampToleranceSeconds.' });
      }
      if (isNaN(quantityTolerancePct) || quantityTolerancePct < 0) {
        return res.status(400).json({ success: false, error: 'Invalid quantityTolerancePct.' });
      }
      if (isNaN(proximityWindowSeconds) || proximityWindowSeconds < 0) {
        return res.status(400).json({ success: false, error: 'Invalid proximityWindowSeconds.' });
      }

      const runId = uuidv4();

      // 3. Create run record
      const run = new ReconciliationRun({
        runId,
        status: 'PENDING',
        config: {
          timestampToleranceSeconds,
          quantityTolerancePct,
          proximityWindowSeconds
        }
      });
      await run.save();

      try {
        // Step A: Ingest User CSV
        await IngestionService.ingestCsv(userFile.buffer, 'user', runId);

        // Step B: Ingest Exchange CSV
        await IngestionService.ingestCsv(exchangeFile.buffer, 'exchange', runId);

        // Step C: Run Matching Engine
        const result = await MatchingService.reconcile(runId, {
          timestampToleranceSeconds,
          quantityTolerancePct,
          proximityWindowSeconds
        });

        return res.status(201).json({
          success: true,
          message: 'Reconciliation run completed successfully.',
          runId,
          config: result.config,
          summary: result.summary
        });

      } catch (error: any) {
        console.error(`Reconciliation run failed for runId: ${runId}:`, error);
        
        run.status = 'FAILED';
        run.error = error.message;
        await run.save();

        return res.status(500).json({
          success: false,
          error: `Reconciliation run failed: ${error.message}`,
          runId
        });
      }
    } catch (err: any) {
      console.error('Fatal error in reconcile controller:', err);
      return res.status(500).json({
        success: false,
        error: `Internal server error: ${err.message}`
      });
    }
  }

  /**
   * GET /api/report/:runId
   * Fetches full report. Downloads CSV if format=csv is queried.
   */
  static async getReport(req: Request, res: Response): Promise<Response | void> {
    const { runId } = req.params;
    const { format } = req.query;

    try {
      const run = await ReconciliationRun.findOne({ runId });
      if (!run) {
        return res.status(404).json({ success: false, error: 'Reconciliation run not found.' });
      }

      if (run.status === 'PENDING') {
        return res.status(202).json({ success: true, message: 'Reconciliation is still processing.', status: 'PENDING' });
      }

      if (run.status === 'FAILED') {
        return res.status(500).json({ success: false, error: 'Reconciliation run failed.', reason: run.error, status: 'FAILED' });
      }

      if (format === 'csv') {
        const csvContent = await ReportService.generateCsvReport(runId);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=reconciliation_report_${runId}.csv`);
        res.status(200).send(csvContent);
        return;
      }

      const report = await ReportService.getFullReport(runId);
      return res.status(200).json({
        success: true,
        runId,
        config: run.config,
        summary: run.summary,
        records: report
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * GET /api/report/:runId/summary
   * Fetches only run metadata and summary counts.
   */
  static async getSummary(req: Request, res: Response): Promise<Response> {
    const { runId } = req.params;

    try {
      const run = await ReconciliationRun.findOne({ runId });
      if (!run) {
        return res.status(404).json({ success: false, error: 'Reconciliation run not found.' });
      }

      return res.status(200).json({
        success: true,
        runId,
        status: run.status,
        config: run.config,
        summary: run.summary,
        error: run.error
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * GET /api/report/:runId/unmatched
   * Fetches only unmatched records and ingestion errors.
   */
  static async getUnmatched(req: Request, res: Response): Promise<Response> {
    const { runId } = req.params;

    try {
      const run = await ReconciliationRun.findOne({ runId });
      if (!run) {
        return res.status(404).json({ success: false, error: 'Reconciliation run not found.' });
      }

      if (run.status === 'PENDING') {
        return res.status(202).json({ success: true, status: 'PENDING' });
      }

      // 1. Fetch unmatched user/exchange records from the Matching engine
      const unmatchedRecords = await ReconciliationRecord.find({
        runId,
        category: { $in: ['UNMATCHED_USER', 'UNMATCHED_EXCHANGE'] }
      })
        .populate('userTransaction')
        .populate('exchangeTransaction')
        .exec();

      // 2. Fetch invalid ingested transaction rows (ingestion errors)
      const ingestionErrors = await IngestedTransaction.find({
        runId,
        status: 'INVALID'
      });

      return res.status(200).json({
        success: true,
        runId,
        summary: {
          unmatchedUserCount: run.summary.unmatchedUserCount,
          unmatchedExchangeCount: run.summary.unmatchedExchangeCount,
          invalidUserCount: run.summary.invalidUserCount,
          invalidExchangeCount: run.summary.invalidExchangeCount
        },
        unmatchedRecords,
        ingestionErrors
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }
}
