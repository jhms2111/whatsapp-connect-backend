import mongoose, { Schema, Document } from 'mongoose';

export interface ICatalogItem extends Document {
  owner: string;
  collectionId: mongoose.Types.ObjectId;
  values: Record<string, any>;
  images: string[];
  createdAt: Date;
}

const CatalogItemSchema = new Schema<ICatalogItem>({
  owner: { type: String, required: true, index: true },
  collectionId: { type: Schema.Types.ObjectId, ref: 'CatalogCollection', required: true, index: true },
  values: { type: Schema.Types.Mixed, required: true },
  images: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model<ICatalogItem>('CatalogItem', CatalogItemSchema);
