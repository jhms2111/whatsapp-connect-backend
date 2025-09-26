import { Router } from 'express';
import ClientMemory from '../../mongo/models/clientMemoryModel';

const router = Router();

type Sentiment = 'positive' | 'neutral' | 'negative';
function isSentiment(x: any): x is Sentiment {
  return x === 'positive' || x === 'neutral' || x === 'negative';
}

// recalcula agregados (tópicos/sentimento)
function recomputeAggregates(doc: any) {
  const topicSet = new Set<string>();
  const counts: Record<Sentiment, number> = { positive: 0, neutral: 0, negative: 0 };

  const interactions = (doc.interactions ?? []) as Array<{ topics?: string[]; sentiment?: Sentiment }>;
  for (const it of interactions) {
    (it.topics ?? []).forEach((t) => topicSet.add(String(t).toLowerCase()));
    if (it.sentiment && isSentiment(it.sentiment)) counts[it.sentiment]++;
  }

  doc.topicsAgg = Array.from(topicSet).slice(0, 10);
  const entries = Object.entries(counts) as [Sentiment, number][];
  entries.sort((a, b) => b[1] - a[1]);
  doc.sentimentAgg = (entries[0]?.[1] ?? 0) > 0 ? entries[0][0] : 'neutral';
}

// Adiciona nova interação/atualiza dados
router.post('/interaction', async (req, res) => {
  const { clientId, message, sender, topics, sentiment, name, age, city, contact } = req.body;

  if (!clientId || !message || !sender) {
    return res.status(400).json({ error: 'clientId, message e sender são obrigatórios.' });
  }

  try {
    let client = await ClientMemory.findOne({ clientId });
    if (!client) client = new ClientMemory({ clientId, interactions: [] });

    if (name) client.name = String(name).trim();
    if (age != null) client.age = Number(age);
    if (city) client.city = String(city).trim();
    if (contact) client.contact = { ...(client.contact ?? {}), ...contact };

    client.interactions.push({
      message: String(message),
      sender,
      timestamp: new Date(),
      topics: Array.isArray(topics) ? topics.slice(0, 10) : [],
      sentiment: isSentiment(sentiment) ? sentiment : 'neutral',
    });

    client.lastInteraction = new Date();
    recomputeAggregates(client);

    await client.save();
    res.status(200).json({ success: true, client });
  } catch (error) {
    console.error('Erro ao registrar interação:', error);
    res.status(500).json({ error: 'Erro ao registrar interação.' });
  }
});

// Recupera memória
router.get('/memory/:clientId', async (req, res) => {
  const { clientId } = req.params;
  try {
    const client = await ClientMemory.findOne({ clientId });
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' });
    res.status(200).json(client);
  } catch (error) {
    console.error('Erro ao buscar memória do cliente:', error);
    res.status(500).json({ error: 'Erro ao buscar memória do cliente.' });
  }
});

export default router;
