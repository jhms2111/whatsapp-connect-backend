// src/infraestructure/mongo/models/productModel.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface IProduct extends Document {
  name: string;
  description: string;
  priceMin: number;
  priceMax: number;
  imageUrl?: string;
  owner: string; // ✅ Novo campo obrigatório
}

const productSchema = new Schema<IProduct>({
  name: { type: String, required: true },
  description: { type: String, required: true },
  priceMin: { type: Number, required: true },
  priceMax: { type: Number, required: true },
  imageUrl: { type: String },
  owner: { type: String, required: true }, // ✅ Adicionado no schema
});

const Product = mongoose.models.Product || mongoose.model<IProduct>('Product', productSchema);

export default Product;
