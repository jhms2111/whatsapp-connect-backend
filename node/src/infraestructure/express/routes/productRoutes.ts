import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import Product from '../../mongo/models/productModel';

const router = Router();

// Diretório para armazenar imagens
const uploadDir = path.resolve(__dirname, '..', '..', '..', '..', 'uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configuração do Multer
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});
const upload = multer({ storage });

// Middleware: extrair username do token
const getUsernameFromToken = (req: any): string | null => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;

  const token = authHeader.split(' ')[1];
  if (!token || !process.env.JWT_SECRET) return null;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET) as jwt.JwtPayload;
    return decoded.username as string;
  } catch (error) {
    console.error('Erro ao verificar token:', error);
    return null;
  }
};

// ✅ POST /api/product — cria produto com owner
router.post('/product', upload.single('image'), async (req, res) => {
  const username = getUsernameFromToken(req);
  if (!username) return res.status(401).json({ error: 'Token inválido ou ausente' });

  const { name, description, priceMin, priceMax } = req.body;
  const imageFile = req.file;

  try {
    const imageUrl = imageFile
      ? `${process.env.BASE_URL || 'http://localhost:4000'}/uploads/${imageFile.filename}`
      : undefined;

    const newProduct = new Product({
      name,
      description,
      priceMin,
      priceMax,
      imageUrl,
      owner: username, // Salva quem criou
    });

    await newProduct.save();
    res.status(201).json(newProduct);
  } catch (error) {
    console.error('Erro ao criar produto:', error);
    res.status(500).json({ error: 'Erro interno ao criar o produto.' });
  }
});

// ✅ GET /api/products — lista apenas produtos do usuário logado
router.get('/products', async (req, res) => {
  const username = getUsernameFromToken(req);
  if (!username) return res.status(401).json({ error: 'Token inválido ou ausente' });

  try {
    const userProducts = await Product.find({ owner: username });
    res.status(200).json(userProducts);
  } catch (error) {
    console.error('Erro ao listar produtos:', error);
    res.status(500).json({ error: 'Erro ao buscar produtos.' });
  }
});

export default router;
