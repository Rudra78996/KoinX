import { Schema, model, Document } from 'mongoose';

export interface IIngestedTransaction extends Document {
  runId: string;
  source: 'user' | 'exchange';
  transactionId: string;
  rawRow: Record<string, string>;
  parsedData: {
    timestamp: Date | null;
    type: string | null;
    asset: string | null;
    quantity: number | null;
    priceUsd: number | null;
    fee: number | null;
    note: string;
  };
  status: 'VALID' | 'INVALID';
  validationErrors: string[];
  createdAt: Date;
  updatedAt: Date;
}

const IngestedTransactionSchema = new Schema<IIngestedTransaction>(
  {
    runId: {
      type: String,
      required: true,
      index: true,
    },
    source: {
      type: String,
      required: true,
      enum: ['user', 'exchange'],
      index: true,
    },
    transactionId: {
      type: String,
      required: true,
      index: true,
    },
    rawRow: {
      type: Schema.Types.Mixed,
      required: true,
    },
    parsedData: {
      timestamp: { type: Date, default: null },
      type: { type: String, default: null },
      asset: { type: String, default: null },
      quantity: { type: Number, default: null },
      priceUsd: { type: Number, default: null },
      fee: { type: Number, default: null },
      note: { type: String, default: '' },
    },
    status: {
      type: String,
      required: true,
      enum: ['VALID', 'INVALID'],
      index: true,
    },
    validationErrors: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to speed up matching engine lookups
IngestedTransactionSchema.index({ runId: 1, source: 1, status: 1 });

export default model<IIngestedTransaction>('IngestedTransaction', IngestedTransactionSchema);
