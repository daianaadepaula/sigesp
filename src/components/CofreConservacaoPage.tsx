import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  DoorClosed,
  DoorOpen,
  Info,
  Lock,
  ShieldAlert,
  Thermometer,
  Unlock,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useCofre } from '../context/CofreContext';
import { ConservationIncident } from '../types/cofre';
import {
  formatDateTimeBR,
  incidentStatusLabelBR,
  sensorStatusLabelBR,
} from '../utils/formatters';
import { StatusBadge } from './StatusBadge';

export const CofreConservacaoPage: React.FC = () => {
  const {
    state,
    currentUser,
    activeBranch,
    requestVaultOpen,
    openVaultDoor,
    closeVaultDoor,
    simulateVaultSensorStatus,
    simulateVaultTemperature,
    evaluateConservationIncident,
    setFocusBranchId,
    setFocusMedicationId,
    setActiveTab,
  } = useCofre();

  const [selectedVaultId, setSelectedVaultId] = useState<string>(
    state.vaults.find((v) => v.branchId === activeBranch?.id)?.id ?? state.vaults[0]?.id ?? ''
  );
  const [purpose, setPurpose] = useState('Retirada assistencial de alto custo (demonstração)');
  const [simTempInput, setSimTempInput] = useState('11.4');
  const [simDurationInput, setSimDurationInput] = useState('22');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Incident evaluation modal
  const [evalTarget, setEvalTarget] = useState<ConservationIncident | null>(null);
  const [evalDecision, setEvalDecision] = useState<'liberar' | 'descarte'>('liberar');
  const [evalJustification, setEvalJustification] = useState('');

  const vault = state.vaults.find((v) => v.id === selectedVaultId) ?? state.vaults[0];
  const vaultBranch = state.branches.find((b) => b.id === vault?.branchId);
  const activeSession = vault?.activeSessionId
    ? state.vaultSessions.find((s) => s.id === vault.activeSessionId) ?? null
    : null;

  const canEvaluate = currentUser?.role === 'gestor' || currentUser?.role === 'administrador';

  const refrigeratedLots = useMemo(() => {
    if (!vault) return [];
    const coldMedIds = new Set(
      state.medications.filter((m) => m.isRefrigerated).map((m) => m.id)
    );
    return state.lots.filter(
      (l) => l.branchId === vault.branchId && coldMedIds.has(l.medicationId)
    );
  }, [state.lots, state.medications, vault]);

  const vaultSessions = useMemo(
    () =>
      state.vaultSessions
        .filter((s) => s.vaultId === vault?.id)
        .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)),
    [state.vaultSessions, vault?.id]
  );

  const vaultReadings = useMemo(
    () =>
      state.vaultReadings
        .filter((r) => r.vaultId === vault?.id)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    [state.vaultReadings, vault?.id]
  );

  const branchIncidents = useMemo(
    () =>
      state.conservationIncidents
        .filter((i) => i.vaultId === vault?.id)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    [state.conservationIncidents, vault?.id]
  );

  const runAction = (res: { ok: boolean; error?: string }, okMsg: string) => {
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error ?? 'Operação não autorizada.' });
      return;
    }
    setFeedback({ type: 'ok', text: okMsg });
  };

  const handleConfirmEval = (e: React.FormEvent) => {
    e.preventDefault();
    if (!evalTarget) return;
    const res = evaluateConservationIncident(evalTarget.id, evalDecision, evalJustification);
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error ?? 'Erro ao registrar avaliação.' });
      return;
    }
    setEvalTarget(null);
    setEvalJustification('');
    setFeedback({
      type: 'ok',
      text: `Ocorrência ${evalTarget.code} avaliada e registrada por ${currentUser?.name}.`,
    });
  };

  if (!vault) return null;

  const isTempOutOfRange =
    vault.currentTempC !== null &&
    (vault.currentTempC < vault.minTempC || vault.currentTempC > vault.maxTempC);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-semibold text-slate-900">
            Cofre e conservação (cadeia fria)
          </h1>
          <p className="text-sm text-slate-600">
            Controle simulado de abertura do cofre refrigerado, vínculo de sessão com retirada e
            tratamento de ocorrências térmicas.
          </p>
        </div>

        <select
          aria-label="Selecionar equipamento do cofre"
          value={vault.id}
          onChange={(e) => setSelectedVaultId(e.target.value)}
          className="px-3.5 py-2 text-sm font-medium border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-[#0F294A]"
        >
          {state.vaults.map((v) => (
            <option key={v.id} value={v.id}>
              {v.equipmentCode} · {state.branches.find((b) => b.id === v.branchId)?.name}
            </option>
          ))}
        </select>
      </div>

      {/* Mandatory Simulation Disclaimer */}
      <div className="p-4 rounded-lg bg-slate-100 border border-slate-300 text-xs text-slate-700 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-[#0F294A] shrink-0 mt-0.5" aria-hidden="true" />
        <div className="space-y-1">
          <div className="font-semibold text-[#0F294A]">
            Integração com equipamento simulada nesta prova de conceito
          </div>
          <p>
            Leituras de temperatura, estado de fechadura e eventos de porta utilizam uma interface
            substituível (<span className="font-mono">VaultControllerGateway</span>) sem
            comunicação física real. As faixas e bloqueios configurados são fictícios para
            demonstração de fluxo e não constituem orientação clínica ou validação sanitária real.
          </p>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-md border text-xs flex items-center gap-2 ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {feedback.type === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          ) : (
            <ShieldAlert className="w-4 h-4 text-red-700 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Telemetry & Equipment Status */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-1.5">
          <div className="text-xs text-slate-500">Equipamento e filial</div>
          <div className="font-mono text-base font-semibold text-[#0F294A]">
            {vault.equipmentCode}
          </div>
          <div className="text-xs text-slate-700">{vaultBranch?.name}</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-1.5">
          <div className="text-xs text-slate-500">Porta e fechadura (simulado)</div>
          <div className="flex items-center gap-2">
            {vault.doorState === 'aberta' ? (
              <StatusBadge tone="warning" icon="warn" label="Porta aberta" />
            ) : (
              <StatusBadge tone="nominal" icon="lock" label="Porta fechada" />
            )}
          </div>
          <div className="text-xs text-slate-600">
            Fechadura:{' '}
            <span className="font-medium text-slate-900">
              {vault.lockState === 'travada'
                ? 'Travada'
                : vault.lockState === 'liberada_para_abertura'
                ? 'Liberada para abertura'
                : 'Destravada'}
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-1.5">
          <div className="text-xs text-slate-500">Temperatura atual (faixa {vault.minTempC}–{vault.maxTempC} °C)</div>
          <div
            className={`font-mono text-2xl font-semibold tabular-nums ${
              vault.currentTempC === null
                ? 'text-slate-400'
                : isTempOutOfRange
                ? 'text-red-700'
                : 'text-[#0F294A]'
            }`}
          >
            {vault.currentTempC !== null ? `${vault.currentTempC.toFixed(1)} °C` : 'Sem leitura'}
          </div>
          <div className="text-xs text-slate-500">
            Tolerância configurada: {vault.toleranceMinutes} min · Última leitura:{' '}
            {formatDateTimeBR(vault.lastReadingAt)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-1.5">
          <div className="text-xs text-slate-500">Comunicação do sensor</div>
          <div>
            {vault.sensorStatus === 'conectado' ? (
              <StatusBadge tone="nominal" icon="check" label={sensorStatusLabelBR(vault.sensorStatus)} />
            ) : vault.sensorStatus === 'leitura_desatualizada' ? (
              <StatusBadge tone="warning" icon="clock" label={sensorStatusLabelBR(vault.sensorStatus)} />
            ) : (
              <StatusBadge tone="danger" icon="x" label={sensorStatusLabelBR(vault.sensorStatus)} />
            )}
          </div>
          <div className="text-xs text-slate-600">
            Vínculo obrigatório em cadeia fria: {vault.requireSessionForColdChain ? 'Ativo' : 'Opcional'}
          </div>
        </div>
      </section>

      {/* Controls: Door Session + Temperature/Sensor Simulation */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Door & Session Control */}
        <section className="lg:col-span-6 bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="border-b border-slate-200 pb-3">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Controle simulado de abertura e sessão
            </h2>
            <p className="text-xs text-slate-500">
              A abertura da porta não confirma retirada automaticamente. É obrigatório identificar
              medicamento, lote e quantidade.
            </p>
          </div>

          <div>
            <label htmlFor="vault-purpose" className="block text-xs font-medium text-slate-700 mb-1">
              Finalidade da abertura
            </label>
            <input
              id="vault-purpose"
              type="text"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                runAction(
                  requestVaultOpen(vault.id, purpose),
                  'Fechadura liberada para abertura por usuário autorizado.'
                )
              }
              className="px-3.5 py-2 text-xs font-medium bg-[#0F294A] hover:bg-[#163864] text-white rounded-md inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Unlock className="w-3.5 h-3.5" aria-hidden="true" />
              <span>1. Solicitar abertura</span>
            </button>

            <button
              type="button"
              onClick={() =>
                runAction(
                  openVaultDoor(vault.id, purpose),
                  'Porta aberta e sessão iniciada. Registre a retirada identificando medicamento, lote e quantidade.'
                )
              }
              className="px-3.5 py-2 text-xs font-medium bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-md inline-flex items-center gap-1.5 cursor-pointer"
            >
              <DoorOpen className="w-3.5 h-3.5" aria-hidden="true" />
              <span>2. Abrir porta</span>
            </button>

            <button
              type="button"
              onClick={() =>
                runAction(
                  closeVaultDoor(vault.id),
                  'Porta fechada e fechadura travada.'
                )
              }
              className="px-3.5 py-2 text-xs font-medium bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-md inline-flex items-center gap-1.5 cursor-pointer"
            >
              <DoorClosed className="w-3.5 h-3.5" aria-hidden="true" />
              <span>4. Fechar porta</span>
            </button>
          </div>

          {activeSession ? (
            <div className="p-4 rounded-md bg-slate-50 border border-[#0F294A] space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#0F294A]">
                  Sessão aberta: {activeSession.code}
                </span>
                <span className="font-mono text-slate-600">
                  {activeSession.employeeName} ({activeSession.employeeMatricula})
                </span>
              </div>
              <div className="text-slate-600">
                Movimentações vinculadas nesta sessão:{' '}
                <strong className="font-mono text-slate-900">
                  {activeSession.linkedMovementIds.length}
                </strong>
              </div>
              <button
                type="button"
                onClick={() => {
                  setFocusBranchId(vault.branchId);
                  setFocusMedicationId('med-img');
                  setActiveTab('movimentacoes');
                }}
                className="w-full py-2 px-3 bg-[#0F294A] hover:bg-[#163864] text-white text-xs font-medium rounded flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>3. Registrar retirada vinculada à sessão {activeSession.code}</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div className="p-3 rounded bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center gap-2">
              <Lock className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
              <span>Nenhuma sessão de abertura ativa no momento.</span>
            </div>
          )}
        </section>

        {/* Temperature & Sensor Simulation */}
        <section className="lg:col-span-6 bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="border-b border-slate-200 pb-3">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Simulação de temperatura e sensor
            </h2>
            <p className="text-xs text-slate-500">
              Teste desvios acima de {vault.toleranceMinutes} min para disparar bloqueio preventivo
              ou simule falha/retorno do sensor.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="sim-temp" className="block text-xs font-medium text-slate-700 mb-1">
                Temperatura simulada (°C)
              </label>
              <input
                id="sim-temp"
                type="number"
                step="0.1"
                value={simTempInput}
                onChange={(e) => setSimTempInput(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label htmlFor="sim-dur" className="block text-xs font-medium text-slate-700 mb-1">
                Duração acumulada (min)
              </label>
              <input
                id="sim-dur"
                type="number"
                min={1}
                value={simDurationInput}
                onChange={(e) => setSimDurationInput(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                const t = Number.parseFloat(simTempInput) || 11.4;
                const d = Number.parseInt(simDurationInput, 10) || 22;
                const res = simulateVaultTemperature(vault.id, t, d);
                runAction(
                  res,
                  res.incidentCode
                    ? `Ocorrência ${res.incidentCode} registrada e lotes refrigerados bloqueados para uso (saldo físico preservado).`
                    : `Leitura simulada de ${t.toFixed(1)} °C registrada.`
                );
              }}
              className="px-3.5 py-2 text-xs font-medium bg-amber-700 hover:bg-amber-800 text-white rounded-md inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Thermometer className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Simular temperatura fora da faixa</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const res = simulateVaultTemperature(vault.id, 4.3, 5);
                runAction(
                  res,
                  'Temperatura normalizada em 4,3 °C. Lotes bloqueados permanecem bloqueados até avaliação técnica registrada.'
                );
              }}
              className="px-3.5 py-2 text-xs font-medium bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-md cursor-pointer"
            >
              Normalizar para 4,3 °C
            </button>
          </div>

          <div className="border-t border-slate-200 pt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                runAction(
                  simulateVaultSensorStatus(vault.id, 'desconectado'),
                  'Falha simulada: sensor desconectado.'
                )
              }
              className="px-3 py-1.5 text-xs border border-red-300 text-red-700 hover:bg-red-50 rounded inline-flex items-center gap-1.5 cursor-pointer"
            >
              <WifiOff className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Simular falha do sensor</span>
            </button>
            <button
              type="button"
              onClick={() =>
                runAction(
                  simulateVaultSensorStatus(vault.id, 'leitura_desatualizada'),
                  'Alerta simulado: leitura desatualizada.'
                )
              }
              className="px-3 py-1.5 text-xs border border-amber-300 text-amber-800 hover:bg-amber-50 rounded cursor-pointer"
            >
              Leitura desatualizada
            </button>
            <button
              type="button"
              onClick={() =>
                runAction(
                  simulateVaultSensorStatus(vault.id, 'conectado'),
                  'Comunicação do sensor restabelecida.'
                )
              }
              className="px-3 py-1.5 text-xs border border-slate-300 text-slate-800 hover:bg-slate-50 rounded inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Wifi className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Simular retorno da comunicação</span>
            </button>
          </div>
        </section>
      </div>

      {/* Refrigerated Lots in this Vault */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200">
          <h2 className="font-display text-sm font-semibold text-slate-900">
            Lotes de cadeia fria nesta filial (bloqueio exclui do saldo utilizável preservando saldo físico)
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                <th className="py-2.5 px-4">Medicamento</th>
                <th className="py-2.5 px-4">Lote</th>
                <th className="py-2.5 px-4 text-right">Físico</th>
                <th className="py-2.5 px-4 text-right">Utilizável disponível</th>
                <th className="py-2.5 px-4">Estado de conservação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {refrigeratedLots.map((l) => {
                const med = state.medications.find((m) => m.id === l.medicationId);
                const usable =
                  l.status === 'utilizavel' ? Math.max(0, l.physicalQty - l.reservedQty) : 0;
                return (
                  <tr key={l.id}>
                    <td className="py-2.5 px-4 font-medium text-slate-900">{med?.name}</td>
                    <td className="py-2.5 px-4 font-mono">{l.lotCode}</td>
                    <td className="py-2.5 px-4 text-right font-mono">{l.physicalQty}</td>
                    <td className="py-2.5 px-4 text-right font-mono font-semibold text-[#0F294A]">
                      {usable}
                    </td>
                    <td className="py-2.5 px-4">
                      {l.status === 'bloqueado' ? (
                        <StatusBadge
                          tone="danger"
                          icon="lock"
                          label={`Bloqueado: ${l.blockedReason ?? 'ocorrência'}`}
                        />
                      ) : (
                        <StatusBadge tone="nominal" icon="check" label="Utilizável" />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Conservation Incidents */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-slate-900">
            Ocorrências de conservação ({branchIncidents.length})
          </h2>
          <span className="text-xs text-slate-500">
            Regras demonstrativas · Normalizar temperatura não desbloqueia automaticamente
          </span>
        </div>

        {branchIncidents.length === 0 ? (
          <div className="p-5 text-sm text-slate-600">
            Nenhuma ocorrência térmica registrada neste cofre.
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {branchIncidents.map((inc) => (
              <div key={inc.id} className="p-5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-[#0F294A]">
                        {inc.code}
                      </span>
                      <StatusBadge
                        tone={
                          inc.status === 'avaliada_liberada'
                            ? 'nominal'
                            : inc.status === 'avaliada_descarte'
                            ? 'danger'
                            : 'warning'
                        }
                        icon={inc.status === 'avaliada_liberada' ? 'check' : 'warn'}
                        label={incidentStatusLabelBR(inc.status)}
                      />
                    </div>
                    <div className="text-xs text-slate-700">
                      {inc.readingsSummary} · Faixa: {inc.allowedRangeLabel}
                    </div>
                    <div className="text-xs text-slate-500">
                      Lotes potencialmente afetados: {inc.affectedLotCodes.join(', ') || 'Nenhum lote utilizável no momento'}
                    </div>
                  </div>

                  {(inc.status === 'aberta' || inc.status === 'bloqueio_aplicado') && (
                    <div>
                      {canEvaluate ? (
                        <button
                          type="button"
                          onClick={() => {
                            setEvalTarget(inc);
                            setEvalDecision('liberar');
                            setEvalJustification('');
                          }}
                          className="px-3.5 py-1.5 text-xs font-medium bg-[#0F294A] text-white rounded hover:bg-[#163864] cursor-pointer"
                        >
                          Registrar avaliação técnica
                        </button>
                      ) : (
                        <span className="text-xs text-slate-500">
                          Avaliação restrita a Gestor/Admin
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {inc.evaluatedBy && (
                  <div className="text-xs text-slate-600 pt-2 border-t border-slate-100">
                    Avaliada por <strong>{inc.evaluatedBy.employeeName}</strong> (
                    {inc.evaluatedBy.employeeMatricula}) em{' '}
                    {formatDateTimeBR(inc.evaluatedBy.timestamp)} —{' '}
                    {inc.evaluatedBy.justification}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Sessions & Reading Log */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200">
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Sessões de abertura ({vaultSessions.length})
            </h3>
          </div>
          <div className="divide-y divide-slate-200 text-xs max-h-72 overflow-y-auto">
            {vaultSessions.length === 0 ? (
              <div className="p-4 text-slate-500">Nenhuma abertura registrada.</div>
            ) : (
              vaultSessions.map((s) => (
                <div key={s.id} className="p-3.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-semibold text-[#0F294A]">{s.code}</span>
                    <span className="text-slate-500">{formatDateTimeBR(s.requestedAt)}</span>
                  </div>
                  <div className="text-slate-700">
                    {s.employeeName} ({s.employeeMatricula}) · {s.purpose}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">
                      Movimentações vinculadas: {s.linkedMovementIds.length}
                    </span>
                    {s.closedWithoutMovement && (
                      <StatusBadge
                        tone="warning"
                        icon="warn"
                        label="Abertura sem movimentação registrada"
                      />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200">
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Histórico de leituras e eventos ({vaultReadings.length})
            </h3>
          </div>
          <div className="divide-y divide-slate-200 text-xs max-h-72 overflow-y-auto">
            {vaultReadings.map((r) => (
              <div key={r.id} className="p-3.5 flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="font-medium text-slate-900">{r.eventLabel}</div>
                  <div className="text-slate-500 font-mono">
                    {formatDateTimeBR(r.timestamp)} · {sensorStatusLabelBR(r.sensorStatus)}
                  </div>
                </div>
                <div className="font-mono font-semibold text-[#0F294A] shrink-0">
                  {r.tempC !== null ? `${r.tempC.toFixed(1)} °C` : '—'}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Modal: Evaluate Conservation Incident */}
      {evalTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-5 space-y-4">
            <h3 className="font-display text-base font-semibold text-slate-900">
              Avaliar ocorrência {evalTarget.code}
            </h3>
            <p className="text-xs text-slate-600">
              A normalização da temperatura não libera os lotes automaticamente. Registre a decisão
              responsável e a justificativa.
            </p>
            <form onSubmit={handleConfirmEval} className="space-y-3 text-xs">
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="inc-dec"
                    checked={evalDecision === 'liberar'}
                    onChange={() => setEvalDecision('liberar')}
                  />
                  <span className="font-medium text-slate-900">
                    Liberar lotes afetados para uso
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="inc-dec"
                    checked={evalDecision === 'descarte'}
                    onChange={() => setEvalDecision('descarte')}
                  />
                  <span className="font-medium text-red-700">
                    Manter bloqueio e destinar para descarte
                  </span>
                </label>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Justificativa técnica registrada
                </label>
                <textarea
                  rows={3}
                  value={evalJustification}
                  onChange={(e) => setEvalJustification(e.target.value)}
                  placeholder="Ex: Avaliação concluída conforme protocolo demonstrativo..."
                  className="w-full px-3 py-2 border border-slate-300 rounded"
                  required
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEvalTarget(null)}
                  className="px-3.5 py-2 border border-slate-300 rounded cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#0F294A] text-white font-medium rounded hover:bg-[#163864] cursor-pointer"
                >
                  Registrar avaliação
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
