import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IAssignment extends Document {
  owner: string;
  professional: Types.ObjectId;          // ref Professional
  template: Types.ObjectId;              // ref AvailabilityTemplate
  startDate: Date;                        // inclusive (YYYY-MM-DD 00:00 local)
  endDate?: Date;                         // inclusive (opcional)
}

const assignmentSchema = new Schema<IAssignment>({
  owner: { type: String, required: true, index: true },
  professional: { type: Schema.Types.ObjectId, ref: 'Professional', required: true, index: true },
  template: { type: Schema.Types.ObjectId, ref: 'AvailabilityTemplate', required: true, index: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date },
}, { timestamps: true });

assignmentSchema.index({ owner: 1, professional: 1, startDate: 1 });

export default mongoose.model<IAssignment>('Assignment', assignmentSchema);
