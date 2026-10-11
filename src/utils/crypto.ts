import { getOne, getAll, CommitOp } from '../db/indexedDB';
import { ChainEvent } from '../types';

export const uid = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });
};

export const sha = async (s: string): Promise<string> => {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    let h = 5381;
    for (const c of s) {
      h = ((h * 33) ^ c.charCodeAt(0)) >>> 0;
    }
    return h.toString(16);
  }
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

/**
 * Append-only, hash-chained event log: every action is a permanent, tamper-evident record.
 */
export async function mkEv(
  loanId: string,
  type: string,
  data: any
): Promise<[ChainEvent, CommitOp]> {
  const headMeta = await getOne<{ k: string; v: { seq: number; hash: string } }>('meta', 'head');
  const hd = headMeta?.v || { seq: 0, hash: '0' };
  
  const ev: ChainEvent = {
    id: uid(),
    loanId,
    type,
    ts: new Date().toISOString(),
    seq: hd.seq + 1,
    prev: hd.hash,
    data,
    hash: '',
  };

  ev.hash = await sha(hd.hash + JSON.stringify([ev.id, loanId, type, ev.ts, ev.seq, data]));

  const metaOp: CommitOp = ['meta', { k: 'head', v: { seq: ev.seq, hash: ev.hash } }];
  return [ev, metaOp];
}

/**
 * Verifies the integrity of the hash chain from genesis to head.
 */
export async function verifyAuditTrail(): Promise<{ n: number; bad: number }> {
  const ev = (await getAll<ChainEvent>('events')).sort((a, b) => a.seq - b.seq);
  let p = ev.length ? ev[0].prev : '0';
  let bad = 0;

  for (const e of ev) {
    const expectedHash = await sha(e.prev + JSON.stringify([e.id, e.loanId, e.type, e.ts, e.seq, e.data]));
    if (e.prev !== p || e.hash !== expectedHash) {
      bad++;
    }
    p = e.hash;
  }

  return { n: ev.length, bad };
}

export const verify = verifyAuditTrail;

