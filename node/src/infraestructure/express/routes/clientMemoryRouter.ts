// src/modules/memory/clientMemoryRouter.ts
import { Router } from 'express';
import ClientMemory, { IClientMemory } from '../../mongo/models/clientMemoryModel';

const router = Router();

// Adiciona uma nova interação ou atualiza dados do cliente
router.post('/interaction', async (req, res) => {
  const { clientId, message, sender, topics, sentiment, name, age, city, contact } = req.body;

  if (!clientId || !message || !sender) {
    return res.status(400).json({ error: 'clientId, message e sender são obrigatórios.' });
  }

  try {
    // Busca o cliente
    let client = await ClientMemory.findOne({ clientId });

    if (!client) {
      // Cria um novo registro se não existir
      client = new ClientMemory({ clientId });
    }

    // Atualiza informações básicas do cliente
    if (name) client.name = name;
    if (age) client.age = age;
    if (city) client.city = city;
    if (contact) client.contact = { ...client.contact, ...contact };

    // Adiciona a nova interação
    client.interactions.push({
      message,
      sender,
      timestamp: new Date(),
      topics: topics || [],
      sentiment: sentiment || 'neutral',
    });

    // Atualiza a última interação
    client.lastInteraction = new Date();

    await client.save();
    res.status(200).json({ success: true, client });
  } catch (error) {
    console.error('Erro ao registrar interação:', error);
    res.status(500).json({ error: 'Erro ao registrar interação.' });
  }
});

router.get('/memory/:clientId', async (req, res) => {
  const { clientId } = req.params;

  try {
    const client = await ClientMemory.findOne({ clientId });
    if (!client) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }
    res.status(200).json(client);
  } catch (error) {
    console.error('Erro ao buscar memória do cliente:', error);
    res.status(500).json({ error: 'Erro ao buscar memória do cliente.' });
  }
});

export default router;
