import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ACTING_PERSONAS, createInitialDemoState } from '../data/seedData';
import {
  AccessLog,
  ActingPersona,
  ActingPersonaId,
  AlertCategory,
  AlertResponsibleRole,
  Branch,
  CofreAppState,
  MovementType,
  OperationalAlert,
  PurchaseRequest,
  ReplenishmentRecommendation,
  StockMovement,
  SupplierOffer,
  TransferOrder,
  TransportCondition,
  UserAccount,
  VaultOpeningSession,
  VaultSensorStatus,
} from '../types/cofre';
import { computeOperationalAlerts } from '../utils/alertsEngine';
import { computeAllRecommendations, SimulationOverride } from '../utils/calculations';
import {
  actionAcknowledgeAlert,
  actionApprovePurchaseRequest,
  actionApproveTransferOrder,
  actionCancelPurchaseRemaining,
  actionCloseVaultDoor,
  actionConfirmSupplierPurchase,
  actionCreatePurchaseRequest,
  actionCreateTransferOrder,
  actionDispatchTransferOrder,
  actionEvaluateConservationIncident,
  actionOpenVaultDoor,
  actionReceivePurchasePartial,
  actionReceiveTransferOrder,
  actionRegisterMovement,
  actionRejectPurchaseRequest,
  actionRejectTransferOrder,
  actionRequestVaultOpen,
  actionReverseMovement,
  actionRevisePurchaseForecast,
  actionSetActingPersona,
  actionSimulateAlertsPlus10Min,
  actionSimulatePurchaseEscalation10Min,
  actionSimulateVaultSensorStatus,
  actionSimulateVaultTemperature,
  actionUpdateAlertRoleConfig,
  actionUpdateBranchMedPolicy,
  actionUpdateSupplierOffer,
  migrateAppState,
} from '../utils/cofreActions';
import { roleLabelBR, stripCpfDigits } from '../utils/formatters';

const STORAGE_STATE_KEY = 'cofre_omg360_poc_state_v1';
const STORAGE_SESSION_KEY = 'cofre_omg360_poc_session_v1';

export type NavTab =
  | 'painel'
  | 'cofre'
  | 'filiais'
  | 'impacto'
  | 'movimentacoes'
  | 'alertas'
  | 'reposicao'
  | 'historico'
  | 'configuracoes';

interface SessionState {
  userId: string | null;
  activeBranchId: string | null;
}

interface SimpleResult {
  ok: boolean;
  error?: string;
  id?: string;
}

interface CofreContextValue {
  state: CofreAppState;
  currentUser: UserAccount | null;
  activeBranch: Branch | null;
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  focusMedicationId: string | null;
  setFocusMedicationId: (medId: string | null) => void;
  focusBranchId: string | null;
  setFocusBranchId: (branchId: string | null) => void;
  simulation: SimulationOverride | null;
  setSimulation: (sim: SimulationOverride | null) => void;
  recommendations: ReplenishmentRecommendation[];

  // Auth
  verifyCredentialsStep1: (
    cpf: string,
    password: string
  ) => { ok: boolean; user?: UserAccount; error?: string };
  verifySecondFactorStep2: (userId: string, code: string) => { ok: boolean; error?: string };
  logout: () => void;
  switchActiveBranch: (branchId: string) => SimpleResult;

  // Movements
  registerMovement: (params: {
    branchId: string;
    medicationId: string;
    lotId?: string;
    newLotCode?: string;
    newLotExpiryDate?: string;
    type: MovementType;
    quantity: number;
    adjustmentDirection?: 'add' | 'remove';
    reason: string;
    vaultSessionId?: string;
  }) => SimpleResult & { movement?: StockMovement };
  reverseMovement: (movementId: string, reason: string) => SimpleResult;

  // Settings & Policies
  updateBranchAlertDays: (branchId: string, days: number) => SimpleResult;
  updateBranchMedPolicy: (params: {
    branchId: string;
    medicationId: string;
    safetyStock: number;
    coverageDays: number;
    justification: string;
    isManualPolicy?: boolean;
  }) => SimpleResult;
  updateSupplierOffer: (offerId: string, patch: Partial<SupplierOffer>) => SimpleResult;
  updateUserAccount: (userId: string, patch: Partial<UserAccount>) => SimpleResult;
  addUserAccount: (user: Omit<UserAccount, 'id'>) => SimpleResult;

  // Transfers
  createTransferOrder: (params: {
    medicationId: string;
    originBranchId: string;
    destinationBranchId: string;
    lotId: string;
    quantity: number;
    reason: string;
  }) => SimpleResult & { transfer?: TransferOrder };
  approveTransferOrder: (transferId: string) => SimpleResult;
  rejectTransferOrder: (transferId: string, note: string) => SimpleResult;
  dispatchTransferOrder: (transferId: string) => SimpleResult;
  receiveTransferOrder: (
    transferId: string,
    params?: {
      receivedQty?: number;
      transportCondition?: TransportCondition;
      divergenceNote?: string;
    }
  ) => SimpleResult;

  // Purchases
  createPurchaseRequest: (params: {
    branchId: string;
    medicationId: string;
    supplierOfferId: string;
    requestedQty: number;
    netNeedAtRequest: number;
    justification: string;
    isException?: boolean;
    exceptionRisks?: string[];
  }) => SimpleResult & { purchase?: PurchaseRequest };
  approvePurchaseRequest: (
    requestId: string,
    params?: { note?: string; allowException?: boolean; exceptionRisks?: string[] }
  ) => SimpleResult;
  confirmSupplierPurchase: (
    requestId: string,
    params?: { expectedArrivalDate?: string; note?: string }
  ) => SimpleResult;
  revisePurchaseForecast: (
    requestId: string,
    newExpectedDate: string,
    reason: string
  ) => SimpleResult;
  receivePurchasePartial: (
    requestId: string,
    params: {
      receivedQty: number;
      lotCode: string;
      expiryDate: string;
      operationToken?: string;
      note?: string;
    }
  ) => SimpleResult;
  cancelPurchaseRemaining: (requestId: string, justification: string) => SimpleResult;
  rejectPurchaseRequest: (requestId: string, justification: string) => SimpleResult;

  // Refrigerated Vault & Conservation
  requestVaultOpen: (vaultId: string, purpose: string) => SimpleResult;
  openVaultDoor: (vaultId: string, purpose: string) => SimpleResult & { session?: VaultOpeningSession };
  closeVaultDoor: (vaultId: string) => SimpleResult;
  simulateVaultSensorStatus: (vaultId: string, sensorStatus: VaultSensorStatus) => SimpleResult;
  simulateVaultTemperature: (
    vaultId: string,
    tempC: number,
    durationMinutes: number
  ) => SimpleResult & { incidentCode?: string };
  evaluateConservationIncident: (
    incidentId: string,
    decision: 'liberar' | 'descarte',
    justification: string
  ) => SimpleResult;

  // Demo controls
  startDemo: () => void;
  restoreDemo: () => void;
  dismissDemoBanner: () => void;

  // Acting persona & Operational Alerts
  actingPersona: ActingPersona;
  setActingPersona: (personaId: ActingPersonaId) => SimpleResult;
  operationalAlerts: OperationalAlert[];
  acknowledgeAlert: (alertId: string) => SimpleResult;
  simulateAlertsPlus10Min: (alertIds?: string[]) => SimpleResult;
  updateAlertRoleConfig: (category: AlertCategory, role: AlertResponsibleRole) => SimpleResult;
  simulatePurchaseEscalation10Min: (requestId: string) => SimpleResult;
}

const CofreContext = createContext<CofreContextValue | null>(null);

function loadPersistedState(): CofreAppState {
  try {
    const raw = localStorage.getItem(STORAGE_STATE_KEY);
    if (raw) {
      return migrateAppState(JSON.parse(raw), new Date());
    }
  } catch {
    // Fallback
  }
  return createInitialDemoState(new Date());
}

function loadPersistedSession(): SessionState {
  try {
    const raw = localStorage.getItem(STORAGE_SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SessionState;
      if (parsed && typeof parsed.userId === 'string') return parsed;
    }
  } catch {
    // Ignore
  }
  return { userId: null, activeBranchId: null };
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export const CofreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<CofreAppState>(loadPersistedState);
  const [session, setSession] = useState<SessionState>(loadPersistedSession);
  const [activeTab, setActiveTab] = useState<NavTab>('painel');
  const [focusMedicationId, setFocusMedicationId] = useState<string | null>('med-img');
  const [focusBranchId, setFocusBranchId] = useState<string | null>('branch-bairro');
  const [simulation, setSimulation] = useState<SimulationOverride | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_STATE_KEY, JSON.stringify(state));
    } catch {
      // Ignore
    }
  }, [state]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(session));
    } catch {
      // Ignore
    }
  }, [session]);

  const currentUser = useMemo(
    () => state.users.find((u) => u.id === session.userId && u.active) ?? null,
    [state.users, session.userId]
  );

  const activeBranch = useMemo(() => {
    if (!currentUser) return null;
    const match = state.branches.find(
      (b) => b.id === session.activeBranchId && currentUser.authorizedBranchIds.includes(b.id)
    );
    if (match) return match;
    return (
      state.branches.find((b) => currentUser.authorizedBranchIds.includes(b.id)) ??
      state.branches[0] ??
      null
    );
  }, [currentUser, session.activeBranchId, state.branches]);

  const recommendations = useMemo(
    () => computeAllRecommendations(state, new Date(), simulation),
    [state, simulation]
  );

  const actingPersona = useMemo(
    () => ACTING_PERSONAS.find((p) => p.id === state.actingPersonaId) ?? ACTING_PERSONAS[0],
    [state.actingPersonaId]
  );

  const operationalAlerts = useMemo(
    () => computeOperationalAlerts(state, recommendations, new Date()),
    [state, recommendations]
  );

  const appendAccessLog = (entry: Omit<AccessLog, 'id' | 'timestamp'>) => {
    const log: AccessLog = {
      id: uid('acc'),
      timestamp: new Date().toISOString(),
      ...entry,
    };
    setState((prev) => ({
      ...prev,
      accessLogs: [log, ...prev.accessLogs],
    }));
  };

  const verifyCredentialsStep1 = (cpfRaw: string, password: string) => {
    const cpfDigits = stripCpfDigits(cpfRaw);
    const user = state.users.find((u) => u.cpf === cpfDigits && u.active);
    if (!user || user.password !== password) {
      appendAccessLog({
        employeeName: user ? user.name : 'Usuário não identificado',
        employeeMatricula: user ? user.matricula : '—',
        roleLabel: user ? roleLabelBR(user.role) : 'Não autenticado',
        result: 'falha_credenciais',
        detail: 'Credenciais inválidas na 1ª etapa de autenticação',
      });
      return {
        ok: false,
        error:
          'CPF ou senha inválidos. Verifique os dados ou use uma conta de demonstração.',
      };
    }
    return { ok: true, user };
  };

  const verifySecondFactorStep2 = (userId: string, code: string) => {
    const user = state.users.find((u) => u.id === userId && u.active);
    if (!user) return { ok: false, error: 'Usuário não encontrado ou inativo.' };
    const cleanCode = code.replace(/\D/g, '');
    if (cleanCode.length !== 6 || cleanCode !== user.totpSeedLabel) {
      appendAccessLog({
        employeeName: user.name,
        employeeMatricula: user.matricula,
        roleLabel: roleLabelBR(user.role),
        result: 'falha_segundo_fator',
        detail: 'Código simulado de segundo fator inválido na 2ª etapa',
      });
      return {
        ok: false,
        error: `Código simulado incorreto. Para esta conta de demonstração, utilize ${user.totpSeedLabel}.`,
      };
    }

    const defaultBranchId = user.authorizedBranchIds.includes('branch-bairro')
      ? 'branch-bairro'
      : user.authorizedBranchIds[0] ?? state.branches[0]?.id ?? null;
    const branchObj = state.branches.find((b) => b.id === defaultBranchId);

    setSession({ userId: user.id, activeBranchId: defaultBranchId });
    appendAccessLog({
      employeeName: user.name,
      employeeMatricula: user.matricula,
      roleLabel: roleLabelBR(user.role),
      branchId: branchObj?.id,
      branchName: branchObj?.name,
      result: 'sucesso',
      detail: 'Autenticação em duas etapas (segundo fator simulado) concluída',
    });
    return { ok: true };
  };

  const logout = () => {
    if (currentUser) {
      appendAccessLog({
        employeeName: currentUser.name,
        employeeMatricula: currentUser.matricula,
        roleLabel: roleLabelBR(currentUser.role),
        branchId: activeBranch?.id,
        branchName: activeBranch?.name,
        result: 'logout',
        detail: 'Sessão encerrada pelo usuário',
      });
    }
    setSession({ userId: null, activeBranchId: null });
    setActiveTab('painel');
    setSimulation(null);
  };

  const switchActiveBranch = (branchId: string): SimpleResult => {
    if (!currentUser) return { ok: false, error: 'Sessão expirada.' };
    if (!currentUser.authorizedBranchIds.includes(branchId)) {
      return {
        ok: false,
        error: 'Seu perfil não possui autorização para acessar esta filial.',
      };
    }
    const branchObj = state.branches.find((b) => b.id === branchId);
    if (!branchObj) return { ok: false, error: 'Filial não encontrada.' };
    setSession((prev) => ({ ...prev, activeBranchId: branchId }));
    setFocusBranchId(branchId);
    appendAccessLog({
      employeeName: currentUser.name,
      employeeMatricula: currentUser.matricula,
      roleLabel: roleLabelBR(currentUser.role),
      branchId: branchObj.id,
      branchName: branchObj.name,
      result: 'sucesso',
      detail: `Troca de filial ativa para ${branchObj.name}`,
    });
    return { ok: true };
  };

  const registerMovement: CofreContextValue['registerMovement'] = (params) => {
    const res = actionRegisterMovement(state, currentUser, params, new Date());
    if (!res.ok) return { ok: false, error: res.error };
    setState(res.state);
    setFocusMedicationId(params.medicationId);
    setFocusBranchId(params.branchId);
    return { ok: true, id: res.data?.movement.id, movement: res.data?.movement };
  };

  const reverseMovement = (movementId: string, reason: string): SimpleResult => {
    const res = actionReverseMovement(state, currentUser, movementId, reason, new Date());
    if (!res.ok) return { ok: false, error: res.error };
    setState(res.state);
    return { ok: true };
  };

  const updateBranchAlertDays = (branchId: string, days: number): SimpleResult => {
    if (!currentUser) return { ok: false, error: 'Usuário não autenticado.' };
    if (currentUser.role === 'funcionario') {
      return {
        ok: false,
        error: 'Apenas Gestor ou Administrador podem alterar prazos de alerta.',
      };
    }
    if (!Number.isFinite(days) || days < 0 || days > 3650) {
      return { ok: false, error: 'Informe um prazo válido entre 0 e 3650 dias.' };
    }
    const prevBranch = state.branches.find((b) => b.id === branchId);
    const rounded = Math.round(days);
    setState((prev) => ({
      ...prev,
      branches: prev.branches.map((b) =>
        b.id === branchId ? { ...b, alertDaysBeforeExpiry: rounded } : b
      ),
      generalAuditLogs: [
        {
          id: uid('aud'),
          timestamp: new Date().toISOString(),
          category: 'filial',
          action: `Alteração do prazo de alerta de validade em ${prevBranch?.name ?? branchId}`,
          employeeName: currentUser.name,
          employeeMatricula: currentUser.matricula,
          previousValue: `${prevBranch?.alertDaysBeforeExpiry ?? 30} dias`,
          newValue: `${rounded} dias`,
        },
        ...prev.generalAuditLogs,
      ],
    }));
    return { ok: true };
  };

  const updateBranchMedPolicy: CofreContextValue['updateBranchMedPolicy'] = (params) => {
    const res = actionUpdateBranchMedPolicy(state, currentUser, params, new Date());
    if (!res.ok) return { ok: false, error: res.error };
    setState(res.state);
    return { ok: true };
  };

  const updateSupplierOffer = (
    offerId: string,
    patch: Partial<SupplierOffer>
  ): SimpleResult => {
    const res = actionUpdateSupplierOffer(state, currentUser, offerId, patch, new Date());
    if (!res.ok) return { ok: false, error: res.error };
    setState(res.state);
    return { ok: true };
  };

  const updateUserAccount = (userId: string, patch: Partial<UserAccount>): SimpleResult => {
    if (!currentUser || currentUser.role !== 'administrador') {
      return {
        ok: false,
        error: 'Apenas o perfil Administrador pode gerenciar usuários e permissões.',
      };
    }
    const prevUser = state.users.find((u) => u.id === userId);
    setState((prev) => ({
      ...prev,
      users: prev.users.map((u) => (u.id === userId ? { ...u, ...patch } : u)),
      generalAuditLogs: [
        {
          id: uid('aud'),
          timestamp: new Date().toISOString(),
          category: 'usuario',
          action: `Alteração de permissões/cadastro de ${prevUser?.name ?? userId}`,
          employeeName: currentUser.name,
          employeeMatricula: currentUser.matricula,
          previousValue: prevUser
            ? `${roleLabelBR(prevUser.role)} · ${prevUser.authorizedBranchIds.length} filiais`
            : undefined,
          newValue: `${roleLabelBR(patch.role ?? prevUser?.role ?? 'funcionario')} · ${
            (patch.authorizedBranchIds ?? prevUser?.authorizedBranchIds ?? []).length
          } filiais`,
        },
        ...prev.generalAuditLogs,
      ],
    }));
    return { ok: true };
  };

  const addUserAccount = (newUser: Omit<UserAccount, 'id'>): SimpleResult => {
    if (!currentUser || currentUser.role !== 'administrador') {
      return {
        ok: false,
        error: 'Apenas o perfil Administrador pode cadastrar usuários.',
      };
    }
    const cpfClean = stripCpfDigits(newUser.cpf);
    if (cpfClean.length !== 11) {
      return { ok: false, error: 'Informe um CPF fictício válido com 11 dígitos.' };
    }
    if (state.users.some((u) => u.cpf === cpfClean)) {
      return { ok: false, error: 'Já existe um usuário cadastrado com este CPF.' };
    }
    const created: UserAccount = { ...newUser, id: uid('usr'), cpf: cpfClean };
    setState((prev) => ({
      ...prev,
      users: [...prev.users, created],
      generalAuditLogs: [
        {
          id: uid('aud'),
          timestamp: new Date().toISOString(),
          category: 'usuario',
          action: `Cadastro de novo colaborador (${created.name} · ${created.matricula})`,
          employeeName: currentUser.name,
          employeeMatricula: currentUser.matricula,
          newValue: roleLabelBR(created.role),
        },
        ...prev.generalAuditLogs,
      ],
    }));
    return { ok: true, id: created.id };
  };

  const createTransferOrder: CofreContextValue['createTransferOrder'] = (params) => {
    const res = actionCreateTransferOrder(state, currentUser, params, new Date());
    if (!res.ok) return { ok: false, error: res.error };
    setState(res.state);
    return { ok: true, id: res.data?.transfer.id, transfer: res.data?.transfer };
  };

  const approveTransferOrder = (transferId: string): SimpleResult => {
    const res = actionApproveTransferOrder(state, currentUser, transferId, new Date());
    if (!res.ok) return { ok: false, error: res.error };
    setState(res.state);
    return { ok: true };
  };

  const rejectTransferOrder = (transferId: string, note: string): SimpleResult => {
    const res = actionRejectTransferOrder(state, currentUser, transferId, note, new Date());
    if (!res.ok) return { ok: false, error: res.error };
    setState(res.state);
    return { ok: true };
  };

  const dispatchTransferOrder = (transferId: string): SimpleResult => {
    const res = actionDispatchTransferOrder(state, currentUser, transferId, new Date());
    if (!res.ok) return { ok: false, error: res.error };
    setState(res.state);
    return { ok: true };
  };

  const receiveTransferOrder: CofreContextValue['receiveTransferOrder'] = (
    transferId,
    params
  ) => {
    const res = actionReceiveTransferOrder(state, currentUser, transferId, params, new Date());
    if (!res.ok) return { ok: false, error: res.error };
    setState(res.state);
    return { ok: true };
  };

  const createPurchaseRequest: CofreContextValue['createPurchaseRequest'] = (params) => {
    const res = actionCreatePurchaseRequest(state, currentUser, params, new Date());
    if (!res.ok) return { ok: false, error: res.error };
    setState(res.state);
    return { ok: true, id: res.data?.purchase.id, purchase: res.data?.purchase };
  };

  const approvePurchaseRequest: CofreContextValue['approvePurchaseRequest'] = (
    requestId,
    params
  ) => {
    const res = actionApprovePurchaseRequest(state, currentUser, requestId, params, new Date());
    if (!res.ok) return { ok: false, error: res.error };
    setState(res.state);
    return { ok: true };
  };

  const confirmSupplierPurchase: CofreContextValue['confirmSupplierPurchase'] = (
    requestId,
    params
  ) => {
    const res = actionConfirmSupplierPurchase(state, currentUser, requestId, params, new Date());
    if (!res.ok) return { ok: false, error: res.error };
    setState(res.state);
    return { ok: true };
  };

  const revisePurchaseForecast = (
    requestId: string,
    newExpectedDate: string,
    reason: string
  ): SimpleResult => {
    const res = actionRevisePurchaseForecast(
      state,
      currentUser,
      requestId,
      newExpectedDate,
      reason,
      new Date()
    );
    if (!res.ok) return { ok: false, error: res.error };
    setState(res.state);
    return { ok: true };
  };

  const receivePurchasePartial: CofreContextValue['receivePurchasePartial'] = (
    requestId,
    params
  ) => {
    const res = actionReceivePurchasePartial(state, currentUser, requestId, params, new Date());
    if (!res.ok) return { ok: false, error: res.error };
    setState(res.state);
    return { ok: true };
  };

  const cancelPurchaseRemaining = (
    requestId: string,
    justification: string
  ): SimpleResult => {
    const res = actionCancelPurchaseRemaining(
      state,
      currentUser,
      requestId,
      justification,
      new Date()
    );
    if (!res.ok) return { ok: false, error: res.error };
    setState(res.state);
    return { ok: true };
  };

  const rejectPurchaseRequest = (
    requestId: string,
    justification: string
  ): SimpleResult => {
    const res = actionRejectPurchaseRequest(
      state,
      currentUser,
      requestId,
      justification,
      new Date()
    );
    if (!res.ok) return { ok: false, error: res.error };
    setState(res.state);
    return { ok: true };
  };

  const requestVaultOpen = (vaultId: string, purpose: string): SimpleResult => {
    const res = actionRequestVaultOpen(state, currentUser, vaultId, purpose, new Date());
    if (!res.ok) return { ok: false, error: res.error };
    setState(res.state);
    return { ok: true };
  };

  const openVaultDoor: CofreContextValue['openVaultDoor'] = (vaultId, purpose) => {
    const res = actionOpenVaultDoor(state, currentUser, vaultId, purpose, new Date());
    if (!res.ok) return { ok: false, error: res.error };
    setState(res.state);
    return { ok: true, id: res.data?.session.id, session: res.data?.session };
  };

  const closeVaultDoor = (vaultId: string): SimpleResult => {
    const res = actionCloseVaultDoor(state, currentUser, vaultId, new Date());
    if (!res.ok) return { ok: false, error: res.error };
    setState(res.state);
    return { ok: true };
  };

  const simulateVaultSensorStatus = (
    vaultId: string,
    sensorStatus: VaultSensorStatus
  ): SimpleResult => {
    const res = actionSimulateVaultSensorStatus(
      state,
      currentUser,
      vaultId,
      sensorStatus,
      new Date()
    );
    if (!res.ok) return { ok: false, error: res.error };
    setState(res.state);
    return { ok: true };
  };

  const simulateVaultTemperature = (
    vaultId: string,
    tempC: number,
    durationMinutes: number
  ): SimpleResult & { incidentCode?: string } => {
    const res = actionSimulateVaultTemperature(
      state,
      currentUser,
      vaultId,
      tempC,
      durationMinutes,
      new Date()
    );
    if (!res.ok) return { ok: false, error: res.error };
    setState(res.state);
    return { ok: true, incidentCode: res.data?.incident?.code };
  };

  const evaluateConservationIncident = (
    incidentId: string,
    decision: 'liberar' | 'descarte',
    justification: string
  ): SimpleResult => {
    const res = actionEvaluateConservationIncident(
      state,
      currentUser,
      incidentId,
      decision,
      justification,
      new Date()
    );
    if (!res.ok) return { ok: false, error: res.error };
    setState(res.state);
    return { ok: true };
  };

  const startDemo = () => {
    const fresh = createInitialDemoState(new Date());
    fresh.isDemoBannerActive = true;
    setState(fresh);
    setSimulation(null);
    setFocusMedicationId('med-img');
    setFocusBranchId('branch-bairro');
    if (currentUser?.authorizedBranchIds.includes('branch-bairro')) {
      setSession((prev) => ({ ...prev, activeBranchId: 'branch-bairro' }));
    }
    setActiveTab('cofre');
  };

  const restoreDemo = () => {
    const fresh = createInitialDemoState(new Date());
    fresh.isDemoBannerActive = true;
    setState(fresh);
    setSimulation(null);
    setFocusMedicationId('med-img');
    setFocusBranchId('branch-bairro');
    if (currentUser?.authorizedBranchIds.includes('branch-bairro')) {
      setSession((prev) => ({ ...prev, activeBranchId: 'branch-bairro' }));
    }
  };

  const dismissDemoBanner = () => {
    setState((prev) => ({ ...prev, isDemoBannerActive: false }));
  };

  const setActingPersona = (personaId: ActingPersonaId): SimpleResult => {
    const res = actionSetActingPersona(state, currentUser, personaId);
    if (!res.ok) return { ok: false, error: res.error };
    setState(res.state);
    return { ok: true };
  };

  const acknowledgeAlert = (alertId: string): SimpleResult => {
    const res = actionAcknowledgeAlert(state, currentUser, alertId, new Date());
    if (!res.ok) return { ok: false, error: res.error };
    setState(res.state);
    return { ok: true };
  };

  const simulateAlertsPlus10Min = (alertIds?: string[]): SimpleResult => {
    const targets =
      alertIds && alertIds.length > 0
        ? alertIds
        : operationalAlerts.filter((a) => !a.acknowledged).map((a) => a.id);
    const res = actionSimulateAlertsPlus10Min(state, currentUser, targets, new Date());
    if (!res.ok) return { ok: false, error: res.error };
    setState(res.state);
    return { ok: true };
  };

  const updateAlertRoleConfig = (
    category: AlertCategory,
    role: AlertResponsibleRole
  ): SimpleResult => {
    const res = actionUpdateAlertRoleConfig(state, currentUser, category, role, new Date());
    if (!res.ok) return { ok: false, error: res.error };
    setState(res.state);
    return { ok: true };
  };

  const simulatePurchaseEscalation10Min = (requestId: string): SimpleResult => {
    const res = actionSimulatePurchaseEscalation10Min(state, currentUser, requestId, new Date());
    if (!res.ok) return { ok: false, error: res.error };
    setState(res.state);
    return { ok: true };
  };

  const value: CofreContextValue = {
    state,
    currentUser,
    activeBranch,
    activeTab,
    setActiveTab,
    focusMedicationId,
    setFocusMedicationId,
    focusBranchId,
    setFocusBranchId,
    simulation,
    setSimulation,
    recommendations,
    verifyCredentialsStep1,
    verifySecondFactorStep2,
    logout,
    switchActiveBranch,
    registerMovement,
    reverseMovement,
    updateBranchAlertDays,
    updateBranchMedPolicy,
    updateSupplierOffer,
    updateUserAccount,
    addUserAccount,
    createTransferOrder,
    approveTransferOrder,
    rejectTransferOrder,
    dispatchTransferOrder,
    receiveTransferOrder,
    createPurchaseRequest,
    approvePurchaseRequest,
    confirmSupplierPurchase,
    revisePurchaseForecast,
    receivePurchasePartial,
    cancelPurchaseRemaining,
    rejectPurchaseRequest,
    requestVaultOpen,
    openVaultDoor,
    closeVaultDoor,
    simulateVaultSensorStatus,
    simulateVaultTemperature,
    evaluateConservationIncident,
    startDemo,
    restoreDemo,
    dismissDemoBanner,
    actingPersona,
    setActingPersona,
    operationalAlerts,
    acknowledgeAlert,
    simulateAlertsPlus10Min,
    updateAlertRoleConfig,
    simulatePurchaseEscalation10Min,
  };

  return <CofreContext.Provider value={value}>{children}</CofreContext.Provider>;
};

export function useCofre(): CofreContextValue {
  const ctx = useContext(CofreContext);
  if (!ctx) throw new Error('useCofre deve ser usado dentro de CofreProvider');
  return ctx;
}
