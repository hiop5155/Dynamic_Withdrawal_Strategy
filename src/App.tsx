import { useState, useMemo, useEffect, useRef } from 'react';
import {
  Plus,
  Trash2,
  TrendingUp,
  DollarSign,
  BarChart3,
  Info,
  RefreshCw,
  Wallet,
  Coins
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';

// --- Types ---
interface StockItem {
  id: string;
  ticker: string;
  name: string; // Optional user note
  quantity: number;
  price: number;
  isEstimate?: boolean;
}

interface InvestmentTarget {
  id: string;
  name: string;
  monthlyAmount: number;
  returnRate: number;
}

interface ProjectionParams {
  initialReturnRate: number;
  years: number;
  targets: InvestmentTarget[];
}

interface YearlyResult {
  year: number;
  principal: number;
  interest: number;
  total: number;
  monthlyIncome?: number;
}

// --- Constants ---

const PRICE_DATABASE: Record<string, number> = {

};

// --- Helper Components ---
const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl shadow-sm ${className}`}>
    {children}
  </div>
);

const Badge = ({ children, variant = 'default' }: { children: React.ReactNode; variant?: 'default' | 'outline' | 'success' }) => {
  const styles = {
    default: 'bg-zinc-800 text-zinc-300',
    outline: 'border border-zinc-700 text-zinc-400',
    success: 'bg-emerald-950/30 text-emerald-400 border border-emerald-900/50',
  };
  return (
    <span className={`px-2 py-0.5 text-[10px] uppercase tracking-wider rounded-md font-medium ${styles[variant]}`}>
      {children}
    </span>
  );
};

const AssetCalculator = () => {
  // --- State ---
  const [portfolio, setPortfolio] = useState<StockItem[]>([
  ]);

  const [projection, setProjection] = useState<ProjectionParams>({
    initialReturnRate: 6, // For existing portfolio (Conservative/Dividend)
    years: 10,
    targets: [
      { id: '1', name: '', monthlyAmount: 3000, returnRate: 20 },
    ]
  });

  const [tickerInput, setTickerInput] = useState('');
  const [qtyInput, setQtyInput] = useState('');
  const [isFetching, setIsFetching] = useState(false);

  // --- Chart Resize Logic ---
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [chartSize, setChartSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const observeTarget = chartContainerRef.current;
    if (!observeTarget) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setChartSize({ width, height });
        }
      }
    });

    resizeObserver.observe(observeTarget);
    return () => resizeObserver.disconnect();
  }, []);

  const SUFFIX_OVERRIDES: Record<string, string> = {
    '00937B': '.TWO',
    '00675L': '.TW',
    '00929': '.TW',
    // Add others if needed
  };

  // --- Logic ---
  const getStockPrice = async (ticker: string): Promise<{ price: number, isEstimate: boolean }> => {
    const cleanTicker = ticker.trim().toUpperCase();

    // Determine the best suffix strategy
    let primarySymbol = cleanTicker.includes('.') ? cleanTicker : `${cleanTicker}.TW`;
    let secondarySymbol: string | null = null;

    if (!cleanTicker.includes('.')) {
      if (SUFFIX_OVERRIDES[cleanTicker]) {
        primarySymbol = `${cleanTicker}${SUFFIX_OVERRIDES[cleanTicker]}`;
      } else {
        // Default strategy: Try TW, then TWO
        primarySymbol = `${cleanTicker}.TW`;
        secondarySymbol = `${cleanTicker}.TWO`;
      }
    }

    const tryFetch = async (sym: string) => {
      try {
        // [FIX]: Switch from allorigins to corsproxy.io for better Yahoo compatibility
        const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1d`;

        // 使用 corsproxy.io，它目前對 Yahoo Finance 的支援度較好
        const fetchUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;

        const response = await fetch(fetchUrl);

        // Handle specific HTTP errors
        if (response.status === 404) return null;
        if (response.status === 429) {
          console.warn(`Rate Limited (429) for ${sym}`);
          return null;
        }
        if (!response.ok) throw new Error(`Status ${response.status}`);

        const data = await response.json();
        const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;

        if (typeof price === 'number') return price;
      } catch (e) {
        // Silent fail allows fallback to database
        console.warn(`Fetch failed for ${sym} via proxy:`, e);
      }
      return null;
    };

    // 1. Try Primary
    let livePrice = await tryFetch(primarySymbol);

    // 2. Try Secondary (if exists and primary failed)
    if (livePrice === null && secondarySymbol) {
      // Small delay before retry to be nice
      await new Promise(r => setTimeout(r, 500));
      livePrice = await tryFetch(secondarySymbol);
    }

    if (livePrice !== null) return { price: livePrice, isEstimate: false };

    // 3. Fallback to Database
    const keysToCheck = [cleanTicker, `${cleanTicker}.TW`, `${cleanTicker}.TWO`];
    for (const key of keysToCheck) {
      if (PRICE_DATABASE[key]) return { price: PRICE_DATABASE[key], isEstimate: true };
    }

    return { price: 0, isEstimate: true };
  };

  const updateAllPrices = async () => {
    setIsFetching(true);
    const updatedPortfolio = [...portfolio];

    // Sequential updates with delay to prevent 429
    for (let i = 0; i < updatedPortfolio.length; i++) {
      const item = updatedPortfolio[i];
      // 1.5 second delay between requests to be extra safe with the public proxy
      if (i > 0) await new Promise(resolve => setTimeout(resolve, 1500));

      const result = await getStockPrice(item.ticker);
      if (result.price > 0) {
        updatedPortfolio[i] = { ...item, price: result.price, isEstimate: result.isEstimate };
      }
    }
    setPortfolio(updatedPortfolio);
    setIsFetching(false);
  };

  const handleAddStock = async () => {
    if (!tickerInput || !qtyInput) return;
    setIsFetching(true);
    const result = await getStockPrice(tickerInput);
    setIsFetching(false);

    const newItem: StockItem = {
      id: Date.now().toString(),
      ticker: tickerInput.toUpperCase(),
      name: '',
      quantity: Number(qtyInput),
      price: result.price,
      isEstimate: result.isEstimate,
    };
    setPortfolio([...portfolio, newItem]);
    setTickerInput('');
    setQtyInput('');
  };

  const handleRemoveStock = (id: string) => setPortfolio(portfolio.filter(item => item.id !== id));

  const handlePriceChange = (id: string, newPrice: string) => {
    setPortfolio(portfolio.map(item =>
      item.id === id ? { ...item, price: Number(newPrice), isEstimate: false } : item
    ));
  };

  // --- Multi-Target Handlers ---
  const addTarget = () => {
    const newTarget: InvestmentTarget = {
      id: Date.now().toString(),
      name: '新策略',
      monthlyAmount: 10000,
      returnRate: 10
    };
    setProjection(p => ({ ...p, targets: [...p.targets, newTarget] }));
  };

  const removeTarget = (id: string) => {
    setProjection(p => ({ ...p, targets: p.targets.filter(t => t.id !== id) }));
  };

  const updateTarget = (id: string, field: keyof InvestmentTarget, value: string | number) => {
    setProjection(p => ({
      ...p,
      targets: p.targets.map(t => t.id === id ? { ...t, [field]: value } : t)
    }));
  };

  // --- Calculations ---
  const currentTotalValue = useMemo(() => {
    return portfolio.reduce((sum, item) => sum + (item.quantity * item.price), 0);
  }, [portfolio]);

  const projectionData = useMemo(() => {
    const data: YearlyResult[] = [];

    // Initial State
    data.push({
      year: 0,
      principal: Math.round(currentTotalValue),
      interest: 0,
      total: Math.round(currentTotalValue),
    });

    const monthlyRateInitial = projection.initialReturnRate / 100 / 12;

    // Running totals
    let valueFromInitial = currentTotalValue;
    // We track value for each target separately using an array of current values
    let targetValues = projection.targets.map(() => 0);

    let principalInitial = currentTotalValue;
    let principalNewTotal = 0;

    for (let y = 1; y <= projection.years; y++) {
      // Calculate month by month
      for (let m = 0; m < 12; m++) {
        // 1. Grow Initial Portfolio (Conservative Rate)
        valueFromInitial = valueFromInitial * (1 + monthlyRateInitial);

        // 2. Grow Each Target
        projection.targets.forEach((target, idx) => {
          const monthlyRate = target.returnRate / 100 / 12;
          // Add Contribution
          targetValues[idx] += target.monthlyAmount;
          principalNewTotal += target.monthlyAmount;
          // Compound
          targetValues[idx] = targetValues[idx] * (1 + monthlyRate);
        });
      }

      const totalNewValue = targetValues.reduce((a, b) => a + b, 0);
      const totalValue = valueFromInitial + totalNewValue;
      const totalPrincipal = principalInitial + principalNewTotal;

      data.push({
        year: y,
        principal: Math.round(totalPrincipal),
        interest: Math.round(totalValue - totalPrincipal),
        total: Math.round(totalValue),
        monthlyIncome: Math.round((totalValue * 0.04) / 12)
      });
    }
    return data;
  }, [currentTotalValue, projection]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(val);
  };

  // Calculate total monthly contribution for display
  const totalMonthlyContribution = projection.targets.reduce((sum, t) => sum + t.monthlyAmount, 0);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 font-sans selection:bg-emerald-500/30">

      {/* Background Gradients */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-900/10 rounded-full blur-[128px]" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-900/10 rounded-full blur-[128px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto p-4 md:p-8 space-y-8">

        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-zinc-800 pb-8">
          <div className="space-y-2">
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-emerald-400 via-teal-200 to-cyan-400 bg-clip-text text-transparent tracking-tight">
              資產計算器
            </h1>
            <p className="text-zinc-400 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              策略模擬
              <span className="text-zinc-600">|</span>
              動態目標追蹤
            </p>
          </div>

          <div className="flex flex-col items-end">
            <span className="text-zinc-500 text-sm font-medium uppercase tracking-wider mb-1">目前資產總值</span>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold text-emerald-100 tabular-nums tracking-tighter shadow-emerald-500/20 drop-shadow-sm">
                {formatCurrency(currentTotalValue)}
              </span>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

          {/* Left Column: Input & Controls */}
          <div className="lg:col-span-4 space-y-6">

            {/* Portfolio Card */}
            <Card className="p-0 overflow-hidden">
              <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/80">
                <h2 className="text-lg font-semibold flex items-center gap-2 text-zinc-100">
                  <Wallet className="w-5 h-5 text-emerald-400" />
                  現有庫存
                </h2>
                <button
                  onClick={updateAllPrices}
                  disabled={isFetching}
                  className="group flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-all border border-zinc-700/50 hover:border-zinc-600"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : "group-hover:rotate-180 transition-transform duration-500"}`} />
                  {isFetching ? "更新中..." : "刷新價格"}
                </button>
              </div>

              {/* Add Input */}
              <div className="p-4 bg-zinc-900/30 border-b border-zinc-800">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    placeholder="代號"
                    className="flex-[2] min-w-[120px] bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all"
                    value={tickerInput}
                    onChange={(e) => setTickerInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddStock()}
                  />
                  <input
                    type="number"
                    placeholder="股數"
                    className="flex-1 min-w-[80px] bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all"
                    value={qtyInput}
                    onChange={(e) => setQtyInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddStock()}
                  />
                  <button
                    onClick={handleAddStock}
                    disabled={isFetching}
                    className="shrink-0 bg-emerald-600/90 hover:bg-emerald-500 text-white p-2 rounded-lg transition-colors shadow-lg shadow-emerald-900/20 active:scale-95"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* List */}
              <div className="max-h-[360px] overflow-y-auto custom-scrollbar">
                {portfolio.map((item, idx) => (
                  <div
                    key={item.id}
                    className={`p-4 flex items-center justify-between group hover:bg-zinc-800/50 transition-colors ${idx !== portfolio.length - 1 ? 'border-b border-zinc-800/50' : ''}`}
                  >
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-zinc-100">{item.ticker}</span>
                        {item.isEstimate && <Badge variant="outline">EST</Badge>}
                      </div>
                      <span className="text-xs text-zinc-500 font-mono tracking-wide">
                        {item.quantity.toLocaleString()} 股
                      </span>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <input
                          type="number"
                          className="block w-20 bg-transparent text-right text-xs text-zinc-400 hover:text-zinc-100 border-b border-transparent hover:border-zinc-700 focus:border-emerald-500 outline-none transition-colors py-0.5"
                          value={item.price}
                          onChange={(e) => handlePriceChange(item.id, e.target.value)}
                        />
                        <div className="text-sm font-semibold text-emerald-400 mt-0.5 tabular-nums">
                          ${Math.round(item.quantity * item.price).toLocaleString()}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveStock(item.id)}
                        className="text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-950/30 rounded transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Projection Controls */}
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-6 text-zinc-100 font-semibold">
                <Coins className="w-5 h-5 text-purple-400" />
                <span>參數設定</span>
              </div>

              {/* 1. Monthly Investment Targets List */}
              <div className="space-y-4 mb-8">
                <div className="flex justify-between items-end">
                  <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">定期定額投入策略</label>
                  <button
                    onClick={addTarget}
                    className="text-xs flex items-center gap-1 text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    <Plus className="w-3 h-3" /> 新增目標
                  </button>
                </div>

                <div className="space-y-3">
                  {projection.targets.map(target => (
                    <div key={target.id} className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 relative group">
                      <button
                        onClick={() => removeTarget(target.id)}
                        className="absolute top-2 right-2 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      <div className="grid grid-cols-12 gap-2 items-center">
                        {/* Name */}
                        <div className="col-span-12 mb-2">
                          <input
                            type="text"
                            value={target.name}
                            onChange={(e) => updateTarget(target.id, 'name', e.target.value)}
                            className="bg-transparent text-sm font-medium text-zinc-200 focus:outline-none border-b border-transparent focus:border-zinc-700 w-full"
                            placeholder="策略名稱"
                          />
                        </div>

                        {/* Amount */}
                        <div className="col-span-7">
                          <div className="relative">
                            <DollarSign className="absolute left-2 top-1.5 w-3.5 h-3.5 text-zinc-500" />
                            <input
                              type="number"
                              value={target.monthlyAmount}
                              onChange={(e) => updateTarget(target.id, 'monthlyAmount', Number(e.target.value))}
                              className="w-full bg-zinc-950 border border-zinc-700 rounded-md pl-7 pr-2 py-1 text-sm text-zinc-100 focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/30 outline-none"
                            />
                          </div>
                          <div className="text-[10px] text-zinc-500 mt-1 pl-1">每月投入</div>
                        </div>

                        {/* APY */}
                        <div className="col-span-5">
                          <div className="relative">
                            <input
                              type="number"
                              value={target.returnRate}
                              onChange={(e) => updateTarget(target.id, 'returnRate', Number(e.target.value))}
                              className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-2 py-1 text-sm text-emerald-400 font-bold text-center focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 outline-none"
                            />
                            <span className="absolute right-2 top-1.5 text-zinc-600 text-xs">%</span>
                          </div>
                          <div className="text-[10px] text-zinc-500 mt-1 text-center">預期年化</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-zinc-800/50">
                  <span className="text-xs text-zinc-500">每月總投入</span>
                  <span className="text-sm font-bold text-zinc-300">{formatCurrency(totalMonthlyContribution)}</span>
                </div>
              </div>


              <div className="grid grid-cols-2 gap-4">
                {/* 2. Existing Portfolio Return */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider" title="僅適用於現有庫存">現有部位預期漲幅 %</label>
                  <input
                    type="number"
                    value={projection.initialReturnRate}
                    onChange={(e) => setProjection({ ...projection, initialReturnRate: Number(e.target.value) })}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-300 font-bold outline-none focus:ring-2 focus:ring-zinc-500/30 focus:border-zinc-500/50 transition-all text-center"
                  />
                </div>

                {/* 3. Years */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">推演年份</label>
                  <input
                    type="number"
                    value={projection.years}
                    onChange={(e) => setProjection({ ...projection, years: Number(e.target.value) })}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500/50 transition-all text-center"
                  />
                </div>
              </div>

              <div className="pt-2 mt-6">
                <div className="bg-blue-950/20 border border-blue-900/30 rounded-lg p-3 flex gap-3 text-xs text-blue-300/80">
                  <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-blue-400" />
                  <div>
                    <p className="mb-1">計算邏輯已更新：</p>
                    <ul className="list-disc pl-4 space-y-0.5 opacity-90">
                      <li>定期定額: <span className="text-purple-400 font-bold">分別計算</span> 不同標的之複利成長</li>
                      <li>現有部位: <span className="text-zinc-300 font-bold">{projection.initialReturnRate}%</span> 獨立複利</li>
                    </ul>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Right Column: Analytics */}
          <div className="lg:col-span-8 space-y-6">

            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { label: `${projection.years} 年後總資產`, value: projectionData[projectionData.length - 1].total, color: 'text-emerald-400', subColor: 'bg-emerald-400/10' },
                { label: '投入本金總額', value: projectionData[projectionData.length - 1].principal, color: 'text-zinc-300', subColor: 'bg-zinc-100/10' },
                { label: '複利/槓桿獲利', value: projectionData[projectionData.length - 1].interest, color: 'text-purple-400', subColor: 'bg-purple-400/10' }
              ].map((stat, i) => (
                <Card key={i} className="p-5 flex flex-col justify-between hover:border-zinc-700 transition-colors">
                  <span className="text-zinc-500 text-xs font-medium uppercase tracking-wider">{stat.label}</span>
                  <div className={`mt-2 text-2xl font-bold tabular-nums tracking-tight ${stat.color}`}>
                    {formatCurrency(stat.value)}
                  </div>
                </Card>
              ))}
            </div>

            {/* Chart */}
            <Card className="p-6">
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-emerald-400" />
                  <h3 className="text-lg font-semibold text-zinc-100">資產成長趨勢</h3>
                </div>
                <div className="flex gap-4 text-xs">
                  <div className="flex items-center gap-1.5 text-zinc-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    總資產
                  </div>
                  <div className="flex items-center gap-1.5 text-zinc-400">
                    <span className="w-2 h-2 rounded-full bg-zinc-600"></span>
                    投入本金
                  </div>
                </div>
              </div>

              {/* Manual ResizeObserver Pattern */}
              <div ref={chartContainerRef} className="h-[350px] w-full relative">
                {chartSize.width > 0 && chartSize.height > 0 ? (
                  <AreaChart
                    width={chartSize.width}
                    height={chartSize.height}
                    data={projectionData}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis
                      dataKey="year"
                      stroke="#52525b"
                      tick={{ fill: '#71717a', fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(val) => `Y${val}`}
                      dy={10}
                    />
                    <YAxis
                      stroke="#52525b"
                      tick={{ fill: '#71717a', fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(val) => `${(val / 10000).toFixed(0)}w`}
                      width={40}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px', color: '#f4f4f5' }}
                      itemStyle={{ fontSize: '13px' }}
                      labelStyle={{ color: '#a1a1aa', marginBottom: '8px' }}
                      formatter={(value: number | undefined) => [formatCurrency(value || 0), '']}
                      labelFormatter={(label) => `第 ${label} 年`}
                    />
                    <Area
                      type="monotone"
                      dataKey="total"
                      stroke="#10b981"
                      fillOpacity={1}
                      fill="url(#colorTotal)"
                      strokeWidth={2}
                      activeDot={{ r: 6, strokeWidth: 0 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="principal"
                      stroke="#52525b"
                      fillOpacity={0} // Line only for principal to keep it clean
                      strokeDasharray="4 4"
                      strokeWidth={2}
                      activeDot={{ r: 4, strokeWidth: 0 }}
                    />
                  </AreaChart>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-600">
                    載入圖表...
                  </div>
                )}
              </div>
            </Card>

            {/* Table */}
            <Card className="overflow-hidden">
              <div className="p-4 border-b border-zinc-800 bg-zinc-900/30">
                <h3 className="font-semibold text-zinc-200 text-sm">詳細數據列表</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-zinc-500 uppercase bg-zinc-950/50">
                    <tr>
                      <th className="px-6 py-3 font-medium">年份</th>
                      <th className="px-6 py-3 font-medium">投入本金</th>
                      <th className="px-6 py-3 font-medium">槓桿收益</th>
                      <th className="px-6 py-3 font-medium text-emerald-500">總資產</th>
                      <th className="px-6 py-3 font-medium text-zinc-400">4% 提領 (月)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {projectionData.map((row) => (
                      <tr key={row.year} className="hover:bg-zinc-900/50 transition-colors group">
                        <td className="px-6 py-4 font-mono text-zinc-400 group-hover:text-zinc-200">
                          {row.year === 0 ? 'Now' : `Y${row.year}`}
                        </td>
                        <td className="px-6 py-4 text-zinc-400">{formatCurrency(row.principal)}</td>
                        <td className="px-6 py-4 text-purple-400">+{formatCurrency(row.interest)}</td>
                        <td className="px-6 py-4 font-bold text-emerald-400 bg-emerald-950/10">{formatCurrency(row.total)}</td>
                        <td className="px-6 py-4 text-zinc-500">{formatCurrency(row.monthlyIncome || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

          </div>
        </div>
      </div>
    </div>
  );
};

export default AssetCalculator;
