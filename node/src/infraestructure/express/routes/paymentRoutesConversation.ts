// src/infraestructure/express/routes/paymentRoutes.ts
import { Router } from 'express';
import { PACKAGES } from '../../../utils/packages';
import { authenticateJWT } from '../middleware/authMiddleware';

const router = Router();

// GET /api/payment/packages
router.get('/packages', authenticateJWT, (req, res) => {
  res.json(PACKAGES);
});

export default router;
