import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  CheckCircle2,
  Clock,
  Info,
  MapPin,
  Search,
  Truck,
  X,
} from 'lucide-react';
import { useCofre } from '../context/CofreContext';
import { StockLot } from '../types/cofre';
import {
  BranchNeedMatch,
  findBranchesNeedingLot,
  getLotAvailableQty,
  isLotExpired,
} from '../utils/calculations';
import {
  alertCategoryLabelBR,
  alertSeverityLabelBR,
  alertStatusLabelBR,
  daysBetweenDates,
  formatDateBR,
} from '../utils/formatters';
import { StatusBadge } from './StatusBadge';

export const AlertasPage: React.FC = () => {
  const {
    state,
    currentUser,
    operationalAlerts,
    acknowledgeAlert,
    simulateAlertsPlus10Min,
    updateBranchAlertDays,
    createTransferOrder,
    setActiveTab,
  } = useCofre();

  const [selectedLotForMatch, setSelectedLotForMatch] = useState<StockLot | null>(null);
  const [transferFeedback, setTransferFeedback] = useState<string | null>(null);
  const [alertFeedback, setAlertFeedback] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critica' | 'alta' | 'informativa'>('all');
  const [customQtyMap, setCustomQtyMap] = useState<Record<string, string>>({});

  const now = new Date();
  const canConfigure = currentUser?.role === 'gestor' || currentUser?.role === 'administrador';

  const visibleOperationalAlerts = useMemo(() => {
    if (severityFilter === 'all') return operationalAlerts;
    return operationalAlerts.filter((a) => a.severity === severityFilter);
  }, [operationalAlerts, severityFilter]);

  const unackCount = useMemo(
    () => operationalAlerts.filter((a) => !a.acknowledged).length,
    [operationalAlerts]
  );

  const alerts = useMemo(() => {
    const items: {
      lot: StockLot;
      branchName: string;
      branchCode: string;
      alertDays: number;
      medName: string;
      medSku: string;
      controlUnit: string;
      daysLeft: number;
      expired: boolean;
      availableQty: number;
    }[] = [];

    for (const lot of state.lots) {
      if (lot.physicalQty <= 0) continue;
      const branch = state.branches.find((b) => b.id === lot.branchId);
      const med = state.medications.find((m) => m.id === lot.medicationId);
      if (!branch || !med) continue;
      const daysLeft = daysBetweenDates(now, lot.expiryDate);
      const expired = isLotExpired(lot, now);
      if (expired || daysLeft <= branch.alertDaysBeforeExpiry) {
        items.push({
          lot,
          branchName: branch.name,
          branchCode: branch.code,
          alertDays: branch.alertDaysBeforeExpiry,
          medName: med.name,
          medSku: med.sku,
          controlUnit: med.controlUnit,
          daysLeft,
          expired,
          availableQty: getLotAvailableQty(lot, now),
        });
      }
    }

    return items.sort((a, b) => a.daysLeft - a.daysLeft);
  }, [state.lots, state.branches, state.medications, now]);

  const matchResults: BranchNeedMatch[] = useMemo(() => {
    if (!selectedLotForMatch) return [];
    return findBranchesNeedingLot(state, selectedLotForMatch, now);
  }, [state, selectedLotForMatch, now]);

  const selectedMatchMed = selectedLotForMatch
    ? state.medications.find((m) => m.id === selectedLotForMatch.medicationId)
    : null;
  const selectedMatchBranch = selectedLotForMatch
    ? state.branches.find((b) => b.id === selectedLotForMatch.branchId)
    : null;

  const handleRequestTransfer = (match: BranchNeedMatch) => {
    if (!selectedLotForMatch) return;
    const rawQty = customQtyMap[match.branch.id];
    const qty = rawQty ? Number.parseInt(rawQty, 10) : match.suggestedTransferQty;
    const res = createTransferOrder({
      medicationId: selectedLotForMatch.medicationId,
      originBranchId: selectedLotForMatch.branchId,
      destinationBranchId: match.branch.id,
      lotId: selectedLotForMatch.id,
      quantity: qty,
      reason: `Aproveitamento de lote próximo ao vencimento (${selectedLotForMatch.lotCode})`,
    });

    if (!res.ok) {
      setTransferFeedback(res.error ?? 'Não foi possível criar a solicitação.');
      return;
    }

    setTransferFeedback(
      `Solicitação ${res.transfer?.code} criada (${qty} unid. de ${selectedMatchBranch?.name} para ${match.branch.name}). Acompanhe e aprove em Reposição e compras.`
    );
  };

  const handleSimulate10Min = () => {
    const res = simulateAlertsPlus10Min();
    if (!res.ok) {
      setAlertFeedback(res.error ?? 'Não foi possível simular avanço de tempo.');
      return;
    }
    setAlertFeedback(
      'Simulação +10 min executada: alertas não reconhecidos avançaram na cadeia de escalonamento.'
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-slate-900">
            Alertas operacionais, responsáveis e validade na rede
          </h1>
          <p className="text-sm text-slate-600">
            Acompanhe desvios em tempo real, responsáveis atribuídos, escalonamento automático após
            10 minutos sem reconhecimento e aproveitamento de lotes próximos ao vencimento.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSimulate10Min}
          className="px-3.5 py-2 text-xs font-medium bg-[#0F294A] hover:bg-[#163864] text-white rounded-md inline-flex items-center gap-1.5 whitespace-nowrap self-start cursor-pointer"
        >
          <Clock className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Simular +10 min sem reconhecimento</span>
        </button>
      </div>

      {/* Screen-only limitation banner */}
      <div className="p-3.5 rounded-md bg-slate-100 border border-slate-200 text-xs text-slate-700 flex items-start gap-2">
        <Info className="w-4 h-4 text-[#0F294A] shrink-0 mt-0.5" aria-hidden="true" />
        <span>
          <strong>Limitação desta prova de conceito:</strong> alertas e escalonamentos são exibidos
          apenas em tela (sem envio real de e-mail, SMS ou push). Os responsáveis padrão por tipo
          de alerta podem ser alterados na tela <strong>Configurações</strong>.
        </span>
      </div>

      {alertFeedback && (
        <div className="p-3.5 rounded-md bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
            <span>{alertFeedback}</span>
          </div>
          <button
            type="button"
            onClick={() => setAlertFeedback(null)}
            className="text-slate-600 hover:text-slate-900 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Operational Alerts with Responsible Role & Escalation */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BellRing className="w-4 h-4 text-[#0F294A]" aria-hidden="true" />
            <h2 className="font-display text-base font-semibold text-slate-900">
              Alertas ativos com responsável e escalonamento ({unackCount} não reconhecido(s) de{' '}
              {operationalAlerts.length})
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <select
              aria-label="Filtrar severidade dos alertas"
              value={severityFilter}
              onChange={(e) =>
                setSeverityFilter(e.target.value as 'all' | 'critica' | 'alta' | 'informativa')
              }
              className="px-2.5 py-1 text-xs border border-slate-300 rounded bg-white"
            >
              <option value="all">Todas as severidades</option>
              <option value="critica">Crítica</option>
              <option value="alta">Alta</option>
              <option value="informativa">Informativa</option>
            </select>
          </div>
        </div>

        {visibleOperationalAlerts.length === 0 ? (
          <div className="p-6 text-sm text-slate-600">
            Nenhum alerta operacional para o filtro selecionado.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                  <th className="py-2.5 px-4">Severidade</th>
                  <th className="py-2.5 px-4">Alerta / Ocorrência</th>
                  <th className="py-2.5 px-4">Unidade</th>
                  <th className="py-2.5 px-4">Responsável atual e cadeia</th>
                  <th className="py-2.5 px-4 text-right">Tempo aberto</th>
                  <th className="py-2.5 px-4">Estado</th>
                  <th className="py-2.5 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {visibleOperationalAlerts.map((a) => (
                  <tr
                    key={a.id}
                    className={
                      !a.acknowledged && a.severity === 'critica'
                        ? 'bg-red-50/50'
                        : 'hover:bg-slate-50'
                    }
                  >
                    <td className="py-3 px-4 whitespace-nowrap">
                      <StatusBadge
                        tone={
                          a.severity === 'critica'
                            ? 'danger'
                            : a.severity === 'alta'
                            ? 'warning'
                            : 'info'
                        }
                        icon={
                          a.severity === 'critica'
                            ? 'danger'
                            : a.severity === 'alta'
                            ? 'warn'
                            : 'clock'
                        }
                        label={alertSeverityLabelBR(a.severity)}
                      />
                    </td>
                    <td className="py-3 px-4 max-w-sm">
                      <div className="text-[11px] font-medium text-[#0F294A]">
                        {alertCategoryLabelBR(a.category)}
                      </div>
                      <div className="font-semibold text-slate-900">{a.title}</div>
                      <div className="text-slate-600 mt-0.5 leading-snug">{a.detail}</div>
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-800 whitespace-nowrap">
                      {a.branchName}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">
                        {a.currentResponsibleRole}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Cadeia: {a.escalationChain.join(' → ')}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-slate-900 whitespace-nowrap">
                      {a.openMinutes} min
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <StatusBadge
                        tone={
                          a.status === 'reconhecido'
                            ? 'nominal'
                            : a.status === 'escalonado'
                            ? 'danger'
                            : 'warning'
                        }
                        icon={
                          a.status === 'reconhecido'
                            ? 'check'
                            : a.status === 'escalonado'
                            ? 'warn'
                            : 'clock'
                        }
                        label={alertStatusLabelBR(a.status)}
                      />
                      {a.acknowledgedBy && (
                        <div className="text-[11px] text-slate-500 mt-1">
                          Por {a.acknowledgedBy}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {!a.acknowledged && (
                          <button
                            type="button"
                            onClick={() => acknowledgeAlert(a.id)}
                            className="px-2.5 py-1 text-xs font-medium bg-[#0F294A] hover:bg-[#163864] text-white rounded cursor-pointer"
                          >
                            Reconhecer
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setActiveTab(a.targetTab)}
                          className="px-2.5 py-1 text-xs font-medium border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 rounded inline-flex items-center gap-1 cursor-pointer"
                        >
                          <span>Abrir</span>
                          <ArrowRight className="w-3 h-3" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Per-branch configurable expiry alert days */}
      <section className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Antecedência do alerta por filial (dias)
            </h2>
            <p className="text-xs text-slate-500">
              Ao alterar o prazo em dias, a lista de alertas abaixo é recalculada imediatamente.
            </p>
          </div>
          {!canConfigure && (
            <span className="text-xs text-slate-500">
              Somente Gestor ou Administrador podem alterar os prazos.
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {state.branches.map((branch) => (
            <div
              key={branch.id}
              className="border border-slate-200 rounded-md p-3.5 flex items-center justify-between gap-3 bg-slate-50/50"
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900 truncate">{branch.name}</div>
                <div className="text-xs text-slate-500 font-mono">{branch.code}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <label htmlFor={`alert-days-${branch.id}`} className="sr-only">
                  Dias de antecedência para {branch.name}
                </label>
                <input
                  id={`alert-days-${branch.id}`}
                  type="number"
                  min={0}
                  max={3650}
                  disabled={!canConfigure}
                  value={branch.alertDaysBeforeExpiry}
                  onChange={(e) => {
                    const val = Number.parseInt(e.target.value, 10);
                    if (!Number.isNaN(val)) {
                      updateBranchAlertDays(branch.id, val);
                    }
                  }}
                  className="w-20 px-2.5 py-1.5 text-sm font-mono text-right border border-slate-300 rounded bg-white disabled:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0F294A]"
                />
                <span className="text-xs text-slate-600">dias</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {transferFeedback && (
        <div className="p-4 rounded-md bg-emerald-50 border border-emerald-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-emerald-900">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
            <span>{transferFeedback}</span>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('reposicao')}
            className="px-3 py-1 text-xs font-medium bg-[#0F294A] text-white rounded hover:bg-[#163864] cursor-pointer"
          >
            Ir para Aprovação de Transferências
          </button>
        </div>
      )}

      {/* Alerts Table */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-slate-900">
            Lotes em alerta ou vencidos ({alerts.length})
          </h2>
        </div>

        {alerts.length === 0 ? (
          <div className="p-6 text-sm text-slate-600">
            Nenhum lote encontrado dentro dos prazos de antecedência configurados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                  <th className="py-2.5 px-4">Filial</th>
                  <th className="py-2.5 px-4">Medicamento</th>
                  <th className="py-2.5 px-4">Lote</th>
                  <th className="py-2.5 px-4 text-right">Quantidade</th>
                  <th className="py-2.5 px-4">Data de validade</th>
                  <th className="py-2.5 px-4 text-right">Dias restantes</th>
                  <th className="py-2.5 px-4">Situação</th>
                  <th className="py-2.5 px-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {alerts.map((a) => (
                  <tr key={a.lot.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-medium text-slate-900">
                      <div>{a.branchName}</div>
                      <div className="text-xs text-slate-500">Alerta: {a.alertDays}d</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{a.medName}</div>
                      <div className="text-xs font-mono text-slate-500">{a.medSku}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-800">{a.lot.lotCode}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-slate-900">
                      {a.lot.status === 'utilizavel' ? a.availableQty : a.lot.physicalQty} {a.controlUnit}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-700">
                      {formatDateBR(a.lot.expiryDate)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                      <span className={a.daysLeft <= 0 ? 'text-red-700' : 'text-amber-800'}>
                        {a.daysLeft} d
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {a.lot.status === 'bloqueado' ? (
                        <StatusBadge tone="danger" icon="lock" label="Bloqueado" />
                      ) : a.expired ? (
                        <StatusBadge tone="danger" icon="x" label="Vencido" />
                      ) : (
                        <StatusBadge
                          tone="warning"
                          icon="warn"
                          label={`Vence em ${a.daysLeft} dias`}
                        />
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedLotForMatch(a.lot);
                          setTransferFeedback(null);
                        }}
                        className="px-3 py-1.5 text-xs font-medium bg-[#0F294A] hover:bg-[#163864] text-white rounded transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                      >
                        <Search className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Encontrar filial que precisa</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* "Encontrar filial que precisa" Result Panel */}
      {selectedLotForMatch && (
        <section className="bg-white border border-[#0F294A] rounded-lg overflow-hidden">
          <div className="px-5 py-4 bg-[#0F294A] text-white flex items-center justify-between gap-4">
            <div>
              <div className="text-xs text-slate-300">
                Análise de aproveitamento de lote · {selectedMatchBranch?.name}
              </div>
              <h3 className="font-display text-base font-semibold">
                {selectedMatchMed?.name} · Lote {selectedLotForMatch.lotCode} (vence em{' '}
                {daysBetweenDates(now, selectedLotForMatch.expiryDate)} dias —{' '}
                {formatDateBR(selectedLotForMatch.expiryDate)})
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setSelectedLotForMatch(null)}
              className="p-1.5 rounded hover:bg-white/10 text-white cursor-pointer"
              aria-label="Fechar análise de aproveitamento"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            {matchResults.every((m) => !m.eligible) && (
              <div className="p-4 rounded-md bg-amber-50 border border-amber-200 flex items-start gap-2.5 text-xs text-amber-900">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <strong className="font-semibold block mb-1">
                    Nenhuma filial elegível consegue aproveitar este lote a tempo
                  </strong>
                  <span>
                    Consulte abaixo o motivo individual de cada filial considerando necessidade
                    líquida, prazo de transporte e consumo antes do vencimento.
                  </span>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                    <th className="py-2.5 px-4">Filial candidata (por proximidade)</th>
                    <th className="py-2.5 px-4 text-right">Distância</th>
                    <th className="py-2.5 px-4">Prazo entrega</th>
                    <th className="py-2.5 px-4 text-right">Necessidade</th>
                    <th className="py-2.5 px-4 text-right">Consumo possível antes validade</th>
                    <th className="py-2.5 px-4">Elegibilidade / Motivo</th>
                    <th className="py-2.5 px-4 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {matchResults.map((m) => (
                    <tr key={m.branch.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-medium text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                          <span>{m.branch.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        {m.distanceKm} km
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        {m.transitDays === 0 ? 'Mesmo dia (0d)' : `${m.transitDays} dia(s)`}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-medium">
                        {m.netNeedQty} {selectedMatchMed?.controlUnit}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        {m.maxConsumableBeforeExpiry} {selectedMatchMed?.controlUnit}
                      </td>
                      <td className="py-3 px-4 text-xs max-w-xs">
                        {m.eligible ? (
                          <span className="text-emerald-800 font-medium">
                            Elegível: pode consumir até {m.maxConsumableBeforeExpiry}{' '}
                            {selectedMatchMed?.controlUnit} antes do vencimento (sugestão:{' '}
                            {m.suggestedTransferQty}).
                          </span>
                        ) : (
                          <span className="text-slate-600">{m.reasonIfIneligible}</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {m.eligible && canConfigure ? (
                          <div className="inline-flex items-center gap-2">
                            <input
                              type="number"
                              min={1}
                              max={m.suggestedTransferQty}
                              value={customQtyMap[m.branch.id] ?? String(m.suggestedTransferQty)}
                              onChange={(e) =>
                                setCustomQtyMap((prev) => ({
                                  ...prev,
                                  [m.branch.id]: e.target.value,
                                }))
                              }
                              aria-label={`Quantidade a transferir para ${m.branch.name}`}
                              className="w-16 px-2 py-1 text-xs font-mono text-right border border-slate-300 rounded"
                            />
                            <button
                              type="button"
                              onClick={() => handleRequestTransfer(m)}
                              className="px-3 py-1.5 text-xs font-medium bg-[#0F294A] hover:bg-[#163864] text-white rounded inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
                            >
                              <Truck className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Solicitar transferência</span>
                            </button>
                          </div>
                        ) : m.eligible ? (
                          <span className="text-xs text-slate-500">Requer perfil Gestor</span>
                        ) : (
                          <span className="text-xs text-slate-400">Inelegível</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};
