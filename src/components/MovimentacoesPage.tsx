import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Barcode,
  CheckCircle2,
  PackageCheck,
  Search,
  ShieldAlert,
  ThermometerSnowflake,
} from 'lucide-react';
import { useCofre } from '../context/CofreContext';
import { MovementType } from '../types/cofre';
import {
  calculateBranchMedicationMetrics,
  getLotAvailableQty,
  isLotExpired,
  isLotUsable,
} from '../utils/calculations';
import {
  addDaysISO,
  daysBetweenDates,
  formatCurrencyBR,
  formatDateBR,
  movementTypeLabelBR,
} from '../utils/formatters';
import { StatusBadge } from './StatusBadge';

export const MovimentacoesPage: React.FC = () => {
  const {
    state,
    currentUser,
    activeBranch,
    focusMedicationId,
    setFocusMedicationId,
    focusBranchId,
    setFocusBranchId,
    registerMovement,
    setActiveTab,
  } = useCofre();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMedId, setSelectedMedId] = useState<string>(
    focusMedicationId ?? state.medications[0]?.id ?? ''
  );
  const [selectedBranchId, setSelectedBranchId] = useState<string>(
    activeBranch?.id ?? state.branches[0]?.id ?? ''
  );

  const [movType, setMovType] = useState<MovementType>('saida_consumo');
  const [selectedLotId, setSelectedLotId] = useState<string>('');
  const [isNewLot, setIsNewLot] = useState(false);
  const [newLotCode, setNewLotCode] = useState('');
  const [newLotExpiry, setNewLotExpiry] = useState(addDaysISO(new Date(), 180));
  const [quantity, setQuantity] = useState<string>('2');
  const [adjDirection, setAdjDirection] = useState<'add' | 'remove'>('remove');
  const [reason, setReason] = useState('Dispensação assistencial controlada (demonstração)');

  const [formError, setFormError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{
    message: string;
    branchId: string;
    medicationId: string;
    showRecommendBtn: boolean;
    missingSessionWarning?: boolean;
  } | null>(null);

  const now = new Date();

  useEffect(() => {
    if (focusMedicationId) setSelectedMedId(focusMedicationId);
  }, [focusMedicationId]);

  useEffect(() => {
    if (focusBranchId && currentUser?.authorizedBranchIds.includes(focusBranchId)) {
      setSelectedBranchId(focusBranchId);
    } else if (
      activeBranch &&
      (!selectedBranchId || !currentUser?.authorizedBranchIds.includes(selectedBranchId))
    ) {
      setSelectedBranchId(activeBranch.id);
    }
  }, [focusBranchId, activeBranch, selectedBranchId, currentUser]);

  const filteredMeds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return state.medications;
    return state.medications.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.sku.toLowerCase().includes(q) ||
        m.barcode.toLowerCase().includes(q) ||
        m.activeIngredient.toLowerCase().includes(q)
    );
  }, [state.medications, searchQuery]);

  const selectedMed =
    state.medications.find((m) => m.id === selectedMedId) ?? state.medications[0];
  const selectedBranch =
    state.branches.find((b) => b.id === selectedBranchId) ?? activeBranch ?? state.branches[0];

  const branchVault = state.vaults.find((v) => v.branchId === selectedBranch?.id);
  const activeVaultSession = branchVault?.activeSessionId
    ? state.vaultSessions.find((s) => s.id === branchVault.activeSessionId) ?? null
    : null;

  const branchLots = useMemo(() => {
    if (!selectedMed || !selectedBranch) return [];
    return state.lots
      .filter((l) => l.branchId === selectedBranch.id && l.medicationId === selectedMed.id)
      .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
  }, [state.lots, selectedMed, selectedBranch]);

  const fefoSuggestedLot = useMemo(() => {
    return (
      branchLots.find((l) => isLotUsable(l, now) && getLotAvailableQty(l, now) > 0) ?? null
    );
  }, [branchLots, now]);

  useEffect(() => {
    if (movType === 'saida_consumo' && fefoSuggestedLot) {
      setSelectedLotId(fefoSuggestedLot.id);
      setIsNewLot(false);
    } else if (branchLots.length > 0 && !branchLots.some((l) => l.id === selectedLotId)) {
      setSelectedLotId(branchLots[0].id);
    }
  }, [movType, fefoSuggestedLot, branchLots, selectedLotId]);

  const handleBarcodeSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim().toLowerCase();
    if (!q) return;
    const exact = state.medications.find(
      (m) =>
        m.barcode.toLowerCase() === q ||
        m.sku.toLowerCase() === q ||
        m.name.toLowerCase().includes(q)
    );
    if (exact) {
      setSelectedMedId(exact.id);
      setFocusMedicationId(exact.id);
      setFormError(null);
    }
  };

  const handleQuickScan = (barcode: string) => {
    setSearchQuery(barcode);
    const match = state.medications.find((m) => m.barcode === barcode);
    if (match) {
      setSelectedMedId(match.id);
      setFocusMedicationId(match.id);
      setFormError(null);
    }
  };

  const branchMetrics = useMemo(() => {
    if (!selectedBranch || !selectedMed) return null;
    return calculateBranchMedicationMetrics(state, selectedBranch.id, selectedMed.id, now);
  }, [state, selectedBranch, selectedMed, now]);

  const selectedLot = branchLots.find((l) => l.id === selectedLotId) ?? null;

  const qtyNum = Number.parseInt(quantity, 10) || 0;
  const isInbound =
    movType === 'entrada' ||
    movType === 'recebimento' ||
    (movType === 'ajuste' && adjDirection === 'add');

  const lotAvailBefore = selectedLot ? getLotAvailableQty(selectedLot, now) : 0;
  const lotPhysicalBefore = isNewLot ? 0 : selectedLot?.physicalQty ?? 0;
  const lotPhysicalAfter = isInbound ? lotPhysicalBefore + qtyNum : lotPhysicalBefore - qtyNum;

  const branchTotalBefore = branchLots.reduce((sum, l) => sum + l.physicalQty, 0);
  const branchTotalAfter = isInbound ? branchTotalBefore + qtyNum : branchTotalBefore - qtyNum;

  const handleConfirmMovement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBranch || !selectedMed) return;
    setFormError(null);
    setSuccessInfo(null);

    const res = registerMovement({
      branchId: selectedBranch.id,
      medicationId: selectedMed.id,
      lotId: isNewLot ? undefined : selectedLotId,
      newLotCode: isNewLot ? newLotCode : undefined,
      newLotExpiryDate: isNewLot ? newLotExpiry : undefined,
      type: movType,
      quantity: qtyNum,
      adjustmentDirection: adjDirection,
      reason,
      vaultSessionId: activeVaultSession?.id,
    });

    if (!res.ok) {
      setFormError(res.error ?? 'Erro ao registrar movimentação.');
      return;
    }

    setSuccessInfo({
      message: `${movementTypeLabelBR(movType)} de ${qtyNum} ${selectedMed.controlUnit}(s) registrada. Saldo físico na ${selectedBranch.name}: ${branchTotalBefore} → ${branchTotalAfter}.`,
      branchId: selectedBranch.id,
      medicationId: selectedMed.id,
      showRecommendBtn: !isInbound,
      missingSessionWarning: res.movement?.missingVaultSessionWarning,
    });
  };

  const authorizedBranches = state.branches.filter((b) =>
    currentUser?.authorizedBranchIds.includes(b.id)
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-slate-900">
          Identificação e movimentação de medicamentos
        </h1>
        <p className="text-sm text-slate-600">
          Localize pelo nome, SKU ou código de barras e registre entradas, saídas por consumo
          (FEFO), perdas ou ajustes com vínculo ao cofre refrigerado.
        </p>
      </div>

      {/* Search & Simulated Barcode Scanner */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <form onSubmit={handleBarcodeSearchSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Digite nome, SKU (ex: MED-IMG-005) ou leia código de barras e pressione Enter"
              aria-label="Localizar medicamento por nome, SKU ou código de barras"
              className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#0F294A]"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2.5 bg-[#0F294A] hover:bg-[#163864] text-white text-sm font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer"
          >
            Localizar item
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-500 flex items-center gap-1">
            <Barcode className="w-4 h-4 text-[#0F294A]" aria-hidden="true" />
            <span>Simular leitura de código de barras:</span>
          </span>
          {state.medications.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => handleQuickScan(m.barcode)}
              className={`px-2.5 py-1 rounded border text-xs transition-colors cursor-pointer ${
                selectedMed?.id === m.id
                  ? 'bg-[#0F294A] text-white border-[#0F294A]'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300'
              }`}
            >
              <span className="font-mono">{m.barcode}</span> · {m.name.split(' (')[0]}
            </button>
          ))}
        </div>

        {filteredMeds.length > 0 && searchQuery.trim() && (
          <div className="border-t border-slate-200 pt-3 flex flex-wrap gap-2">
            {filteredMeds.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setSelectedMedId(m.id);
                  setFocusMedicationId(m.id);
                }}
                className={`px-3 py-1.5 text-xs rounded border cursor-pointer ${
                  selectedMed?.id === m.id
                    ? 'border-[#0F294A] bg-slate-100 font-semibold text-[#0F294A]'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                {m.name} ({m.sku})
              </button>
            ))}
          </div>
        )}
      </section>

      {selectedMed && selectedBranch && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 space-y-5">
            <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
                <div>
                  <div className="text-xs font-mono text-[#0F294A]">
                    SKU {selectedMed.sku} · EAN {selectedMed.barcode}
                  </div>
                  <h2 className="font-display text-lg font-semibold text-slate-900 mt-0.5">
                    {selectedMed.name}
                  </h2>
                  {selectedMed.isRefrigerated && (
                    <div className="mt-1.5">
                      <StatusBadge
                        tone="info"
                        icon="clock"
                        label="Exige cofre refrigerado (2–8 °C simulado)"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label htmlFor="mov-branch-select" className="block text-xs text-slate-500 mb-1">
                    Filial da operação
                  </label>
                  <select
                    id="mov-branch-select"
                    value={selectedBranch.id}
                    onChange={(e) => setSelectedBranchId(e.target.value)}
                    className="px-3 py-1.5 text-sm font-medium border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-[#0F294A]"
                  >
                    {authorizedBranches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 text-xs">
                <div>
                  <dt className="text-slate-500">Princípio ativo</dt>
                  <dd className="font-medium text-slate-900 mt-0.5">{selectedMed.activeIngredient}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Concentração</dt>
                  <dd className="font-medium text-slate-900 mt-0.5">{selectedMed.concentration}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Forma farmacêutica</dt>
                  <dd className="font-medium text-slate-900 mt-0.5">{selectedMed.pharmaceuticalForm}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Apresentação</dt>
                  <dd className="font-medium text-slate-900 mt-0.5">{selectedMed.presentation}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Unidade e valor unitário</dt>
                  <dd className="font-medium text-slate-900 mt-0.5">
                    {selectedMed.controlUnit} · {formatCurrencyBR(selectedMed.unitCostReference)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Saldo utilizável ({selectedBranch.code})</dt>
                  <dd className="font-mono font-semibold text-[#0F294A] mt-0.5">
                    {branchMetrics?.availableUsableQty ?? 0} {selectedMed.controlUnit}(s)
                  </dd>
                </div>
              </dl>
            </section>

            {/* Branch Lots Table */}
            <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
                <h3 className="font-display text-sm font-semibold text-slate-900">
                  Lotes na {selectedBranch.name}
                </h3>
                {fefoSuggestedLot && (
                  <span className="text-xs text-[#0F294A] font-medium">
                    Sugestão FEFO (vence primeiro): {fefoSuggestedLot.lotCode}
                  </span>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                      <th className="py-2 px-4">Lote</th>
                      <th className="py-2 px-4">Validade</th>
                      <th className="py-2 px-4 text-right">Físico</th>
                      <th className="py-2 px-4 text-right">Reservado</th>
                      <th className="py-2 px-4 text-right">Disponível</th>
                      <th className="py-2 px-4">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {branchLots.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-4 px-4 text-xs text-slate-500">
                          Nenhum lote cadastrado nesta filial.
                        </td>
                      </tr>
                    ) : (
                      branchLots.map((lot) => {
                        const expired = isLotExpired(lot, now);
                        const avail = getLotAvailableQty(lot, now);
                        const daysLeft = daysBetweenDates(now, lot.expiryDate);
                        const isSelected = !isNewLot && selectedLotId === lot.id;

                        return (
                          <tr
                            key={lot.id}
                            onClick={() => {
                              setIsNewLot(false);
                              setSelectedLotId(lot.id);
                            }}
                            className={`cursor-pointer transition-colors ${
                              isSelected ? 'bg-slate-100' : 'hover:bg-slate-50'
                            }`}
                          >
                            <td className="py-2.5 px-4 font-mono font-medium text-slate-900">
                              {lot.lotCode}
                              {fefoSuggestedLot?.id === lot.id && (
                                <span className="ml-2 text-xs font-sans font-normal text-[#0F294A]">
                                  (FEFO)
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-4 font-mono tabular-nums text-slate-700">
                              {formatDateBR(lot.expiryDate)} ({daysLeft}d)
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                              {lot.physicalQty}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600">
                              {lot.reservedQty}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                              {avail}
                            </td>
                            <td className="py-2.5 px-4">
                              {lot.status === 'bloqueado' ? (
                                <StatusBadge tone="danger" icon="lock" label="Bloqueado" />
                              ) : expired ? (
                                <StatusBadge tone="danger" icon="x" label="Vencido" />
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
            </section>
          </div>

          {/* Right: Movement Form */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <h3 className="font-display text-base font-semibold text-slate-900 border-b border-slate-200 pb-3">
              Registrar movimentação
            </h3>

            {/* Vault session link status for cold chain */}
            {selectedMed.isRefrigerated && (
              <div
                className={`p-3 rounded-md border text-xs space-y-1.5 ${
                  activeVaultSession
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}
              >
                <div className="flex items-center justify-between gap-2 font-semibold">
                  <span className="flex items-center gap-1.5">
                    <ThermometerSnowflake className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>
                      {activeVaultSession
                        ? `Sessão do cofre vinculada: ${activeVaultSession.code}`
                        : 'Sem sessão de abertura ativa no cofre'}
                    </span>
                  </span>
                </div>
                {!activeVaultSession && (
                  <div className="flex items-center justify-between gap-2">
                    <span>
                      Movimentar cadeia fria sem sessão aberta gera alerta de auditoria.
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveTab('cofre')}
                      className="underline font-medium whitespace-nowrap cursor-pointer"
                    >
                      Abrir cofre
                    </button>
                  </div>
                )}
              </div>
            )}

            {successInfo && (
              <div className="p-4 rounded-md bg-emerald-50 border border-emerald-200 space-y-3">
                <div className="flex items-start gap-2 text-xs text-emerald-900">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{successInfo.message}</span>
                </div>
                {successInfo.missingSessionWarning && (
                  <div className="text-xs text-amber-800 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      Registro gravado com sinalização: movimentação sem sessão de abertura do
                      cofre.
                    </span>
                  </div>
                )}
                {successInfo.showRecommendBtn && (
                  <button
                    type="button"
                    onClick={() => {
                      setFocusBranchId(successInfo.branchId);
                      setFocusMedicationId(successInfo.medicationId);
                      setActiveTab('reposicao');
                    }}
                    className="w-full py-2 px-3 bg-[#0F294A] hover:bg-[#163864] text-white text-xs font-medium rounded-md transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>Ver recomendação</span>
                    <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            )}

            {formError && (
              <div
                role="alert"
                className="p-3 rounded-md bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2"
              >
                <ShieldAlert className="w-4 h-4 text-red-700 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleConfirmMovement} className="space-y-4">
              <div>
                <label htmlFor="mov-type" className="block text-xs font-medium text-slate-700 mb-1">
                  Tipo de operação
                </label>
                <select
                  id="mov-type"
                  value={movType}
                  onChange={(e) => {
                    const nextType = e.target.value as MovementType;
                    setMovType(nextType);
                    setIsNewLot(false);
                    setFormError(null);
                  }}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-[#0F294A]"
                >
                  <option value="saida_consumo">Saída por consumo (FEFO)</option>
                  <option value="entrada">Entrada</option>
                  <option value="perda">Perda</option>
                  <option value="ajuste">Ajuste de inventário</option>
                  <option value="expedicao">Expedição avulsa</option>
                  <option value="recebimento">Recebimento avulso</option>
                </select>
              </div>

              {movType === 'ajuste' && (
                <div>
                  <span className="block text-xs font-medium text-slate-700 mb-1">
                    Sentido do ajuste
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setAdjDirection('remove')}
                      className={`py-1.5 text-xs font-medium rounded border cursor-pointer ${
                        adjDirection === 'remove'
                          ? 'bg-[#0F294A] text-white border-[#0F294A]'
                          : 'bg-white text-slate-700 border-slate-300'
                      }`}
                    >
                      Subtrair (−)
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdjDirection('add')}
                      className={`py-1.5 text-xs font-medium rounded border cursor-pointer ${
                        adjDirection === 'add'
                          ? 'bg-[#0F294A] text-white border-[#0F294A]'
                          : 'bg-white text-slate-700 border-slate-300'
                      }`}
                    >
                      Adicionar (+)
                    </button>
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="mov-lot" className="text-xs font-medium text-slate-700">
                    Lote
                  </label>
                  {movType === 'entrada' && (
                    <button
                      type="button"
                      onClick={() => setIsNewLot(!isNewLot)}
                      className="text-xs text-[#0F294A] hover:underline cursor-pointer"
                    >
                      {isNewLot ? 'Usar lote existente' : 'Cadastrar novo lote'}
                    </button>
                  )}
                </div>

                {isNewLot && movType === 'entrada' ? (
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={newLotCode}
                      onChange={(e) => setNewLotCode(e.target.value)}
                      placeholder="Código do lote"
                      className="px-3 py-2 text-sm border border-slate-300 rounded-md font-mono"
                      required
                    />
                    <input
                      type="date"
                      value={newLotExpiry}
                      onChange={(e) => setNewLotExpiry(e.target.value)}
                      className="px-3 py-2 text-sm border border-slate-300 rounded-md font-mono"
                      required
                    />
                  </div>
                ) : (
                  <select
                    id="mov-lot"
                    value={selectedLotId}
                    onChange={(e) => setSelectedLotId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-[#0F294A]"
                  >
                    {branchLots.map((l) => {
                      const avail = getLotAvailableQty(l, now);
                      const statusNote =
                        l.status === 'bloqueado'
                          ? 'BLOQUEADO'
                          : isLotExpired(l, now)
                          ? 'VENCIDO'
                          : `Disp: ${avail}`;
                      return (
                        <option key={l.id} value={l.id}>
                          {l.lotCode} · Val: {formatDateBR(l.expiryDate)} · {statusNote}
                          {fefoSuggestedLot?.id === l.id ? ' [Sugerido FEFO]' : ''}
                        </option>
                      );
                    })}
                  </select>
                )}
              </div>

              <div>
                <label htmlFor="mov-qty" className="block text-xs font-medium text-slate-700 mb-1">
                  Quantidade ({selectedMed.controlUnit}s)
                </label>
                <input
                  id="mov-qty"
                  type="number"
                  min={1}
                  step={1}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md font-mono focus:outline-none focus:ring-2 focus:ring-[#0F294A]"
                  required
                />
              </div>

              <div>
                <label htmlFor="mov-reason" className="block text-xs font-medium text-slate-700 mb-1">
                  Motivo / observação
                </label>
                <input
                  id="mov-reason"
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ex: Dispensação assistencial / conferência"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#0F294A]"
                  required
                />
              </div>

              <div className="p-3.5 rounded-md bg-slate-50 border border-slate-200 space-y-2 text-xs">
                <div className="font-semibold text-slate-800">
                  Prévia de saldo antes e depois
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Lote selecionado (físico):</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {lotPhysicalBefore} →{' '}
                    <span className={lotPhysicalAfter < 0 ? 'text-red-700' : 'text-[#0F294A]'}>
                      {lotPhysicalAfter}
                    </span>{' '}
                    {selectedMed.controlUnit}(s)
                  </span>
                </div>
                {!isInbound && selectedLot && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Disponível para saída no lote:</span>
                    <span className="font-mono text-slate-800">{lotAvailBefore}</span>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-slate-200 pt-1.5">
                  <span className="text-slate-600">Total físico na {selectedBranch.name}:</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {branchTotalBefore} → {branchTotalAfter} {selectedMed.controlUnit}(s)
                  </span>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 px-4 bg-[#0F294A] hover:bg-[#163864] text-white text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <PackageCheck className="w-4 h-4" aria-hidden="true" />
                <span>Confirmar movimentação</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
