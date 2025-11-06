import mongoose, { Schema, Document } from 'mongoose';

export interface ICustomField {
  name: string;
  type: 'text' | 'number' | 'boolean' | 'image' | 'url' | 'longtext';
  required: boolean;
}

export interface ICatalogCollection extends Document {
  owner: string;
  title: string;
  fields: ICustomField[];
  createdAt: Date;
}

const CustomFieldSchema = new Schema<ICustomField>({
  name: { type: String, required: true },
  type: { type: String, required: true, enum: ['text','number','boolean','image','url','longtext'] },
  required: { type: Boolean, default: false },
});

const CatalogCollectionSchema = new Schema<ICatalogCollection>({
  owner: { type: String, required: true, index: true },
  title: { type: String, required: true },
  fields: { type: [CustomFieldSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model<ICatalogCollection>('CatalogCollection', CatalogCollectionSchema);
