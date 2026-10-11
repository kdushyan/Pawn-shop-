import React from 'react';
import { PlusCircle, CornerDownLeft, BookOpen, BarChart3, Database } from 'lucide-react';

export type TabType = 'pledge' | 'redeem' | 'loans' | 'research' | 'data';

interface NavigationProps {
  currentTab: TabType;
  onSelectTab: (tab: TabType) => void;
}

export const Navigation: React.FC<NavigationProps> = ({ currentTab, onSelectTab }) => {
  const tabs = [
    { id: 'pledge', label: 'New Pledge', icon: PlusCircle },
    { id: 'redeem', label: 'Redemption', icon: CornerDownLeft },
    { id: 'loans', label: 'Ledger', icon: BookOpen },
    { id: 'research', label: 'Research', icon: BarChart3 },
    { id: 'data', label: 'Data', icon: Database },
  ] as const;

  return (
    <>
      {/* Desktop Side Navigation */}
      <nav className="hidden md:flex flex-col w-44 bg-slate-900 border-r border-slate-800 p-4 sticky top-0 h-screen gap-2 shrink-0">
        <div className="mb-4 text-center">
          <h1 className="font-bold text-lg text-slate-100 tracking-tight">Suba Finance</h1>
          <small className="text-xs text-slate-400 block mt-0.5">S1 · Krishna Kumar – Kokila</small>
        </div>

        <div className="flex flex-col gap-1.5 flex-1">
          {tabs.map(({ id, label, icon: Icon }) => {
            const active = currentTab === id;
            return (
              <button
                key={id}
                onClick={() => onSelectTab(id)}
                className={`flex flex-col items-center justify-center p-3.5 rounded-xl font-medium text-sm transition-all duration-150 min-h-[72px] gap-1.5 ${
                  active
                    ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Icon className="w-6 h-6 stroke-[1.75]" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-auto pt-3 border-t border-slate-800 text-[11px] text-slate-500 text-center">
          RBI 2026 Compliant
        </div>
      </nav>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur border-t border-slate-800 z-40 px-2 py-1.5 flex justify-around pb-safe">
        {tabs.map(({ id, label, icon: Icon }) => {
          const active = currentTab === id;
          return (
            <button
              key={id}
              onClick={() => onSelectTab(id)}
              className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-lg text-xs font-medium transition-colors flex-1 ${
                active ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="w-5 h-5 mb-0.5" />
              <span className="text-[10px] whitespace-nowrap">{label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
};
