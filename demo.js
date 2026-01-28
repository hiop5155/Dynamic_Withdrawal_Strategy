import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, TrendingUp, DollarSign, Calculator, BarChart3, Info, RefreshCw, AlertTriangle } from 'lucide-react';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

// Types
interface StockItem {
    id: string;
    ticker: string;
    name: string; // Optional user note
    quantity: number;
    price: number;
    isEstimate?: boolean;
}

interface ProjectionParams {
    monthlyContribution: number;
    targetTicker: string;
    returnRate: number;
    years: number;
}

interface YearlyResult {
    year: number;
    principal: number; // Total money put in (Initial + Monthly Contributions)
    interest: number;  // Growth
    total: number;
    monthlyIncome?: number; // Estimated monthly income based on 4% rule just for ref
}

// Internal Database of prices (Updated based on user screenshots + recent market data)
// This ensures the app works immediately without relying on flaky external APIs
const PRICE_DATABASE: Record<string, number> = {
    '00929': 19.78,
    '00929.TW': 19.78,
    '00675L': 187.1,
    '00675L.TW': 187.1,
    '00937B': 15.95,
    '00937B.TW': 15.95,
    '0050': 198.5,
    '0050.TW': 198.5,
    '2887': 22.20,
    '2887.TW': 22.20,
    '2330': 1065,
    '2330.TW': 1065,
    '00878': 22.8,
    '0056': 39.5,
    '006208': 115.2,
};

const AssetCalculator = () => {
    // --- State ---
    // INITIALIZATION FIX: Hardcoding the prices here ensures the app works instantly.
    const [portfolio, setPortfolio] = useState < StockItem[] > ([
        { id: '1', ticker: '00929', name: '復華台灣科技優息', quantity: 175245, price: 19.78 },
        { id: '2', ticker: '00675L', name: '富邦臺灣加權正2', quantity: 1070, price: 187.1 },
        { id: '3', ticker: '00937B', name: '群益ESG投等債', quantity: 20000, price: 15.95 },
        { id: '4', ticker: '0050', name: '元大台灣50', quantity: 2040, price: 198.5 },
        { id: '5', ticker: '2887', name: '台新新光金', quantity: 3000, price: 22.20 },
    ]);

    const [projection, setProjection] = useState < ProjectionParams > ({
        monthlyContribution: 24300, // Based on our conversation (14.3k dividend + 10k salary)
        targetTicker: '00675L',
        returnRate: 20, // High leverage expectation
        years: 10,
    });

    const [tickerInput, setTickerInput] = useState('');
    const [qtyInput, setQtyInput] = useState('');
    const [isFetching, setIsFetching] = useState(false);
    const [fetchError, setFetchError] = useState(false);

    // --- Price Lookup Logic ---
    const getStockPrice = async (ticker: string): Promise<{ price: number, isEstimate: boolean }> => {
        const cleanTicker = ticker.trim().toUpperCase();
        const symbol = cleanTicker.endsWith('.TW') ? cleanTicker : `${cleanTicker}.TW`;

        // 1. First check internal database (Fastest, 100% reliable for known stocks)
        if (PRICE_DATABASE[cleanTicker]) return { price: PRICE_DATABASE[cleanTicker], isEstimate: true };
        if (PRICE_DATABASE[symbol]) return { price: PRICE_DATABASE[symbol], isEstimate: true };

        // 2. If unknown, try to fetch (Bonus feature)
        try {
            // Using a different proxy strategy or just simulating delay for unknown stocks
            // In this environment, real fetching is often blocked.
            const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
            const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;

            const response = await fetch(proxyUrl);
            if (!response.ok) throw new Error('Network error');

            const data = await response.json();
            const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;

            if (typeof price === 'number') {
                return { price, isEstimate: false };
            }
        } catch (e) {
            console.warn(`Could not fetch live price for ${ticker}`);
        }

        // 3. Last resort: Return 0 so user can input manually
        return { price: 0, isEstimate: true };
    };

    const updateAllPrices = async () => {
        setIsFetching(true);
        setFetchError(false);

        // We map sequentially to avoid triggering too many network requests if falling back to fetch
        const updatedPortfolio = [...portfolio];

        for (let i = 0; i < updatedPortfolio.length; i++) {
            const item = updatedPortfolio[i];
            // Only fetch if price is 0 or user explicitly requested update
            // Here we just re-verify against database or fetch
            const result = await getStockPrice(item.ticker);
            if (result.price > 0) {
                updatedPortfolio[i] = { ...item, price: result.price, isEstimate: result.isEstimate };
            }
        }

        setPortfolio(updatedPortfolio);
        setIsFetching(false);
    };

    // --- Calculations ---

    // 1. Current Portfolio Value
    const currentTotalValue = useMemo(() => {
        return portfolio.reduce((sum, item) => sum + (item.quantity * item.price), 0);
    }, [portfolio]);

    // 2. Projection Calculation
    const projectionData = useMemo(() => {
        const data: YearlyResult[] = [];
        let currentWealth = currentTotalValue;
        let totalPrincipal = currentTotalValue;

        // Start with Year 0
        data.push({
            year: 0,
            principal: Math.round(totalPrincipal),
            interest: 0,
            total: Math.round(currentWealth),
        });

        const monthlyRate = projection.returnRate / 100 / 12;

        for (let y = 1; y <= projection.years; y++) {
            // Calculate month by month for accuracy with monthly contributions
            for (let m = 0; m < 12; m++) {
                // Add monthly contribution
                currentWealth += projection.monthlyContribution;
                totalPrincipal += projection.monthlyContribution;

                // Grow by monthly rate
                currentWealth = currentWealth * (1 + monthlyRate);
            }

            data.push({
                year: y,
                principal: Math.round(totalPrincipal),
                interest: Math.round(currentWealth - totalPrincipal),
                total: Math.round(currentWealth),
                monthlyIncome: Math.round((currentWealth * 0.04) / 12) // 4% rule reference
            });
        }

        return data;
    }, [currentTotalValue, projection]);

    // --- Handlers ---

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
            price: result.price, // Will be database price, fetched price, or 0
            isEstimate: result.isEstimate,
        };

        setPortfolio([...portfolio, newItem]);
        setTickerInput('');
        setQtyInput('');
    };

    const handleRemoveStock = (id: string) => {
        setPortfolio(portfolio.filter(item => item.id !== id));
    };

    const handlePriceChange = (id: string, newPrice: string) => {
        setPortfolio(portfolio.map(item =>
            item.id === id ? { ...item, price: Number(newPrice), isEstimate: false } : item
        ));
    };

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(val);
    };

    return (
        <div className="min-h-screen bg-slate-900 text-slate-100 p-4 md:p-8 font-sans">
            <div className="max-w-6xl mx-auto space-y-8">

                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-700 pb-6">
                    <div>
                        <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
                            資產槓桿加速器
                        </h1>
                        <p className="text-slate-400 mt-2">
                            高槓桿策略模擬 | 動態提領目標追蹤
                        </p>
                    </div>
                    <div className="mt-4 md:mt-0 bg-slate-800 p-4 rounded-lg border border-slate-700">
                        <div className="text-sm text-slate-400">目前資產總值</div>
                        <div className="text-2xl font-bold text-emerald-400">{formatCurrency(currentTotalValue)}</div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

                    {/* LEFT COLUMN: Inputs */}
                    <div className="lg:col-span-4 space-y-6">

                        {/* Card 1: Current Portfolio */}
                        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-lg">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-xl font-semibold flex items-center gap-2">
                                    <Calculator size={20} className="text-blue-400" />
                                    現有庫存
                                </h2>
                                <div className="flex gap-2">
                                    {/* We removed the auto-fetch on mount to prevent zeroing out data. Button remains for manual updates. */}
                                    <button
                                        onClick={updateAllPrices}
                                        disabled={isFetching}
                                        className="text-xs flex items-center gap-1 bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded text-slate-300 disabled:opacity-50"
                                    >
                                        <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} />
                                        {isFetching ? "更新中..." : "重置價格"}
                                    </button>
                                </div>
                            </div>

                            {/* Input Row */}
                            <div className="flex gap-2 mb-4">
                                <input
                                    type="text"
                                    placeholder="代號 (如 00675L)"
                                    className="flex-1 bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                                    value={tickerInput}
                                    onChange={(e) => setTickerInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddStock()}
                                />
                                <input
                                    type="number"
                                    placeholder="股數"
                                    className="w-24 bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                                    value={qtyInput}
                                    onChange={(e) => setQtyInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddStock()}
                                />
                                <button
                                    onClick={handleAddStock}
                                    disabled={isFetching}
                                    className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 text-white p-2 rounded transition-colors"
                                >
                                    <Plus size={20} />
                                </button>
                            </div>

                            {/* List */}
                            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                {portfolio.map(item => (
                                    <div key={item.id} className="flex items-center justify-between bg-slate-700/50 p-3 rounded group hover:bg-slate-700 transition-colors">
                                        <div>
                                            <div className="font-bold text-slate-200 flex items-center gap-2">
                                                {item.ticker}
                                                {item.isEstimate && (
                                                    <span title="使用內建或備份價格" className="text-[10px] bg-slate-600 text-slate-300 px-1 rounded">EST</span>
                                                )}
                                            </div>
                                            <div className="text-xs text-slate-400">
                                                {item.quantity.toLocaleString()} 股
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="text-right">
                                                <div className="text-xs text-slate-500">單價 (TWD)</div>
                                                <input
                                                    type="number"
                                                    className="w-20 bg-transparent text-right text-sm border-b border-transparent hover:border-slate-500 focus:border-blue-400 outline-none"
                                                    value={item.price}
                                                    onChange={(e) => handlePriceChange(item.id, e.target.value)}
                                                />
                                            </div>
                                            <div className="text-right w-24">
                                                <div className="text-sm font-medium text-emerald-400">
                                                    {formatCurrency(Math.round(item.quantity * item.price)).replace('TWD', '$')}
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleRemoveStock(item.id)}
                                                className="text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Card 2: Future Projection Inputs */}
                        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-lg">
                            <h2 className="text-xl font-semibold flex items-center gap-2 mb-6">
                                <TrendingUp size={20} className="text-purple-400" />
                                未來增長參數
                            </h2>

                            <div className="space-y-5">
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">主要投入標的 (僅標示用)</label>
                                    <input
                                        type="text"
                                        value={projection.targetTicker}
                                        onChange={(e) => setProjection({ ...projection, targetTicker: e.target.value })}
                                        className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 focus:border-purple-500 outline-none"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">每月定期投入金額 (PMT)</label>
                                    <div className="relative">
                                        <DollarSign size={16} className="absolute left-3 top-3 text-slate-500" />
                                        <input
                                            type="number"
                                            value={projection.monthlyContribution}
                                            onChange={(e) => setProjection({ ...projection, monthlyContribution: Number(e.target.value) })}
                                            className="w-full bg-slate-900 border border-slate-600 rounded pl-9 pr-3 py-2 focus:border-purple-500 outline-none font-mono"
                                        />
                                    </div>
                                    <div className="text-xs text-slate-500 mt-1">
                                        包含薪資 + 股息再投入
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm text-slate-400 mb-1">預期年化報酬 (%)</label>
                                        <input
                                            type="number"
                                            value={projection.returnRate}
                                            onChange={(e) => setProjection({ ...projection, returnRate: Number(e.target.value) })}
                                            className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 focus:border-purple-500 outline-none font-bold text-emerald-400"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-400 mb-1">推演年份</label>
                                        <input
                                            type="number"
                                            value={projection.years}
                                            onChange={(e) => setProjection({ ...projection, years: Number(e.target.value) })}
                                            className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 focus:border-purple-500 outline-none"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Side Note */}
                        <div className="bg-blue-900/20 border border-blue-800 p-4 rounded-lg text-sm text-blue-200 flex gap-3">
                            <Info className="flex-shrink-0 mt-0.5" size={18} />
                            <div>
                                <p className="font-bold mb-1">槓桿策略師提醒</p>
                                <p className="opacity-80">
                                    此計算假設您的「總資產」皆以 {projection.returnRate}% 複利增長。
                                    若您採用「股息養槓桿」策略，請確保每月投入金額包含股息與薪資。
                                </p>
                            </div>
                        </div>

                    </div>

                    {/* RIGHT COLUMN: Results */}
                    <div className="lg:col-span-8 space-y-6">

                        {/* Summary Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-slate-800 p-5 rounded-xl border border-slate-700">
                                <div className="text-slate-400 text-sm mb-1">{projection.years} 年後總資產</div>
                                <div className="text-2xl font-bold text-emerald-400">
                                    {formatCurrency(projectionData[projectionData.length - 1].total)}
                                </div>
                            </div>
                            <div className="bg-slate-800 p-5 rounded-xl border border-slate-700">
                                <div className="text-slate-400 text-sm mb-1">投入本金總額</div>
                                <div className="text-2xl font-bold text-slate-200">
                                    {formatCurrency(projectionData[projectionData.length - 1].principal)}
                                </div>
                            </div>
                            <div className="bg-slate-800 p-5 rounded-xl border border-slate-700">
                                <div className="text-slate-400 text-sm mb-1">複利/槓桿獲利</div>
                                <div className="text-2xl font-bold text-purple-400">
                                    {formatCurrency(projectionData[projectionData.length - 1].interest)}
                                </div>
                            </div>
                        </div>

                        {/* Chart */}
                        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg h-[400px]">
                            <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
                                <BarChart3 size={20} className="text-emerald-400" />
                                資產成長趨勢圖
                            </h3>
                            <ResponsiveContainer width="100%" height="85%">
                                <AreaChart data={projectionData} margin={{ top: 10, right: 30, left: 20, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="colorPrincipal" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#64748b" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#64748b" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <XAxis dataKey="year" stroke="#94a3b8" tickFormatter={(val) => `第 ${val} 年`} />
                                    <YAxis
                                        stroke="#94a3b8"
                                        tickFormatter={(val) => `${(val / 10000).toFixed(0)}萬`}
                                    />
                                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f1f5f9' }}
                                        formatter={(value: number) => formatCurrency(value)}
                                        labelFormatter={(label) => `第 ${label} 年`}
                                    />
                                    <Legend />
                                    <Area
                                        type="monotone"
                                        dataKey="total"
                                        stroke="#10b981"
                                        fillOpacity={1}
                                        fill="url(#colorTotal)"
                                        name="總資產價值"
                                        strokeWidth={2}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="principal"
                                        stroke="#64748b"
                                        fillOpacity={1}
                                        fill="url(#colorPrincipal)"
                                        name="投入本金"
                                        strokeWidth={2}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Detailed Table */}
                        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
                            <div className="p-4 bg-slate-900/50 border-b border-slate-700">
                                <h3 className="font-semibold text-slate-200">年度資產細節 (Year-by-Year)</h3>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left text-slate-300">
                                    <thead className="text-xs text-slate-400 uppercase bg-slate-900/50">
                                        <tr>
                                            <th className="px-6 py-3">年份</th>
                                            <th className="px-6 py-3">投入本金</th>
                                            <th className="px-6 py-3">槓桿獲利 (複利)</th>
                                            <th className="px-6 py-3 text-emerald-400">總資產</th>
                                            <th className="px-6 py-3">4% 提領月薪 (預估)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {projectionData.map((row) => (
                                            <tr key={row.year} className="border-b border-slate-700 hover:bg-slate-700/50 transition-colors">
                                                <td className="px-6 py-4 font-medium text-white">
                                                    {row.year === 0 ? '目前' : `第 ${row.year} 年`}
                                                </td>
                                                <td className="px-6 py-4">{formatCurrency(row.principal)}</td>
                                                <td className="px-6 py-4 text-purple-400">+{formatCurrency(row.interest)}</td>
                                                <td className="px-6 py-4 font-bold text-emerald-400">{formatCurrency(row.total)}</td>
                                                <td className="px-6 py-4 text-slate-400">{formatCurrency(row.monthlyIncome || 0)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
};

export default AssetCalculator;