import React, { useEffect } from 'react';
import { Loan, CollateralItem, Customer } from '../types';
import { T, fd, inr, pc, ch } from '../utils/rules';
import { mkEv } from '../utils/crypto';
import { commit } from '../db/indexedDB';
import { Printer, Globe, X } from 'lucide-react';

interface DisclosureModalProps {
  loan: Loan;
  items: CollateralItem[];
  customer?: Customer;
  currentLang: 'en' | 'ta';
  onToggleLang: () => void;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}

export const DisclosureModal: React.FC<DisclosureModalProps> = ({
  loan,
  items,
  customer,
  currentLang,
  onToggleLang,
  onClose,
  onRefresh,
}) => {
  const L = T[currentLang];
  const loanItems = items.filter((i) => i.loanId === loan.id);

  // Track disclosure event in tamper-evident chain if newly viewed in this language
  useEffect(() => {
    const recordDisclosure = async () => {
      const existingLangs = loan.dis?.langs || [];
      if (!loan.dis || !existingLangs.includes(currentLang)) {
        const startedTime = loan.startedAt ? Date.parse(loan.startedAt) : 0;
        const elapsedSec = startedTime ? (Date.now() - startedTime) / 1000 : null;
        const validSec = elapsedSec != null && elapsedSec < 3600 ? Math.round(elapsedSec) : null;

        const updatedDis = {
          at: loan.dis?.at || new Date().toISOString(),
          sec: loan.dis?.sec ?? validSec,
          langs: [...existingLangs, currentLang],
        };

        const updatedLoan: Loan = {
          ...loan,
          dis: updatedDis,
        };

        const [ev, hd] = await mkEv(loan.id, 'DISCLOSURE', {
          lang: currentLang,
          sec: updatedDis.sec,
        });

        await commit([['loans', updatedLoan], ['events', ev], hd]);
        await onRefresh();
      }
    };
    recordDisclosure();
  }, [loan.id, currentLang]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-3xl rounded-2xl overflow-hidden shadow-2xl my-auto print:m-0 print:border-none print:shadow-none print:w-full print:max-w-none print:bg-white print:text-black">
        {/* Controls (hidden during print) */}
        <div className="p-4 bg-slate-800 border-b border-slate-700 flex justify-between items-center print:hidden">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-white text-slate-950 font-bold text-xs rounded-xl transition shadow-sm"
            >
              <Printer className="w-4 h-4" />
              <span>Print / Save PDF</span>
            </button>

            <button
              onClick={onToggleLang}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold rounded-xl transition"
            >
              <Globe className="w-4 h-4 text-amber-400" />
              <span>{currentLang === 'en' ? 'தமிழ் (Tamil)' : 'English'}</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded-xl transition"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Printable Disclosure Statement */}
        <div className="p-8 text-slate-100 print:text-slate-950 print:p-6 space-y-6 text-sm font-sans bg-slate-900 print:bg-white">
          <div className="border-b border-slate-700 print:border-slate-300 pb-4">
            <h2 className="text-xl font-bold tracking-tight text-slate-100 print:text-slate-900">{L.t}</h2>
            <div className="mt-2 text-xs text-slate-400 print:text-slate-600 space-y-1">
              <div>
                <strong className="text-slate-200 print:text-slate-900">Suba Finance</strong> · {L.d}: {fd(loan.loanDate)} · {L.s}:{' '}
                <span className="font-mono">{loan.serialNo}</span>
              </div>
              <div>
                {L.b}: <strong className="text-slate-200 print:text-slate-900">{customer?.name}</strong>, {customer?.address}
                {customer?.phone && (
                  <span>
                    {' '}· {L.ph}: <strong className="text-slate-200 print:text-slate-900 font-mono">{customer.phone}</strong>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Ornaments Table */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 print:text-slate-600">
              {L.o}
            </h3>
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-700 print:border-slate-300 font-semibold text-slate-400 print:text-slate-600">
                  <th className="py-2">Item Description</th>
                  <th className="py-2">{L.n}</th>
                  <th className="py-2">{L.p}</th>
                  <th className="py-2 text-right">{L.v}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 print:divide-slate-200">
                {loanItems.map((item) => (
                  <tr key={item.id}>
                    <td className="py-2 text-slate-200 print:text-slate-900">
                      {item.description}
                      {item.hallmark === true ? ' (HM)' : item.hallmark === false ? ' (non-HM)' : ''}
                    </td>
                    <td className="py-2 text-slate-300 print:text-slate-700">{item.netWeight ?? ''} g</td>
                    <td className="py-2 text-slate-300 print:text-slate-700">
                      {item.purity
                        ? item.metal === 'gold'
                          ? Math.round(item.purity * 24) + 'K'
                          : item.purity * 100 + '%'
                        : ''}
                    </td>
                    <td className="py-2 text-right font-semibold text-slate-100 print:text-slate-900">
                      {inr(item.value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Financial Breakdown */}
          <div className="bg-slate-800/60 print:bg-slate-50 border border-slate-700/60 print:border-slate-300 rounded-xl p-4 space-y-2 text-xs leading-relaxed">
            <div>
              <strong className="text-sm text-slate-100 print:text-slate-900">
                {L.pr}: {inr(loan.principal)}
              </strong>
            </div>
            {loan.upfront != null && (
              <div>
                {L.up}: {inr(loan.upfront)} · <strong className="text-emerald-400 print:text-emerald-700">{L.cash}: {inr(loan.disbursed)}</strong>
              </div>
            )}
            <div>
              {L.ltv}: {pc(loan.ltv)} · {L.cap}: {pc(loan.cap)}
            </div>
            <div>
              {L.mr}: {loan.interestRate}% · {L.ar}: {(loan.interestRate * 12).toFixed(1)}% · {L.eff}:{' '}
              {((loan.interestRate / (100 - loan.interestRate)) * 100).toFixed(2)}%
            </div>
          </div>

          {/* Grace Period & Rule */}
          <p className="text-xs text-slate-400 print:text-slate-600 leading-relaxed italic">
            {L.gr}
          </p>

          {/* Payment Projection Table */}
          <div className="space-y-2">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-700 print:border-slate-300 font-semibold text-slate-400 print:text-slate-600">
                  <th className="py-2">{L.ex}</th>
                  <th className="py-2 text-right">{L.tot}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 print:divide-slate-200">
                {[1, 3, 6, 12].map((m) => (
                  <tr key={m}>
                    <td className="py-2 text-slate-300 print:text-slate-700">
                      {m} {L.mo}
                    </td>
                    <td className="py-2 text-right font-bold text-slate-100 print:text-slate-900">
                      {inr(loan.principal * (1 + (loan.interestRate / 100) * ch(m * 30)))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Valuation Source */}
          <p className="text-[11px] text-slate-500 print:text-slate-500">
            {L.vm}: {loan.rateGold ? `24K ${inr(loan.rateGold)}` : ''}{' '}
            {loan.rateSilver ? `· 999 ${inr(loan.rateSilver)}` : ''} ({loan.benchSrc || 'IBJA'})
          </p>

          {/* Signatures */}
          <div className="flex justify-between items-end pt-12 text-xs border-t border-slate-800 print:border-slate-300">
            <div className="text-center">
              <div className="w-40 border-b border-slate-600 print:border-slate-400 mb-2" />
              <span className="text-slate-400 print:text-slate-600">{L.sg}</span>
            </div>
            <div className="text-center">
              <div className="w-40 border-b border-slate-600 print:border-slate-400 mb-2" />
              <span className="text-slate-400 print:text-slate-600">{L.lg}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
