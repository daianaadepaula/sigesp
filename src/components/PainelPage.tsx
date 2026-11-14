import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckSquare,
  PackageMinus,
  Play,
  RotateCcw,
  Sparkles,
  ThermometerSnowflake,
} from 'lucide-react';
import { useCofre } from '../context/CofreContext';
import { requestAiRewrite } from '../services/aiRewriteService';
import { isLotExpired } from '../utils/calculations';
import {
  daysBetweenDates,
  formatCurrencyBR,
  formatDateBR,
  formatNumberBR,
  purchaseStatusLabelBR,
  sensorStatusLabelBR,
  transferStatusLabelBR,
} from '../utils/formatters';
import { StatusBadge } from './StatusBadge';

export const PainelPage: React.FC = () => {
  const {
    state,
    activeBranch,
    recommendations,
    operationalAlerts,
    setActiveTab,
    setFocusBranchId,
    setFocusMedicationId,
    startDemo,
    restoreDemo,
  } = useCofre();

  const [aiDailySummary, setAiDailySummary] = useState<{
    text: string;
    usedAi: boolean;
  } | null>(null);
  const [loadingDailyAi, setLoadingDailyAi] = useState(false);

  const now = new Date();

  const activeVault = state.vaults.find((v) => v.branchId === activeBranch?.id) ?? state.vaults[0];
  const openIncidents = state.conservationIncidents.filter(
    (i) => i.status === 'aberta' || i.status === 'bloqueio_aplicado'
  );

  // 1. O que está faltando?
  const missingItems = useMemo(() => {
    return recommendations
      .filter(
        (r) =>
          r.metrics.netNeedQty > 0 ||
          r.metrics.availableUsableQty <= r.metrics.safetyStock
      )
      .sort((a, b) => b.metrics.netNeedQty - a.metrics.netNeedQty);
  }, [recommendations]);

  // 2. O que vai vencer?
  const expiringItems = useMemo(() => {
    const list: {
      lotId: string;
      branchId: string;
      branchName: string;
      medicationId: string;
      medicationName: string;
      lotCode: string;
      physicalQty: number;
      availableQty: number;
      expiryDate: string;
      daysLeft: number;
      expired: boolean;
      alertDays: number;
    }[] = [];

    for (const lot of state.lots) {
      if (lot.physicalQty <= 0) continue;
      const branch = state.branches.find((b) => b.id === lot.branchId);
      const med = state.medications.find((m) => m.id === lot.medicationId);
      if (!branch || !med) continue;
      const daysLeft = daysBetweenDates(now, lot.expiryDate);
      const expired = isLotExpired(lot, now);
      if (expired || daysLeft <= branch.alertDaysBeforeExpiry) {
        list.push({
          lotId: lot.id,
          branchId: branch.id,
          branchName: branch.name,
          medicationId: med.id,
          medicationName: med.name,
          lotCode: lot.lotCode,
          physicalQty: lot.physicalQty,
          availableQty: Math.max(0, lot.physicalQty - lot.reservedQty),
          expiryDate: lot.expiryDate,
          daysLeft,
          expired,
          alertDays: branch.alertDaysBeforeExpiry,
        });
      }
    }

    return list.sort((a, b) => a.daysLeft - b.daysLeft);
  }, [state.lots, state.branches, state.medications, now]);

  // 3. O que precisa da minha decisão?
  const pendingDecisions = useMemo(() => {
    const items: {
      id: string;
      category: 'Conservação' | 'Transferência' | 'Compra' | 'Recomendação';
      title: string;
      subtitle: string;
      statusLabel: string;
      tone: 'warning' | 'info' | 'danger';
      actionLabel: string;
      onAction: () => void;
    }[] = [];

    for (const inc of openIncidents) {
      const br = state.branches.find((b) => b.id === inc.branchId);
      items.push({
        id: inc.id,
        category: 'Conservação',
        title: `${inc.code} · ${br?.name ?? ''} (${inc.equipmentCode})`,
        subtitle: `${inc.readingsSummary} · Lotes bloqueados: ${inc.affectedLotCodes.join(', ') || 'nenhum'}`,
        statusLabel: 'Aguardando avaliação técnica',
        tone: 'danger',
        actionLabel: 'Avaliar ocorrência',
        onAction: () => setActiveTab('cofre'),
      });
    }

    for (const trf of state.transfers) {
      if (trf.status === 'recebida' || trf.status === 'recusada') continue;
      const med = state.medications.find((m) => m.id === trf.medicationId);
      const orig = state.branches.find((b) => b.id === trf.originBranchId);
      const dest = state.branches.find((b) => b.id === trf.destinationBranchId);
      items.push({
        id: trf.id,
        category: 'Transferência',
        title: `${trf.code} · ${med?.name ?? ''} (${trf.quantity} ${med?.controlUnit ?? 'un'})`,
        subtitle: `${orig?.name ?? ''} → ${dest?.name ?? ''} · Lote ${trf.lotCode}`,
        statusLabel: transferStatusLabelBR(trf.status),
        tone: trf.status === 'solicitada' ? 'warning' : 'info',
        actionLabel: 'Acompanhar',
        onAction: () => setActiveTab('reposicao'),
      });
    }

    for (const pr of state.purchaseRequests) {
      if (
        pr.status === 'recebida' ||
        pr.status === 'recusada' ||
        pr.status === 'cancelada'
      ) {
        continue;
      }
      const med = state.medications.find((m) => m.id === pr.medicationId);
      const branch = state.branches.find((b) => b.id === pr.branchId);
      items.push({
        id: pr.id,
        category: 'Compra',
        title: `${pr.code} · ${med?.name ?? ''} (${pr.pendingQty} pendentes de ${pr.requestedQty})`,
        subtitle: `${branch?.name ?? ''} · ${pr.supplierName} · ${formatCurrencyBR(pr.totalCost)}`,
        statusLabel: purchaseStatusLabelBR(pr.status, pr.supplierConfirmed),
        tone:
          pr.status === 'pendente' ||
          pr.status === 'aguardando_aprovacao' ||
          pr.status === 'escalonada_diretor'
            ? 'warning'
            : 'info',
        actionLabel: 'Gerenciar compra',
        onAction: () => setActiveTab('reposicao'),
      });
    }

    for (const rec of recommendations) {
      if (rec.metrics.netNeedQty <= 0) continue;
      const branch = state.branches.find((b) => b.id === rec.branchId);
      const med = state.medications.find((m) => m.id === rec.medicationId);
      items.push({
        id: `rec-${rec.branchId}-${rec.medicationId}`,
        category: 'Recomendação',
        title: `${branch?.name ?? ''} · ${med?.name ?? ''}`,
        subtitle: `Faltam ${rec.metrics.netNeedQty} ${med?.controlUnit ?? 'un'} (sugestão: ${rec.totalSuggestedTransferQty} transferência + ${rec.remainingPurchaseQty} compra)`,
        statusLabel: rec.stockoutRiskBeforeArrival.hasRisk
          ? 'Risco de ruptura'
          : 'Aguardando decisão',
        tone: rec.stockoutRiskBeforeArrival.hasRisk ? 'danger' : 'warning',
        actionLabel: 'Ver recomendação',
        onAction: () => {
          setFocusBranchId(rec.branchId);
          setFocusMedicationId(rec.medicationId);
          setActiveTab('reposicao');
        },
      });
    }

    return items;
  }, [
    openIncidents,
    state,
    recommendations,
    setActiveTab,
    setFocusBranchId,
    setFocusMedicationId,
  ]);

  return (
    <div className="space-y-6">
      <section className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="text-xs font-medium text-[#0F294A]">
            Painel Executivo · Filial ativa: {activeBranch?.name} · Integração com cofre simulada
          </div>
          <h1 className="font-display text-xl font-semibold text-slate-900">
            Visão imediata de faltas, vencimentos, conservação e decisões
          </h1>
          <p className="text-sm text-slate-600 max-w-3xl">
            Inicie o roteiro guiado de 8 etapas com medicamento de alto custo refrigerado
            (Imunoglobulina 5 g/100 mL) clicando em{' '}
            <strong className="font-semibold text-slate-900">Iniciar demonstração</strong>.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={startDemo}
            className="px-4 py-2 bg-[#0F294A] hover:bg-[#163864] text-white text-sm font-medium rounded-md transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer"
          >
            <Play className="w-4 h-4" aria-hidden="true" />
            <span>Iniciar demonstração</span>
          </button>
          <button
            type="button"
            onClick={restoreDemo}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            <span>Restaurar</span>
          </button>
        </div>
      </section>

      {/* Deterministic Daily Summary + Explicar com IA */}
      {(() => {
        const criticalAlerts = operationalAlerts.filter(
          (a) => !a.acknowledged && a.severity === 'critica'
        );
        const quarantinedLots = state.lots.filter(
          (l) => l.status === 'bloqueado' && l.physicalQty > 0
        );
        const pendingApprovals = state.purchaseRequests.filter(
          (p) =>
            p.status === 'aguardando_aprovacao' ||
            p.status === 'escalonada_diretor' ||
            p.status === 'pendente'
        );
        const topRec = missingItems[0];
        const topMed = topRec
          ? state.medications.find((m) => m.id === topRec.medicationId)
          : null;
        const topBr = topRec
          ? state.branches.find((b) => b.id === topRec.branchId)
          : null;

        const deterministicDailyText = [
          `Hoje há ${missingItems.length} item(ns) abaixo do estoque-alvo ou de segurança e ${criticalAlerts.length} alerta(s) crítico(s) não reconhecido(s).`,
          topRec && topMed && topBr
            ? `Prioridade imediata: ${topMed.name.split(' (')[0]} na ${topBr.name} (saldo útil ${
                topRec.metrics.availableUsableQty
              }, alvo ${topRec.metrics.targetStock}, sugestão ${
                topRec.totalSuggestedTransferQty
              } por transferência + ${topRec.remainingPurchaseQty} por compra).`
            : 'Nenhuma falta crítica pendente nos parâmetros atuais.',
          quarantinedLots.length > 0
            ? `Lotes em quarentena fora do saldo útil: ${quarantinedLots
                .map((l) => `${l.lotCode} (${l.physicalQty} unid.)`)
                .join(', ')}.`
            : '',
          pendingApprovals.length > 0
            ? `Há ${pendingApprovals.length} pedido(s) de compra aguardando aprovação independente.`
            : '',
        ]
          .filter(Boolean)
          .join(' ');

        const handleExplainDaily = async () => {
          setLoadingDailyAi(true);
          const res = await requestAiRewrite({
            mode: 'daily_summary',
            deterministicText: deterministicDailyText,
            contextTitle: `Resumo executivo · ${activeBranch?.name ?? 'Rede'}`,
          });
          setAiDailySummary({ text: res.text, usedAi: res.usedAi });
          setLoadingDailyAi(false);
        };

        return (
          <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[#0F294A]">
                  Resumo executivo do dia
                </span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                  Origem: motor de regras determinístico
                </span>
              </div>
              <button
                type="button"
                disabled={loadingDailyAi}
                onClick={handleExplainDaily}
                className="px-3 py-1 text-xs font-medium border border-[#0F294A] text-[#0F294A] hover:bg-slate-50 rounded inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{loadingDailyAi ? 'Gerando...' : 'Explicar com IA'}</span>
              </button>
            </div>
            <p className="text-xs text-slate-700 leading-relaxed">{deterministicDailyText}</p>
            {aiDailySummary && (
              <div className="p-3 rounded bg-slate-50 border border-slate-200 text-xs space-y-1">
                <div className="font-semibold text-[#0F294A]">
                  {aiDailySummary.usedAi
                    ? 'Texto reescrito por IA (mantendo os mesmos números do motor)'
                    : 'Texto explicativo determinístico (IA indisponível sem chave configurada)'}
                </div>
                <p className="text-slate-700 leading-relaxed">{aiDailySummary.text}</p>
              </div>
            )}
          </section>
        );
      })()}

      {/* Summary KPI Row */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-600">O que está faltando?</span>
            <PackageMinus className="w-4 h-4 text-[#0F294A]" aria-hidden="true" />
          </div>
          <div className="font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {missingItems.length} {missingItems.length === 1 ? 'item' : 'itens'}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Abaixo do estoque-alvo ou nível de segurança
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-600">O que vai vencer?</span>
            <AlertTriangle className="w-4 h-4 text-amber-600" aria-hidden="true" />
          </div>
          <div className="font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {expiringItems.length} {expiringItems.length === 1 ? 'lote' : 'lotes'}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Vencidos ou na janela de alerta por filial
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-600">
              O que precisa da minha decisão?
            </span>
            <CheckSquare className="w-4 h-4 text-[#0F294A]" aria-hidden="true" />
          </div>
          <div className="font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {pendingDecisions.length} {pendingDecisions.length === 1 ? 'ação' : 'ações'}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Ocorrências, recomendações, transferências e compras
          </div>
        </div>

        <button
          type="button"
          onClick={() => setActiveTab('cofre')}
          className="bg-white border border-slate-200 hover:border-[#0F294A] rounded-lg p-5 text-left transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-600">Cofre refrigerado (simulado)</span>
            <ThermometerSnowflake className="w-4 h-4 text-[#0F294A]" aria-hidden="true" />
          </div>
          <div className="font-mono text-2xl font-semibold text-[#0F294A] tabular-nums">
            {activeVault?.currentTempC !== null && activeVault?.currentTempC !== undefined
              ? `${activeVault.currentTempC.toFixed(1)} °C`
              : 'Sem leitura'}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {activeVault?.equipmentCode} · {sensorStatusLabelBR(activeVault?.sensorStatus ?? 'conectado')}
          </div>
        </button>
      </section>

      {/* Question 1 */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              1. O que está faltando?
            </h2>
            <p className="text-xs text-slate-500">
              Comparação entre saldo disponível utilizável e estoque-alvo por filial
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('movimentacoes')}
            className="text-xs font-medium text-[#0F294A] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>Registrar movimentação</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>

        {missingItems.length === 0 ? (
          <div className="p-6 text-sm text-slate-600">
            Nenhum medicamento abaixo do estoque-alvo neste momento.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                  <th className="py-2.5 px-4">Filial</th>
                  <th className="py-2.5 px-4">Medicamento</th>
                  <th className="py-2.5 px-4 text-right">Consumo/dia</th>
                  <th className="py-2.5 px-4 text-right">Utilizável</th>
                  <th className="py-2.5 px-4 text-right">Segurança</th>
                  <th className="py-2.5 px-4 text-right">Alvo</th>
                  <th className="py-2.5 px-4 text-right">Necessidade</th>
                  <th className="py-2.5 px-4">Situação</th>
                  <th className="py-2.5 px-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {missingItems.map((rec) => {
                  const branch = state.branches.find((b) => b.id === rec.branchId);
                  const med = state.medications.find((m) => m.id === rec.medicationId);
                  const m = rec.metrics;
                  return (
                    <tr key={`${rec.branchId}-${rec.medicationId}`} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-medium text-slate-900">{branch?.name}</td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{med?.name}</div>
                        <div className="text-xs text-slate-500 font-mono">{med?.sku}</div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                        {formatNumberBR(m.averageDailyConsumption, 2)}/d
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-slate-900">
                        {m.availableUsableQty} {med?.controlUnit}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                        {m.safetyStock}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                        {m.targetStock}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-red-700">
                        {m.netNeedQty} {med?.controlUnit}
                      </td>
                      <td className="py-3 px-4">
                        {m.availableUsableQty <= m.safetyStock ? (
                          <StatusBadge tone="danger" icon="danger" label="Abaixo da segurança" />
                        ) : (
                          <StatusBadge tone="warning" icon="warn" label="Abaixo do alvo" />
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setFocusBranchId(rec.branchId);
                            setFocusMedicationId(rec.medicationId);
                            setActiveTab('reposicao');
                          }}
                          className="px-3 py-1 text-xs font-medium bg-[#0F294A] hover:bg-[#163864] text-white rounded transition-colors whitespace-nowrap cursor-pointer"
                        >
                          Ver recomendação
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Question 2 */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              2. O que vai vencer?
            </h2>
            <p className="text-xs text-slate-500">
              Lotes vencidos ou dentro da antecedência de alerta configurada por filial
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('alertas')}
            className="text-xs font-medium text-[#0F294A] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>Abrir alertas e prazos</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>

        {expiringItems.length === 0 ? (
          <div className="p-6 text-sm text-slate-600">
            Nenhum lote dentro da janela de alerta de vencimento.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                  <th className="py-2.5 px-4">Filial</th>
                  <th className="py-2.5 px-4">Medicamento</th>
                  <th className="py-2.5 px-4">Lote</th>
                  <th className="py-2.5 px-4 text-right">Saldo</th>
                  <th className="py-2.5 px-4">Validade</th>
                  <th className="py-2.5 px-4 text-right">Dias restantes</th>
                  <th className="py-2.5 px-4">Estado</th>
                  <th className="py-2.5 px-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {expiringItems.map((item) => (
                  <tr key={item.lotId} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-medium text-slate-900">{item.branchName}</td>
                    <td className="py-3 px-4 text-slate-900">{item.medicationName}</td>
                    <td className="py-3 px-4 font-mono text-slate-700">{item.lotCode}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900">
                      {item.availableQty}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-700">
                      {formatDateBR(item.expiryDate)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-slate-900">
                      {item.daysLeft} d
                    </td>
                    <td className="py-3 px-4">
                      {item.expired ? (
                        <StatusBadge tone="danger" icon="x" label="Vencido (bloqueado)" />
                      ) : (
                        <StatusBadge
                          tone="warning"
                          icon="clock"
                          label={`Alerta (${item.alertDays}d)`}
                        />
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => setActiveTab('alertas')}
                        className="px-3 py-1 text-xs font-medium border border-slate-300 hover:bg-slate-50 text-slate-800 rounded transition-colors whitespace-nowrap cursor-pointer"
                      >
                        Encontrar filial que precisa
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Question 3 */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              3. O que precisa da minha decisão?
            </h2>
            <p className="text-xs text-slate-500">
              Ocorrências de conservação, aprovações, expedições, recebimentos e recomendações
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('reposicao')}
            className="text-xs font-medium text-[#0F294A] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>Ir para Reposição e compras</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>

        {pendingDecisions.length === 0 ? (
          <div className="p-6 text-sm text-slate-600">
            Nenhuma decisão operacional pendente no momento.
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {pendingDecisions.map((dec) => (
              <div
                key={dec.id}
                className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50"
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-semibold text-[#0F294A]">{dec.category}</span>
                    <span aria-hidden="true">·</span>
                    <StatusBadge
                      tone={dec.tone}
                      icon={
                        dec.tone === 'danger'
                          ? 'danger'
                          : dec.tone === 'warning'
                          ? 'warn'
                          : 'truck'
                      }
                      label={dec.statusLabel}
                    />
                  </div>
                  <div className="text-sm font-medium text-slate-900">{dec.title}</div>
                  <div className="text-xs text-slate-600">{dec.subtitle}</div>
                </div>
                <button
                  type="button"
                  onClick={dec.onAction}
                  className="px-3.5 py-1.5 text-xs font-medium bg-[#0F294A] hover:bg-[#163864] text-white rounded transition-colors whitespace-nowrap shrink-0 self-start sm:self-center cursor-pointer"
                >
                  {dec.actionLabel}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
