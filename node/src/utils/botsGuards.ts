import Cliente from '../infraestructure/mongo/models/clienteModel';

/**
 * Verifica se o usuário pode responder automaticamente (bots).
 * allow = false quando status='blocked' OU botsEnabled=false OU usuário inexistente.
 */
export async function canUserAutoRespond(
  username: string
): Promise<{ allow: boolean; reason?: 'BLOCKED' | 'BOTS_OFF' | 'NO_USER' }> {
  const cli = await Cliente.findOne(
    { username },
    { status: 1, botsEnabled: 1 }
  ).lean();

  if (!cli) return { allow: false, reason: 'NO_USER' };

  const status = (cli as any).status || 'active';
  if (status === 'blocked') return { allow: false, reason: 'BLOCKED' };

  const enabled =
    typeof (cli as any).botsEnabled === 'boolean' ? (cli as any).botsEnabled : true;
  if (!enabled) return { allow: false, reason: 'BOTS_OFF' };

  return { allow: true };
}

/**
 * Para webhooks: se não puder responder, termina com 200 (evita reentrega do provedor)
 * e registra log amigável.
 */
export function endIfBlockedOrOff(
  res: any,
  username: string,
  check: { allow: boolean; reason?: string }
) {
  if (!check.allow) {
    console.log(
      `[bot-guard] username=${username} allow=false reason=${check.reason}`
    );
    return res.status(200).send('IGNORED_BY_GUARD');
  }
  return null;
}
