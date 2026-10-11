import React, { useState } from 'react';
import { Loan, CollateralItem, Customer, ChainEvent, MetalRate } from '../types';
import { LV, fd, inr, pc, checks, score, cap } from '../utils/rules';
import { Search, FileText, CheckCircle2, XCircle, Clock, ShieldCheck } from 'lucide-react';

interface LedgerProps {
  loans: Loan[];
  items: CollateralItem[];
  customers: Customer[];
  events: ChainEvent[];
  rates: MetalRate[];
  onOpenDisclosure: (loanId: string, lang: 'en' | 'ta') => void;
}

export const Ledger: React.FC<LedgerProps> = ({
  loans,
  items,
  customers,
  events,
  rates,
  onOpenDisclosure,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'Active' | 'Closed' | 'All'>('Active');
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);

  const getCust = (loan: Loan) => customers.find((c) => c.id === loan.customerId);

  const filteredLoans = loans
    .filter((l) => {
      if (filterStatus !== 'All' && l.status !== filterStatus) return false;
      const custName = getCust(l)?.name || '';
      const q = searchQuery.toLowerCase();
      return l.serialNo.toLowerCase().includes(q) || custName.toLowerCase().includes(q);
    })
    .sort((a, b) => (b.loanDate < a.loanDate ? -1 : 1));

  const selectedLoan = loans.find((l) => l.id === selectedLoanId);
  const selectedCust = selectedLoan ? getCust(selectedLoan) : null;
  const selectedLv = selectedLoan ? LV(selectedLoan, items) : null;
  const loanChecks = selectedLoan ? checks(selectedLoan, items, rates) : [];
  const loanEvents = selectedLoan ? events.filter((v) => v.loanId === selectedLoan.id) : [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-100">Ledger & Audit Records</h2>
        <p className="text-sm text-slate-400 mt-1">
          Complete ledger of all digitized pledges. Tap any record to view its RBI scorecard, disclosure, and hash-chain audit log.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
          <input
            placeholder="Search name or serial..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-400"
          />
        </div>

        <div className="flex gap-2 self-start sm:self-auto">
          {(['Active', 'Closed', 'All'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                filterStatus === status
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Loan List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {filteredLoans.map((l) => {
          const c = getCust(l);
          const lv = LV(l, items);
          const tierC = cap(l.principal);
          const overCap = lv.ltv != null && lv.ltv > tierC;

          return (
            <div
              key={l.id}
              onClick={() => setSelectedLoanId(l.id)}
              className="bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 hover:border-slate-600 rounded-2xl p-4 cursor-pointer transition shadow-sm space-y-3"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-bold text-base text-slate-100">{c?.name || 'Unknown'}</h4>
                  <p className="text-xs text-slate-400 mt-0.5 font-mono">
                    #{l.serialNo} · {fd(l.loanDate)}
                  </p>
                </div>
                <div className="text-right">
                  <span className="font-bold text-base text-slate-100">{inr(l.currentPrincipal)}</span>
                  <div className="text-[11px] text-slate-400 mt-0.5">{l.interestRate}%/mo</div>
                </div>
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-slate-700/60 text-xs">
                <span className="text-slate-400">
                  {l.src === 'S1' ? 'Digitized (S1)' : 'Imported (S0)'}
                </span>

                <div className="flex items-center gap-1.5">
                  {l.status === 'Active' ? (
                    <span
                      className={`px-2 py-0.5 rounded-full font-bold ${
                        overCap
                          ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                          : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      }`}
                    >
                      LTV {pc(lv.ltv)}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full font-semibold bg-slate-700 text-slate-300">
                      {l.status}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {filteredLoans.length === 0 && (
          <div className="col-span-full p-12 text-center text-sm text-slate-500 bg-slate-800/40 rounded-2xl border border-slate-800">
            No loans match the current filters.
          </div>
        )}
      </div>

      {/* Selected Loan Modal View */}
      {selectedLoan && selectedLv && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex justify-end">
          <div className="w-full max-w-xl bg-slate-900 border-l border-slate-800 h-full overflow-y-auto p-6 space-y-6">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-xl font-bold text-slate-100">
                  {selectedCust?.name} · #{selectedLoan.serialNo}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {selectedCust?.address} · Pledged {fd(selectedLoan.loanDate)} · {selectedLoan.interestRate}%/mo
                </p>
              </div>
              <button
                onClick={() => setSelectedLoanId(null)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
              >
                Close
              </button>
            </div>

            {/* Financial Card */}
            <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-4 space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Principal outstanding:</span>
                <span className="font-semibold text-slate-100">{inr(selectedLoan.currentPrincipal)}</span>
              </div>
              {selectedLoan.disbursed != null && (
                <div className="flex justify-between">
                  <span className="text-slate-400">
                    Cash handed over (after {inr(selectedLoan.upfront)} 1st-mo int):
                  </span>
                  <span className="font-semibold text-emerald-400">{inr(selectedLoan.disbursed)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-400">
                  {selectedLv.d} days ({selectedLv.m} extra month(s)):
                </span>
                <span className="font-semibold text-amber-400">{inr(selectedLv.intr)}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-slate-700/60 font-bold">
                <span>Total to collect today:</span>
                <span className="text-lg text-emerald-400">{inr(selectedLv.dues)}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-400 pt-1">
                <span>Collateral value (at pledge):</span>
                <span>{inr(selectedLv.val)}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-400">
                <span>LTV incl. interest:</span>
                <span>{selectedLoan.status === 'Active' ? pc(selectedLv.ltv) : '—'}</span>
              </div>
            </div>

            {/* RBI Scorecard */}
            {selectedLoan.src === 'S1' && (
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    RBI Compliance Scorecard
                  </h4>
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    {pc(score(selectedLoan, items, rates))}
                  </span>
                </div>

                <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3 divide-y divide-slate-700/60 text-xs">
                  {loanChecks.map(([label, passed], i) => (
                    <div key={i} className="py-2 flex justify-between items-center first:pt-0 last:pb-0">
                      <span className="text-slate-300 pr-2">{label}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full font-bold shrink-0 ${
                          passed
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                        }`}
                      >
                        {passed ? 'PASS' : 'GAP'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Disclosure Buttons */}
            <div className="flex gap-2.5">
              <button
                onClick={() => onOpenDisclosure(selectedLoan.id, 'ta')}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
              >
                <FileText className="w-4 h-4 text-amber-400" />
                <span>Disclosure (தமிழ்)</span>
              </button>
              <button
                onClick={() => onOpenDisclosure(selectedLoan.id, 'en')}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
              >
                <FileText className="w-4 h-4 text-amber-400" />
                <span>Disclosure (English)</span>
              </button>
            </div>

            {/* Tamper-Evident Audit Trail */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Hash-Chained Audit Trail</span>
              </h4>

              <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-3 text-xs divide-y divide-slate-700/60">
                {loanEvents.map((v) => (
                  <div key={v.id} className="py-2 first:pt-0 last:pb-0 flex justify-between items-center">
                    <div>
                      <span className="font-semibold text-slate-200">{v.type}</span>
                      <span className="text-[10px] text-slate-500 font-mono block">
                        hash: {v.hash.slice(0, 12)}... (seq #{v.seq})
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400">{new Date(v.ts).toLocaleString('en-IN')}</span>
                  </div>
                ))}
                {loanEvents.length === 0 && <span className="text-slate-500 py-1 block">No events recorded.</span>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
