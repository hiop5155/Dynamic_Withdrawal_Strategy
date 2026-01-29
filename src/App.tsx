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
  Coins,
  HelpCircle,
  X
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
}

interface WithdrawalParams {
  initialRate: number;
  upperGuardrail: number;
  lowerGuardrail: number;
  expectedAPY: number;
  volatility: number;
  simulations: number;
  years: number;
}

interface WithdrawalResult {
  year: number;
  portfolioValue: number;
  withdrawalAmount: number;
  withdrawalRate: number;
  returnRate: number;
  inflationAdjusted: boolean;
  guardrailTriggered: 'upper' | 'lower' | null;
}

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
  const [portfolio, setPortfolio] = useState<StockItem[]>(() => {
    const saved = localStorage.getItem('portfolio');
    return saved ? JSON.parse(saved) : [];
  });

  const [projection, setProjection] = useState<ProjectionParams>(() => {
    const saved = localStorage.getItem('projection');
    return saved ? JSON.parse(saved) : {
      initialReturnRate: 6,
      years: 10,
      targets: [
        { id: '1', name: '', monthlyAmount: 3000, returnRate: 20 },
      ]
    };
  });

  const [tickerInput, setTickerInput] = useState('');
  const [qtyInput, setQtyInput] = useState('');
  const [isFetching, setIsFetching] = useState(false);

  // --- Withdrawal Simulation State ---
  const [withdrawalParams, setWithdrawalParams] = useState<WithdrawalParams>(() => {
    const saved = localStorage.getItem('withdrawalParams');
    return saved ? JSON.parse(saved) : {
      initialRate: 4,
      upperGuardrail: 20,
      lowerGuardrail: 20,
      expectedAPY: 7,
      volatility: 15,
      simulations: 10,
      years: 40
    };
  });
  const [allSimulations, setAllSimulations] = useState<WithdrawalResult[][]>([]);
  const [selectedSimIndex, setSelectedSimIndex] = useState<number | null>(null);
  const [showWithdrawalSim, setShowWithdrawalSim] = useState(false);
  const [showGKModal, setShowGKModal] = useState(false);

  // --- Save to localStorage on state changes ---
  useEffect(() => {
    localStorage.setItem('portfolio', JSON.stringify(portfolio));
  }, [portfolio]);

  useEffect(() => {
    localStorage.setItem('projection', JSON.stringify(projection));
  }, [projection]);

  useEffect(() => {
    localStorage.setItem('withdrawalParams', JSON.stringify(withdrawalParams));
  }, [withdrawalParams]);

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

  // --- Stock Price Fetching (via Backend API) ---
  const getStockPrice = async (ticker: string): Promise<{ price: number, isEstimate: boolean }> => {
    const cleanTicker = ticker.trim().toUpperCase();

    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(`${API_URL}/api/stocks/price/${cleanTicker}`);

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      return {
        price: data.price,
        isEstimate: data.isEstimate,
      };
    } catch (error) {
      console.error('Failed to fetch stock price:', error);
      // Ultimate fallback
      return { price: 100, isEstimate: true };
    }
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

  const handleQuantityChange = (id: string, newQuantity: string) => {
    setPortfolio(portfolio.map(item =>
      item.id === id ? { ...item, quantity: Number(newQuantity) } : item
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
        total: Math.round(totalValue)
      });
    }
    return data;
  }, [currentTotalValue, projection]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(val);
  };

  // --- GK Withdrawal Simulation ---
  const generateRandomReturn = (mean: number, stdDev: number): number => {
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z * stdDev;
  };

  const runGKSimulation = (
    startingValue: number,
    params: WithdrawalParams,
    years: number
  ): WithdrawalResult[] => {
    const results: WithdrawalResult[] = [];

    let portfolioValue = startingValue;
    let withdrawalAmount = startingValue * (params.initialRate / 100);
    const initialWithdrawalRate = params.initialRate / 100;

    for (let year = 1; year <= years; year++) {
      // 1. Deduct withdrawal at year start
      portfolioValue -= withdrawalAmount;

      // 2. Apply random market return
      const randomReturn = generateRandomReturn(
        params.expectedAPY / 100,
        params.volatility / 100
      );
      const previousValue = portfolioValue;
      portfolioValue *= (1 + randomReturn);
      const portfolioGained = portfolioValue > previousValue;

      // 3. Calculate current withdrawal rate
      const currentRate = withdrawalAmount / portfolioValue;

      // 4. Apply GK Rules for NEXT year's withdrawal
      let nextWithdrawal = withdrawalAmount;
      let guardrailTriggered: 'upper' | 'lower' | null = null;
      let inflationAdjusted = false;

      // Capital Preservation Rule (Upper Guardrail)
      if (currentRate > initialWithdrawalRate * (1 + params.upperGuardrail / 100)) {
        nextWithdrawal *= 0.9; // Reduce 10%
        guardrailTriggered = 'upper';
      }
      // Prosperity Rule (Lower Guardrail)
      else if (currentRate < initialWithdrawalRate * (1 - params.lowerGuardrail / 100)) {
        nextWithdrawal *= 1.1; // Increase 10%
        guardrailTriggered = 'lower';
      }
      // Inflation Rule
      else if (portfolioGained) {
        nextWithdrawal *= 1.03; // 3% inflation adjustment
        inflationAdjusted = true;
      }

      results.push({
        year,
        portfolioValue: Math.max(0, portfolioValue),
        withdrawalAmount,
        withdrawalRate: currentRate * 100,
        returnRate: randomReturn * 100, // Annual market return as percentage
        inflationAdjusted,
        guardrailTriggered,
      });

      withdrawalAmount = nextWithdrawal;

      // Stop if portfolio depleted
      if (portfolioValue <= 0) break;
    }

    return results;
  };

  const handleRunSimulation = () => {
    // Use current total value if no accumulation years, otherwise use final projection value
    const startingValue = projection.years === 0
      ? currentTotalValue
      : (projectionData[projectionData.length - 1]?.total || currentTotalValue);

    // Run Monte Carlo simulations
    const simulations: WithdrawalResult[][] = [];
    for (let i = 0; i < withdrawalParams.simulations; i++) {
      const simResult = runGKSimulation(startingValue, withdrawalParams, withdrawalParams.years);
      simulations.push(simResult);
    }

    setAllSimulations(simulations);
    setSelectedSimIndex(null); // Reset selection
    setShowWithdrawalSim(true);
  };

  // --- Statistics Helper Functions ---
  const calculateSuccessRate = (sims: WithdrawalResult[][]): number => {
    const successful = sims.filter(sim => {
      const final = sim[sim.length - 1];
      return final && final.portfolioValue > 0;
    }).length;
    return Math.round((successful / sims.length) * 100);
  };

  const calculateMedianFinal = (sims: WithdrawalResult[][]): number => {
    const finalValues = sims
      .map(sim => sim[sim.length - 1]?.portfolioValue || 0)
      .sort((a, b) => a - b);
    return finalValues[Math.floor(finalValues.length / 2)];
  };

  const getBestCase = (sims: WithdrawalResult[][]): number => {
    return Math.max(...sims.map(sim => sim[sim.length - 1]?.portfolioValue || 0));
  };

  const getWorstCase = (sims: WithdrawalResult[][]): number => {
    return Math.min(...sims.map(sim => sim[sim.length - 1]?.portfolioValue || 0));
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

      <main className="relative z-10 max-w-7xl mx-auto p-4 md:p-8 space-y-8" role="main">

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
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          className="w-20 bg-transparent text-xs text-zinc-400 hover:text-zinc-100 border-b border-transparent hover:border-zinc-700 focus:border-emerald-500 outline-none transition-colors py-0.5 font-mono"
                          value={item.quantity}
                          onChange={(e) => handleQuantityChange(item.id, e.target.value)}
                        />
                        <span className="text-xs text-zinc-500">股</span>
                      </div>
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
                        type="button"
                        onClick={() => handleRemoveStock(item.id)}
                        className="p-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors"
                        aria-label="Remove stock"
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
                { label: '複利', value: projectionData[projectionData.length - 1].interest, color: 'text-purple-400', subColor: 'bg-purple-400/10' }
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* GK Withdrawal Simulation Section */}
            <Card className="mt-8">
              <div className="p-6 border-b border-zinc-800">
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="text-xl font-bold text-zinc-200">
                    退休後動態提領模擬 (GK法則)
                  </h2>
                  <button
                    onClick={() => setShowGKModal(true)}
                    className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-emerald-400 transition-colors"
                    aria-label="GK法則說明"
                  >
                    <HelpCircle className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-sm text-zinc-400 mt-2">
                  基於 Guyton-Klinger 動態提領策略，模擬退休後資產提領與護欄調整
                </p>
              </div>

              <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">初始提領率 (%)</label>
                    <input type="number" value={withdrawalParams.initialRate} onChange={(e) => setWithdrawalParams({ ...withdrawalParams, initialRate: Number(e.target.value) })} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-300 font-bold outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500/50 transition-all text-center" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">上護欄 (%)</label>
                    <input type="number" value={withdrawalParams.upperGuardrail} onChange={(e) => setWithdrawalParams({ ...withdrawalParams, upperGuardrail: Number(e.target.value) })} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-300 font-bold outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500/50 transition-all text-center" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">下護欄 (%)</label>
                    <input type="number" value={withdrawalParams.lowerGuardrail} onChange={(e) => setWithdrawalParams({ ...withdrawalParams, lowerGuardrail: Number(e.target.value) })} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-300 font-bold outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50 transition-all text-center" />
                  </div>
                </div>

                <div className="border-t border-zinc-800 pt-6">
                  <h3 className="text-sm font-semibold text-zinc-400 mb-4 uppercase tracking-wider">Monte Carlo 模擬參數</h3>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">退休年數</label>
                      <input type="number" value={withdrawalParams.years} onChange={(e) => setWithdrawalParams({ ...withdrawalParams, years: Number(e.target.value) })} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-300 font-bold outline-none focus:ring-2 focus:ring-zinc-500/30 focus:border-zinc-500/50 transition-all text-center" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">預期年化報酬 (%)</label>
                      <input type="number" value={withdrawalParams.expectedAPY} onChange={(e) => setWithdrawalParams({ ...withdrawalParams, expectedAPY: Number(e.target.value) })} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-300 font-bold outline-none focus:ring-2 focus:ring-zinc-500/30 focus:border-zinc-500/50 transition-all text-center" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">波動率 (%)</label>
                      <input type="number" value={withdrawalParams.volatility} onChange={(e) => setWithdrawalParams({ ...withdrawalParams, volatility: Number(e.target.value) })} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-300 font-bold outline-none focus:ring-2 focus:ring-zinc-500/30 focus:border-zinc-500/50 transition-all text-center" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">模擬次數</label>
                      <input type="number" value={withdrawalParams.simulations} onChange={(e) => setWithdrawalParams({ ...withdrawalParams, simulations: Number(e.target.value) })} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-300 font-bold outline-none focus:ring-2 focus:ring-zinc-500/30 focus:border-zinc-500/50 transition-all text-center" />
                    </div>
                  </div>
                </div>

                <button onClick={handleRunSimulation} className="w-full bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white font-bold py-3 rounded-lg transition-all shadow-lg shadow-purple-900/30 active:scale-98 flex items-center justify-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  執行模擬
                </button>

                {showWithdrawalSim && allSimulations.length > 0 && (
                  <div className="border-t border-zinc-800 pt-6 space-y-4">
                    <h3 className="text-lg font-bold text-zinc-200">
                      模擬結果摘要 ({allSimulations.length} 次模擬)
                    </h3>

                    {/* Statistics Bar */}
                    <div className="flex flex-wrap gap-4 p-4 bg-zinc-900/50 rounded-lg text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-400">成功率:</span>
                        <span className="font-bold text-emerald-400">{calculateSuccessRate(allSimulations)}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-400">中位數:</span>
                        <span className="font-bold text-zinc-300">{formatCurrency(calculateMedianFinal(allSimulations))}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-400">最佳:</span>
                        <span className="font-bold text-emerald-300">{formatCurrency(getBestCase(allSimulations))}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-400">最差:</span>
                        <span className="font-bold text-red-300">{formatCurrency(getWorstCase(allSimulations))}</span>
                      </div>
                    </div>

                    {/* Simulation Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-96 overflow-y-auto p-2 bg-zinc-950/50 rounded-lg">
                      {allSimulations.map((sim, index) => {
                        const finalValue = sim[sim.length - 1]?.portfolioValue || 0;
                        const isSuccess = finalValue > 0;
                        const isSelected = selectedSimIndex === index;

                        return (
                          <button
                            key={index}
                            onClick={() => setSelectedSimIndex(index)}
                            className={`p-3 rounded-lg text-left transition-all ${isSelected
                              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/50'
                              : 'bg-zinc-800 hover:bg-zinc-700'
                              }`}
                          >
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-xs font-mono opacity-75">模擬 #{index + 1}</span>
                              <span className={`text-sm ${isSuccess ? 'text-emerald-300' : 'text-red-400'}`}>
                                {isSuccess ? '✓' : '✗'}
                              </span>
                            </div>
                            <div className="text-base font-bold">
                              {formatCurrency(finalValue)}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Detail View for Selected Simulation */}
                {selectedSimIndex !== null && allSimulations[selectedSimIndex] && (
                  <div className="border-t border-zinc-800 pt-6 mt-6 space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="text-lg font-bold text-zinc-200">
                        模擬 #{selectedSimIndex + 1} 詳細結果
                      </h3>
                      <button
                        onClick={() => setSelectedSimIndex(null)}
                        className="text-zinc-400 hover:text-white transition-colors px-3 py-1 rounded hover:bg-zinc-800"
                      >
                        關閉 ✕
                      </button>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-zinc-900/50 text-zinc-400 uppercase text-xs border-b border-zinc-800">
                          <tr>
                            <th className="px-4 py-3 font-medium">年份</th>
                            <th className="px-4 py-3 font-medium">資產餘額</th>
                            <th className="px-4 py-3 font-medium">提領金額</th>
                            <th className="px-4 py-3 font-medium">提領率</th>
                            <th className="px-4 py-3 font-medium">模擬回報率</th>
                            <th className="px-4 py-3 font-medium">通膨調整</th>
                            <th className="px-4 py-3 font-medium">護欄觸發</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/50">
                          {allSimulations[selectedSimIndex].map((row: WithdrawalResult) => (
                            <tr key={row.year} className="hover:bg-zinc-900/50 transition-colors">
                              <td className="px-4 py-3 font-mono text-zinc-400">Y{row.year}</td>
                              <td className="px-4 py-3 text-zinc-300">{formatCurrency(row.portfolioValue)}</td>
                              <td className="px-4 py-3 text-purple-400">{formatCurrency(row.withdrawalAmount)}</td>
                              <td className="px-4 py-3 text-zinc-400">{row.withdrawalRate.toFixed(2)}%</td>
                              <td className={`px-4 py-3 font-semibold ${row.returnRate >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {row.returnRate >= 0 ? '+' : ''}{row.returnRate.toFixed(2)}%
                              </td>
                              <td className="px-4 py-3">
                                {row.inflationAdjusted ? (
                                  <span className="text-emerald-400">✓</span>
                                ) : (
                                  <span className="text-zinc-600">-</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                {row.guardrailTriggered === 'upper' && (
                                  <span className="text-red-400 text-xs font-semibold">↓ 減少10%</span>
                                )}
                                {row.guardrailTriggered === 'lower' && (
                                  <span className="text-emerald-400 text-xs font-semibold">↑ 增加10%</span>
                                )}
                                {!row.guardrailTriggered && (
                                  <span className="text-zinc-600">-</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </Card>

          </div>
        </div>

        {/* Footer */}
        <footer className="mt-16 border-t border-zinc-800 pt-8 pb-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col items-center gap-6">
              {/* Links */}
              <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm">
                <a
                  href="/"
                  className="text-zinc-400 hover:text-emerald-400 transition-colors"
                >
                  記帳助手 App
                </a>
                <a
                  href="/blog"
                  className="text-zinc-400 hover:text-emerald-400 transition-colors"
                >
                  理財知識庫
                </a>
                <a
                  href="/blog/privacy.html"
                  className="text-zinc-400 hover:text-emerald-400 transition-colors"
                >
                  隱私權政策
                </a>
              </div>

              {/* Copyright */}
              <div className="text-center text-sm text-zinc-500">
                <p>© 2026 記帳助手 Money Tracker.</p>
                <p className="mt-1">All rights reserved.</p>
              </div>
            </div>
          </div>
        </footer>
      </main>

      {/* GK Rule Explanation Modal */}
      {showGKModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowGKModal(false)}
        >
          <div
            className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 bg-zinc-900 border-b border-zinc-800 p-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/20 rounded-lg">
                  <DollarSign className="w-6 h-6 text-purple-400" />
                </div>
                <h3 className="text-2xl font-bold text-zinc-100">Guyton-Klinger 動態提領法則</h3>
              </div>
              <button
                onClick={() => setShowGKModal(false)}
                className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Overview */}
              <div>
                <h4 className="text-lg font-semibold text-emerald-400 mb-2">什麼是 GK 法則？</h4>
                <p className="text-zinc-300 leading-relaxed">
                  Guyton-Klinger 法則是一種<strong className="text-white">動態提領策略</strong>，旨在退休後維持穩定的生活水準，同時透過「護欄機制」調整提領金額，避免資產過早耗盡。
                </p>
              </div>

              {/* Core Rules */}
              <div className="space-y-4">
                <h4 className="text-lg font-semibold text-purple-400 mb-2">三大核心規則</h4>

                {/* Rule 1 */}
                <div className="bg-zinc-950/50 border border-zinc-800 rounded-lg p-4">
                  <div className="flex items-start gap-3 mb-2">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">1</div>
                    <div>
                      <h5 className="font-semibold text-zinc-100 mb-1">通膨調整規則</h5>
                      <p className="text-sm text-zinc-400">
                        當投資組合<span className="text-emerald-400">有正報酬</span>時，隔年提領金額按<strong className="text
-white">3% 通膨率</strong>調整。
                      </p>
                    </div>
                  </div>
                </div>

                {/* Rule 2 */}
                <div className="bg-zinc-950/50 border border-zinc-800 rounded-lg p-4">
                  <div className="flex items-start gap-3 mb-2">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center font-bold">2</div>
                    <div>
                      <h5 className="font-semibold text-zinc-100 mb-1">資本保護護欄 (Upper Guardrail)</h5>
                      <p className="text-sm text-zinc-400 mb-2">
                        當提領率超過初始提領率的<strong className="text-white">120%</strong>（例如從 4% 升至 4.8%），代表資產縮水過多。
                      </p>
                      <div className="bg-red-950/30 border-l-4 border-red-500 px-3 py-2 rounded">
                        <p className="text-sm text-red-300">
                          ⚠️ <strong>減少 10%</strong> 提領金額，保護資產不過度縮水
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Rule 3 */}
                <div className="bg-zinc-950/50 border border-zinc-800 rounded-lg p-4">
                  <div className="flex items-start gap-3 mb-2">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">3</div>
                    <div>
                      <h5 className="font-semibold text-zinc-100 mb-1">繁榮護欄 (Lower Guardrail)</h5>
                      <p className="text-sm text-zinc-400 mb-2">
                        當提領率低於初始提領率的<strong className="text-white">80%</strong>（例如從 4% 降至 3.2%），代表資產成長良好。
                      </p>
                      <div className="bg-emerald-950/30 border-l-4 border-emerald-500 px-3 py-2 rounded">
                        <p className="text-sm text-emerald-300">
                          ✓ <strong>增加 10%</strong> 提領金額，提升生活品質
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Example */}
              <div className="bg-purple-950/20 border border-purple-800/30 rounded-lg p-4">
                <h5 className="font-semibold text-purple-300 mb-2 flex items-center gap-2">
                  <Info className="w-4 h-4" />
                  模擬範例
                </h5>
                <p className="text-sm text-zinc-300 leading-relaxed">
                  假設退休時有 <strong className="text-white">$1,000萬</strong>，初始提領率 <strong className="text-emerald-400">4%</strong>（年提領 $40萬）。
                  第一年投資獲利，隔年提領調整為 $40萬 × 1.03 = <strong className="text-white">$41.2萬</strong>。
                  若某年市場大跌導致資產縮水至 $850萬，提領率升至 41.2 / 850 = <strong className="text-red-400">4.85%</strong>，
                  觸發<span className="text-red-400">上護欄</span>，下年提領減少 10% 至 <strong className="text-white">$37萬</strong>。
                </p>
              </div>

              {/* Benefits */}
              <div>
                <h4 className="text-lg font-semibold text-zinc-200 mb-3">為什麼使用 GK 法則？</h4>
                <ul className="space-y-2 text-sm text-zinc-300">
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-400 mt-0.5">✓</span>
                    <span><strong className="text-white">動態平衡：</strong>市場波動時自動調整，避免固定提領導致資產過早耗盡</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-400 mt-0.5">✓</span>
                    <span><strong className="text-white">彈性應對：</strong>牛市時增加提領享受生活，熊市時減少支出保護資本</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-400 mt-0.5">✓</span>
                    <span><strong className="text-white">長期永續：</strong>提高退休資產維持 30 年以上的成功率</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-zinc-900 border-t border-zinc-800 p-4">
              <button
                onClick={() => setShowGKModal(false)}
                className="w-full bg-purple-600 hover:bg-purple-500 text-white font-semibold py-3 rounded-lg transition-colors"
              >
                了解了
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssetCalculator;
