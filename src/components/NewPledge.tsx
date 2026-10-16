import React, { useState, useId, useRef, useEffect } from 'react';
import { Customer, CollateralItem, Loan, MetalRate } from '../types';
import { uid, mkEv } from '../utils/crypto';
import { commit, CommitOp } from '../db/indexedDB';
import {
  today,
  addD,
  fd,
  nextSer,
  bench,
  r2,
  inr,
  pc,
  cap,
  maxLoan,
  PURITY_OPTIONS,
  CFG,
} from '../utils/rules';
import { Plus, Trash2, CheckCircle2, Search, UserPlus, UserCheck, X, Calendar } from 'lucide-react';

interface OrnamentDraft {
  id: string;
  description: string;
  metal: 'gold' | 'silver';
  grossWeight: string;
  hallmark: boolean;
  purity: number;
  principalValue: string;
}

interface NewPledgeProps {
  loans: Loan[];
  customers: Customer[];
  rates: MetalRate[];
  onRefresh: () => Promise<void>;
  onOpenDisclosure: (loanId: string, lang: 'en' | 'ta') => void;
  showToast: (msg: string) => void;
}

export const NewPledge: React.FC<NewPledgeProps> = ({
  loans,
  customers,
  rates,
  onRefresh,
  onOpenDisclosure,
  showToast,
}) => {
  const [customerName, setCustomerName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  const customerDropdownRef = useRef<HTMLDivElement>(null);
  const addressInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        customerDropdownRef.current &&
        !customerDropdownRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const trimmedQuery = customerName.trim().toLowerCase();
  const matchingCustomers = trimmedQuery
    ? customers.filter((c) =>
        c.name.toLowerCase().includes(trimmedQuery) ||
        c.address.toLowerCase().includes(trimmedQuery) ||
        (c.phone && c.phone.includes(trimmedQuery))
      ).slice(0, 8)
    : [];

  const handleSelectCustomer = (c: Customer) => {
    handleStartTyping();
    setSelectedCustomerId(c.id);
    setCustomerName(c.name);
    setAddress(c.address);
    setPhone(c.phone || '');
    setShowDropdown(false);
  };

  const handleAddNewCustomer = () => {
    handleStartTyping();
    setSelectedCustomerId(null);
    setShowDropdown(false);
    addressInputRef.current?.focus();
  };
  const lastLoan = [...loans].sort((a, b) => (b.createdAt < a.createdAt ? -1 : 1))[0];
  const [serialNo, setSerialNo] = useState(lastLoan ? nextSer(lastLoan.serialNo) : '1');
  const [loanDate, setLoanDate] = useState(today());
  const [interestRate, setInterestRate] = useState(2.5);

  const [items, setItems] = useState<OrnamentDraft[]>([
    {
      id: uid(),
      description: '',
      metal: 'gold',
      grossWeight: '',
      hallmark: true,
      purity: 22 / 24,
      principalValue: '',
    },
  ]);

  const [savedLoan, setSavedLoan] = useState<Loan | null>(null);
  const [formStartTime, setFormStartTime] = useState<number | null>(null);

  const handleStartTyping = () => {
    if (!formStartTime) setFormStartTime(Date.now());
  };

  const addOrnament = () => {
    setItems((prev) => [
      ...prev,
      {
        id: uid(),
        description: '',
        metal: 'gold',
        grossWeight: '',
        hallmark: true,
        purity: 22 / 24,
        principalValue: '',
      },
    ]);
  };

  const removeOrnament = (id: string) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const updateOrnament = (id: string, field: keyof OrnamentDraft, val: any) => {
    handleStartTyping();
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        if (field === 'metal') {
          const newMetal = val as 'gold' | 'silver';
          const defaultPurity = newMetal === 'gold' ? 22 / 24 : 0.925;
          return { ...it, metal: newMetal, purity: defaultPurity };
        }
        return { ...it, [field]: val };
      })
    );
  };

  // Calculations
  const calculatedItems = items.map((it) => {
    const b = bench(it.metal, rates, loanDate);
    const g = parseFloat(it.grossWeight) || 0;
    const pu = it.purity || (it.metal === 'gold' ? 22 / 24 : 0.925);
    const assessedVal = b ? r2(g * pu * b.rate) : null;
    const principal = parseFloat(it.principalValue) || 0;
    return {
      ...it,
      rate: b?.rate ?? null,
      assessedVal,
      principal,
    };
  });

  const totalPrincipal = r2(calculatedItems.reduce((acc, it) => acc + it.principal, 0));
  const totalCollateralVal = calculatedItems.reduce((acc, it) => acc + (it.assessedVal || 0), 0);
  const upfrontInterest = r2((totalPrincipal * interestRate) / 100);
  const cashDisbursed = r2(totalPrincipal - upfrontInterest);
  const tierCap = cap(totalPrincipal || 1);
  const ltv = totalCollateralVal ? totalPrincipal / totalCollateralVal : 0;
  const maxEligible = maxLoan(totalCollateralVal);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loans.some((l) => l.serialNo === serialNo.trim())) {
      showToast(`Serial #${serialNo} is already used`);
      return;
    }
    if (!calculatedItems.some((it) => it.principal > 0)) {
      showToast('Add at least one ornament with a loan amount');
      return;
    }

    const trimmedName = customerName.trim();
    const trimmedAddr = address.trim();
    const trimmedPhone = phone.trim();

    let cu: Customer | undefined;
    let newCust = false;

    if (selectedCustomerId) {
      const existing = customers.find((c) => c.id === selectedCustomerId);
      if (existing) {
        cu = {
          ...existing,
          name: trimmedName,
          address: trimmedAddr,
          phone: trimmedPhone || existing.phone,
        };
      }
    }

    if (!cu) {
      const existing = customers.find(
        (c) =>
          c.name.toLowerCase() === trimmedName.toLowerCase() &&
          c.address.toLowerCase() === trimmedAddr.toLowerCase()
      );
      if (existing) {
        cu = {
          ...existing,
          phone: trimmedPhone || existing.phone,
        };
      } else {
        newCust = true;
        cu = {
          id: uid(),
          name: trimmedName,
          address: trimmedAddr,
          ...(trimmedPhone ? { phone: trimmedPhone } : {}),
          createdAt: new Date().toISOString(),
        };
      }
    }

    const bGold = bench('gold', rates, loanDate);
    const bSilver = bench('silver', rates, loanDate);
    const primaryBench = bGold || bSilver;

    const newLoan: Loan = {
      id: uid(),
      customerId: cu.id,
      serialNo: serialNo.trim(),
      loanDate,
      product: [...new Set(calculatedItems.map((i) => i.metal))]
        .map((m) => m[0].toUpperCase() + m.slice(1))
        .join(' & '),
      noOfArticles: calculatedItems.length,
      weight: r2(calculatedItems.reduce((s, i) => s + (parseFloat(i.grossWeight) || 0), 0)),
      interestRate,
      principal: totalPrincipal,
      currentPrincipal: totalPrincipal,
      upfront: upfrontInterest,
      disbursed: cashDisbursed,
      status: 'Active',
      createdAt: new Date().toISOString(),
      closedAt: null,
      src: 'S1',
      rule: 'S0-32d',
      cfg: CFG.ver,
      value: r2(totalCollateralVal),
      ltv: totalCollateralVal ? totalPrincipal / totalCollateralVal : null,
      cap: tierCap,
      benchFresh: primaryBench?.fresh,
      benchN: primaryBench?.n || 0,
      benchSrc: primaryBench?.src,
      rateGold: bGold?.rate ?? null,
      rateSilver: bSilver?.rate ?? null,
      saveSec: formStartTime ? Math.round((Date.now() - formStartTime) / 1000) : 0,
      startedAt: formStartTime ? new Date(formStartTime).toISOString() : new Date().toISOString(),
    };

    const [ev, hd] = await mkEv(newLoan.id, 'ISSUE', {
      principal: totalPrincipal,
      upfront: upfrontInterest,
      ltv: newLoan.ltv,
      cap: newLoan.cap,
    });

    const ops: CommitOp[] = [['loans', newLoan]];
    if (newCust || trimmedPhone || (selectedCustomerId && cu)) {
      ops.push(['customers', cu]);
    }
    calculatedItems.forEach((i) => {
      ops.push([
        'items',
        {
          id: uid(),
          loanId: newLoan.id,
          description: i.description.trim() || 'Ornament',
          metal: i.metal,
          grossWeight: parseFloat(i.grossWeight) || 0,
          hallmark: i.hallmark,
          netWeight: r2(parseFloat(i.grossWeight) || 0),
          purity: i.purity,
          principalValue: i.principal,
          rate: i.rate,
          value: i.assessedVal,
        },
      ]);
    });
    ops.push(['events', ev]);
    ops.push(hd);

    await commit(ops);
    await onRefresh();
    setSavedLoan(newLoan);
    setSelectedCustomerId(null);
    setCustomerName('');
    setAddress('');
    setPhone('');
    setSerialNo(nextSer(newLoan.serialNo));
    setItems([
      {
        id: uid(),
        description: '',
        metal: 'gold',
        grossWeight: '',
        hallmark: true,
        purity: 22 / 24,
        principalValue: '',
      },
    ]);
    setFormStartTime(null);
    showToast(`Saved #${newLoan.serialNo} — next serial ${nextSer(newLoan.serialNo)}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-100">New Pledge</h2>
        <p className="text-sm text-slate-400 mt-1">
          Gold & silver ornaments only. Verified against RBI 2026 tiered LTV standards.
        </p>
      </div>

      {/* Success Banner */}
      {savedLoan && (
        <div className="bg-emerald-500/15 border border-emerald-500/30 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-200">
                Saved #{savedLoan.serialNo} · Cash handed over {inr(savedLoan.disbursed)}
              </p>
              <p className="text-xs text-emerald-400/80">Issue timestamp chained to audit log</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onOpenDisclosure(savedLoan.id, 'ta')}
              className="px-3 py-1.5 bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 text-xs font-semibold rounded-xl border border-emerald-500/30 transition"
            >
              Disclosure (தமிழ்)
            </button>
            <button
              onClick={() => onOpenDisclosure(savedLoan.id, 'en')}
              className="px-3 py-1.5 bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 text-xs font-semibold rounded-xl border border-emerald-500/30 transition"
            >
              Disclosure (English)
            </button>
          </div>
        </div>
      )}

      {/* Pledge Form */}
      <form onSubmit={handleSubmit} className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-5 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
          <div className="relative" ref={customerDropdownRef}>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-xs font-semibold text-slate-400">Customer Name</label>
              {selectedCustomerId && (
                <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20 flex items-center gap-1">
                  <UserCheck className="w-3 h-3" /> Linked
                </span>
              )}
            </div>
            <div className="relative">
              <input
                required
                placeholder="Search or enter customer name..."
                value={customerName}
                onChange={(e) => {
                  handleStartTyping();
                  setCustomerName(e.target.value);
                  setSelectedCustomerId(null);
                  setShowDropdown(true);
                }}
                onFocus={() => {
                  if (customerName.trim().length > 0) setShowDropdown(true);
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-8 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-amber-400"
              />
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3 pointer-events-none" />
              {customerName && (
                <button
                  type="button"
                  onClick={() => {
                    setCustomerName('');
                    setSelectedCustomerId(null);
                    setShowDropdown(false);
                  }}
                  className="absolute right-2.5 top-2.5 p-0.5 text-slate-500 hover:text-slate-300 rounded"
                  title="Clear"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Customer Search & Auto-Fill Dropdown */}
            {showDropdown && customerName.trim().length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1.5 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-30 overflow-hidden max-h-64 overflow-y-auto divide-y divide-slate-800">
                {matchingCustomers.length > 0 ? (
                  <>
                    <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider font-bold text-slate-400 bg-slate-800/80 flex items-center justify-between">
                      <span>Matching Customers ({matchingCustomers.length})</span>
                      <span className="text-slate-500 font-normal">Click to auto-fill</span>
                    </div>
                    {matchingCustomers.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleSelectCustomer(c)}
                        className="w-full text-left px-3 py-2.5 hover:bg-slate-800 transition flex items-start justify-between gap-2 group"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-100 group-hover:text-amber-300 transition truncate flex items-center gap-1.5">
                            <span>{c.name}</span>
                          </div>
                          <div className="text-xs text-slate-400 truncate mt-0.5">
                            {c.address}
                          </div>
                        </div>
                        {c.phone && (
                          <span className="text-[11px] font-mono text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/60 shrink-0">
                            {c.phone}
                          </span>
                        )}
                      </button>
                    ))}
                    <div className="p-2 bg-slate-950/60 border-t border-slate-800">
                      <button
                        type="button"
                        onClick={handleAddNewCustomer}
                        className="w-full py-1.5 px-3 text-xs font-semibold text-amber-400 hover:text-amber-300 hover:bg-amber-400/10 rounded-lg transition flex items-center justify-center gap-1.5"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Add "{customerName.trim()}" as New Customer</span>
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="p-3 text-center space-y-2 bg-slate-900">
                    <p className="text-xs text-slate-400">
                      No matching customer found for <strong className="text-slate-200 font-medium">"{customerName.trim()}"</strong>
                    </p>
                    <button
                      type="button"
                      onClick={handleAddNewCustomer}
                      className="w-full py-2 px-3 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <UserPlus className="w-4 h-4" />
                      <span>Add New Customer</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Address</label>
            <input
              ref={addressInputRef}
              required
              placeholder="e.g. 14 South St, Salem"
              value={address}
              onChange={(e) => {
                handleStartTyping();
                setAddress(e.target.value);
              }}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-amber-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Customer Mobile Number <span className="text-slate-500 font-normal">(Optional)</span>
            </label>
            <input
              type="tel"
              placeholder="e.g. 9876543210"
              value={phone}
              onChange={(e) => {
                handleStartTyping();
                setPhone(e.target.value);
              }}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-amber-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Serial No. (auto)</label>
            <input
              required
              value={serialNo}
              onChange={(e) => setSerialNo(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-amber-400 font-mono"
            />
          </div>
          {/* Multi-Date Provision & Date Tabs */}
          <div className="space-y-1.5 md:col-span-2">
            <div className="flex justify-between items-center">
              <label className="block text-xs font-semibold text-slate-400">Pledge Date</label>
              <span
                className={`text-[11px] font-mono font-medium px-2 py-0.5 rounded-full ${
                  loanDate === today()
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : loanDate < today()
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                }`}
              >
                {loanDate === today()
                  ? '● Today'
                  : loanDate === addD(today(), -1)
                  ? '● Yesterday'
                  : '● Custom Date'}
                : {fd(loanDate)}
              </span>
            </div>

            <div className="flex flex-wrap sm:flex-nowrap gap-2 items-center">
              {/* Quick Multi-Date Tabs */}
              <div className="inline-flex p-1 bg-slate-900 border border-slate-700 rounded-xl shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    handleStartTyping();
                    setLoanDate(today());
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    loanDate === today()
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleStartTyping();
                    setLoanDate(addD(today(), -1));
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    loanDate === addD(today(), -1)
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Yesterday
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleStartTyping();
                    if (loanDate === today() || loanDate === addD(today(), -1)) {
                      setLoanDate(addD(today(), -2));
                    }
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    loanDate !== today() && loanDate !== addD(today(), -1)
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Any Date
                </button>
              </div>

              {/* Exact Date Picker Input */}
              <div className="relative flex-1 min-w-[160px]">
                <input
                  type="date"
                  value={loanDate}
                  onChange={(e) => {
                    handleStartTyping();
                    if (e.target.value) setLoanDate(e.target.value);
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-400 cursor-pointer"
                  title="Select any pledge date"
                />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Interest % / Month</label>
            <select
              value={interestRate}
              onChange={(e) => setInterestRate(parseFloat(e.target.value))}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-amber-400"
            >
              {[2, 2.5, 3, 5].map((r) => (
                <option key={r} value={r}>
                  {r}% / mo
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Ornaments Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Pledged Ornaments</h3>
            <button
              type="button"
              onClick={addOrnament}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-xl text-xs font-semibold hover:bg-amber-500/25 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Ornament</span>
            </button>
          </div>

          <div className="space-y-3">
            {items.map((it, idx) => {
              const calcIt = calculatedItems[idx];
              return (
                <div
                  key={it.id}
                  className="bg-slate-900/70 border border-slate-700/60 rounded-xl p-4 space-y-3 transition-all hover:border-slate-600 shadow-sm"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-2.5 items-end">
                    <div className="md:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">Description</label>
                      <input
                        placeholder="e.g. Gold bangle, necklace"
                        value={it.description}
                        onChange={(e) => updateOrnament(it.id, 'description', e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-amber-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">Metal</label>
                      <select
                        value={it.metal}
                        onChange={(e) => updateOrnament(it.id, 'metal', e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-amber-400"
                      >
                        <option value="gold">Gold</option>
                        <option value="silver">Silver</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">Weight (g)</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={it.grossWeight}
                        onChange={(e) => updateOrnament(it.id, 'grossWeight', e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-amber-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">Hallmark</label>
                      <select
                        value={it.hallmark ? '1' : '0'}
                        onChange={(e) => updateOrnament(it.id, 'hallmark', e.target.value === '1')}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-amber-400"
                      >
                        <option value="1">Hallmarked (HM)</option>
                        <option value="0">Non-hallmarked</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">Purity</label>
                      <select
                        value={it.purity}
                        onChange={(e) => updateOrnament(it.id, 'purity', parseFloat(e.target.value))}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-amber-400"
                      >
                        {PURITY_OPTIONS[it.metal].map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between pt-2 border-t border-slate-800/80 gap-3">
                    <div className="text-xs text-slate-400">
                      Assessed collateral:{' '}
                      <span className="font-semibold text-slate-200">
                        {calcIt?.assessedVal != null ? inr(calcIt.assessedVal) : '—'}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* ENLARGED LOAN AMOUNT INPUT */}
                      <div className="flex items-center gap-2 bg-slate-950/80 p-1.5 sm:p-2 rounded-xl border border-slate-700 shadow-sm">
                        <label className="text-xs font-bold text-amber-400 whitespace-nowrap pl-1">
                          Loan Amount (₹):
                        </label>
                        <div className="relative flex items-center">
                          <input
                            type="number"
                            placeholder="0"
                            value={it.principalValue}
                            onChange={(e) => updateOrnament(it.id, 'principalValue', e.target.value)}
                            className="w-36 sm:w-48 bg-slate-900 border-2 border-amber-500/40 focus:border-amber-400 rounded-lg px-3 py-1.5 text-base sm:text-lg font-bold text-amber-300 font-mono focus:outline-none shadow-inner"
                          />
                        </div>
                        {calcIt.principal > 0 && (
                          <span className="hidden sm:inline text-xs font-mono font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">
                            {inr(calcIt.principal)}
                          </span>
                        )}
                      </div>

                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeOrnament(it.id)}
                          className="p-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl transition"
                          title="Remove item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Real-Time Assessment & LTV Metrics with Enlarged Loan Display */}
        <div className="bg-slate-900 border border-slate-700/80 rounded-2xl p-5 space-y-3.5">
          <div className="flex justify-between items-center text-sm py-1.5 border-b border-slate-800">
            <span className="text-slate-400">Collateral value (benchmark):</span>
            <span className="font-semibold text-slate-100 text-base">{inr(totalCollateralVal)}</span>
          </div>

          {/* Prominently Enlarged Total Loan Amount */}
          <div className="flex justify-between items-center py-2.5 px-3 rounded-xl bg-amber-500/10 border border-amber-500/25">
            <div>
              <span className="block text-xs uppercase tracking-wider font-bold text-amber-400">
                Principal (Total Loan Amount)
              </span>
              <span className="text-[11px] text-slate-400">Total requested pledge value</span>
            </div>
            <span className="font-black text-2xl sm:text-3xl text-amber-300 font-mono tracking-tight">
              {inr(totalPrincipal)}
            </span>
          </div>

          <div className="flex justify-between items-center py-2.5 px-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
            <div>
              <span className="block text-xs uppercase tracking-wider font-bold text-emerald-400">
                Cash Handed to Customer
              </span>
              <span className="text-[11px] text-slate-400">
                After 1st-mo upfront interest ({inr(upfrontInterest)})
              </span>
            </div>
            <span className="font-black text-2xl sm:text-3xl text-emerald-400 font-mono tracking-tight">
              {inr(cashDisbursed)}
            </span>
          </div>

          <div className="flex justify-between items-center text-sm py-1.5 border-b border-slate-800">
            <span className="text-slate-400">Max eligible loan (RBI tier rule):</span>
            <span className="font-semibold text-slate-200">{inr(maxEligible)}</span>
          </div>

          {/* LTV Bar */}
          <div className="pt-2">
            <div className="h-2.5 bg-slate-800 rounded-full relative overflow-visible my-2">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  ltv > tierCap ? 'bg-rose-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(ltv, 1) * 100}%` }}
              />
              <div
                className="absolute top-[-3px] w-0.5 h-4 bg-slate-100"
                style={{ left: `${tierCap * 100}%` }}
                title={`Tier cap: ${pc(tierCap)}`}
              />
            </div>
            <div className="flex justify-between items-center text-xs text-slate-400 mt-1.5">
              <span>
                LTV {pc(ltv)} · Cap {pc(tierCap)}
              </span>
              <span
                className={`px-2 py-0.5 rounded-full font-bold ${
                  ltv > tierCap
                    ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                    : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                }`}
              >
                {ltv > tierCap ? 'OVER CAP' : 'WITHIN CAP'}
              </span>
            </div>
          </div>
        </div>

        <button
          type="submit"
          className="w-full py-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-lg shadow-lg hover:shadow-amber-500/20 transition duration-150 active:scale-[0.99] flex items-center justify-center gap-2"
        >
          <span>Save Pledge</span>
        </button>
      </form>
    </div>
  );
};
