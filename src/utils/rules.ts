import { Loan, CollateralItem, MetalRate } from '../types';

/* ===== RULES (RBI Master Directions 2025/2026 rubric) ===== */
export const CFG = {
  grace: 32,
  tiers: [
    [250000, 0.85],
    [500000, 0.8],
    [1e12, 0.75],
  ] as [number, number][],
  capG: 1000, // max 1000g gold per borrower
  capS: 10000, // max 10kg silver per borrower
  ver: 'rbi-2025-eff-2026-04-01',
};

export const cap = (principal: number): number => {
  const match = CFG.tiers.find((t) => principal <= t[0]);
  return match ? match[1] : 0.75;
};

export const r2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export const inr = (n?: number | null): string => {
  if (n == null) return '—';
  return '₹' + Math.round(n).toLocaleString('en-IN');
};

export const pc = (n?: number | null): string => {
  if (n == null) return '—';
  return (n * 100).toFixed(1) + '%';
};

export const today = (): string =>
  new Date(Date.now() + 19800000).toISOString().slice(0, 10);

export const addD = (d: string, n: number): string =>
  new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);

export const fd = (d?: string | null): string => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

export const months = (a: string, b: string) => {
  const d = Math.max(
    0,
    Math.round(
      (new Date(b + 'T00:00:00+05:30').getTime() - new Date(a + 'T00:00:00+05:30').getTime()) /
        864e5
    )
  );
  return { d, m: d > CFG.grace ? Math.ceil((d - CFG.grace) / 30) : 0 };
};

export const ch = (d: number): number =>
  d > CFG.grace ? Math.ceil((d - CFG.grace) / 30) : 0;

export const bump = (x: string): string => {
  const c = x.split('');
  let i = c.length - 1;
  while (i >= 0) {
    if (c[i] === 'Z') {
      c[i] = 'A';
      i--;
    } else {
      c[i] = String.fromCharCode(c[i].charCodeAt(0) + 1);
      break;
    }
  }
  if (i < 0) c.unshift('A');
  return c.join('');
};

export const nextSer = (s?: string | null): string => {
  const m = (s || '').trim().match(/^([a-zA-Z\-_]*?)(\d+)([a-zA-Z]*)$/);
  if (!m) return '1';
  let n = +m[2];
  let x = m[3];
  if (n < 10000) n++;
  else {
    n = 1;
    x = x ? bump(x) : 'A';
  }
  return m[1] + n + x;
};

export const maxLoan = (v: number): number =>
  Math.max(
    ...CFG.tiers.map(([l, r], i) => {
      const x = Math.min(v * r, l);
      return x > (i ? CFG.tiers[i - 1][0] : -1) ? x : 0;
    })
  );

/**
 * RBI benchmark: lower of previous-day close and 30-day average.
 */
export function bench(metal: 'gold' | 'silver', rates: MetalRate[], d: string = today()) {
  const r = rates.filter((x) => x.metal === metal && x.date <= d).sort((a, b) => (b.date < a.date ? -1 : 1));
  if (!r.length) return null;
  const pv = r.find((x) => x.date < d) || r[0];
  const w = r.filter((x) => x.date > addD(d, -30));
  const av = w.reduce((s, x) => s + x.pg, 0) / w.length;
  return {
    rate: Math.min(pv.pg, av),
    n: w.length,
    date: pv.date,
    src: pv.src,
    fresh: pv.date >= addD(d, -1),
  };
}

export function LV(l: Loan, items: CollateralItem[], d: string = today()) {
  const it = items.filter((i) => i.loanId === l.id);
  const k = months(l.loanDate, d);
  const intr = l.status === 'Active' ? r2((l.currentPrincipal * l.interestRate) / 100 * k.m) : 0;
  const dues = l.currentPrincipal + intr;
  let v = 0;
  let ok = it.length > 0;
  for (const i of it) {
    if (i.value == null) {
      ok = false;
      break;
    }
    v += i.value;
  }
  return {
    it,
    ...k,
    intr,
    dues,
    val: ok ? v : null,
    ltv: ok && v ? dues / v : null,
  };
}

export function checks(l: Partial<Loan>, items: CollateralItem[] = [], rates: MetalRate[] = []): [string, boolean][] {
  const it = items.filter((i) => i.loanId === l.id);
  const g = it.filter((i) => i.metal === 'gold').reduce((s, i) => s + (i.netWeight || 0), 0);
  const s = it.filter((i) => i.metal === 'silver').reduce((a, i) => a + (i.netWeight || 0), 0);
  const d = l.dis;
  const benchRate = bench(l.product?.toLowerCase().includes('silver') ? 'silver' : 'gold', rates, l.loanDate || today());

  return [
    ['LTV within tier cap (' + pc(l.cap ?? 0.85) + ')', l.ltv != null && l.ltv <= (l.cap ?? 0.85) + 1e-9],
    ['Benchmark rate on record, ≤1 day old', !!(l.benchFresh ?? benchRate?.fresh)],
    ['Weight & purity assessed per item', it.length > 0 && it.every((i) => i.netWeight != null && i.purity)],
    ['Within per-borrower ornament limit', g <= CFG.capG && s <= CFG.capS],
    ['Written disclosure issued', !!d],
    ['Disclosure given in Tamil', !!d?.langs?.includes('ta')],
    ['Stated APR and total monthly charges explicitly written on receipt/ledger', !!d],
  ];
}

export const score = (l: Loan, items: CollateralItem[] = [], rates: MetalRate[] = []): number => {
  const c = checks(l, items, rates);
  return c.filter((x) => x[1]).length / c.length;
};

export const PURITY_OPTIONS = {
  gold: [
    { value: 22 / 24, label: '22K (916)' },
    { value: 24 / 24, label: '24K (999)' },
    { value: 20 / 24, label: '20K' },
    { value: 18 / 24, label: '18K' },
  ],
  silver: [
    { value: 0.925, label: 'Sterling 92.5%' },
    { value: 0.8, label: '80%' },
    { value: 0.7, label: '70%' },
    { value: 0.999, label: 'Fine 99.9%' },
  ],
};

/* Localization strings */
export const T = {
  en: {
    t: 'Loan Disclosure Statement',
    b: 'Borrower',
    d: 'Date',
    s: 'Serial no.',
    o: 'Pledged ornaments',
    n: 'Net wt',
    p: 'Purity',
    v: 'Value',
    pr: 'Loan amount',
    ltv: 'Loan-to-value (LTV)',
    cap: 'Maximum allowed',
    mr: 'Interest per month',
    ar: 'Interest per year (simple)',
    gr: "The first month's interest is deducted when the loan is given and covers the first 32 days. After that, each further 30 days (or part) is charged one more month.",
    up: 'First-month interest (deducted now)',
    cash: 'Cash handed to you',
    eff: 'Monthly rate on cash received',
    ex: 'Amount payable if redeemed after',
    mo: 'months',
    tot: 'Total payable',
    vm: 'Valuation: lower of previous-day close and 30-day average, source',
    sg: 'Borrower signature',
    lg: 'Lender signature',
    ph: 'Mobile',
  },
  ta: {
    t: 'கடன் வெளிப்படுத்தல் அறிக்கை',
    b: 'கடன் பெறுபவர்',
    d: 'தேதி',
    s: 'வரிசை எண்',
    o: 'அடகு வைத்த நகைகள்',
    n: 'நிகர எடை',
    p: 'தூய்மை',
    v: 'மதிப்பு',
    pr: 'கடன் தொகை',
    ltv: 'கடன்-மதிப்பு விகிதம் (LTV)',
    cap: 'அனுமதிக்கப்பட்ட அதிகபட்சம்',
    mr: 'மாத வட்டி',
    ar: 'ஆண்டு வட்டி (எளிய)',
    gr: 'முதல் மாத வட்டி கடன் தரும்போதே கழிக்கப்படும்; அது முதல் 32 நாட்களை உள்ளடக்கும். அதன் பின் ஒவ்வொரு 30 நாட்கள் (அல்லது அதன் பகுதி) கூடுதலாக ஒரு மாதமாகக் கணக்கிடப்படும்.',
    up: 'முதல் மாத வட்டி (இப்போதே கழிக்கப்பட்டது)',
    cash: 'உங்களுக்கு வழங்கப்பட்ட பணம்',
    eff: 'கையில் பெற்ற தொகைக்கு மாத வட்டி',
    ex: 'மீட்கும் போது செலுத்த வேண்டிய தொகை',
    mo: 'மாதங்கள்',
    tot: 'மொத்த தொகை',
    vm: 'மதிப்பீட்டுக்கு எடுத்த விலை (கிராமுக்கு ₹)',
    sg: 'கடன் பெறுபவர் கையொப்பம்',
    lg: 'கடன் வழங்குபவர் கையொப்பம்',
    ph: 'கைபேசி',
  },
};
