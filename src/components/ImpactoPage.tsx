import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Info,
  Layers,
  Scale,
  TrendingUp,
} from 'lucide-react';
import { useCofre } from '../context/CofreContext';
import { formatCurrencyBR, formatNumberBR } from '../utils/formatters';
import { runImpactSimulation90Days } from '../utils/impactSimulation';
import { StatusBadge } from './StatusBadge';

function pctDelta(recVal: number, baseVal: number): { label: string; raw: number } {
  if (baseVal === 0) {
    return recVal === 0 ? { label: '0,0%', raw: 0 } : { label: '+100,0%', raw: 100 };
  }
  const pct = ((recVal - baseVal) / baseVal) * 100;
  const sign = pct > 0 ? '+' : '';
  return { label: `${sign}${formatNumberBR(pct, 1)}%`, raw: pct };
}

export const ImpactoPage: React.FC = () => {
  const { state } = useCofre();
  const [branchFilter, setBranchFilter] = useState<string>('all');

  const sim = useMemo(() => runImpactSimulation90Days(state, new Date()), [state]);

  const base = sim.baseline;
  const rec = sim.recommended;

  const demandDelta = pctDelta(rec.demandServed, base.demandServed);
  const costPerUnitDelta = pctDelta(rec.costPerServedUnit, base.costPerServedUnit);
  const capitalDelta = pctDelta(rec.avgIdleCapital, base.avgIdleCapital);
  const totalDelta = pctDelta(rec.totalPeriodCost, base.totalPeriodCost);

  const filteredDetailRows = useMemo(() => {
    if (branchFilter === 'all') return sim.detailRows;
    return sim.detailRows.filter((r) => r.branchId === branchFilter);
  }, [sim.detailRows, branchFilter]);

  // SVG chart dimensions for 90-day curves
  const chartW = 540;
  const chartH = 190;
  const padL = 48;
  const padR = 16;
  const padT = 16;
  const padB = 28;
  const plotW = chartW - padL - padR;
  const plotH = chartH - padT - padB;

  const maxServed = Math.max(
    1,
    ...sim.dailySeries.map((d) => Math.max(d.baselineCumulativeServed, d.recommendedCumulativeServed))
  );
  const maxCapital = Math.max(
    1,
    ...sim.dailySeries.map((d) => Math.max(d.baselineCapital, d.recommendedCapital))
  );

  const toPoints = (getter: (d: (typeof sim.dailySeries)[number]) => number, maxVal: number) =>
    sim.dailySeries
      .map((d, idx) => {
        const x = padL + (idx / Math.max(1, sim.dailySeries.length - 1)) * plotW;
        const y = padT + plotH - (getter(d) / maxVal) * plotH;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

  const servedBasePts = toPoints((d) => d.baselineCumulativeServed, maxServed);
  const servedRecPts = toPoints((d) => d.recommendedCumulativeServed, maxServed);
  const capBasePts = toPoints((d) => d.baselineCapital, maxCapital);
  const capRecPts = toPoints((d) => d.recommendedCapital, maxCapital);

  const maxTotalPeriod = Math.max(1, base.totalPeriodCost, rec.totalPeriodCost);

  const indicatorRows: {
    id: string;
    label: string;
    note?: string;
    highlight?: boolean;
    baseText: string;
    recText: string;
    deltaText: string;
    positiveIsGood: boolean;
    rawDelta: number;
  }[] = [
    {
      id: 'demand',
      label: 'Demanda atendida',
      note: `De ${base.totalDemand} unid. solicitadas em 90 dias · Rupturas: ${base.stockoutDays}d vs ${rec.stockoutDays}d`,
      baseText: `${base.demandServed} unid. (${formatNumberBR(
        (base.demandServed / Math.max(1, base.totalDemand)) * 100,
        1
      )}%)`,
      recText: `${rec.demandServed} unid. (${formatNumberBR(
        (rec.demandServed / Math.max(1, rec.totalDemand)) * 100,
        1
      )}%)`,
      deltaText: demandDelta.label,
      positiveIsGood: true,
      rawDelta: demandDelta.raw,
    },
    {
      id: 'cost-per-unit',
      label: 'Custo por caixa atendida (comparação principal)',
      note: 'Total do período ÷ demanda efetivamente atendida',
      highlight: true,
      baseText: formatCurrencyBR(base.costPerServedUnit),
      recText: formatCurrencyBR(rec.costPerServedUnit),
      deltaText: costPerUnitDelta.label,
      positiveIsGood: false,
      rawDelta: costPerUnitDelta.raw,
    },
    {
      id: 'cogs',
      label: 'Custo das mercadorias',
      note: 'Compras + frete + estoque inicial − estoque final',
      baseText: formatCurrencyBR(base.cogs),
      recText: formatCurrencyBR(rec.cogs),
      deltaText: pctDelta(rec.cogs, base.cogs).label,
      positiveIsGood: false,
      rawDelta: pctDelta(rec.cogs, base.cogs).raw,
    },
    {
      id: 'carrying',
      label: 'Custo de carregar estoque',
      note: '15% a.a. pro-rata sobre o valor médio diário imobilizado',
      baseText: formatCurrencyBR(base.carryingCost),
      recText: formatCurrencyBR(rec.carryingCost),
      deltaText: pctDelta(rec.carryingCost, base.carryingCost).label,
      positiveIsGood: false,
      rawDelta: pctDelta(rec.carryingCost, base.carryingCost).raw,
    },
    {
      id: 'stockout',
      label: 'Custo de falta realizado',
      note: `R$ 2.000/dia sem cobertura · ${base.stockoutDays} dias vs ${rec.stockoutDays} dias`,
      baseText: formatCurrencyBR(base.stockoutCost),
      recText: formatCurrencyBR(rec.stockoutCost),
      deltaText: pctDelta(rec.stockoutCost, base.stockoutCost).label,
      positiveIsGood: false,
      rawDelta: pctDelta(rec.stockoutCost, base.stockoutCost).raw,
    },
    {
      id: 'total',
      label: 'Total do período',
      note: 'Soma: custo das mercadorias + carregar estoque + falta realizado',
      highlight: true,
      baseText: formatCurrencyBR(base.totalPeriodCost),
      recText: formatCurrencyBR(rec.totalPeriodCost),
      deltaText: totalDelta.label,
      positiveIsGood: false,
      rawDelta: totalDelta.raw,
    },
    {
      id: 'expiry',
      label: 'Perdas por vencimento',
      note: 'Já incluídas no total do período (saem do estoque final)',
      baseText: formatCurrencyBR(base.expiryLosses),
      recText: formatCurrencyBR(rec.expiryLosses),
      deltaText: pctDelta(rec.expiryLosses, base.expiryLosses).label,
      positiveIsGood: false,
      rawDelta: pctDelta(rec.expiryLosses, base.expiryLosses).raw,
    },
    {
      id: 'capital',
      label: 'Capital imobilizado médio',
      note: 'Saldo médio em estoque — exibido fora da soma do período',
      baseText: formatCurrencyBR(base.avgIdleCapital),
      recText: formatCurrencyBR(rec.avgIdleCapital),
      deltaText: capitalDelta.label,
      positiveIsGood: false,
      rawDelta: capitalDelta.raw,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header + Notice */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium text-[#0F294A]">
              <TrendingUp className="w-4 h-4" aria-hidden="true" />
              <span>Simulação de impacto · Horizonte {sim.horizonDays} dias · Semente {sim.seed}</span>
            </div>
            <h1 className="font-display text-xl font-semibold text-slate-900">
              Se a farmácia comprasse pelo motor de regras, em vez do jeito atual, o que mudaria em
              90 dias?
            </h1>
            <p className="text-sm text-slate-600 max-w-3xl">
              As duas políticas enfrentam exatamente a mesma série diária de demanda, com os mesmos
              lotes iniciais e ofertas comerciais cadastradas na base atual.
            </p>
          </div>
          <div className="shrink-0">
            <StatusBadge
              tone="warning"
              icon="warn"
              label="Estimativa ilustrativa com dados fictícios, não é promessa de economia"
            />
          </div>
        </div>

        <div className="p-3.5 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-950 flex items-start gap-2.5">
          <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <strong className="font-semibold">
              Estimativa ilustrativa com dados fictícios, não é promessa de economia.
            </strong>{' '}
            A política atual de linha de base foi definida para esta demonstração (não vem de dado
            histórico de cliente) e o custo de falta (R$ 2.000/dia) é um parâmetro ilustrativo de
            apoio à decisão.
          </div>
        </div>
      </section>

      {/* Top Executive Comparison Strip */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500">Demanda atendida (90d)</div>
          <div className="mt-1.5 flex items-baseline justify-between gap-2">
            <span className="font-mono text-2xl font-semibold text-[#0F294A] tabular-nums">
              {rec.demandServed} cx
            </span>
            <span className="text-xs font-mono font-semibold text-emerald-700 tabular-nums">
              {demandDelta.label} vs {base.demandServed}
            </span>
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Dias com ruptura: {base.stockoutDays} → {rec.stockoutDays}
          </div>
        </div>

        <div className="bg-white border border-[#0F294A]/40 rounded-lg p-5">
          <div className="text-xs font-medium text-[#0F294A]">
            Custo por caixa atendida (principal)
          </div>
          <div className="mt-1.5 flex items-baseline justify-between gap-2">
            <span className="font-mono text-2xl font-semibold text-slate-900 tabular-nums">
              {formatCurrencyBR(rec.costPerServedUnit)}
            </span>
            <span
              className={`text-xs font-mono font-semibold tabular-nums ${
                costPerUnitDelta.raw <= 0 ? 'text-emerald-700' : 'text-amber-800'
              }`}
            >
              {costPerUnitDelta.label}
            </span>
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Linha de base: {formatCurrencyBR(base.costPerServedUnit)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500">
            Capital imobilizado médio (fora da soma)
          </div>
          <div className="mt-1.5 flex items-baseline justify-between gap-2">
            <span className="font-mono text-2xl font-semibold text-slate-900 tabular-nums">
              {formatCurrencyBR(rec.avgIdleCapital)}
            </span>
            <span
              className={`text-xs font-mono font-semibold tabular-nums ${
                capitalDelta.raw <= 0 ? 'text-emerald-700' : 'text-amber-800'
              }`}
            >
              {capitalDelta.label}
            </span>
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Linha de base: {formatCurrencyBR(base.avgIdleCapital)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500">
            Perdas por vencimento (no total)
          </div>
          <div className="mt-1.5 flex items-baseline justify-between gap-2">
            <span className="font-mono text-2xl font-semibold text-slate-900 tabular-nums">
              {formatCurrencyBR(rec.expiryLosses)}
            </span>
            <span className="text-xs font-mono text-slate-600 tabular-nums">
              Base: {formatCurrencyBR(base.expiryLosses)}
            </span>
          </div>
          <div className="text-xs text-slate-500 mt-1">
            FEFO + transferências preservam validade
          </div>
        </div>
      </section>

      {/* 8 Indicators Comparison Table */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-[#0F294A]" aria-hidden="true" />
            <h2 className="font-display text-base font-semibold text-slate-900">
              Comparativo dos 8 indicadores em 90 dias
            </h2>
          </div>
          <span className="text-xs text-slate-500">
            {rec.transfersCount} transferência(s) e {rec.purchasesCount} compra(s) na recomendada vs{' '}
            {base.purchasesCount} compra(s) na atual
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                <th className="py-2.5 px-4">Indicador</th>
                <th className="py-2.5 px-4 text-right">Política atual (linha de base)</th>
                <th className="py-2.5 px-4 text-right">Política recomendada (motor)</th>
                <th className="py-2.5 px-4 text-right">Variação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {indicatorRows.map((row) => {
                const isGood = row.positiveIsGood ? row.rawDelta >= 0 : row.rawDelta <= 0;
                return (
                  <tr
                    key={row.id}
                    className={row.highlight ? 'bg-slate-50/80 font-medium' : 'hover:bg-slate-50'}
                  >
                    <td className="py-3 px-4">
                      <div className="text-slate-900">{row.label}</div>
                      {row.note && <div className="text-xs text-slate-500">{row.note}</div>}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                      {row.baseText}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-[#0F294A]">
                      {row.recText}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-semibold ${
                          isGood ? 'text-emerald-700' : 'text-amber-800'
                        }`}
                      >
                        {row.deltaText}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Comparative Visual Charts */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart A: Cumulative demand served & daily capital */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-900 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[#0F294A]" aria-hidden="true" />
                <span>Curva de demanda atendida acumulada (90 dias)</span>
              </h3>
              <p className="text-xs text-slate-500">
                Mesma demanda diária (série fixa) · azul = recomendada · tracejado = linha de base
              </p>
            </div>
          </div>

          <div className="w-full overflow-x-auto">
            <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-48" role="img" aria-label="Curva de demanda atendida acumulada em 90 dias">
              <line x1={padL} y1={padT + plotH} x2={chartW - padR} y2={padT + plotH} stroke="#CBD5E1" strokeWidth="1" />
              <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="#CBD5E1" strokeWidth="1" />
              <text x={padL - 6} y={padT + 8} textAnchor="end" fontSize="10" fill="#64748B">
                {maxServed}
              </text>
              <text x={padL - 6} y={padT + plotH} textAnchor="end" fontSize="10" fill="#64748B">
                0
              </text>
              <text x={padL} y={chartH - 6} textAnchor="start" fontSize="10" fill="#64748B">
                Dia 1
              </text>
              <text x={chartW - padR} y={chartH - 6} textAnchor="end" fontSize="10" fill="#64748B">
                Dia 90
              </text>
              <polyline
                fill="none"
                stroke="#94A3B8"
                strokeWidth="2"
                strokeDasharray="5,4"
                points={servedBasePts}
              />
              <polyline
                fill="none"
                stroke="#0F294A"
                strokeWidth="2.5"
                points={servedRecPts}
              />
            </svg>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 border-t border-slate-100 pt-3">
            <span className="inline-flex items-center gap-2">
              <span className="w-3 h-0.5 bg-[#0F294A] inline-block" />
              Recomendada: <strong className="font-mono text-slate-900">{rec.demandServed} unid.</strong>
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="w-3 h-0.5 bg-slate-400 inline-block" />
              Atual (base): <strong className="font-mono text-slate-900">{base.demandServed} unid.</strong>
            </span>
          </div>
        </div>

        {/* Chart B: Daily Idle Capital & Period Total Composition */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#0F294A]" aria-hidden="true" />
              <span>Capital imobilizado diário e composição do custo do período</span>
            </h3>
            <p className="text-xs text-slate-500">
              Saldo diário em estoque (azul = recomendada, tracejado = atual)
            </p>
          </div>

          <div className="w-full overflow-x-auto">
            <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-36" role="img" aria-label="Curva de capital imobilizado em 90 dias">
              <line x1={padL} y1={padT + plotH} x2={chartW - padR} y2={padT + plotH} stroke="#CBD5E1" strokeWidth="1" />
              <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="#CBD5E1" strokeWidth="1" />
              <text x={padL - 6} y={padT + 8} textAnchor="end" fontSize="10" fill="#64748B">
                {Math.round(maxCapital / 1000)}k
              </text>
              <text x={padL - 6} y={padT + plotH} textAnchor="end" fontSize="10" fill="#64748B">
                0
              </text>
              <polyline
                fill="none"
                stroke="#94A3B8"
                strokeWidth="2"
                strokeDasharray="5,4"
                points={capBasePts}
              />
              <polyline
                fill="none"
                stroke="#0F294A"
                strokeWidth="2.5"
                points={capRecPts}
              />
            </svg>
          </div>

          {/* Stacked breakdown bar: COGS + Carrying + Stockout */}
          <div className="space-y-2.5 pt-2 border-t border-slate-100 text-xs">
            {[
              { label: 'Política atual (base)', m: base },
              { label: 'Política recomendada', m: rec },
            ].map((item) => {
              const cogsW = (Math.max(0, item.m.cogs) / maxTotalPeriod) * 100;
              const carryW = (Math.max(0, item.m.carryingCost) / maxTotalPeriod) * 100;
              const stockoutW = (Math.max(0, item.m.stockoutCost) / maxTotalPeriod) * 100;
              return (
                <div key={item.label} className="space-y-1">
                  <div className="flex justify-between">
                    <span className="font-medium text-slate-800">{item.label}</span>
                    <span className="font-mono font-semibold text-slate-900 tabular-nums">
                      {formatCurrencyBR(item.m.totalPeriodCost)}
                    </span>
                  </div>
                  <div className="w-full h-3.5 rounded bg-slate-100 overflow-hidden flex">
                    <div
                      style={{ width: `${cogsW}%` }}
                      className="bg-[#0F294A] h-full"
                      title={`Mercadorias: ${formatCurrencyBR(item.m.cogs)}`}
                    />
                    <div
                      style={{ width: `${carryW}%` }}
                      className="bg-amber-500 h-full"
                      title={`Carregamento: ${formatCurrencyBR(item.m.carryingCost)}`}
                    />
                    <div
                      style={{ width: `${stockoutW}%` }}
                      className="bg-red-600 h-full"
                      title={`Falta realizada: ${formatCurrencyBR(item.m.stockoutCost)}`}
                    />
                  </div>
                </div>
              );
            })}
            <div className="flex flex-wrap gap-4 pt-1 text-[11px] text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#0F294A]" /> Mercadorias
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" /> Carregamento (15% a.a.)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-red-600" /> Falta (R$ 2.000/dia)
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Detailed breakdown per branch & medication */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Detalhamento por unidade e medicamento (90 dias)
            </h2>
            <p className="text-xs text-slate-500">
              Atendimento, dias de ruptura, custo por unidade atendida e capital médio imobilizado
            </p>
          </div>
          <select
            aria-label="Filtrar unidade no detalhamento"
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-300 rounded bg-white"
          >
            <option value="all">Todas as filiais</option>
            {state.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                <th className="py-2.5 px-4">Filial</th>
                <th className="py-2.5 px-4">Medicamento</th>
                <th className="py-2.5 px-4 text-right">Demanda 90d</th>
                <th className="py-2.5 px-4 text-right">Atendida (Atual → Rec.)</th>
                <th className="py-2.5 px-4 text-right">Ruptura (Atual → Rec.)</th>
                <th className="py-2.5 px-4 text-right">R$/un. (Atual → Rec.)</th>
                <th className="py-2.5 px-4 text-right">Capital médio (Atual → Rec.)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {filteredDetailRows.map((r) => (
                <tr key={`${r.branchId}-${r.medicationId}`} className="hover:bg-slate-50">
                  <td className="py-2.5 px-4 font-medium text-slate-900">{r.branchName}</td>
                  <td className="py-2.5 px-4 text-slate-800">{r.medicationName.split(' (')[0]}</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                    {r.demandTotal} {r.controlUnit}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                    {r.baselineServed} →{' '}
                    <span className="font-semibold text-[#0F294A]">{r.recommendedServed}</span>
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                    <span className={r.baselineStockoutDays > 0 ? 'text-red-700' : 'text-slate-700'}>
                      {r.baselineStockoutDays}d
                    </span>{' '}
                    →{' '}
                    <span
                      className={`font-semibold ${
                        r.recommendedStockoutDays < r.baselineStockoutDays
                          ? 'text-emerald-700'
                          : 'text-slate-900'
                      }`}
                    >
                      {r.recommendedStockoutDays}d
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                    {formatCurrencyBR(r.baselineCostPerUnit)} →{' '}
                    <span className="font-semibold">{formatCurrencyBR(r.recommendedCostPerUnit)}</span>
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                    {formatCurrencyBR(r.baselineAvgCapital)} →{' '}
                    <span className="font-semibold text-emerald-700">
                      {formatCurrencyBR(r.recommendedAvgCapital)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Premissas da simulação & Limites */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-display text-base font-semibold text-slate-900 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#0F294A]" aria-hidden="true" />
            <span>Premissas da simulação e limites explícitos</span>
          </h2>
          <span className="text-xs font-mono text-slate-500">
            Semente fixa: {sim.seed} · Z = {formatNumberBR(sim.zScore, 2)}
          </span>
        </div>

        <ul className="space-y-1.5 text-xs text-slate-700 list-disc pl-5">
          {sim.assumptions.map((a, idx) => (
            <li key={idx} className="leading-relaxed">
              {a}
            </li>
          ))}
        </ul>

        <div className="p-3 rounded bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            <strong>Limites do modelo:</strong> a política atual (linha de base) foi definida para
            esta prova de conceito e não representa dados reais de compras de um cliente; o custo de
            falta de R$ 2.000/dia é um parâmetro ilustrativo configurável em código, não uma perda
            contábil real.
          </span>
        </div>
      </section>
    </div>
  );
};
