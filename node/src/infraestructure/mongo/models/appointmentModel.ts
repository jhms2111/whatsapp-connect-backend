import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IAppointment {
  clientId: string;
  clientName: string;
  datetime: Date;
  status: 'confirmed' | 'pending' | 'cancelled';
  createdBy: 'bot' | 'human';
  createdAt?: Date;
}

export interface IAppointmentDoc extends IAppointment, Document {}

const AppointmentSchema = new Schema<IAppointmentDoc>({
  clientId: { type: String, required: true },
  clientName: { type: String, required: true },
  datetime: { type: Date, required: true },
  status: { type: String, enum: ['confirmed', 'pending', 'cancelled'], required: true },
  createdBy: { type: String, enum: ['bot', 'human'], required: true },
  createdAt: { type: Date, default: Date.now },
});

const Appointment = mongoose.model<IAppointmentDoc>('Appointment', AppointmentSchema);
export default Appointment;
