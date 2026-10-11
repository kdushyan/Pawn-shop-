import React, { useState, useEffect } from 'react';
import JSZip from 'jszip';
import Papa from 'papaparse';
import { AppState } from '../types';
import { MIG, commit, getOne } from '../db/indexedDB';
import { uid, sha, verifyAuditTrail } from '../utils/crypto';
import { checks, score, today, fd, CFG } from '../utils/rules';
import { Download, Upload, ShieldCheck, CheckCircle2, AlertTriangle, HardDrive } from 'lucide-react';

interface DataManagementProps {
  appState: AppState;
  onRefresh: () => Promise<void>;
  showToast: (msg: string) => void;
}

export const DataManagement: React.FC<DataManagementProps> = ({
  appState,
  onRefresh,
  showToast,
}) => {
  const [verificationResult, setVerificationResult] = useState<string | null>(null);
  const [storageStatus, setStorageStatus] = useState<string>('Checking...');

  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
      navigator.storage.persist().then((persisted) => {
        setStorageStatus(
          persisted
            ? 'Protected from automatic browser clean-up (Persistent Storage enabled)'
            : 'Standard storage (Browser may clear if low on disk space — backup regularly)'
        );
      });
    } else {
      setStorageStatus('Standard browser storage');
    }
  }, []);

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const handleExportAll = async () => {
    const backupData = {
      customers: appState.customers,
      loans: appState.loans,
      items: appState.items,
      events: appState.events,
      rates: appState.rates,
      audits: appState.audits,
    };
    const jsonStr = JSON.stringify(
      {
        schema: 'suba-s1',
        dbVersion: MIG.length,
        exportedAt: new Date().toISOString(),
        data: backupData,
      },
      null,
      2
    );
    const blob = new Blob([jsonStr], { type: 'application/json' });
    downloadBlob(blob, `suba-s1-backup-${today()}.json`);

    await commit([['meta', { k: 'lastBackup', v: new Date().toISOString() }]]);
    await onRefresh();
    showToast('Full backup downloaded');
  };

  const handleExportResearchBundle = async () => {
    let salt = appState.meta.salt;
    if (!salt) {
      salt = uid();
      await commit([['meta', { k: 'salt', v: salt }]]);
    }

    const rows = [];
    for (const l of appState.loans.filter((x) => x.src === 'S1')) {
      const c = checks(l, appState.items, appState.rates);
      const cu = appState.customers.find((x) => x.id === l.customerId);
      const loanHash = (await sha(salt + l.id)).slice(0, 8);
      const custHash = (await sha(salt + (cu?.name || '') + (cu?.address || ''))).slice(0, 8);
      const loanItems = appState.items.filter((i) => i.loanId === l.id);
      const hmCount = loanItems.filter((i) => i.hallmark).length;

      rows.push({
        loan: loanHash,
        cust: custHash,
        date: l.loanDate,
        product: l.product,
        principal: l.principal,
        value: l.value,
        ltv: l.ltv,
        cap: l.cap,
        rate_pm: l.interestRate,
        hallmarked_items: `${hmCount}/${loanItems.length}`,
        upfront: l.upfront,
        disbursed: l.disbursed,
        bench_days: l.benchN,
        save_sec: l.saveSec,
        disclosure_sec: l.dis?.sec,
        langs: (l.dis?.langs || []).join('+'),
        score: score(l, appState.items, appState.rates),
        ...Object.fromEntries(c.map((x, i) => ['c' + (i + 1), +x[1]])),
      });
    }

    const zip = new JSZip();
    zip.file('digital_loans_anonymised.csv', Papa.unparse(rows));
    zip.file(
      'shop_visits.csv',
      Papa.unparse(
        appState.audits.map((a) => ({
          id: a.id,
          code: a.code,
          method: a.method,
          date: a.date,
          loans_observed: a.loans || 1,
          sec_disclosure: a.sec,
          checks: a.checks.map(Number).join(''),
          notes: a.notes,
        }))
      )
    );
    const rubricTxt =
      checks({ id: '', cap: 0.85 }, [], appState.rates)
        .map((c, i) => `c${i + 1}: ${c[0]}`)
        .join('\n') +
      '\nConfig: ' +
      JSON.stringify(CFG);
    zip.file('rubric.txt', rubricTxt);

    const blob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(blob, `suba-research-${today()}.zip`);
    showToast('Research ZIP bundle downloaded');
  };

  const handleVerifyChain = async () => {
    const res = await verifyAuditTrail();
    if (res.bad > 0) {
      setVerificationResult(`FAIL: ${res.bad} of ${res.n} audit events failed hash verification!`);
    } else {
      setVerificationResult(`PASS: All ${res.n} event hashes verified intact from genesis to head.`);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      let importedCount = 0;
      const addIfMissing = async (store: string, obj: any) => {
        const existing = await getOne(store, obj.id);
        if (!existing) {
          await commit([[store, obj]]);
          importedCount++;
        }
      };

      if (/\.json$/i.test(file.name)) {
        const text = await file.text();
        const json = JSON.parse(text);
        if (json.schema !== 'suba-s1') {
          showToast('Invalid backup file schema');
          return;
        }
        for (const storeName of ['customers', 'loans', 'items', 'events', 'rates', 'audits']) {
          if (Array.isArray(json.data?.[storeName])) {
            for (const item of json.data[storeName]) {
              await addIfMissing(storeName, item);
            }
          }
        }
      } else if (/\.zip$/i.test(file.name)) {
        const zip = await JSZip.loadAsync(file);
        const readCsv = async (name: string) => {
          const f = zip.file(name);
          if (!f) return [];
          const text = await f.async('string');
          return Papa.parse<any>(text, { header: true, dynamicTyping: true, skipEmptyLines: true }).data;
        };

        const custs = await readCsv('customers.csv');
        for (const c of custs) await addIfMissing('customers', c);

        const loansData = await readCsv('loans.csv');
        for (const l of loansData) await addIfMissing('loans', { ...l, src: 'S0', rule: 'S0-32d' });

        const itemsData = await readCsv('collateral.csv');
        for (const it of itemsData) {
          const parentLoan = loansData.find((l) => l.id === it.loanId);
          const isSilver = /silver/i.test(parentLoan?.product) && !/gold/i.test(parentLoan?.product);
          await addIfMissing('items', {
            ...it,
            metal: isSilver ? 'silver' : 'gold',
            netWeight: null,
            purity: null,
            legacy: true,
          });
        }
      } else {
        showToast('Unsupported file type. Please upload .json or .zip');
        return;
      }

      await onRefresh();
      showToast(`Imported ${importedCount} records successfully`);
    } catch (err: any) {
      showToast('Import failed: ' + err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-100">Data & Backup Management</h2>
        <p className="text-sm text-slate-400 mt-1">
          Everything runs entirely local and client-side inside this browser's IndexedDB. Export backups regularly to safeguard data.
        </p>
      </div>

      {/* Storage Health */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4.5 space-y-1">
          <span className="text-xs font-semibold text-slate-400">Total Digitised Pledges</span>
          <div className="text-2xl font-bold text-slate-100">{appState.loans.length}</div>
          <span className="text-xs text-slate-500 font-mono">
            {appState.loans.filter((l) => l.status === 'Active').length} currently active
          </span>
        </div>

        <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4.5 space-y-1">
          <span className="text-xs font-semibold text-slate-400">Tamper-Evident Audit Events</span>
          <div className="text-2xl font-bold text-slate-100">{appState.events.length}</div>
          <span className="text-xs text-slate-500 font-mono">SHA-256 hash-chain verified</span>
        </div>

        <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4.5 space-y-1">
          <span className="text-xs font-semibold text-slate-400">Last Full Backup</span>
          <div className="text-2xl font-bold text-slate-100">
            {appState.meta.lastBackup ? fd(appState.meta.lastBackup) : 'Never'}
          </div>
          <span className="text-xs text-slate-500">Local JSON snapshot</span>
        </div>
      </div>

      {/* Action Card */}
      <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">Export & Audit Actions</h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={handleExportAll}
            className="flex items-center justify-center gap-2 py-3.5 px-4 bg-slate-100 hover:bg-white text-slate-950 font-bold rounded-xl text-sm transition shadow-sm"
          >
            <Download className="w-4 h-4" />
            <span>Full Backup (.json)</span>
          </button>

          <button
            onClick={handleExportResearchBundle}
            className="flex items-center justify-center gap-2 py-3.5 px-4 bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30 font-bold rounded-xl text-sm transition"
          >
            <Download className="w-4 h-4" />
            <span>Research Bundle (.zip)</span>
          </button>

          <button
            onClick={handleVerifyChain}
            className="flex items-center justify-center gap-2 py-3.5 px-4 bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold rounded-xl text-sm transition"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Verify Audit Chain</span>
          </button>
        </div>

        {verificationResult && (
          <div
            className={`p-3.5 rounded-xl border text-xs font-medium flex items-center gap-2 ${
              verificationResult.startsWith('PASS')
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
            }`}
          >
            {verificationResult.startsWith('PASS') ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{verificationResult}</span>
          </div>
        )}
      </div>

      {/* Restore / Import */}
      <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-5 space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
          <Upload className="w-4 h-4 text-slate-400" />
          <span>Restore / Import Data</span>
        </h3>
        <p className="text-xs text-slate-400">
          Accepts an S1 backup (.json) or the legacy S0 "Export Backup" ZIP. Existing records are never overwritten.
        </p>
        <input
          type="file"
          accept=".json,.zip"
          onChange={handleImportFile}
          className="block w-full text-xs text-slate-400 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-slate-700 file:text-slate-200 hover:file:bg-slate-600 cursor-pointer"
        />
      </div>

      {/* Persistence Note */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center gap-3 text-xs text-slate-400">
        <HardDrive className="w-4 h-4 text-slate-500 shrink-0" />
        <div>
          <span className="font-semibold text-slate-300">IndexedDB Status: </span>
          {storageStatus}
        </div>
      </div>
    </div>
  );
};
