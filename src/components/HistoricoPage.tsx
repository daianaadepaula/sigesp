import React, { useMemo, useState } from 'react';
import { AlertTriangle, History, Info, RotateCcw, ShieldCheck, X } from 'lucide-react';
import { useCofre } from '../context/CofreContext';
import { StockMovement } from '../types/cofre';
import {
  accessResultLabelBR,
  formatDateTimeBR,
  movementTypeLabelBR,
} from '../utils/formatters';
import { StatusBadge } from './StatusBadge';

export const HistoricoPage: React.FC = () => {
  const { state, currentUser, reverseMovement } = useCofre();
  const [tab, setTab] = useState<
    'movimentacoes' | 'acessos' | 'cofre_sessoes' | 'seguranca' | 'auditoria_geral'
  >('movimentacoes');

  // Movement filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterEmployee, setFilterEmployee] = useState('');
  const [filterBranch, setFilterBranch] = useState('');
  const [filterMed, setFilterMed] = useState('');
  const [filterLot, setFilterLot] = useState('');

  // Access filters
  const [accFilterEmployee, setAccFilterEmployee] = useState('');
  const [accFilterBranch, setAccFilterBranch] = useState('');

  // Reversal modal
  const [reversalTarget, setReversalTarget] = useState<StockMovement | null>(null);
  const [reversalReason, setReversalReason] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const reversedIds = useMemo(() => {
    const set = new Set<string>();
    for (const m of state.movements) {
      if (m.reversedMovementId) set.add(m.reversedMovementId);
    }
    return set;
  }, [state.movements]);

  const filteredMovements = useMemo(() => {
    return state.movements
      .filter((m) => {
        if (filterBranch && m.branchId !== filterBranch) return false;
        if (filterMed && m.medicationId !== filterMed) return false;
        if (
          filterEmployee.trim() &&
          !`${m.employeeName} ${m.employeeMatricula}`
            .toLowerCase()
            .includes(filterEmployee.trim().toLowerCase())
        ) {
          return false;
        }
        if (
          filterLot.trim() &&
          !m.lotCode.toLowerCase().includes(filterLot.trim().toLowerCase())
        ) {
          return false;
        }
        const dayStr = m.timestamp.slice(0, 10);
        if (dateFrom && dayStr < dateFrom) return false;
        if (dateTo && dayStr > dateTo) return false;
        return true;
      })
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [state.movements, filterBranch, filterMed, filterEmployee, filterLot, dateFrom, dateTo]);

  const filteredAccessLogs = useMemo(() => {
    return state.accessLogs
      .filter((a) => {
        if (accFilterBranch && a.branchId !== accFilterBranch) return false;
        if (
          accFilterEmployee.trim() &&
          !`${a.employeeName} ${a.employeeMatricula}`
            .toLowerCase()
            .includes(accFilterEmployee.trim().toLowerCase())
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [state.accessLogs, accFilterBranch, accFilterEmployee]);

  const handleConfirmReversal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reversalTarget) return;
    const res = reverseMovement(reversalTarget.id, reversalReason);
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error ?? 'Erro ao estornar.' });
      setReversalTarget(null);
      return;
    }
    setReversalTarget(null);
    setReversalReason('');
    setFeedback({
      type: 'ok',
      text: 'Estorno registrado e vinculado ao lançamento original preservando coerência com transferências e compras.',
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-semibold text-slate-900">
            Histórico e auditoria
          </h1>
          <p className="text-sm text-slate-600">
            Registros de movimentações, acessos, sessões do cofre, alterações de política e auditoria
            administrativa.
          </p>
        </div>

        <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start">
          <button
            type="button"
            onClick={() => setTab('movimentacoes')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              tab === 'movimentacoes'
                ? 'bg-white text-[#0F294A] shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Movimentações ({state.movements.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('acessos')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              tab === 'acessos'
                ? 'bg-white text-[#0F294A] shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Acessos ({state.accessLogs.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('cofre_sessoes')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              tab === 'cofre_sessoes'
                ? 'bg-white text-[#0F294A] shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Sessões do cofre ({state.vaultSessions.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('seguranca')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              tab === 'seguranca'
                ? 'bg-white text-[#0F294A] shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Políticas ({state.safetyChangeLogs.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('auditoria_geral')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              tab === 'auditoria_geral'
                ? 'bg-white text-[#0F294A] shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Auditoria geral ({state.generalAuditLogs.length})
          </button>
        </div>
      </div>

      {/* Explicit local PoC disclaimer */}
      <div className="p-3 rounded-md bg-slate-100 border border-slate-300 text-xs text-slate-700 flex items-start gap-2">
        <Info className="w-4 h-4 text-[#0F294A] shrink-0 mt-0.5" aria-hidden="true" />
        <span>
          <strong>Escopo de auditoria desta PoC:</strong> os históricos ficam gravados localmente no
          navegador (localStorage), sem assinatura criptográfica ou proteção contra adulteração
          externa. Senhas, códigos simulados de verificação e CPF completo nunca são gravados nos
          registros.
        </span>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-md border text-xs flex items-center justify-between ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <span>{feedback.text}</span>
          <button type="button" onClick={() => setFeedback(null)} className="cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {tab === 'movimentacoes' && (
        <div className="space-y-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <div>
              <label className="block text-xs text-slate-600 mb-1">Data inicial</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">Data final</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">Funcionário</label>
              <input
                type="text"
                value={filterEmployee}
                onChange={(e) => setFilterEmployee(e.target.value)}
                placeholder="Nome ou matrícula"
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">Filial</label>
              <select
                value={filterBranch}
                onChange={(e) => setFilterBranch(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white"
              >
                <option value="">Todas</option>
                {state.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">Medicamento</label>
              <select
                value={filterMed}
                onChange={(e) => setFilterMed(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white"
              >
                <option value="">Todos</option>
                {state.medications.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">Lote</label>
              <input
                type="text"
                value={filterLot}
                onChange={(e) => setFilterLot(e.target.value)}
                placeholder="Ex: IMG-BR-2604"
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded font-mono"
              />
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                    <th className="py-2.5 px-3">Data / Hora</th>
                    <th className="py-2.5 px-3">Funcionário</th>
                    <th className="py-2.5 px-3">Filial</th>
                    <th className="py-2.5 px-3">Medicamento</th>
                    <th className="py-2.5 px-3">Lote</th>
                    <th className="py-2.5 px-3">Operação</th>
                    <th className="py-2.5 px-3 text-right">Qtd.</th>
                    <th className="py-2.5 px-3 text-right">Saldo ant. → post.</th>
                    <th className="py-2.5 px-3">Motivo / Vínculos</th>
                    <th className="py-2.5 px-3 text-right">Correção</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredMovements.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-6 px-4 text-xs text-slate-500 text-center">
                        Nenhuma movimentação encontrada para os filtros aplicados.
                      </td>
                    </tr>
                  ) : (
                    filteredMovements.map((m) => {
                      const branch = state.branches.find((b) => b.id === m.branchId);
                      const med = state.medications.find((md) => md.id === m.medicationId);
                      const origBranch = m.originBranchId
                        ? state.branches.find((b) => b.id === m.originBranchId)
                        : null;
                      const destBranch = m.destinationBranchId
                        ? state.branches.find((b) => b.id === m.destinationBranchId)
                        : null;
                      const isReversed = reversedIds.has(m.id);
                      const canReverse =
                        !isReversed &&
                        m.type !== 'estorno' &&
                        currentUser?.authorizedBranchIds.includes(m.branchId);

                      return (
                        <tr key={m.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-mono text-xs tabular-nums whitespace-nowrap text-slate-700">
                            {formatDateTimeBR(m.timestamp)}
                          </td>
                          <td className="py-2.5 px-3 text-xs">
                            <div className="font-medium text-slate-900">{m.employeeName}</div>
                            <div className="font-mono text-slate-500">{m.employeeMatricula}</div>
                          </td>
                          <td className="py-2.5 px-3 text-xs font-medium text-slate-800">
                            {branch?.name}
                          </td>
                          <td className="py-2.5 px-3 text-xs text-slate-900">{med?.name}</td>
                          <td className="py-2.5 px-3 font-mono text-xs text-slate-700">
                            {m.lotCode}
                          </td>
                          <td className="py-2.5 px-3 text-xs">
                            <span className="font-medium text-slate-900">
                              {movementTypeLabelBR(m.type)}
                            </span>
                            {isReversed && (
                              <span className="block text-amber-700 text-[11px]">Estornado</span>
                            )}
                          </td>
                          <td
                            className={`py-2.5 px-3 text-right font-mono text-xs font-semibold tabular-nums ${
                              m.quantityDelta >= 0 ? 'text-emerald-700' : 'text-red-700'
                            }`}
                          >
                            {m.quantityDelta > 0 ? `+${m.quantityDelta}` : m.quantityDelta}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-xs tabular-nums text-slate-700 whitespace-nowrap">
                            {m.previousBalance} → {m.newBalance}
                          </td>
                          <td className="py-2.5 px-3 text-xs text-slate-600 max-w-xs">
                            <div>{m.reason}</div>
                            {m.transferGroupId && (
                              <div className="font-mono text-[11px] text-[#0F294A] mt-0.5">
                                {m.transferGroupId}: {origBranch?.name} → {destBranch?.name}
                              </div>
                            )}
                            {m.vaultSessionId && (
                              <div className="font-mono text-[11px] text-emerald-700 mt-0.5">
                                Vinculado à sessão do cofre
                              </div>
                            )}
                            {m.missingVaultSessionWarning && (
                              <div className="text-[11px] text-amber-800 font-medium flex items-center gap-1 mt-0.5">
                                <AlertTriangle className="w-3 h-3 shrink-0" />
                                <span>Movimentação refrigerada sem abertura de cofre vinculada</span>
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {canReverse ? (
                              <button
                                type="button"
                                onClick={() => setReversalTarget(m)}
                                className="px-2 py-1 text-xs border border-slate-300 hover:bg-slate-100 rounded inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                              >
                                <RotateCcw className="w-3 h-3" aria-hidden="true" />
                                <span>Estornar</span>
                              </button>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
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
      )}

      {tab === 'acessos' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                value={accFilterEmployee}
                onChange={(e) => setAccFilterEmployee(e.target.value)}
                placeholder="Filtrar por nome ou matrícula"
                className="px-3 py-1.5 text-xs border border-slate-300 rounded w-56"
              />
              <select
                value={accFilterBranch}
                onChange={(e) => setAccFilterBranch(e.target.value)}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded bg-white"
              >
                <option value="">Todas as filiais</option>
                {state.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="text-xs text-slate-500 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#0F294A]" aria-hidden="true" />
              <span>
                Senhas, códigos simulados e CPF completo são omitidos dos registros de auditoria.
              </span>
            </div>
          </div>

          <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                    <th className="py-2.5 px-4">Data / Hora</th>
                    <th className="py-2.5 px-4">Funcionário</th>
                    <th className="py-2.5 px-4">Perfil</th>
                    <th className="py-2.5 px-4">Filial selecionada</th>
                    <th className="py-2.5 px-4">Resultado</th>
                    <th className="py-2.5 px-4">Detalhe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {filteredAccessLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-4 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        {formatDateTimeBR(log.timestamp)}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className="font-medium text-slate-900">{log.employeeName}</span>{' '}
                        <span className="font-mono text-slate-500">({log.employeeMatricula})</span>
                      </td>
                      <td className="py-2.5 px-4 text-slate-700">{log.roleLabel}</td>
                      <td className="py-2.5 px-4 text-slate-700">{log.branchName ?? '—'}</td>
                      <td className="py-2.5 px-4">
                        <StatusBadge
                          tone={
                            log.result === 'sucesso'
                              ? 'nominal'
                              : log.result === 'logout'
                              ? 'neutral'
                              : 'danger'
                          }
                          icon={
                            log.result === 'sucesso'
                              ? 'check'
                              : log.result === 'logout'
                              ? 'clock'
                              : 'x'
                          }
                          label={accessResultLabelBR(log.result)}
                        />
                      </td>
                      <td className="py-2.5 px-4 text-slate-600">{log.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {tab === 'cofre_sessoes' && (
        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200">
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Sessões de abertura do cofre refrigerado
            </h2>
          </div>
          {state.vaultSessions.length === 0 ? (
            <div className="p-6 text-sm text-slate-600">
              Nenhuma abertura de cofre registrada ainda.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                    <th className="py-2.5 px-4">Sessão</th>
                    <th className="py-2.5 px-4">Filial</th>
                    <th className="py-2.5 px-4">Colaborador</th>
                    <th className="py-2.5 px-4">Abertura / Fechamento</th>
                    <th className="py-2.5 px-4">Movimentações</th>
                    <th className="py-2.5 px-4">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {state.vaultSessions.map((ses) => {
                    const br = state.branches.find((b) => b.id === ses.branchId);
                    return (
                      <tr key={ses.id}>
                        <td className="py-2.5 px-4 font-mono font-semibold text-[#0F294A]">
                          {ses.code}
                        </td>
                        <td className="py-2.5 px-4 text-slate-700">{br?.name}</td>
                        <td className="py-2.5 px-4">
                          {ses.employeeName}{' '}
                          <span className="font-mono text-slate-500">({ses.employeeMatricula})</span>
                        </td>
                        <td className="py-2.5 px-4 font-mono text-slate-600">
                          {ses.doorOpenedAt ? formatDateTimeBR(ses.doorOpenedAt) : '—'} →{' '}
                          {ses.doorClosedAt ? formatDateTimeBR(ses.doorClosedAt) : 'Em aberto'}
                        </td>
                        <td className="py-2.5 px-4 font-mono">
                          {ses.linkedMovementIds.length} vinculada(s)
                        </td>
                        <td className="py-2.5 px-4">
                          {ses.closedWithoutMovement ? (
                            <StatusBadge
                              tone="warning"
                              icon="warn"
                              label="Abertura sem movimentação registrada"
                            />
                          ) : ses.doorClosedAt ? (
                            <StatusBadge tone="nominal" icon="check" label="Concluída" />
                          ) : (
                            <StatusBadge tone="info" icon="clock" label="Em andamento" />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === 'seguranca' && (
        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center gap-2">
            <History className="w-4 h-4 text-[#0F294A]" aria-hidden="true" />
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Registro de alterações em estoque de segurança e cobertura
            </h2>
          </div>
          {state.safetyChangeLogs.length === 0 ? (
            <div className="p-6 text-sm text-slate-600">
              Nenhuma alteração de estoque de segurança registrada nesta sessão.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                    <th className="py-2.5 px-4">Data / Hora</th>
                    <th className="py-2.5 px-4">Responsável</th>
                    <th className="py-2.5 px-4">Filial / Medicamento</th>
                    <th className="py-2.5 px-4">Segurança ant. → nova</th>
                    <th className="py-2.5 px-4">Justificativa registrada</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {state.safetyChangeLogs.map((s) => {
                    const br = state.branches.find((b) => b.id === s.branchId);
                    const md = state.medications.find((m) => m.id === s.medicationId);
                    return (
                      <tr key={s.id}>
                        <td className="py-2.5 px-4 font-mono tabular-nums text-slate-700">
                          {formatDateTimeBR(s.timestamp)}
                        </td>
                        <td className="py-2.5 px-4">
                          {s.employeeName}{' '}
                          <span className="font-mono text-slate-500">({s.employeeMatricula})</span>
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="font-medium text-slate-900">{br?.name}</div>
                          <div className="text-slate-600">{md?.name}</div>
                        </td>
                        <td className="py-2.5 px-4 font-mono font-semibold text-[#0F294A]">
                          {s.previousSafetyStock} → {s.newSafetyStock}
                        </td>
                        <td className="py-2.5 px-4 text-slate-700">{s.justification}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === 'auditoria_geral' && (
        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200">
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Auditoria geral (fornecedores, políticas, usuários, permissões, cofre e ocorrências)
            </h2>
          </div>
          {state.generalAuditLogs.length === 0 ? (
            <div className="p-6 text-sm text-slate-600">
              Nenhum evento administrativo ou de conservação registrado ainda.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                    <th className="py-2.5 px-4">Data / Hora</th>
                    <th className="py-2.5 px-4">Categoria</th>
                    <th className="py-2.5 px-4">Responsável</th>
                    <th className="py-2.5 px-4">Ação</th>
                    <th className="py-2.5 px-4">Antes → Depois</th>
                    <th className="py-2.5 px-4">Justificativa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {state.generalAuditLogs.map((aud) => (
                    <tr key={aud.id}>
                      <td className="py-2.5 px-4 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        {formatDateTimeBR(aud.timestamp)}
                      </td>
                      <td className="py-2.5 px-4 font-mono uppercase text-[11px] text-[#0F294A]">
                        {aud.category}
                      </td>
                      <td className="py-2.5 px-4">
                        {aud.employeeName}{' '}
                        <span className="font-mono text-slate-500">({aud.employeeMatricula})</span>
                      </td>
                      <td className="py-2.5 px-4 font-medium text-slate-900">{aud.action}</td>
                      <td className="py-2.5 px-4 text-slate-600">
                        {aud.previousValue || aud.newValue ? (
                          <span>
                            {aud.previousValue ?? '—'} → <strong>{aud.newValue ?? '—'}</strong>
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600">{aud.justification ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Reversal Modal */}
      {reversalTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-5 space-y-4">
            <h3 className="font-display text-base font-semibold text-slate-900">
              Gerar estorno vinculado
            </h3>
            <p className="text-xs text-slate-600">
              O registro original não é apagado. Será criado um lançamento de estorno no sentido
              oposto ({reversalTarget.quantityDelta > 0 ? '-' : '+'}
              {reversalTarget.quantityAbs} unid. no lote {reversalTarget.lotCode}), mantendo a
              consistência com transferências e pedidos vinculados.
            </p>
            <form onSubmit={handleConfirmReversal} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Motivo / justificativa obrigatória
                </label>
                <input
                  type="text"
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  placeholder="Ex: Erro de digitação na quantidade"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded"
                  required
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReversalTarget(null)}
                  className="px-3.5 py-2 text-xs border border-slate-300 rounded cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-medium bg-[#0F294A] text-white rounded hover:bg-[#163864] cursor-pointer"
                >
                  Confirmar estorno
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
