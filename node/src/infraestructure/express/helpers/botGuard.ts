import Cliente from '../../mongo/models/clienteModel';

type Cache = Map<string, { value: boolean; exp: number }>;
const cache: Cache = new Map();
const TTL_MS = 10_000; // 10s

export async function canAutoReplyOwner(owner: string): Promise<boolean> {
  if (!owner) return false;

  const now = Date.now();
  const c = cache.get(owner);
  if (c && c.exp > now) return c.value;

  const cli = await Cliente.findOne({ username: owner }, { botsEnabled: 1, status: 1 })
    .lean<{ botsEnabled?: boolean; status?: 'active' | 'blocked' }>()
    .exec();

  const ok = cli?.status === 'blocked'
    ? false
    : (typeof cli?.botsEnabled === 'boolean' ? cli!.botsEnabled : true);

  cache.set(owner, { value: ok, exp: now + TTL_MS });
  return ok;
}

export function invalidateOwnerGuard(owner?: string) {
  if (owner) cache.delete(owner);
  else cache.clear();
}
