export interface Customer {
  id: string;
  name: string;
  address: string;
  createdAt: string;
}

export interface CollateralItem {
  id: string;
  loanId: string;
  description: string;
  metal: 'gold' | 'silver';
  grossWeight: number;
  hallmark: boolean;
  netWeight: number | null;
  purity: number | null;
  principalValue: number;
  rate: number | null;
  value: number | null;
  legacy?: boolean;
}

export interface LoanDisclosure {
  at: string;
  sec?: number | null;
  langs: string[];
}

export interface Loan {
  id: string;
  customerId: string;
  serialNo: string;
  loanDate: string;
  product: string;
  noOfArticles: number;
  weight: number;
  interestRate: number;
  principal: number;
  currentPrincipal: number;
  upfront: number | null;
  disbursed: number | null;
  status: 'Active' | 'Closed' | 'Void';
  createdAt: string;
  closedAt: string | null;
  src: 'S0' | 'S1';
  rule: string;
  cfg: string;
  value: number | null;
  ltv: number | null;
  cap: number;
  benchFresh?: boolean;
  benchN?: number;
  benchSrc?: string;
  rateGold?: number | null;
  rateSilver?: number | null;
  saveSec?: number;
  startedAt?: string;
  dis?: LoanDisclosure;
}

export interface MetalRate {
  id: string;
  date: string;
  metal: 'gold' | 'silver';
  pg: number;
  src: string;
}

export interface ChainEvent {
  id: string;
  loanId: string;
  type: string;
  ts: string;
  seq: number;
  prev: string;
  data: any;
  hash: string;
}

export interface ShopVisitAudit {
  id: string;
  code: string;
  method: string;
  date: string;
  sec: number | null;
  loans?: number;
  checks: boolean[];
  notes?: string;
}

export interface AppState {
  loans: Loan[];
  items: CollateralItem[];
  customers: Customer[];
  rates: MetalRate[];
  audits: ShopVisitAudit[];
  events: ChainEvent[];
  meta: {
    lastBackup?: string;
    salt?: string;
    head?: { seq: number; hash: string };
  };
}
