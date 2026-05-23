import { Schema, model, Document, Types } from 'mongoose';

export interface IReconciliationRecord extends Document {
  runId: string;
  category: 'MATCHED' | 'CONFLICTING' | 'UNMATCHED_USER' | 'UNMATCHED_EXCHANGE';
  userTransactionId: string | null;
  exchangeTransactionId: string | null;
  userTransaction: Types.ObjectId | null;
  exchangeTransaction: Types.ObjectId | null;
  reason: string;
  createdAt: Date;
  updatedAt: Date;
}

const ReconciliationRecordSchema = new Schema<IReconciliationRecord>(
  {
    runId: {
      type: String,
      required: true,
      index: true,
    },
    category: {
      type: String,
      required: true,
      enum: ['MATCHED', 'CONFLICTING', 'UNMATCHED_USER', 'UNMATCHED_EXCHANGE'],
      index: true,
    },
    userTransactionId: {
      type: String,
      default: null,
      index: true,
    },
    exchangeTransactionId: {
      type: String,
      default: null,
      index: true,
    },
    userTransaction: {
      type: Schema.Types.ObjectId,
      ref: 'IngestedTransaction',
      default: null,
    },
    exchangeTransaction: {
      type: Schema.Types.ObjectId,
      ref: 'IngestedTransaction',
      default: null,
    },
    reason: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export default model<IReconciliationRecord>('ReconciliationRecord', ReconciliationRecordSchema);
