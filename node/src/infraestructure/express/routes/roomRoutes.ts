// src/routes/roomRoutes.ts
import { Router } from 'express';
import { occupiedRooms } from '../../../modules/integration/application/roomManagement';
import { users } from '../../../modules/integration/damain/user';

const router = Router();

router.get('/active-rooms', (req, res) => {
  const activeRooms = Array.from(occupiedRooms).map(roomId => {
    let currentUser = 'Bot';

    for (const [, userData] of users.entries()) {
      if ((userData as any).roomId === roomId) {
        currentUser = userData.username;
        break;
      }
    }

    return { roomId, currentUser };
  });

  res.json(activeRooms);
});

export default router;
