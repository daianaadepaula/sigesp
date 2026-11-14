import React, { useMemo, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowLeftRight,
  Building2,
  CheckCircle2,
  ClipboardList,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Play,
  RotateCcw,
  Settings,
  ShoppingCart,
  ThermometerSnowflake,
  TrendingUp,
  X,
} from 'lucide-react';
import { NavTab, useCofre } from '../context/CofreContext';
import { calculateBranchMedicationMetrics } from '../utils/calculations';
import { roleLabelBR } from '../utils/formatters';

interface AppLayoutProps {
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const {
    state,
    currentUser,
    activeBranch,
    activeTab,
    setActiveTab,
    switchActiveBranch,
    logout,
    startDemo,
    restoreDemo,
    dismissDemoBanner,
    recommendations,
    operationalAlerts,
    acknowledgeAlert,
    setFocusBranchId,
    setFocusMedicationId,
  } = useCofre();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const unacknowledgedAlertsCount = useMemo(
    () => operationalAlerts.filter((a) => !a.acknowledged).length,
    [operationalAlerts]
  );

  const unacknowledgedCriticalAlerts = useMemo(
    () => operationalAlerts.filter((a) => !a.acknowledged && a.severity === 'critica'),
    [operationalAlerts]
  );

  const activeIncidentCount = useMemo(
    () =>
      state.conservationIncidents.filter(
        (i) => i.status === 'aberta' || i.status === 'bloqueio_aplicado'
      ).length,
    [state.conservationIncidents]
  );

  const pendingDecisionCount = useMemo(() => {
    const needCount = recommendations.filter((r) => r.metrics.netNeedQty > 0).length;
    const pendingTrf = state.transfers.filter(
      (t) =>
        t.status === 'solicitada' ||
        t.status === 'aprovada_reservada' ||
        t.status === 'expedida'
    ).length;
    const pendingPr = state.purchaseRequests.filter(
      (p) =>
        p.status === 'pendente' ||
        p.status === 'aguardando_aprovacao' ||
        p.status === 'escalonada_diretor' ||
        p.status === 'aprovada' ||
        p.status === 'parcialmente_recebida'
    ).length;
    return needCount + pendingTrf + pendingPr;
  }, [recommendations, state.transfers, state.purchaseRequests]);

  // 8-step guided presentation checklist
  const demoChecklist = useMemo(() => {
    const imgBairro = calculateBranchMedicationMetrics(
      state,
      'branch-bairro',
      'med-img',
      new Date()
    );
    const step1 = state.vaultSessions.length > 0;
    const step2 = imgBairro.netConsumptionPeriod >= 30;
    const step3 = imgBairro.netNeedQty > 0;
    const step4 = state.transfers.some((t) => t.medicationId === 'med-img');
    const step5 = state.purchaseRequests.some((p) => p.medicationId === 'med-img');
    const step6 = state.purchaseRequests.some(
      (p) => p.receipts.length > 0 && (p.status === 'parcialmente_recebida' || p.status === 'recebida')
    );
    const step7 = state.conservationIncidents.length > 0;
    return { step1, step2, step3, step4, step5, step6, step7 };
  }, [state]);

  const navItems: {
    id: NavTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    count?: number;
  }[] = [
    { id: 'painel', label: 'Painel', icon: LayoutDashboard },
    { id: 'cofre', label: 'Cofre e conservação', icon: ThermometerSnowflake, count: activeIncidentCount },
    { id: 'filiais', label: 'Filiais e estoques', icon: Building2 },
    { id: 'impacto', label: 'Impacto', icon: TrendingUp },
    { id: 'movimentacoes', label: 'Movimentações', icon: ArrowLeftRight },
    { id: 'alertas', label: 'Alertas', icon: AlertTriangle, count: unacknowledgedAlertsCount },
    { id: 'reposicao', label: 'Reposição e compras', icon: ShoppingCart, count: pendingDecisionCount },
    { id: 'historico', label: 'Histórico', icon: History },
    { id: 'configuracoes', label: 'Configurações', icon: Settings },
  ];

  const canSwitchBranch = (currentUser?.authorizedBranchIds.length ?? 0) > 1;

  const handleNavClick = (id: NavTab) => {
    setActiveTab(id);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-[#0F294A] text-white">
        <div className="px-4 py-4 border-b border-white/10">
          <button
            type="button"
            onClick={logout}
            title="Voltar à tela de acesso ao sistema (trocar usuário ou encerrar sessão)"
            aria-label="SIGESP — Voltar à tela de acesso ao sistema"
            className="w-full flex items-center gap-2.5 p-1.5 rounded-md text-left hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/40 transition-colors cursor-pointer group"
          >
            <div className="w-8 h-8 rounded bg-white text-[#0F294A] flex items-center justify-center font-display font-bold text-sm shrink-0">
              S
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-display font-semibold text-base leading-tight group-hover:underline">
                SIGESP
              </div>
              <div className="text-[11px] text-slate-300 leading-snug">
                Sistema de Gerenciamento de Produtos
              </div>
            </div>
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Menu principal">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium rounded-md transition-colors cursor-pointer ${
                  active
                    ? 'bg-white text-[#0F294A]'
                    : 'text-slate-200 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2.5 whitespace-nowrap">
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{item.label}</span>
                </span>
                {item.count !== undefined && item.count > 0 && (
                  <span
                    className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                      active ? 'bg-slate-100 text-[#0F294A]' : 'bg-white/15 text-white'
                    }`}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10 text-xs text-slate-300 space-y-1">
          <div className="font-medium text-white">Prova de Conceito · OMG 360</div>
          <div className="text-slate-300/80">
            Dados fictícios locais (sem sincronização entre dispositivos) e sensores simulados.
          </div>
        </div>
      </aside>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/50"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-72 max-w-full bg-[#0F294A] text-white flex flex-col h-full z-10">
            <div className="px-4 py-3.5 border-b border-white/10 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  logout();
                }}
                title="Voltar à tela de acesso ao sistema (trocar usuário ou encerrar sessão)"
                aria-label="SIGESP — Voltar à tela de acesso ao sistema"
                className="min-w-0 flex-1 text-left p-1 rounded-md hover:bg-white/10 transition-colors cursor-pointer group"
              >
                <div className="font-display font-semibold text-base leading-tight group-hover:underline">
                  SIGESP
                </div>
                <div className="text-[11px] text-slate-300 leading-snug">
                  Sistema de Gerenciamento de Produtos
                </div>
              </button>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded hover:bg-white/10"
                aria-label="Fechar menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavClick(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium rounded-md ${
                      active ? 'bg-white text-[#0F294A]' : 'text-slate-200 hover:bg-white/10'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </span>
                    {item.count !== undefined && item.count > 0 && (
                      <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-white/15">
                        {item.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 sticky top-0 z-30">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden p-2 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50"
                aria-label="Abrir menu"
              >
                <Menu className="w-5 h-5" />
              </button>

              <button
                type="button"
                onClick={logout}
                title="Voltar à tela de acesso ao sistema (trocar usuário ou encerrar sessão)"
                aria-label="SIGESP — Voltar à tela de acesso ao sistema"
                className="lg:hidden px-2 py-1 rounded bg-[#0F294A] text-white font-display font-semibold text-xs hover:bg-[#163864] transition-colors shrink-0 cursor-pointer"
              >
                SIGESP
              </button>

              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="font-medium text-slate-900 truncate">
                    {currentUser?.name}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">{currentUser?.matricula}</span>
                  <span aria-hidden="true">·</span>
                  <span>{currentUser ? roleLabelBR(currentUser.role) : ''}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-slate-500">Filial ativa:</span>
                  {canSwitchBranch ? (
                    <select
                      aria-label="Selecionar filial ativa"
                      value={activeBranch?.id ?? ''}
                      onChange={(e) => switchActiveBranch(e.target.value)}
                      className="text-sm font-semibold text-[#0F294A] bg-slate-50 border border-slate-300 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-[#0F294A]"
                    >
                      {state.branches
                        .filter((b) => currentUser?.authorizedBranchIds.includes(b.id))
                        .map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name} ({b.code})
                          </option>
                        ))}
                    </select>
                  ) : (
                    <span className="text-sm font-semibold text-[#0F294A]">
                      {activeBranch?.name} ({activeBranch?.code})
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <button
                type="button"
                onClick={startDemo}
                className="px-3 py-1.5 text-xs font-medium bg-[#0F294A] hover:bg-[#163864] text-white rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Iniciar demonstração</span>
              </button>
              <button
                type="button"
                onClick={restoreDemo}
                className="px-3 py-1.5 text-xs font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Restaurar demonstração</span>
              </button>
              <button
                type="button"
                onClick={logout}
                className="px-3 py-1.5 text-xs font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Sair</span>
              </button>
            </div>
          </div>
        </header>

        {unacknowledgedCriticalAlerts.length > 0 && (() => {
          const topCritical = unacknowledgedCriticalAlerts[0];
          return (
            <div
              role="alert"
              className="bg-red-700 text-white border-b border-red-800 px-4 sm:px-6 py-2.5"
            >
              <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-start sm:items-center gap-2.5 min-w-0">
                  <AlertOctagon className="w-4 h-4 text-red-100 shrink-0 mt-0.5 sm:mt-0" aria-hidden="true" />
                  <div className="text-xs leading-snug min-w-0">
                    <span className="font-semibold uppercase tracking-wide">
                      Alerta crítico ({unacknowledgedCriticalAlerts.length})
                    </span>
                    <span className="mx-1.5" aria-hidden="true">·</span>
                    <span className="font-medium">{topCritical.title}</span>
                    <span className="mx-1.5 text-red-200" aria-hidden="true">·</span>
                    <span className="text-red-100">
                      {topCritical.branchName} · Responsável: {topCritical.currentResponsibleRole}
                      {topCritical.status === 'escalonado' ? ' (Escalonado)' : ''} ·{' '}
                      <span className="font-mono tabular-nums">{topCritical.openMinutes} min</span> ·{' '}
                      Aviso apenas em tela
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => acknowledgeAlert(topCritical.id)}
                    className="px-2.5 py-1 text-xs font-medium bg-white text-red-800 hover:bg-red-50 rounded transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Reconhecer
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('alertas')}
                    className="px-2.5 py-1 text-xs font-medium border border-red-300/70 text-white hover:bg-red-800 rounded transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Abrir alertas
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {state.isDemoBannerActive && (
          <div className="bg-slate-100 border-b border-slate-200 px-4 sm:px-6 py-3">
            <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <ClipboardList className="w-4 h-4 text-[#0F294A] mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <div className="text-xs font-semibold text-[#0F294A]">
                    Roteiro de 8 etapas (Imunoglobulina 5 g/100 mL · Alto custo refrigerado · Filial Bairro)
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 mt-1 text-xs text-slate-700">
                    <button
                      type="button"
                      onClick={() => setActiveTab('cofre')}
                      className="inline-flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      <CheckCircle2 className={`w-3.5 h-3.5 ${demoChecklist.step1 ? 'text-emerald-600' : 'text-slate-400'}`} />
                      <span>1. Abertura simulada do cofre</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFocusBranchId('branch-bairro');
                        setFocusMedicationId('med-img');
                        setActiveTab('movimentacoes');
                      }}
                      className="inline-flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      <CheckCircle2 className={`w-3.5 h-3.5 ${demoChecklist.step2 ? 'text-emerald-600' : 'text-slate-400'}`} />
                      <span>2. Retirada de 2 frascos</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFocusBranchId('branch-bairro');
                        setFocusMedicationId('med-img');
                        setActiveTab('reposicao');
                      }}
                      className="inline-flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      <CheckCircle2 className={`w-3.5 h-3.5 ${demoChecklist.step3 ? 'text-emerald-600' : 'text-slate-400'}`} />
                      <span>3. Recomendação recalculada</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('reposicao')}
                      className="inline-flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      <CheckCircle2 className={`w-3.5 h-3.5 ${demoChecklist.step4 ? 'text-emerald-600' : 'text-slate-400'}`} />
                      <span>4. Transferência (5 frascos)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('reposicao')}
                      className="inline-flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      <CheckCircle2 className={`w-3.5 h-3.5 ${demoChecklist.step5 ? 'text-emerald-600' : 'text-slate-400'}`} />
                      <span>5. Compra complementar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('reposicao')}
                      className="inline-flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      <CheckCircle2 className={`w-3.5 h-3.5 ${demoChecklist.step6 ? 'text-emerald-600' : 'text-slate-400'}`} />
                      <span>6. Recebimento parcial</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('cofre')}
                      className="inline-flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      <CheckCircle2 className={`w-3.5 h-3.5 ${demoChecklist.step7 ? 'text-emerald-600' : 'text-slate-400'}`} />
                      <span>7. Ocorrência térmica</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('historico')}
                      className="inline-flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      <span>8. Histórico completo</span>
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={dismissDemoBanner}
                className="text-xs text-slate-600 hover:text-slate-900 whitespace-nowrap self-start md:self-center cursor-pointer"
              >
                Ocultar roteiro
              </button>
            </div>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
};
