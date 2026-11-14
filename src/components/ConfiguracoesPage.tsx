import React, { useState } from 'react';
import { BellRing, Building2, CheckCircle2, Lock, Plus, Truck, Users } from 'lucide-react';
import { useCofre } from '../context/CofreContext';
import { DEFAULT_ALERT_ROLE_CONFIG } from '../data/seedData';
import { AlertCategory, AlertResponsibleRole, UserRole } from '../types/cofre';
import { AVAILABLE_ALERT_ROLES, buildEscalationChain } from '../utils/alertsEngine';
import { alertCategoryLabelBR, formatCpfInput, roleLabelBR } from '../utils/formatters';
import { StatusBadge } from './StatusBadge';

export const ConfiguracoesPage: React.FC = () => {
  const {
    state,
    currentUser,
    updateBranchAlertDays,
    updateSupplierOffer,
    updateUserAccount,
    addUserAccount,
    updateAlertRoleConfig,
  } = useCofre();

  const [feedback, setFeedback] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newMatricula, setNewMatricula] = useState('');
  const [newCpf, setNewCpf] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('funcionario');
  const [newBranches, setNewBranches] = useState<string[]>(['branch-bairro']);

  const isAdmin = currentUser?.role === 'administrador';
  const canEditOperational = currentUser?.role === 'gestor' || isAdmin;

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    const res = addUserAccount({
      name: newName.trim(),
      matricula: newMatricula.trim().toUpperCase(),
      cpf: newCpf,
      password: 'demo-user-2026',
      totpSeedLabel: '551920',
      role: newRole,
      authorizedBranchIds: newBranches,
      active: true,
    });
    if (!res.ok) {
      setFeedback(res.error ?? 'Erro ao cadastrar usuário.');
      return;
    }
    setNewName('');
    setNewMatricula('');
    setNewCpf('');
    setFeedback('Colaborador fictício adicionado com sucesso.');
  };

  const toggleUserBranch = (userId: string, branchId: string, currentIds: string[]) => {
    const next = currentIds.includes(branchId)
      ? currentIds.filter((id) => id !== branchId)
      : [...currentIds, branchId];
    if (next.length === 0) return;
    updateUserAccount(userId, { authorizedBranchIds: next });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-slate-900">Configurações</h1>
        <p className="text-sm text-slate-600">
          Parâmetros de validade por filial, condições comerciais dos fornecedores (para teste de
          sensibilidade) e gestão de usuários e permissões.
        </p>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-md bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Branch Alert Settings */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-[#0F294A]" aria-hidden="true" />
          <h2 className="font-display text-base font-semibold text-slate-900">
            Filiais, distâncias e prazos de alerta
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                <th className="py-2.5 px-4">Filial</th>
                <th className="py-2.5 px-4">Endereço (fictício)</th>
                <th className="py-2.5 px-4">Distâncias cadastradas</th>
                <th className="py-2.5 px-4 text-right">Alerta de validade (dias)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {state.branches.map((branch) => (
                <tr key={branch.id}>
                  <td className="py-3 px-4 font-medium text-slate-900">
                    <div>{branch.name}</div>
                    <div className="font-mono text-slate-500">{branch.code}</div>
                  </td>
                  <td className="py-3 px-4 text-slate-700">
                    {branch.address} · {branch.cityState}
                  </td>
                  <td className="py-3 px-4 text-slate-600">
                    {branch.distances
                      .map((d) => {
                        const t = state.branches.find((b) => b.id === d.toBranchId);
                        return `${t?.name}: ${d.distanceKm} km (${
                          d.transitDays === 0 ? 'mesmo dia' : `${d.transitDays}d`
                        })`;
                      })
                      .join(' · ')}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <input
                      type="number"
                      min={0}
                      max={3650}
                      disabled={!canEditOperational}
                      value={branch.alertDaysBeforeExpiry}
                      onChange={(e) => {
                        const v = Number.parseInt(e.target.value, 10);
                        if (!Number.isNaN(v)) updateBranchAlertDays(branch.id, v);
                      }}
                      className="w-20 px-2.5 py-1 text-right font-mono border border-slate-300 rounded disabled:bg-slate-100"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Supplier Commercial Rules (Editable for evaluation sensitivity tests) */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Truck className="w-4 h-4 text-[#0F294A]" aria-hidden="true" />
            <h2 className="font-display text-base font-semibold text-slate-900">
              Condições comerciais dos fornecedores (fictícios)
            </h2>
          </div>
          <span className="text-xs text-slate-500">
            Alterações refletem imediatamente no comparativo em Reposição e compras.
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 font-medium text-slate-600">
                <th className="py-2.5 px-3">Medicamento</th>
                <th className="py-2.5 px-3">Fornecedor</th>
                <th className="py-2.5 px-3 text-right">Preço/cx (R$)</th>
                <th className="py-2.5 px-3 text-right">Pedido mínimo</th>
                <th className="py-2.5 px-3 text-right">Múltiplo</th>
                <th className="py-2.5 px-3 text-right">Frete (R$)</th>
                <th className="py-2.5 px-3 text-right">Prazo (dias)</th>
                <th className="py-2.5 px-3 text-right">Disponibilidade</th>
                <th className="py-2.5 px-3">Validade lote</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {state.supplierOffers.map((offer) => {
                const med = state.medications.find((m) => m.id === offer.medicationId);
                return (
                  <tr key={offer.id}>
                    <td className="py-2.5 px-3 font-medium text-slate-900">
                      {med?.name.split(' (')[0]}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700">{offer.supplierName}</td>
                    <td className="py-2.5 px-3 text-right">
                      <input
                        type="number"
                        min={0.01}
                        step={0.5}
                        disabled={!canEditOperational}
                        value={offer.pricePerBox}
                        onChange={(e) =>
                          updateSupplierOffer(offer.id, {
                            pricePerBox: Number.parseFloat(e.target.value) || 1,
                          })
                        }
                        className="w-20 px-2 py-1 text-right font-mono border border-slate-300 rounded disabled:bg-slate-100"
                      />
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <input
                        type="number"
                        min={1}
                        disabled={!canEditOperational}
                        value={offer.minOrderQty}
                        onChange={(e) =>
                          updateSupplierOffer(offer.id, {
                            minOrderQty: Number.parseInt(e.target.value, 10) || 1,
                          })
                        }
                        className="w-16 px-2 py-1 text-right font-mono border border-slate-300 rounded disabled:bg-slate-100"
                      />
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <input
                        type="number"
                        min={1}
                        disabled={!canEditOperational}
                        value={offer.packMultiple}
                        onChange={(e) =>
                          updateSupplierOffer(offer.id, {
                            packMultiple: Number.parseInt(e.target.value, 10) || 1,
                          })
                        }
                        className="w-16 px-2 py-1 text-right font-mono border border-slate-300 rounded disabled:bg-slate-100"
                      />
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        disabled={!canEditOperational}
                        value={offer.freightCost}
                        onChange={(e) =>
                          updateSupplierOffer(offer.id, {
                            freightCost: Number.parseFloat(e.target.value) || 0,
                          })
                        }
                        className="w-20 px-2 py-1 text-right font-mono border border-slate-300 rounded disabled:bg-slate-100"
                      />
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <input
                        type="number"
                        min={0}
                        disabled={!canEditOperational}
                        value={offer.leadTimeDays}
                        onChange={(e) =>
                          updateSupplierOffer(offer.id, {
                            leadTimeDays: Number.parseInt(e.target.value, 10) || 0,
                          })
                        }
                        className="w-16 px-2 py-1 text-right font-mono border border-slate-300 rounded disabled:bg-slate-100"
                      />
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <input
                        type="number"
                        min={0}
                        disabled={!canEditOperational}
                        value={offer.availableQty}
                        onChange={(e) =>
                          updateSupplierOffer(offer.id, {
                            availableQty: Number.parseInt(e.target.value, 10) || 0,
                          })
                        }
                        className="w-20 px-2 py-1 text-right font-mono border border-slate-300 rounded disabled:bg-slate-100"
                      />
                    </td>
                    <td className="py-2.5 px-3">
                      <input
                        type="date"
                        disabled={!canEditOperational}
                        value={offer.lotExpiryDate}
                        onChange={(e) =>
                          updateSupplierOffer(offer.id, {
                            lotExpiryDate: e.target.value,
                          })
                        }
                        className="px-2 py-1 font-mono border border-slate-300 rounded disabled:bg-slate-100"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Default Alert Responsible Mapping */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BellRing className="w-4 h-4 text-[#0F294A]" aria-hidden="true" />
            <h2 className="font-display text-base font-semibold text-slate-900">
              Responsável padrão por tipo de alerta
            </h2>
          </div>
          <span className="text-xs text-slate-500">
            Escalonamento automático após 10 min simulados sem reconhecimento (apenas em tela).
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                <th className="py-2.5 px-4">Tipo de alerta</th>
                <th className="py-2.5 px-4">Responsável padrão</th>
                <th className="py-2.5 px-4">Cadeia de escalonamento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {(Object.keys(DEFAULT_ALERT_ROLE_CONFIG) as AlertCategory[]).map((cat) => {
                const currentRole = state.alertRoleConfig[cat] ?? DEFAULT_ALERT_ROLE_CONFIG[cat];
                const chain = buildEscalationChain(currentRole);
                return (
                  <tr key={cat} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-medium text-slate-900">
                      {alertCategoryLabelBR(cat)}
                    </td>
                    <td className="py-3 px-4">
                      <select
                        aria-label={`Responsável padrão para ${alertCategoryLabelBR(cat)}`}
                        disabled={!canEditOperational}
                        value={currentRole}
                        onChange={(e) => {
                          const res = updateAlertRoleConfig(
                            cat,
                            e.target.value as AlertResponsibleRole
                          );
                          if (res.ok) {
                            setFeedback(
                              `Responsável padrão de "${alertCategoryLabelBR(
                                cat
                              )}" atualizado para ${e.target.value}.`
                            );
                          }
                        }}
                        className="px-2.5 py-1 border border-slate-300 rounded bg-white disabled:bg-slate-100"
                      >
                        {AVAILABLE_ALERT_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 px-4 text-slate-600 font-mono">
                      {chain.join(' → ')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Admin Users & Permissions */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#0F294A]" aria-hidden="true" />
            <h2 className="font-display text-base font-semibold text-slate-900">
              Usuários e permissões por filial
            </h2>
          </div>
          {!isAdmin && (
            <StatusBadge
              tone="neutral"
              icon="lock"
              label="Edição restrita ao perfil Administrador"
            />
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                <th className="py-2.5 px-4">Colaborador</th>
                <th className="py-2.5 px-4">Matrícula</th>
                <th className="py-2.5 px-4">Perfil</th>
                <th className="py-2.5 px-4">Filiais autorizadas</th>
                <th className="py-2.5 px-4">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {state.users.map((u) => (
                <tr key={u.id}>
                  <td className="py-3 px-4 font-medium text-slate-900">{u.name}</td>
                  <td className="py-3 px-4 font-mono text-slate-700">{u.matricula}</td>
                  <td className="py-3 px-4">
                    {isAdmin ? (
                      <select
                        value={u.role}
                        onChange={(e) =>
                          updateUserAccount(u.id, { role: e.target.value as UserRole })
                        }
                        className="px-2 py-1 border border-slate-300 rounded bg-white"
                      >
                        <option value="funcionario">Funcionário</option>
                        <option value="gestor">Gestor</option>
                        <option value="administrador">Administrador</option>
                      </select>
                    ) : (
                      roleLabelBR(u.role)
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-wrap gap-2">
                      {state.branches.map((b) => {
                        const checked = u.authorizedBranchIds.includes(b.id);
                        return (
                          <label
                            key={b.id}
                            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border ${
                              checked
                                ? 'bg-slate-100 border-slate-300 text-slate-900'
                                : 'bg-white border-slate-200 text-slate-400'
                            } ${isAdmin ? 'cursor-pointer' : ''}`}
                          >
                            <input
                              type="checkbox"
                              disabled={!isAdmin}
                              checked={checked}
                              onChange={() =>
                                toggleUserBranch(u.id, b.id, u.authorizedBranchIds)
                              }
                            />
                            <span>{b.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    {u.active ? (
                      <StatusBadge tone="nominal" icon="check" label="Ativo" />
                    ) : (
                      <StatusBadge tone="danger" icon="lock" label="Inativo" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {isAdmin ? (
          <form
            onSubmit={handleCreateUser}
            className="p-5 border-t border-slate-200 bg-slate-50 space-y-3"
          >
            <div className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5 text-[#0F294A]" aria-hidden="true" />
              <span>Cadastrar novo colaborador fictício</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <input
                type="text"
                placeholder="Nome completo"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded bg-white"
                required
              />
              <input
                type="text"
                placeholder="Matrícula (ex: MAT-2040)"
                value={newMatricula}
                onChange={(e) => setNewMatricula(e.target.value)}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded bg-white font-mono"
                required
              />
              <input
                type="text"
                placeholder="CPF fictício (11 dígitos)"
                value={newCpf}
                onChange={(e) => setNewCpf(formatCpfInput(e.target.value))}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded bg-white font-mono"
                required
              />
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as UserRole)}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded bg-white"
              >
                <option value="funcionario">Funcionário</option>
                <option value="gestor">Gestor</option>
                <option value="administrador">Administrador</option>
              </select>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs font-medium bg-[#0F294A] text-white rounded hover:bg-[#163864] cursor-pointer"
              >
                Adicionar usuário
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
              <span>Filiais iniciais:</span>
              {state.branches.map((b) => (
                <label key={b.id} className="inline-flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newBranches.includes(b.id)}
                    onChange={() =>
                      setNewBranches((prev) =>
                        prev.includes(b.id)
                          ? prev.length > 1
                            ? prev.filter((id) => id !== b.id)
                            : prev
                          : [...prev, b.id]
                      )
                    }
                  />
                  <span>{b.name}</span>
                </label>
              ))}
            </div>
          </form>
        ) : (
          <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 text-xs text-slate-500 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" aria-hidden="true" />
            <span>
              Acesse com a conta de demonstração Administrador para gerenciar usuários e permissões.
            </span>
          </div>
        )}
      </section>
    </div>
  );
};
