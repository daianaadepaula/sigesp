import React, { useMemo, useState } from 'react';
import { Building2, MapPin, Pill } from 'lucide-react';
import { useCofre } from '../context/CofreContext';
import {
  calculateBranchMedicationMetrics,
  getLotAvailableQty,
  isLotExpired,
} from '../utils/calculations';
import {
  daysBetweenDates,
  formatCurrencyBR,
  formatDateBR,
  formatNumberBR,
} from '../utils/formatters';
import { StatusBadge } from './StatusBadge';

export const FiliaisEstoquesPage: React.FC = () => {
  const {
    state,
    activeBranch,
    setActiveTab,
    setFocusBranchId,
    setFocusMedicationId,
  } = useCofre();

  const [viewMode, setViewMode] = useState<'por_filial' | 'por_medicamento'>('por_filial');
  const [selectedBranchId, setSelectedBranchId] = useState<string>(
    activeBranch?.id ?? state.branches[0]?.id ?? ''
  );
  const [selectedMedId, setSelectedMedId] = useState<string>(state.medications[0]?.id ?? '');

  const now = new Date();
  const selectedBranch = state.branches.find((b) => b.id === selectedBranchId) ?? state.branches[0];
  const selectedMed = state.medications.find((m) => m.id === selectedMedId) ?? state.medications[0];

  const branchSummaryRows = useMemo(() => {
    if (!selectedBranch) return [];
    return state.medications.map((med) => {
      const metrics = calculateBranchMedicationMetrics(
        state,
        selectedBranch.id,
        med.id,
        now
      );
      const lots = state.lots
        .filter((l) => l.branchId === selectedBranch.id && l.medicationId === med.id)
        .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
      return { med, metrics, lots };
    });
  }, [state, selectedBranch, now]);

  const medicationComparisonRows = useMemo(() => {
    if (!selectedMed) return [];
    return state.branches.map((branch) => {
      const metrics = calculateBranchMedicationMetrics(
        state,
        branch.id,
        selectedMed.id,
        now
      );
      return { branch, metrics };
    });
  }, [state, selectedMed, now]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-semibold text-slate-900">
            Filiais e estoques
          </h1>
          <p className="text-sm text-slate-600">
            Consulte os lotes por unidade ou compare um mesmo SKU lado a lado em toda a rede
          </p>
        </div>

        {/* Mode Switcher */}
        <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start">
          <button
            type="button"
            onClick={() => setViewMode('por_filial')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              viewMode === 'por_filial'
                ? 'bg-white text-[#0F294A] shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Consultar por filial</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('por_medicamento')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              viewMode === 'por_medicamento'
                ? 'bg-white text-[#0F294A] shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Pill className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Comparar por medicamento</span>
          </button>
        </div>
      </div>

      {viewMode === 'por_filial' && selectedBranch && (
        <div className="space-y-5">
          {/* Branch Selector & Details */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="font-mono font-medium text-[#0F294A]">{selectedBranch.code}</span>
                <span aria-hidden="true">·</span>
                <span>Alerta de validade: {selectedBranch.alertDaysBeforeExpiry} dias</span>
              </div>
              <h2 className="font-display text-lg font-semibold text-slate-900">
                {selectedBranch.name}
              </h2>
              <div className="text-sm text-slate-600 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
                <span>
                  {selectedBranch.address} — {selectedBranch.cityState}
                </span>
              </div>
              <div className="text-xs text-slate-500 pt-1">
                Distâncias e fretes cadastrados:{' '}
                {selectedBranch.distances
                  .map((d) => {
                    const target = state.branches.find((b) => b.id === d.toBranchId);
                    const costStr =
                      d.estimatedTransferCost !== null && d.estimatedTransferCost !== undefined
                        ? ` · ${formatCurrencyBR(d.estimatedTransferCost)}`
                        : ' · custo não informado';
                    return `${target?.name ?? d.toBranchId}: ${d.distanceKm} km (${
                      d.transitDays === 0 ? 'mesmo dia' : `${d.transitDays} dia`
                    }${costStr})`;
                  })
                  .join(' · ')}
              </div>
            </div>

            <div className="shrink-0">
              <label htmlFor="select-branch-view" className="block text-xs font-medium text-slate-600 mb-1">
                Selecionar filial
              </label>
              <select
                id="select-branch-view"
                value={selectedBranch.id}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="px-3.5 py-2 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-[#0F294A]"
              >
                {state.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Branch Medications & Lots */}
          <div className="space-y-4">
            {branchSummaryRows.map(({ med, metrics, lots }) => (
              <div key={med.id} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display font-semibold text-slate-900">{med.name}</span>
                      <span className="text-xs font-mono text-slate-500">{med.sku}</span>
                      {med.isRefrigerated && (
                        <span className="text-xs font-medium text-[#0F294A]">
                          · Cofre refrigerado (2–8 °C)
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-600 mt-0.5">
                      {med.activeIngredient} · {med.concentration} · {med.presentation} · Ref.:{' '}
                      {formatCurrencyBR(med.unitCostReference)}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <div>
                      <span className="text-slate-500">Disponível: </span>
                      <span className="font-mono font-semibold text-slate-900">
                        {metrics.availableUsableQty} {med.controlUnit}
                      </span>
                      {metrics.blockedQty > 0 && (
                        <span className="text-red-700 font-mono ml-1">
                          ({metrics.blockedQty} bloq.)
                        </span>
                      )}
                    </div>
                    <div>
                      <span className="text-slate-500">Segurança: </span>
                      <span className="font-mono font-medium text-slate-800">{metrics.safetyStock}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Alvo: </span>
                      <span className="font-mono font-medium text-slate-800">{metrics.targetStock}</span>
                    </div>
                    {metrics.netNeedQty > 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          setFocusBranchId(selectedBranch.id);
                          setFocusMedicationId(med.id);
                          setActiveTab('reposicao');
                        }}
                        className="px-2.5 py-1 text-xs font-medium bg-red-50 hover:bg-red-100 text-red-800 border border-red-200 rounded cursor-pointer"
                      >
                        Faltam {metrics.netNeedQty} · Ver recomendação
                      </button>
                    ) : metrics.excessQty > 0 ? (
                      <StatusBadge
                        tone="info"
                        icon="check"
                        label={`Excedente: ${metrics.excessQty} ${med.controlUnit}`}
                      />
                    ) : (
                      <StatusBadge tone="nominal" icon="check" label="Estoque equilibrado" />
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs font-medium text-slate-500">
                        <th className="py-2 px-4">Lote</th>
                        <th className="py-2 px-4">Validade</th>
                        <th className="py-2 px-4 text-right">Dias restantes</th>
                        <th className="py-2 px-4 text-right">Saldo físico</th>
                        <th className="py-2 px-4 text-right">Reservado</th>
                        <th className="py-2 px-4 text-right">Disponível</th>
                        <th className="py-2 px-4">Situação do lote</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {lots.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-4 px-4 text-xs text-slate-500">
                            Nenhum lote registrado nesta filial para este medicamento.
                          </td>
                        </tr>
                      ) : (
                        lots.map((lot) => {
                          const daysLeft = daysBetweenDates(now, lot.expiryDate);
                          const expired = isLotExpired(lot, now);
                          const avail = getLotAvailableQty(lot, now);
                          const nearExpiry =
                            !expired &&
                            lot.status === 'utilizavel' &&
                            daysLeft <= selectedBranch.alertDaysBeforeExpiry;

                          return (
                            <tr key={lot.id} className="hover:bg-slate-50">
                              <td className="py-2.5 px-4 font-mono font-medium text-slate-900">
                                {lot.lotCode}
                              </td>
                              <td className="py-2.5 px-4 font-mono tabular-nums text-slate-700">
                                {formatDateBR(lot.expiryDate)}
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                                {daysLeft} d
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                                {lot.physicalQty}
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                                {lot.reservedQty}
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                                {avail}
                              </td>
                              <td className="py-2.5 px-4">
                                {lot.status === 'bloqueado' ? (
                                  <StatusBadge
                                    tone="danger"
                                    icon="lock"
                                    label={`Bloqueado (${lot.blockedReason ?? 'quarentena'})`}
                                  />
                                ) : expired ? (
                                  <StatusBadge tone="danger" icon="x" label="Vencido (uso impedido)" />
                                ) : nearExpiry ? (
                                  <StatusBadge
                                    tone="warning"
                                    icon="clock"
                                    label={`Vence em ${daysLeft}d`}
                                  />
                                ) : (
                                  <StatusBadge tone="nominal" icon="check" label="Utilizável" />
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {viewMode === 'por_medicamento' && selectedMed && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-xs font-mono text-[#0F294A]">
                {selectedMed.sku} · EAN {selectedMed.barcode}
              </div>
              <h2 className="font-display text-lg font-semibold text-slate-900">
                {selectedMed.name}
              </h2>
              <p className="text-xs text-slate-600">
                {selectedMed.activeIngredient} · {selectedMed.concentration} ·{' '}
                {selectedMed.pharmaceuticalForm} · {selectedMed.presentation} · Unidade:{' '}
                {selectedMed.controlUnit}
              </p>
            </div>

            <div className="shrink-0">
              <label htmlFor="select-med-compare" className="block text-xs font-medium text-slate-600 mb-1">
                Selecionar medicamento
              </label>
              <select
                id="select-med-compare"
                value={selectedMed.id}
                onChange={(e) => setSelectedMedId(e.target.value)}
                className="px-3.5 py-2 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-[#0F294A]"
              >
                {state.medications.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.sku})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200">
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Comparativo lado a lado entre todas as filiais
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                    <th className="py-2.5 px-4">Filial</th>
                    <th className="py-2.5 px-4 text-right">Consumo 30d</th>
                    <th className="py-2.5 px-4 text-right">CMD</th>
                    <th className="py-2.5 px-4 text-right">Saldo disponível</th>
                    <th className="py-2.5 px-4 text-right">Estoque segurança</th>
                    <th className="py-2.5 px-4 text-right">Estoque-alvo</th>
                    <th className="py-2.5 px-4">Próximo vencimento</th>
                    <th className="py-2.5 px-4 text-right">Saldo vs Alvo</th>
                    <th className="py-2.5 px-4">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {medicationComparisonRows.map(({ branch, metrics }) => (
                    <tr key={branch.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{branch.name}</div>
                        <div className="text-xs text-slate-500 font-mono">{branch.code}</div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                        {metrics.netConsumptionPeriod} {selectedMed.controlUnit}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                        {formatNumberBR(metrics.averageDailyConsumption, 2)}/d
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {metrics.availableUsableQty} {selectedMed.controlUnit}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                        {metrics.safetyStock}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-slate-900">
                        {metrics.targetStock}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-slate-700">
                        {metrics.nextUsableExpiryDate ? (
                          <span>
                            {formatDateBR(metrics.nextUsableExpiryDate)} ({metrics.nextUsableExpiryDays}d)
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                        {metrics.netNeedQty > 0 ? (
                          <span className="text-red-700">−{metrics.netNeedQty} (falta)</span>
                        ) : metrics.excessQty > 0 ? (
                          <span className="text-[#0F294A]">+{metrics.excessQty} (excedente)</span>
                        ) : (
                          <span className="text-emerald-700">0 (no alvo)</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {metrics.netNeedQty > 0 ? (
                          <button
                            type="button"
                            onClick={() => {
                              setFocusBranchId(branch.id);
                              setFocusMedicationId(selectedMed.id);
                              setActiveTab('reposicao');
                            }}
                            className="px-2.5 py-1 text-xs font-medium bg-[#0F294A] text-white rounded hover:bg-[#163864] cursor-pointer whitespace-nowrap"
                          >
                            Ver recomendação
                          </button>
                        ) : metrics.excessQty > 0 ? (
                          <StatusBadge tone="info" icon="check" label="Pode ceder excedente" />
                        ) : (
                          <StatusBadge tone="nominal" icon="check" label="Atendido" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
