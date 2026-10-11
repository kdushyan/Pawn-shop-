import React, { useState } from 'react';
import { Loan, CollateralItem, ShopVisitAudit, MetalRate } from '../types';
import { checks, score, pc, today, fd } from '../utils/rules';
import { uid } from '../utils/crypto';
import { commit } from '../db/indexedDB';
import { BarChart3, Plus, ShieldCheck, Store, Clock } from 'lucide-react';

interface ResearchProps {
  loans: Loan[];
  items: CollateralItem[];
  rates: MetalRate[];
  audits: ShopVisitAudit[];
  onRefresh: () => Promise<void>;
  showToast: (msg: string) => void;
}

export const Research: React.FC<ResearchProps> = ({
  loans,
  items,
  rates,
  audits,
  onRefresh,
  showToast,
}) => {
  const mine = loans.filter((l) => l.src === 'S1');
  const n = mine.length;
  const cs = mine.map((l) => checks(l, items, rates));

  const med = (a: (number | null | undefined)[]) => {
    const valid = a.filter((x): x is number => x != null).sort((x, y) => x - y);
    return valid.length ? valid[valid.length >> 1] : null;
  };

  const avg = (a: (number | null)[]) => {
    const valid = a.filter((x): x is number => x != null);
    return valid.length ? valid.reduce((s, x) => s + x, 0) / valid.length : null;
  };

  const crit = cs[0] ? cs[0].map((c, i) => [c[0], cs.filter((x) => x[i][1]).length] as [string, number]) : [];

  const grp = (m: string) => audits.filter((a) => a.method === m);
  const auditScore = (a: ShopVisitAudit) => a.checks.filter(Boolean).length / a.checks.length;

  const grpStats = (m: string) => {
    const groupItems = grp(m);
    const uniqueShops = new Set(groupItems.map((a) => (a.code || '').trim().toUpperCase())).size;
    const totalLoans = groupItems.reduce((s, a) => s + (a.loans || 1), 0);
    const perShop = uniqueShops ? (totalLoans / uniqueShops % 1 === 0 ? totalLoans / uniqueShops : (totalLoans / uniqueShops).toFixed(1)) : 0;
    const weightedScore = totalLoans
      ? groupItems.reduce((s, a) => s + auditScore(a) * (a.loans || 1), 0) / totalLoans
      : null;
    return {
      uniqueShops,
      totalLoans,
      perShop,
      weightedScore,
      medianSec: med(groupItems.map((a) => a.sec)) ?? '—',
    };
  };

  // Field visit form state
  const rubricTemplate = checks({ id: '', cap: 0.85 }, [], rates);
  const [shopCode, setShopCode] = useState('');
  const [method, setMethod] = useState<'Paper ledger' | 'Other digital'>('Paper ledger');
  const [loanCount, setLoanCount] = useState('1');
  const [visitDate, setVisitDate] = useState(today());
  const [disclosureSec, setDisclosureSec] = useState('');
  const [checkedItems, setCheckedItems] = useState<boolean[]>(new Array(rubricTemplate.length).fill(false));
  const [notes, setNotes] = useState('');

  const handleToggleCheck = (index: number) => {
    setCheckedItems((prev) => {
      const copy = [...prev];
      copy[index] = !copy[index];
      return copy;
    });
  };

  const handleSaveVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shopCode.trim()) {
      showToast('Enter an anonymous shop code');
      return;
    }
    const count = Math.max(1, parseInt(loanCount) || 1);
    const sec = disclosureSec.trim() ? parseInt(disclosureSec) || null : null;

    const newAudit: ShopVisitAudit = {
      id: uid(),
      code: shopCode.trim().toUpperCase(),
      method,
      date: visitDate,
      sec,
      loans: count,
      checks: checkedItems,
      notes: notes.trim(),
    };

    await commit([['audits', newAudit]]);
    await onRefresh();
    setShopCode('');
    setLoanCount('1');
    setDisclosureSec('');
    setCheckedItems(new Array(rubricTemplate.length).fill(false));
    setNotes('');
    showToast('Shop visit logged successfully');
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-100">Research & RBI 2026 Evaluation</h2>
        <p className="text-sm text-slate-400 mt-1">
          Standardized rubric from RBI's Lending Against Gold & Silver Collateral Directions, 2025 (effective 1 Apr 2026).
          Telemetry data is tracked automatically across your digitised shop and comparative field visits.
        </p>
      </div>

      {/* Digitised Shop Rubric Card */}
      <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-5 space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Digitised Shop (This App) — 1 Shop · {n} S1 Loans (N = {n})</span>
          </h3>
          <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            Mean Score: {pc(avg(mine.map((l) => score(l, items, rates))))}
          </span>
        </div>

        <div className="divide-y divide-slate-700/60 text-sm">
          {crit.map(([label, passCount], i) => (
            <div key={i} className="py-2.5 flex justify-between items-center first:pt-0 last:pb-0">
              <span className="text-slate-300 pr-2">{label}</span>
              <span className="font-bold font-mono text-slate-100">
                {passCount} / {n}
              </span>
            </div>
          ))}
          {crit.length === 0 && (
            <div className="py-4 text-center text-slate-500 text-xs">
              Save pledges to populate compliance telemetry.
            </div>
          )}
        </div>

        <div className="pt-3 border-t border-slate-700/60 flex flex-wrap justify-between items-center gap-3 text-xs text-slate-400">
          <div>
            Median seconds (form start → disclosure):{' '}
            <span className="font-bold text-slate-200">{med(mine.map((l) => l.dis?.sec)) ?? '—'}</span>
          </div>
          <div>
            Overall Mean Compliance Score:{' '}
            <span className="font-bold text-emerald-400">{pc(avg(mine.map((l) => score(l, items, rates))))}</span>
          </div>
        </div>
      </div>

      {/* Comparison Table */}
      <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-amber-400" />
          <span>Cross-Sector Field Visit Comparison Matrix</span>
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-700 text-xs font-semibold text-slate-400">
                <th className="py-2.5 px-3">Group</th>
                <th className="py-2.5 px-3">Shops / Loans</th>
                <th className="py-2.5 px-3">Mean Score</th>
                <th className="py-2.5 px-3">Median Sec</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/60">
              <tr className="bg-slate-900/40">
                <td className="py-3 px-3 font-semibold text-slate-200">Digitised (S1)</td>
                <td className="py-3 px-3">
                  <div className="font-semibold text-slate-100">1 shop / {n} loans</div>
                  <div className="text-xs text-slate-400">N = {n} ({n} per shop)</div>
                </td>
                <td className="py-3 px-3 font-bold text-emerald-400">
                  {pc(avg(mine.map((l) => score(l, items, rates))))}
                </td>
                <td className="py-3 px-3 text-slate-300">
                  {med(mine.map((l) => l.dis?.sec)) ?? '—'}
                </td>
              </tr>
              {(['Paper ledger', 'Other digital'] as const).map((m) => {
                const st = grpStats(m);
                return (
                  <tr key={m}>
                    <td className="py-3 px-3 font-semibold text-slate-300">{m}</td>
                    <td className="py-3 px-3">
                      {st.totalLoans ? (
                        <>
                          <div className="font-semibold text-slate-200">
                            {st.uniqueShops} shop{st.uniqueShops > 1 ? 's' : ''} / {st.totalLoans} loans
                          </div>
                          <div className="text-xs text-slate-400">
                            N = {st.totalLoans} ({st.perShop} per shop)
                          </div>
                        </>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3 font-semibold text-slate-200">
                      {pc(st.weightedScore)}
                    </td>
                    <td className="py-3 px-3 text-slate-300">{st.medianSec}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Field Visit Logging Form */}
      <form onSubmit={handleSaveVisit} className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-5 space-y-5">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
          <Store className="w-4 h-4 text-amber-400" />
          <span>Log a Shop Visit (Paper Ledger or Other Digital Shop)</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Shop Code (anonymous)</label>
            <input
              required
              placeholder="e.g. P1, P2"
              value={shopCode}
              onChange={(e) => setShopCode(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 uppercase focus:outline-none focus:border-amber-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Method</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as any)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-400"
            >
              <option value="Paper ledger">Paper ledger</option>
              <option value="Other digital">Other digital</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Observed Loan Count</label>
            <input
              type="number"
              min="1"
              required
              placeholder="e.g. 5"
              value={loanCount}
              onChange={(e) => setLoanCount(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Visit Date</label>
            <input
              type="date"
              value={visitDate}
              onChange={(e) => setVisitDate(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Sec to Produce Disclosure</label>
            <input
              type="number"
              placeholder="optional"
              value={disclosureSec}
              onChange={(e) => setDisclosureSec(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-400"
            />
          </div>
        </div>

        {/* 7 Checkboxes */}
        <div className="space-y-2 pt-2 border-t border-slate-700/60">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
            Observed Compliance Rubric (7 Checks)
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {rubricTemplate.map(([label], i) => (
              <label
                key={i}
                className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-900/60 border border-slate-700/60 hover:border-slate-600 cursor-pointer text-xs text-slate-200 transition"
              >
                <input
                  type="checkbox"
                  checked={checkedItems[i] || false}
                  onChange={() => handleToggleCheck(i)}
                  className="w-4 h-4 mt-0.5 rounded text-amber-500 bg-slate-800 border-slate-700 focus:ring-0 shrink-0 cursor-pointer"
                />
                <span>{label.replace(/\s*\(.*\)/, '')}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1">
            Notes (how LTV is estimated, rate explanation, hidden charges...)
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Document observations regarding APR disclosure and physical pledge receipts..."
            className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm text-slate-100 focus:outline-none focus:border-amber-400"
          />
        </div>

        <button
          type="submit"
          className="px-5 py-2.5 bg-slate-100 hover:bg-white text-slate-950 font-bold rounded-xl text-sm transition"
        >
          Save Shop Visit
        </button>
      </form>

      {/* Recorded Shop Visits List */}
      <div className="space-y-2.5">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Logged Field Visits</h4>
        <div className="space-y-2">
          {audits.map((a) => {
            const sc = auditScore(a);
            return (
              <div
                key={a.id}
                className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3.5 flex flex-wrap justify-between items-center gap-2"
              >
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-bold text-slate-100">{a.code}</span>
                  <span className="text-slate-500">·</span>
                  <span className="text-slate-300">{a.method}</span>
                  <span className="text-slate-500">·</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-300 font-medium">
                    {a.loans || 1} loan{(a.loans || 1) > 1 ? 's' : ''} observed
                  </span>
                  <span className="text-slate-500">·</span>
                  <span className="text-xs text-slate-400">{fd(a.date)}</span>
                </div>
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                    sc >= 0.7
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                  }`}
                >
                  Score {pc(sc)}
                </span>
              </div>
            );
          })}
          {audits.length === 0 && (
            <div className="p-6 text-center text-xs text-slate-500 bg-slate-800/30 rounded-xl border border-slate-800">
              No field visits logged yet. Use the form above to log observations.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
