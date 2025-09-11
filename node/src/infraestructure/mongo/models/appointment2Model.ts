// src/infraestructure/mongo/models/appointmentV2Model.ts
import mongoose, { Schema, Document, Types } from 'mongoose';

export type AppointmentStatus = 'confirmed' | 'pending' | 'cancelled';
export type AppointmentSource = 'bot' | 'human';

export interface IAppointmentV2 extends Document {
  owner: string;                 // username do dono da conta
  clientId: string;
  clientName: string;
  start: Date;                   // UTC preferencialmente
  durationMin: number;           // >= 5
  status: AppointmentStatus;
  createdBy: AppointmentSource;
  professional: Types.ObjectId;  // ref: Professional (obrigatório)
  service?: Types.ObjectId;      // ref: Service (opcional)
  createdAt?: Date;
  end?: Date;                    // virtual
}

const appointmentV2Schema = new Schema<IAppointmentV2>({
  owner: { type: String, required: true, index: true },
  clientId: { type: String, required: true },
  clientName: { type: String, required: true },
  start: { type: Date, required: true, index: true },
  durationMin: { type: Number, required: true, min: 5 },
  status: { type: String, enum: ['confirmed','pending','cancelled'], required: true },
  createdBy: { type: String, enum: ['bot','human'], required: true },
  professional: { type: Schema.Types.ObjectId, ref: 'Professional', required: true },
  service: { type: Schema.Types.ObjectId, ref: 'Service' },
}, { timestamps: true });

appointmentV2Schema.virtual('end').get(function (this: IAppointmentV2) {
  return new Date(this.start.getTime() + this.durationMin * 60 * 1000);
});

appointmentV2Schema.set('toJSON', { virtuals: true });
appointmentV2Schema.set('toObject', { virtuals: true });

appointmentV2Schema.index({ owner: 1, professional: 1, start: 1 });
appointmentV2Schema.index({ owner: 1, clientId: 1, start: -1 });

const AppointmentV2 = mongoose.model<IAppointmentV2>('AppointmentV2', appointmentV2Schema);
export default AppointmentV2;
