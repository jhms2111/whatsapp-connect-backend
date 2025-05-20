// src/types/express.d.ts
import { ICliente } from '../src/infraestructure/mongo/models/clienteModel'; // Ajuste o caminho conforme necessário

declare global {
  namespace Express {
    interface Request {
      user?: ICliente;  // Tornando o campo 'user' opcional
    }
  }
}
