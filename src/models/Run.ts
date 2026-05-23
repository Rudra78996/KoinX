import { Schema, model, Document } from 'mongoose';

export interface IReconciliationRun extends Document {
  runId: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  config: {
    timestampToleranceSeconds: number;
    quantityTolerancePct: number;
    proximityWindowSeconds: number;
  };
  summary: {
    matchedCount: number;
    conflictingCount: number;
    unmatchedUserCount: number;
    unmatchedExchangeCount: number;
    invalidUserCount: number;
    invalidExchangeCount: number;
  };
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const ReconciliationRunSchema = new Schema<IReconciliationRun>(
  {
    runId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['PENDING', 'COMPLETED', 'FAILED'],
      default: 'PENDING',
    },
    config: {
      timestampToleranceSeconds: {
        type: Number,
        required: true,
      },
      quantityTolerancePct: {
        type: Number,
        required: true,
      },
      proximityWindowSeconds: {
        type: Number,
        required: true,
      },
    },
    summary: {
      matchedCount: { type: Number, default: 0 },
      conflictingCount: { type: Number, default: 0 },
      unmatchedUserCount: { type: Number, default: 0 },
      unmatchedExchangeCount: { type: Number, default: 0 },
      invalidUserCount: { type: Number, default: 0 },
      invalidExchangeCount: { type: Number, default: 0 },
    },
    error: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export default model<IReconciliationRun>('ReconciliationRun', ReconciliationRunSchema);
