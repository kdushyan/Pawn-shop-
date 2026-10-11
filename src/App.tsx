import React, { useState, useEffect, useCallback } from 'react';
import { AppState } from './types';
import { getAll, getOne, openDB } from './db/indexedDB';
import { Navigation, TabType } from './components/Navigation';
import { NewPledge } from './components/NewPledge';
import { Redemption } from './components/Redemption';
import { Ledger } from './components/Ledger';
import { Research } from './components/Research';
import { DataManagement } from './components/DataManagement';
import { DisclosureModal } from './components/DisclosureModal';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<TabType>('pledge');
  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [activeDisclosure, setActiveDisclosure] = useState<{
    loanId: string;
    lang: 'en' | 'ta';
  } | null>(null);

  const [appState, setAppState] = useState<AppState>({
    loans: [],
    items: [],
    customers: [],
    rates: [],
    audits: [],
    events: [],
    meta: {},
  });

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2800);
  }, []);

  const refreshData = useCallback(async () => {
    try {
      await openDB();
      const [loans, items, customers, rates, audits, events, lastBackupMeta, saltMeta, headMeta] =
        await Promise.all([
          getAll('loans'),
          getAll('items'),
          getAll('customers'),
          getAll('rates'),
          getAll('audits'),
          getAll('events'),
          getOne('meta', 'lastBackup'),
          getOne('meta', 'salt'),
          getOne('meta', 'head'),
        ]);

      events.sort((a, b) => b.seq - a.seq);

      setAppState({
        loans,
        items,
        customers,
        rates,
        audits,
        events,
        meta: {
          lastBackup: lastBackupMeta?.v,
          salt: saltMeta?.v,
          head: headMeta?.v,
        },
      });
    } catch (err) {
      console.error('Error refreshing IndexedDB state:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const handleOpenDisclosure = (loanId: string, lang: 'en' | 'ta') => {
    setActiveDisclosure({ loanId, lang });
  };

  const handleToggleDisclosureLang = () => {
    setActiveDisclosure((prev) =>
      prev ? { ...prev, lang: prev.lang === 'en' ? 'ta' : 'en' } : null
    );
  };

  const disclosureLoan = activeDisclosure
    ? appState.loans.find((l) => l.id === activeDisclosure.loanId)
    : null;
  const disclosureCustomer = disclosureLoan
    ? appState.customers.find((c) => c.id === disclosureLoan.customerId)
    : undefined;

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Navigation */}
      <Navigation currentTab={currentTab} onSelectTab={setCurrentTab} />

      {/* Main Content Area */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto w-full pb-28 md:pb-12">
        {loading ? (
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-slate-400 text-sm font-medium animate-pulse">
              Loading Suba Finance local database...
            </div>
          </div>
        ) : (
          <>
            {currentTab === 'pledge' && (
              <NewPledge
                loans={appState.loans}
                customers={appState.customers}
                rates={appState.rates}
                onRefresh={refreshData}
                onOpenDisclosure={handleOpenDisclosure}
                showToast={showToast}
              />
            )}

            {currentTab === 'redeem' && (
              <Redemption
                loans={appState.loans}
                items={appState.items}
                customers={appState.customers}
                onRefresh={refreshData}
                showToast={showToast}
              />
            )}

            {currentTab === 'loans' && (
              <Ledger
                loans={appState.loans}
                items={appState.items}
                customers={appState.customers}
                events={appState.events}
                rates={appState.rates}
                onOpenDisclosure={handleOpenDisclosure}
              />
            )}

            {currentTab === 'research' && (
              <Research
                loans={appState.loans}
                items={appState.items}
                rates={appState.rates}
                audits={appState.audits}
                onRefresh={refreshData}
                showToast={showToast}
              />
            )}

            {currentTab === 'data' && (
              <DataManagement
                appState={appState}
                onRefresh={refreshData}
                showToast={showToast}
              />
            )}
          </>
        )}
      </main>

      {/* Printable Bilingual Disclosure Modal */}
      {disclosureLoan && activeDisclosure && (
        <DisclosureModal
          loan={disclosureLoan}
          items={appState.items}
          customer={disclosureCustomer}
          currentLang={activeDisclosure.lang}
          onToggleLang={handleToggleDisclosureLang}
          onClose={() => setActiveDisclosure(null)}
          onRefresh={refreshData}
        />
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-20 md:bottom-8 bg-slate-100 text-slate-950 font-semibold px-4 py-2.5 rounded-xl shadow-2xl text-xs z-50 animate-fade-in border border-slate-300">
          {toastMessage}
        </div>
      )}
    </div>
  );
};
export default App;
