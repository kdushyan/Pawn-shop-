import React, { useState } from 'react';
import { Loan, CollateralItem, Customer } from '../types';
import { LV, fd, inr, pc, r2, cap } from '../utils/rules';
import { mkEv } from '../utils/crypto';
import { commit } from '../db/indexedDB';
import { Search, CheckCircle, ArrowDownCircle, AlertTriangle } from 'lucide-react';

interface RedemptionProps {
  loans: Loan[];
  items: CollateralItem[];
  customers: Customer[];
  onRefresh: () => Promise<void>;
  showToast: (msg: string) => void;
}

export const Redemption: React.FC<RedemptionProps> = ({
  loans,
  items,
  customers,
  onRefresh,
  showToast,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<'date' | 'name' | 'amount'>('date');
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);
  const [authorizedBy, setAuthorizedBy] = useState(localStorage.getItem('au') || '');
  const [partialAmount, setPartialAmount] = useState('');

  const getCust = (loan: Loan) => customers.find((c) => c.id === loan.customerId);

  const activeLoans = loans.filter((l) => {
    if (l.status !== 'Active') return false;
    const cust = getCust(l);
    const custName = cust?.name || '';
    const custPhone = cust?.phone || '';
    const q = searchQuery.toLowerCase();
    return (
      l.serialNo.toLowerCase().includes(q) ||
      custName.toLowerCase().includes(q) ||
      custPhone.toLowerCase().includes(q)
    );
  });

  activeLoans.sort((a, b) => {
    if (sortKey === 'name') {
      const na = getCust(a)?.name || '';
      const nb = getCust(b)?.name || '';
      return na.localeCompare(nb);
    }
    if (sortKey === 'amount') {
      return b.currentPrincipal - a.currentPrincipal;
    }
    return b.loanDate < a.loanDate ? -1 : 1;
  });

  const selectedLoan = activeLoans.find((l) => l.id === selectedLoanId) || activeLoans[0] || null;
  const currentLoan = selectedLoan ? loans.find((l) => l.id === selectedLoan.id) : null;
  const cust = currentLoan ? getCust(currentLoan) : null;
  const lv = currentLoan ? LV(currentLoan, items) : null;

  const handleRedeemAction = async (kind: 'full' | 'partial' | 'void') => {
    if (!currentLoan || !lv) return;
    const auth = authorizedBy.trim();
    if (!auth) {
      showToast('Enter who authorised this settlement');
      return;
    }
    localStorage.setItem('au', auth);

    let eventType = '';
    let paidPrincipal = 0;
    let interestPaid = 0;
    const updatedLoan = { ...currentLoan };

    if (kind === 'void') {
      if (!window.confirm('Void this loan entry? It remains permanently in the tamper-evident audit trail.')) {
        return;
      }
      eventType = 'VOID';
      updatedLoan.status = 'Void';
      updatedLoan.closedAt = new Date().toISOString();
    } else if (kind === 'full') {
      eventType = 'FULL_REDEMPTION';
      paidPrincipal = currentLoan.currentPrincipal;
      interestPaid = lv.intr;
      updatedLoan.status = 'Closed';
      updatedLoan.currentPrincipal = 0;
      updatedLoan.closedAt = new Date().toISOString();
    } else {
      const p = parseFloat(partialAmount);
      if (!(p > 0 && p < currentLoan.currentPrincipal)) {
        showToast('Enter a partial amount less than the outstanding principal');
        return;
      }
      eventType = 'PARTIAL_REDEMPTION';
      paidPrincipal = p;
      interestPaid = r2((p * currentLoan.interestRate) / 100 * lv.m);
      updatedLoan.currentPrincipal = r2(currentLoan.currentPrincipal - p);
    }

    const [ev, hd] = await mkEv(currentLoan.id, eventType, {
      paidPrincipal,
      interestPaid,
      authorizer: auth,
      remainingPrincipal: updatedLoan.currentPrincipal,
    });

    await commit([['loans', updatedLoan], ['events', ev], hd]);
    await onRefresh();
    setPartialAmount('');
    showToast(
      kind === 'full'
        ? `Settled #${currentLoan.serialNo} in full`
        : kind === 'partial'
        ? `Partial payment recorded for #${currentLoan.serialNo}`
        : `Voided #${currentLoan.serialNo}`
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-100">Redemption & Settlement</h2>
        <p className="text-sm text-slate-400 mt-1">
          {activeLoans.length} active pledges. Settle in full, record partial payments, or audit void entries.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Loan Selector */}
        <div className="lg:col-span-5 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
            <input
              placeholder="Search name or serial..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-400"
            />
          </div>

          <div className="flex gap-2">
            {(
              [
                ['date', 'Newest'],
                ['name', 'Name'],
                ['amount', 'Amount'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSortKey(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  sortKey === key
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {activeLoans.map((l) => {
              const c = getCust(l);
              const isSelected = (selectedLoanId || activeLoans[0]?.id) === l.id;
              const loanLv = LV(l, items);
              const tierC = cap(l.principal);
              const overCap = loanLv.ltv != null && loanLv.ltv > tierC;

              return (
                <div
                  key={l.id}
                  onClick={() => setSelectedLoanId(l.id)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition ${
                    isSelected
                      ? 'bg-amber-500/10 border-amber-500 shadow-sm'
                      : 'bg-slate-800/80 border-slate-700/80 hover:border-slate-600'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-semibold text-sm text-slate-100">{c?.name || 'Unknown'}</h4>
                      <div className="text-xs text-slate-400 mt-0.5 font-mono">
                        #{l.serialNo} · {fd(l.loanDate)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-sm text-slate-100">{inr(l.currentPrincipal)}</div>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold inline-block mt-1 ${
                          overCap
                            ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                            : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                        }`}
                      >
                        LTV {pc(loanLv.ltv)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}

            {activeLoans.length === 0 && (
              <div className="p-8 text-center text-sm text-slate-500 bg-slate-800/40 rounded-xl border border-slate-800">
                No active loans found matching query.
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Settlement Details */}
        <div className="lg:col-span-7">
          {currentLoan && lv ? (
            <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-5 space-y-5">
              <div>
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-xl font-bold text-slate-100">{cust?.name}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      #{currentLoan.serialNo} · {cust?.address}{cust?.phone ? ` · ${cust.phone}` : ''} · Pledged {fd(currentLoan.loanDate)} · {currentLoan.interestRate}%/mo
                    </p>
                  </div>
                  <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    Active
                  </span>
                </div>
                <div className="text-xs text-slate-400 mt-2 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                  <span className="font-semibold text-slate-300">Collateral: </span>
                  {lv.it.map((i) => i.description).join(', ') || 'Gold & Silver ornaments'}
                </div>
              </div>

              {/* Dues Breakdown */}
              <div className="space-y-2.5 border-t border-b border-slate-700/70 py-4 text-sm">
                <div className="flex justify-between text-slate-300">
                  <span>Principal Outstanding:</span>
                  <span className="font-semibold text-slate-100">{inr(currentLoan.currentPrincipal)}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>
                    {lv.d} days elapsed ({lv.m} extra month(s) beyond 32-day prepaid month):
                  </span>
                  <span className="font-semibold text-amber-400">{inr(lv.intr)}</span>
                </div>
                <div className="flex justify-between items-center text-base pt-2 border-t border-slate-700/50">
                  <span className="font-bold text-slate-100">Total to Collect Today:</span>
                  <span className="text-2xl font-bold text-emerald-400">{inr(lv.dues)}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-400 pt-1">
                  <span>Pledge-day Collateral Value:</span>
                  <span>{inr(lv.val)}</span>
                </div>
              </div>

              {/* Action Form */}
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Authorised By</label>
                    <input
                      placeholder="e.g. Kokila / Krishna"
                      value={authorizedBy}
                      onChange={(e) => setAuthorizedBy(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Partial: Principal Paid (₹)</label>
                    <input
                      type="number"
                      placeholder="e.g. 10000"
                      value={partialAmount}
                      onChange={(e) => setPartialAmount(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-400 font-mono"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2.5 pt-2">
                  <button
                    onClick={() => handleRedeemAction('full')}
                    className="flex-1 min-w-[140px] py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-sm transition shadow-sm"
                  >
                    Full Redemption
                  </button>
                  <button
                    onClick={() => handleRedeemAction('partial')}
                    className="flex-1 min-w-[140px] py-3 bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30 font-bold rounded-xl text-sm transition"
                  >
                    Partial Payment
                  </button>
                  <button
                    onClick={() => handleRedeemAction('void')}
                    className="py-3 px-4 bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 font-bold rounded-xl text-sm transition"
                  >
                    Void Entry
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-800/40 border border-slate-800 rounded-2xl p-12 text-center text-slate-500">
              Select an active loan from the left list to settle.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
