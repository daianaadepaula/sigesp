import {
  ACTING_PERSONAS,
  CURRENT_SCHEMA_VERSION,
  DEFAULT_ALERT_ROLE_CONFIG,
  PURCHASE_APPROVAL_THRESHOLD,
  createInitialDemoState,
} from '../data/seedData';
import { defaultVaultGateway } from '../services/vaultGateway';
import {
  ActingPersona,
  ActingPersonaId,
  AlertCategory,
  AlertResponsibleRole,
  CofreAppState,
  ConservationIncident,
  GeneralAuditLog,
  MovementType,
  PurchaseReceiptRecord,
  PurchaseRequest,
  StockLot,
  StockMovement,
  SupplierOffer,
  TransferOrder,
  TransportCondition,
  UserAccount,
  VaultOpeningSession,
  VaultSensorStatus,
} from '../types/cofre';
import {
  calculateBranchMedicationMetrics,
  evaluateSupplierOffers,
  getDistanceBetweenBranches,
  getLotAvailableQty,
  isLotExpired,
  isLotUsable,
} from './calculations';
import { addDaysISO, formatCurrencyBR, formatDateBR } from './formatters';

export interface ActionResult<T = unknown> {
  ok: boolean;
  error?: string;
  state: CofreAppState;
  data?: T;
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function appendAudit(
  logs: GeneralAuditLog[],
  entry: Omit<GeneralAuditLog, 'id' | 'timestamp'>,
  now: Date
): GeneralAuditLog[] {
  return [
    {
      id: uid('aud'),
      timestamp: now.toISOString(),
      ...entry,
    },
    ...logs,
  ];
}

function fail<T = unknown>(state: CofreAppState, error: string): ActionResult<T> {
  return { ok: false, error, state };
}

function validateUserActive(user: UserAccount | null): string | null {
  if (!user) return 'Usuário não autenticado.';
  if (!user.active) return 'Conta de usuário inativa.';
  return null;
}

function validateBranchAuth(user: UserAccount, branchId: string): string | null {
  if (!user.authorizedBranchIds.includes(branchId)) {
    return `Usuário ${user.name} (${user.matricula}) não possui autorização para operar na filial selecionada.`;
  }
  return null;
}

function validateManagerRole(user: UserAccount): string | null {
  if (user.role !== 'gestor' && user.role !== 'administrador') {
    return 'Ação permitida apenas para perfis Gestor ou Administrador.';
  }
  return null;
}

export function migrateAppState(raw: unknown, now = new Date()): CofreAppState {
  const fresh = createInitialDemoState(now);
  if (!raw || typeof raw !== 'object') return fresh;
  const obj = raw as Partial<CofreAppState>;
  if (!Array.isArray(obj.branches) || !Array.isArray(obj.medications) || !Array.isArray(obj.lots)) {
    return fresh;
  }

  // Migrate medications with unitCostReference & isRefrigerated
  const medications = obj.medications.map((m) => {
    const seedMatch = fresh.medications.find((sm) => sm.id === m.id);
    return {
      ...m,
      unitCostReference: m.unitCostReference ?? seedMatch?.unitCostReference ?? 20,
      isRefrigerated: m.isRefrigerated ?? seedMatch?.isRefrigerated ?? false,
    };
  });
  // Ensure new refrigerated medication exists if migrating from v1
  for (const sm of fresh.medications) {
    if (!medications.some((m) => m.id === sm.id)) {
      medications.push(sm);
    }
  }

  const branches = obj.branches.map((b) => {
    const seedB = fresh.branches.find((sb) => sb.id === b.id);
    return {
      ...b,
      distances: b.distances.map((d) => {
        const seedD = seedB?.distances.find((sd) => sd.toBranchId === d.toBranchId);
        return {
          ...d,
          estimatedTransferCost:
            d.estimatedTransferCost !== undefined
              ? d.estimatedTransferCost
              : seedD?.estimatedTransferCost ?? null,
        };
      }),
    };
  });

  const lots = [...obj.lots];
  for (const sl of fresh.lots) {
    if (!lots.some((l) => l.id === sl.id)) lots.push(sl);
  }

  const policies = [...(obj.policies ?? [])];
  for (const sp of fresh.policies) {
    if (!policies.some((p) => p.branchId === sp.branchId && p.medicationId === sp.medicationId)) {
      policies.push(sp);
    }
  }

  const supplierOffers = [...(obj.supplierOffers ?? [])];
  for (const so of fresh.supplierOffers) {
    if (!supplierOffers.some((o) => o.id === so.id)) supplierOffers.push(so);
  }

  const transfers: TransferOrder[] = (obj.transfers ?? []).map((t) => ({
    ...t,
    expectedArrivalDate: t.expectedArrivalDate ?? addDaysISO(now, t.transitDays ?? 0),
    forecastHistory: t.forecastHistory ?? [],
  }));

  const purchaseRequests: PurchaseRequest[] = (obj.purchaseRequests ?? []).map((pr) => {
    const receivedTotal =
      pr.receivedQtyTotal ?? (pr.status === 'recebida' ? pr.requestedQty : 0);
    return {
      ...pr,
      receivedQtyTotal: receivedTotal,
      pendingQty: pr.pendingQty ?? Math.max(0, pr.requestedQty - receivedTotal),
      expectedArrivalDate: pr.expectedArrivalDate ?? addDaysISO(now, pr.leadTimeDays ?? 2),
      supplierConfirmed: pr.supplierConfirmed ?? false,
      forecastHistory: pr.forecastHistory ?? [],
      receipts: pr.receipts ?? [],
    };
  });

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    isDemoBannerActive: Boolean(obj.isDemoBannerActive),
    demoStepCompleted: obj.demoStepCompleted ?? 0,
    actingPersonaId: obj.actingPersonaId ?? fresh.actingPersonaId,
    alertRoleConfig: {
      ...DEFAULT_ALERT_ROLE_CONFIG,
      ...(obj.alertRoleConfig ?? {}),
    },
    alertRuntimeState: obj.alertRuntimeState ?? {},
    users: obj.users ?? fresh.users,
    branches,
    medications,
    lots,
    policies,
    movements: obj.movements ?? fresh.movements,
    accessLogs: obj.accessLogs ?? fresh.accessLogs,
    transfers,
    supplierOffers,
    purchaseRequests,
    safetyChangeLogs: obj.safetyChangeLogs ?? [],
    generalAuditLogs: obj.generalAuditLogs ?? [],
    vaults: obj.vaults && obj.vaults.length > 0 ? obj.vaults : fresh.vaults,
    vaultSessions: obj.vaultSessions ?? [],
    vaultReadings:
      obj.vaultReadings && obj.vaultReadings.length > 0 ? obj.vaultReadings : fresh.vaultReadings,
    conservationIncidents: obj.conservationIncidents ?? [],
  };
}

// 1. REGISTER MOVEMENT (with refrigerated vault session linking & FEFO/block guards)
export function actionRegisterMovement(
  state: CofreAppState,
  actor: UserAccount | null,
  params: {
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
  },
  now = new Date()
): ActionResult<{ movement: StockMovement }> {
  const authErr = validateUserActive(actor) ?? validateBranchAuth(actor!, params.branchId);
  if (authErr) return fail(state, authErr);

  if (!Number.isInteger(params.quantity) || params.quantity <= 0) {
    return fail(state, 'Informe uma quantidade inteira positiva maior que zero.');
  }
  if (!params.reason.trim()) {
    return fail(state, 'Informe o motivo da movimentação para registro no histórico.');
  }

  const med = state.medications.find((m) => m.id === params.medicationId);
  if (!med) return fail(state, 'Medicamento não encontrado.');

  const isInbound =
    params.type === 'entrada' ||
    params.type === 'recebimento' ||
    (params.type === 'ajuste' && params.adjustmentDirection === 'add');

  let targetLot: StockLot | undefined = params.lotId
    ? state.lots.find(
        (l) =>
          l.id === params.lotId &&
          l.branchId === params.branchId &&
          l.medicationId === params.medicationId
      )
    : undefined;

  if (!targetLot && params.type === 'entrada' && params.newLotCode?.trim() && params.newLotExpiryDate) {
    const existingByCode = state.lots.find(
      (l) =>
        l.branchId === params.branchId &&
        l.medicationId === params.medicationId &&
        l.lotCode.toLowerCase() === params.newLotCode!.trim().toLowerCase()
    );
    targetLot = existingByCode ?? {
      id: uid('lot'),
      branchId: params.branchId,
      medicationId: params.medicationId,
      lotCode: params.newLotCode.trim().toUpperCase(),
      expiryDate: params.newLotExpiryDate,
      physicalQty: 0,
      reservedQty: 0,
      status: 'utilizavel',
    };
  }

  if (!targetLot) {
    return fail(state, 'Selecione um lote válido ou informe código e validade do novo lote.');
  }

  if (params.type === 'saida_consumo' || params.type === 'expedicao') {
    if (targetLot.status === 'bloqueado') {
      return fail(
        state,
        `Operação bloqueada: o lote ${targetLot.lotCode} está bloqueado (${targetLot.blockedReason ?? 'restrição'}).`
      );
    }
    if (isLotExpired(targetLot, now)) {
      return fail(
        state,
        `Operação bloqueada: o lote ${targetLot.lotCode} está vencido e não pode sair para uso.`
      );
    }
  }

  const avail = Math.max(0, targetLot.physicalQty - targetLot.reservedQty);
  if (!isInbound && params.quantity > avail) {
    return fail(
      state,
      `Quantidade (${params.quantity}) superior ao saldo disponível (${avail}) no lote ${targetLot.lotCode}.`
    );
  }

  // Check refrigerated vault session linkage
  const vault = state.vaults.find((v) => v.branchId === params.branchId);
  let linkedSessionId = params.vaultSessionId;
  if (!linkedSessionId && vault?.activeSessionId) {
    const activeSes = state.vaultSessions.find((s) => s.id === vault.activeSessionId);
    if (activeSes && !activeSes.doorClosedAt) {
      linkedSessionId = activeSes.id;
    }
  }

  const missingVaultSessionWarning =
    med.isRefrigerated && Boolean(vault?.requireSessionForColdChain) && !linkedSessionId;

  const previousBalance = state.lots
    .filter((l) => l.branchId === params.branchId && l.medicationId === params.medicationId)
    .reduce((sum, l) => sum + l.physicalQty, 0);

  const delta = isInbound ? params.quantity : -params.quantity;
  const movement: StockMovement = {
    id: uid('mov'),
    timestamp: now.toISOString(),
    employeeId: actor!.id,
    employeeName: actor!.name,
    employeeMatricula: actor!.matricula,
    branchId: params.branchId,
    medicationId: params.medicationId,
    lotId: targetLot.id,
    lotCode: targetLot.lotCode,
    type: params.type,
    quantityDelta: delta,
    quantityAbs: params.quantity,
    previousBalance,
    newBalance: previousBalance + delta,
    reason: params.reason.trim(),
    vaultSessionId: linkedSessionId,
    missingVaultSessionWarning,
  };

  const lotExists = state.lots.some((l) => l.id === targetLot!.id);
  const updatedLots = lotExists
    ? state.lots.map((l) =>
        l.id === targetLot!.id ? { ...l, physicalQty: l.physicalQty + delta } : l
      )
    : [...state.lots, { ...targetLot, physicalQty: delta }];

  const updatedSessions = linkedSessionId
    ? state.vaultSessions.map((s) =>
        s.id === linkedSessionId
          ? {
              ...s,
              linkedMovementIds: [...s.linkedMovementIds, movement.id],
              closedWithoutMovement: false,
            }
          : s
      )
    : state.vaultSessions;

  return {
    ok: true,
    data: { movement },
    state: {
      ...state,
      lots: updatedLots,
      movements: [movement, ...state.movements],
      vaultSessions: updatedSessions,
    },
  };
}

// 2. REVERSE MOVEMENT (Preserves linked Transfer / Purchase Request document coherence!)
export function actionReverseMovement(
  state: CofreAppState,
  actor: UserAccount | null,
  movementId: string,
  reason: string,
  now = new Date()
): ActionResult {
  const authErr = validateUserActive(actor);
  if (authErr) return fail(state, authErr);
  if (!reason.trim()) return fail(state, 'Informe a justificativa obrigatória para o estorno.');

  const orig = state.movements.find((m) => m.id === movementId);
  if (!orig) return fail(state, 'Movimentação original não encontrada.');

  const branchErr = validateBranchAuth(actor!, orig.branchId);
  if (branchErr) return fail(state, branchErr);

  if (orig.type === 'estorno') {
    return fail(state, 'Não é possível estornar um lançamento que já é um estorno.');
  }
  if (state.movements.some((m) => m.reversedMovementId === orig.id)) {
    return fail(state, 'Este lançamento já possui um estorno vinculado.');
  }

  const lot = state.lots.find((l) => l.id === orig.lotId);
  if (!lot) return fail(state, 'Lote vinculado não encontrado.');

  const reversalDelta = -orig.quantityDelta;
  let updatedTransfers = state.transfers;
  let updatedPurchases = state.purchaseRequests;
  let updatedLots = state.lots;

  // Linked Transfer Consistency
  if (orig.transferGroupId) {
    const trf = state.transfers.find((t) => t.code === orig.transferGroupId);
    if (trf) {
      if (orig.type === 'expedicao') {
        if (trf.status === 'recebida') {
          return fail(
            state,
            `Estorno bloqueado: a transferência ${trf.code} já foi recebida no destino. Estorne primeiro o recebimento no destino para manter coerência.`
          );
        }
        // Revert transfer back to aprovada_reservada and restore physical + reserved on origin
        updatedLots = updatedLots.map((l) =>
          l.id === orig.lotId
            ? {
                ...l,
                physicalQty: l.physicalQty + orig.quantityAbs,
                reservedQty: l.reservedQty + orig.quantityAbs,
              }
            : l
        );
        updatedTransfers = updatedTransfers.map((t) =>
          t.id === trf.id
            ? { ...t, status: 'aprovada_reservada', dispatchedBy: undefined }
            : t
        );
      } else if (orig.type === 'recebimento') {
        const destAvail = Math.max(0, lot.physicalQty - lot.reservedQty);
        if (destAvail < orig.quantityAbs) {
          return fail(
            state,
            `Não é possível estornar o recebimento da ${trf.code} porque parte das unidades já foi consumida ou reservada no destino.`
          );
        }
        updatedLots = updatedLots.map((l) =>
          l.id === orig.lotId ? { ...l, physicalQty: l.physicalQty - orig.quantityAbs } : l
        );
        updatedTransfers = updatedTransfers.map((t) =>
          t.id === trf.id
            ? { ...t, status: 'expedida', receivedBy: undefined, receivedQty: undefined }
            : t
        );
      }
    }
  } else if (orig.purchaseRequestId) {
    // Linked Purchase Receipt Consistency
    const pr = state.purchaseRequests.find((p) => p.id === orig.purchaseRequestId);
    if (pr) {
      const destAvail = Math.max(0, lot.physicalQty - lot.reservedQty);
      if (destAvail < orig.quantityAbs) {
        return fail(
          state,
          `Não é possível estornar o recebimento da compra ${pr.code} porque parte das unidades já foi consumida ou reservada.`
        );
      }
      updatedLots = updatedLots.map((l) =>
        l.id === orig.lotId ? { ...l, physicalQty: l.physicalQty - orig.quantityAbs } : l
      );
      const newReceivedTotal = Math.max(0, pr.receivedQtyTotal - orig.quantityAbs);
      const newPending = Math.max(0, pr.requestedQty - newReceivedTotal);
      updatedPurchases = updatedPurchases.map((p) =>
        p.id === pr.id
          ? {
              ...p,
              receivedQtyTotal: newReceivedTotal,
              pendingQty: newPending,
              status: newReceivedTotal > 0 ? 'parcialmente_recebida' : 'aprovada',
            }
          : p
      );
    }
  } else {
    // Standard non-document movement reversal
    if (lot.physicalQty + reversalDelta < lot.reservedQty) {
      return fail(
        state,
        'Não é possível estornar esta entrada porque as unidades já estão reservadas ou foram consumidas.'
      );
    }
    updatedLots = updatedLots.map((l) =>
      l.id === orig.lotId ? { ...l, physicalQty: l.physicalQty + reversalDelta } : l
    );
  }

  const previousBalance = state.lots
    .filter((l) => l.branchId === orig.branchId && l.medicationId === orig.medicationId)
    .reduce((sum, l) => sum + l.physicalQty, 0);

  const reversal: StockMovement = {
    id: uid('mov'),
    timestamp: now.toISOString(),
    employeeId: actor!.id,
    employeeName: actor!.name,
    employeeMatricula: actor!.matricula,
    branchId: orig.branchId,
    medicationId: orig.medicationId,
    lotId: orig.lotId,
    lotCode: orig.lotCode,
    type: 'estorno',
    quantityDelta: reversalDelta,
    quantityAbs: orig.quantityAbs,
    previousBalance,
    newBalance: previousBalance + reversalDelta,
    reason: `Estorno vinculado: ${reason.trim()}`,
    reversedMovementId: orig.id,
    transferGroupId: orig.transferGroupId,
    purchaseRequestId: orig.purchaseRequestId,
  };

  return {
    ok: true,
    state: {
      ...state,
      lots: updatedLots,
      transfers: updatedTransfers,
      purchaseRequests: updatedPurchases,
      movements: [reversal, ...state.movements],
    },
  };
}

// 3. TRANSFERS WITH PER-STAGE REVALIDATION & DIVERGENCE / BLOCKING
export function actionCreateTransferOrder(
  state: CofreAppState,
  actor: UserAccount | null,
  params: {
    medicationId: string;
    originBranchId: string;
    destinationBranchId: string;
    lotId: string;
    quantity: number;
    reason: string;
  },
  now = new Date()
): ActionResult<{ transfer: TransferOrder }> {
  const err = validateUserActive(actor) ?? validateManagerRole(actor!);
  if (err) return fail(state, err);

  if (params.originBranchId === params.destinationBranchId) {
    return fail(state, 'Filial de origem e destino não podem ser iguais.');
  }
  if (!Number.isInteger(params.quantity) || params.quantity <= 0) {
    return fail(state, 'A quantidade da transferência deve ser um número inteiro positivo.');
  }
  const lot = state.lots.find(
    (l) =>
      l.id === params.lotId &&
      l.branchId === params.originBranchId &&
      l.medicationId === params.medicationId
  );
  if (!lot) return fail(state, 'Lote de origem não encontrado.');
  if (!isLotUsable(lot, now)) {
    return fail(state, `Lote ${lot.lotCode} está vencido ou bloqueado e não pode ser transferido.`);
  }
  const avail = getLotAvailableQty(lot, now);
  if (params.quantity > avail) {
    return fail(state, `Quantidade (${params.quantity}) indisponível no lote ${lot.lotCode} (${avail}).`);
  }

  const originMetrics = calculateBranchMedicationMetrics(
    state,
    params.originBranchId,
    params.medicationId,
    now
  );
  if (originMetrics.availableUsableQty - params.quantity < originMetrics.targetStock) {
    return fail(
      state,
      `A origem precisa preservar seu estoque-alvo (${originMetrics.targetStock}). Disponível após envio seria ${
        originMetrics.availableUsableQty - params.quantity
      }.`
    );
  }

  const dist = getDistanceBetweenBranches(
    state.branches,
    params.originBranchId,
    params.destinationBranchId
  );
  if (!dist) return fail(state, 'Distância entre as filiais não cadastrada.');

  const code = `TRF-${now.getFullYear()}-${String(state.transfers.length + 1).padStart(3, '0')}`;
  const order: TransferOrder = {
    id: uid('trf'),
    code,
    medicationId: params.medicationId,
    originBranchId: params.originBranchId,
    destinationBranchId: params.destinationBranchId,
    lotId: lot.id,
    lotCode: lot.lotCode,
    lotExpiryDate: lot.expiryDate,
    quantity: params.quantity,
    distanceKm: dist.distanceKm,
    transitDays: dist.transitDays,
    estimatedTransferCost: dist.estimatedTransferCost,
    expectedArrivalDate: addDaysISO(now, dist.transitDays),
    forecastHistory: [],
    status: 'solicitada',
    reason: params.reason.trim() || 'Redistribuição entre filiais',
    requestedBy: {
      employeeName: actor!.name,
      employeeMatricula: actor!.matricula,
      timestamp: now.toISOString(),
    },
  };

  return {
    ok: true,
    data: { transfer: order },
    state: {
      ...state,
      transfers: [order, ...state.transfers],
    },
  };
}

export function actionApproveTransferOrder(
  state: CofreAppState,
  actor: UserAccount | null,
  transferId: string,
  now = new Date()
): ActionResult {
  const err = validateUserActive(actor) ?? validateManagerRole(actor!);
  if (err) return fail(state, err);

  const trf = state.transfers.find((t) => t.id === transferId);
  if (!trf) return fail(state, 'Transferência não encontrada.');
  if (trf.status !== 'solicitada') {
    return fail(state, 'Operação duplicada ou inválida: transferência não está solicitada.');
  }

  const lot = state.lots.find((l) => l.id === trf.lotId);
  if (!lot) return fail(state, 'Lote de origem não encontrado.');
  if (!isLotUsable(lot, now)) {
    return fail(state, `Aprovação bloqueada: lote ${lot.lotCode} está vencido ou bloqueado.`);
  }
  const avail = getLotAvailableQty(lot, now);
  if (trf.quantity > avail) {
    return fail(state, `Saldo insuficiente no lote ${lot.lotCode} (${avail} disponíveis).`);
  }

  const originMetrics = calculateBranchMedicationMetrics(
    state,
    trf.originBranchId,
    trf.medicationId,
    now
  );
  if (originMetrics.availableUsableQty - trf.quantity < originMetrics.targetStock) {
    return fail(
      state,
      `Aprovação bloqueada: a origem deixaria de preservar seu estoque-alvo (${originMetrics.targetStock}).`
    );
  }

  return {
    ok: true,
    state: {
      ...state,
      lots: state.lots.map((l) =>
        l.id === trf.lotId ? { ...l, reservedQty: l.reservedQty + trf.quantity } : l
      ),
      transfers: state.transfers.map((t) =>
        t.id === transferId
          ? {
              ...t,
              status: 'aprovada_reservada',
              expectedArrivalDate: addDaysISO(now, t.transitDays),
              approvedBy: {
                employeeName: actor!.name,
                employeeMatricula: actor!.matricula,
                timestamp: now.toISOString(),
              },
            }
          : t
      ),
      generalAuditLogs: appendAudit(
        state.generalAuditLogs,
        {
          category: 'transferencia',
          action: `Aprovação e reserva da ${trf.code} (${trf.quantity} unid.)`,
          employeeName: actor!.name,
          employeeMatricula: actor!.matricula,
        },
        now
      ),
    },
  };
}

export function actionDispatchTransferOrder(
  state: CofreAppState,
  actor: UserAccount | null,
  transferId: string,
  now = new Date()
): ActionResult {
  const err = validateUserActive(actor);
  if (err) return fail(state, err);

  const trf = state.transfers.find((t) => t.id === transferId);
  if (!trf) return fail(state, 'Transferência não encontrada.');
  if (trf.status !== 'aprovada_reservada') {
    return fail(state, 'Operação inválida: transferência precisa estar aprovada e reservada.');
  }

  const authErr = validateBranchAuth(actor!, trf.originBranchId);
  if (authErr) return fail(state, authErr);

  const originLot = state.lots.find((l) => l.id === trf.lotId);
  if (!originLot) return fail(state, 'Lote de origem não encontrado.');

  // CRITICAL RULE 5: Revalidate expiry and block status AT DISPATCH!
  if (originLot.status === 'bloqueado') {
    return fail(
      state,
      `Expedição bloqueada: o lote ${originLot.lotCode} foi bloqueado após a aprovação (${originLot.blockedReason ?? 'restrição'}).`
    );
  }
  if (isLotExpired(originLot, now)) {
    return fail(
      state,
      `Expedição bloqueada: o lote ${originLot.lotCode} venceu (${formatDateBR(originLot.expiryDate)}) após a aprovação e não pode ser expedido.`
    );
  }
  if (originLot.physicalQty < trf.quantity) {
    return fail(state, 'Saldo físico insuficiente na origem para expedição.');
  }

  // Revalidate origin target stock preservation (usable physical excluding this lot's reserved portion)
  const originMetrics = calculateBranchMedicationMetrics(
    state,
    trf.originBranchId,
    trf.medicationId,
    now
  );
  // Note: trf.quantity is already inside reservedQty; so availableUsableQty already excludes it!
  if (originMetrics.availableUsableQty < originMetrics.targetStock) {
    return fail(
      state,
      `Expedição bloqueada: o estoque disponível livre na origem (${originMetrics.availableUsableQty}) caiu abaixo do alvo (${originMetrics.targetStock}).`
    );
  }

  const prevOriginBalance = state.lots
    .filter((l) => l.branchId === trf.originBranchId && l.medicationId === trf.medicationId)
    .reduce((sum, l) => sum + l.physicalQty, 0);

  const mov: StockMovement = {
    id: uid('mov'),
    timestamp: now.toISOString(),
    employeeId: actor!.id,
    employeeName: actor!.name,
    employeeMatricula: actor!.matricula,
    branchId: trf.originBranchId,
    medicationId: trf.medicationId,
    lotId: trf.lotId,
    lotCode: trf.lotCode,
    type: 'expedicao',
    quantityDelta: -trf.quantity,
    quantityAbs: trf.quantity,
    previousBalance: prevOriginBalance,
    newBalance: prevOriginBalance - trf.quantity,
    reason: `Expedição da transferência ${trf.code}`,
    transferGroupId: trf.code,
    originBranchId: trf.originBranchId,
    destinationBranchId: trf.destinationBranchId,
  };

  return {
    ok: true,
    state: {
      ...state,
      lots: state.lots.map((l) =>
        l.id === trf.lotId
          ? {
              ...l,
              physicalQty: l.physicalQty - trf.quantity,
              reservedQty: Math.max(0, l.reservedQty - trf.quantity),
            }
          : l
      ),
      movements: [mov, ...state.movements],
      transfers: state.transfers.map((t) =>
        t.id === transferId
          ? {
              ...t,
              status: 'expedida',
              dispatchedQty: trf.quantity,
              expectedArrivalDate: addDaysISO(now, t.transitDays),
              dispatchedBy: {
                employeeName: actor!.name,
                employeeMatricula: actor!.matricula,
                timestamp: now.toISOString(),
              },
            }
          : t
      ),
    },
  };
}

export function actionReceiveTransferOrder(
  state: CofreAppState,
  actor: UserAccount | null,
  transferId: string,
  params?: {
    receivedQty?: number;
    transportCondition?: TransportCondition;
    divergenceNote?: string;
  },
  now = new Date()
): ActionResult {
  const err = validateUserActive(actor);
  if (err) return fail(state, err);

  const trf = state.transfers.find((t) => t.id === transferId);
  if (!trf) return fail(state, 'Transferência não encontrada.');
  if (trf.status !== 'expedida') {
    return fail(state, 'Operação duplicada ou inválida: transferência não está em trânsito.');
  }

  const authErr = validateBranchAuth(actor!, trf.destinationBranchId);
  if (authErr) return fail(state, authErr);

  const receivedQty = params?.receivedQty ?? trf.quantity;
  if (!Number.isInteger(receivedQty) || receivedQty <= 0) {
    return fail(state, 'A quantidade recebida deve ser um inteiro positivo.');
  }
  const condition: TransportCondition = params?.transportCondition ?? 'conforme';
  const divergenceNote = params?.divergenceNote?.trim() ?? '';
  if (receivedQty !== trf.quantity && !divergenceNote) {
    return fail(state, 'Informe uma observação explicando a divergência de quantidade no recebimento.');
  }
  if (condition === 'em_avaliacao_desvio' && !divergenceNote) {
    return fail(state, 'Informe o motivo do desvio / avaliação na condição de transporte.');
  }

  const prevDestBalance = state.lots
    .filter((l) => l.branchId === trf.destinationBranchId && l.medicationId === trf.medicationId)
    .reduce((sum, l) => sum + l.physicalQty, 0);

  const needsQuarantine = condition === 'em_avaliacao_desvio';
  const targetStatus = needsQuarantine ? 'bloqueado' : 'utilizavel';
  const lotCodeToUse = needsQuarantine ? `${trf.lotCode}-AVAL` : trf.lotCode;

  const existingDestLot = state.lots.find(
    (l) =>
      l.branchId === trf.destinationBranchId &&
      l.medicationId === trf.medicationId &&
      l.lotCode === lotCodeToUse
  );
  const destLotId = existingDestLot ? existingDestLot.id : uid('lot');

  const mov: StockMovement = {
    id: uid('mov'),
    timestamp: now.toISOString(),
    employeeId: actor!.id,
    employeeName: actor!.name,
    employeeMatricula: actor!.matricula,
    branchId: trf.destinationBranchId,
    medicationId: trf.medicationId,
    lotId: destLotId,
    lotCode: lotCodeToUse,
    type: 'recebimento',
    quantityDelta: receivedQty,
    quantityAbs: receivedQty,
    previousBalance: prevDestBalance,
    newBalance: prevDestBalance + receivedQty,
    reason: needsQuarantine
      ? `Recebimento da ${trf.code} sob avaliação (bloqueado): ${divergenceNote}`
      : `Recebimento da transferência ${trf.code}${divergenceNote ? ` (${divergenceNote})` : ''}`,
    transferGroupId: trf.code,
    originBranchId: trf.originBranchId,
    destinationBranchId: trf.destinationBranchId,
  };

  const updatedLots = existingDestLot
    ? state.lots.map((l) =>
        l.id === existingDestLot.id
          ? {
              ...l,
              physicalQty: l.physicalQty + receivedQty,
              status: needsQuarantine ? ('bloqueado' as const) : l.status,
              blockedReason: needsQuarantine
                ? `Sob avaliação no recebimento da ${trf.code}: ${divergenceNote}`
                : l.blockedReason,
            }
          : l
      )
    : [
        ...state.lots,
        {
          id: destLotId,
          branchId: trf.destinationBranchId,
          medicationId: trf.medicationId,
          lotCode: lotCodeToUse,
          expiryDate: trf.lotExpiryDate,
          physicalQty: receivedQty,
          reservedQty: 0,
          status: targetStatus as StockLot['status'],
          blockedReason: needsQuarantine
            ? `Sob avaliação no recebimento da ${trf.code}: ${divergenceNote}`
            : undefined,
        },
      ];

  return {
    ok: true,
    state: {
      ...state,
      lots: updatedLots,
      movements: [mov, ...state.movements],
      transfers: state.transfers.map((t) =>
        t.id === transferId
          ? {
              ...t,
              status: 'recebida',
              receivedQty,
              transportCondition: condition,
              divergenceNote: divergenceNote || undefined,
              receivedBy: {
                employeeName: actor!.name,
                employeeMatricula: actor!.matricula,
                timestamp: now.toISOString(),
                note: divergenceNote || undefined,
              },
            }
          : t
      ),
    },
  };
}

export function actionRejectTransferOrder(
  state: CofreAppState,
  actor: UserAccount | null,
  transferId: string,
  note: string,
  now = new Date()
): ActionResult {
  const err = validateUserActive(actor) ?? validateManagerRole(actor!);
  if (err) return fail(state, err);

  const trf = state.transfers.find((t) => t.id === transferId);
  if (!trf || (trf.status !== 'solicitada' && trf.status !== 'aprovada_reservada')) {
    return fail(state, 'Transferência não pode ser recusada nesta etapa.');
  }

  const releaseReservation = trf.status === 'aprovada_reservada';
  return {
    ok: true,
    state: {
      ...state,
      lots: releaseReservation
        ? state.lots.map((l) =>
            l.id === trf.lotId
              ? { ...l, reservedQty: Math.max(0, l.reservedQty - trf.quantity) }
              : l
          )
        : state.lots,
      transfers: state.transfers.map((t) =>
        t.id === transferId
          ? {
              ...t,
              status: 'recusada',
              rejectedBy: {
                employeeName: actor!.name,
                employeeMatricula: actor!.matricula,
                timestamp: now.toISOString(),
                note: note.trim() || 'Recusada pelo gestor',
              },
            }
          : t
      ),
    },
  };
}

function resolveActingPersona(state: CofreAppState, overridePersona?: ActingPersona): ActingPersona {
  if (overridePersona) return overridePersona;
  return (
    ACTING_PERSONAS.find((p) => p.id === state.actingPersonaId) ?? ACTING_PERSONAS[0]
  );
}

// 4. PURCHASE REQUESTS WITH REVALIDATION, > R$ 10.000 INDEPENDENT APPROVAL, SEGREGATION & ESCALATION
export function actionCreatePurchaseRequest(
  state: CofreAppState,
  actor: UserAccount | null,
  params: {
    branchId: string;
    medicationId: string;
    supplierOfferId: string;
    requestedQty: number;
    netNeedAtRequest: number;
    justification: string;
    isException?: boolean;
    exceptionRisks?: string[];
    actingPersona?: ActingPersona;
  },
  now = new Date()
): ActionResult<{ purchase: PurchaseRequest }> {
  const err = validateUserActive(actor) ?? validateManagerRole(actor!);
  if (err) return fail(state, err);

  if (!Number.isInteger(params.requestedQty) || params.requestedQty <= 0) {
    return fail(state, 'A quantidade solicitada deve ser um inteiro positivo.');
  }
  if (!params.justification.trim()) {
    return fail(state, 'Informe a justificativa da solicitação de compra.');
  }

  const offer = state.supplierOffers.find((o) => o.id === params.supplierOfferId);
  if (!offer) return fail(state, 'Oferta de fornecedor não encontrada.');

  // Revalidate current supplier viability at creation time!
  const metrics = calculateBranchMedicationMetrics(
    state,
    params.branchId,
    params.medicationId,
    now
  );
  const { evaluated } = evaluateSupplierOffers(
    state,
    params.medicationId,
    params.requestedQty,
    metrics.coverageDays,
    metrics.daysUntilStockout,
    now
  );
  const currentEval = evaluated.find((e) => e.offer.id === offer.id);
  if (!currentEval) return fail(state, 'Não foi possível revalidar a oferta do fornecedor.');

  if (!currentEval.isViable) {
    if (!params.isException || !params.exceptionRisks || params.exceptionRisks.length === 0) {
      return fail(
        state,
        `Oferta inviável no fluxo normal (${currentEval.viabilityIssues.join(
          '; '
        )}). Utilize a aprovação por exceção com registro explícito dos riscos.`
      );
    }
  }

  const persona = resolveActingPersona(state, params.actingPersona);
  const totalCost = params.requestedQty * offer.pricePerBox + offer.freightCost;
  const requiresIndependentApproval = totalCost > PURCHASE_APPROVAL_THRESHOLD || !currentEval.isViable;
  const excessQty = Math.max(0, params.requestedQty - params.netNeedAtRequest);
  const code = `SC-${now.getFullYear()}-${String(state.purchaseRequests.length + 1).padStart(
    3,
    '0'
  )}`;

  const pr: PurchaseRequest = {
    id: uid('pr'),
    code,
    branchId: params.branchId,
    medicationId: params.medicationId,
    supplierOfferId: offer.id,
    supplierName: offer.supplierName,
    requestedQty: params.requestedQty,
    receivedQtyTotal: 0,
    pendingQty: params.requestedQty,
    netNeedAtRequest: params.netNeedAtRequest,
    excessQty,
    unitPrice: offer.pricePerBox,
    freightCost: offer.freightCost,
    totalCost,
    leadTimeDays: offer.leadTimeDays,
    paymentTerms: offer.paymentTerms,
    expectedArrivalDate: addDaysISO(now, offer.leadTimeDays),
    supplierConfirmed: !requiresIndependentApproval,
    supplierConfirmedAt: !requiresIndependentApproval ? now.toISOString() : undefined,
    supplierConfirmationNote: !requiresIndependentApproval
      ? 'Pedido direto dentro do limite de R$ 10.000 (simulado)'
      : undefined,
    forecastHistory: [],
    status: requiresIndependentApproval ? 'aguardando_aprovacao' : 'aprovada',
    isException: !currentEval.isViable,
    exceptionRisks: !currentEval.isViable ? params.exceptionRisks : undefined,
    justification: params.justification.trim(),
    requestedBy: {
      employeeName: `${persona.name} (${persona.roleTitle})`,
      employeeMatricula: persona.matricula,
      timestamp: now.toISOString(),
    },
    approvedBy: !requiresIndependentApproval
      ? {
          employeeName: `${persona.name} (${persona.roleTitle})`,
          employeeMatricula: persona.matricula,
          timestamp: now.toISOString(),
          note: 'Confirmação direta (valor até R$ 10.000)',
        }
      : undefined,
    createdByActorId: persona.id,
    createdByActorName: persona.name,
    createdByActorRole: persona.roleTitle,
    pendingMinutes: requiresIndependentApproval ? 0 : undefined,
    escalatedToDirector: false,
    receipts: [],
  };

  return {
    ok: true,
    data: { purchase: pr },
    state: {
      ...state,
      purchaseRequests: [pr, ...state.purchaseRequests],
      generalAuditLogs: appendAudit(
        state.generalAuditLogs,
        {
          category: 'compra',
          action: requiresIndependentApproval
            ? `Envio da ${code} para aprovação independente (> ${formatCurrencyBR(
                PURCHASE_APPROVAL_THRESHOLD
              )})${pr.isException ? ' · EXCEÇÃO' : ''}`
            : `Pedido direto confirmado ${code} (até ${formatCurrencyBR(
                PURCHASE_APPROVAL_THRESHOLD
              )})`,
          employeeName: persona.name,
          employeeMatricula: persona.matricula,
          newValue: `${params.requestedQty} unid. · ${offer.supplierName} · ${formatCurrencyBR(
            totalCost
          )}`,
          justification: params.justification.trim(),
        },
        now
      ),
    },
  };
}

export function actionApprovePurchaseRequest(
  state: CofreAppState,
  actor: UserAccount | null,
  requestId: string,
  params?: {
    note?: string;
    allowException?: boolean;
    exceptionRisks?: string[];
    actingPersona?: ActingPersona;
  },
  now = new Date()
): ActionResult {
  const err = validateUserActive(actor) ?? validateManagerRole(actor!);
  if (err) return fail(state, err);

  const pr = state.purchaseRequests.find((p) => p.id === requestId);
  if (!pr) return fail(state, 'Solicitação de compra não encontrada.');
  if (
    pr.status !== 'pendente' &&
    pr.status !== 'aguardando_aprovacao' &&
    pr.status !== 'escalonada_diretor'
  ) {
    return fail(state, 'Solicitação não está pendente de aprovação.');
  }

  const persona = resolveActingPersona(state, params?.actingPersona);
  // Segregation of functions: creator cannot approve their own order!
  if (
    (pr.createdByActorId && pr.createdByActorId === persona.id) ||
    (pr.createdByActorName && pr.createdByActorName === persona.name)
  ) {
    return fail(
      state,
      `Segregação de funções: ${persona.name} (${persona.roleTitle}) criou este pedido e não pode aprová-lo. Troque o papel para Aprovador ou Diretor de operações.`
    );
  }
  if (persona.roleTitle === 'Comprador') {
    return fail(
      state,
      'Segregação de funções: o papel Comprador não possui alçada para aprovar pedidos acima de R$ 10.000.'
    );
  }

  // Revalidate supplier conditions AT APPROVAL TIME (data may have changed since creation!)
  const metrics = calculateBranchMedicationMetrics(state, pr.branchId, pr.medicationId, now);
  const { evaluated } = evaluateSupplierOffers(
    state,
    pr.medicationId,
    pr.requestedQty,
    metrics.coverageDays,
    metrics.daysUntilStockout,
    now
  );
  const currentEval = evaluated.find((e) => e.offer.id === pr.supplierOfferId);
  if (!currentEval) {
    return fail(state, 'Oferta do fornecedor não está mais disponível para revalidação.');
  }

  if (!currentEval.isViable) {
    const hasExceptionAck =
      (params?.allowException && (params.exceptionRisks?.length ?? 0) > 0) ||
      (pr.isException && (pr.exceptionRisks?.length ?? 0) > 0);
    if (!hasExceptionAck || !(params?.note?.trim() || pr.justification.trim())) {
      return fail(
        state,
        `Revalidação falhou na aprovação: ${currentEval.viabilityIssues.join(
          '; '
        )}. Exige exceção justificada e ciência explícita dos riscos.`
      );
    }
  }

  const nextExpected = addDaysISO(now, currentEval.offer.leadTimeDays);

  return {
    ok: true,
    state: {
      ...state,
      purchaseRequests: state.purchaseRequests.map((p) =>
        p.id === requestId
          ? {
              ...p,
              status: 'aprovada',
              supplierConfirmed: true,
              supplierConfirmedAt: now.toISOString(),
              supplierConfirmationNote: `Aprovado e confirmado por ${persona.name} (${persona.roleTitle})`,
              expectedArrivalDate: nextExpected,
              isException: !currentEval.isViable || p.isException,
              exceptionRisks:
                params?.exceptionRisks && params.exceptionRisks.length > 0
                  ? params.exceptionRisks
                  : p.exceptionRisks,
              approvedByActorName: persona.name,
              approvedBy: {
                employeeName: `${persona.name} (${persona.roleTitle})`,
                employeeMatricula: persona.matricula,
                timestamp: now.toISOString(),
                note: params?.note?.trim(),
              },
            }
          : p
      ),
      generalAuditLogs: appendAudit(
        state.generalAuditLogs,
        {
          category: 'compra',
          action: `APROVAÇÃO da ${pr.code} · Status alterado para Confirmado`,
          employeeName: persona.name,
          employeeMatricula: persona.matricula,
          previousValue: `Criado por ${pr.createdByActorName ?? pr.requestedBy.employeeName}`,
          newValue: `Confirmado · Previsão ${formatDateBR(nextExpected)} · ${formatCurrencyBR(
            pr.totalCost
          )}`,
          justification: params?.note?.trim() || pr.justification,
        },
        now
      ),
    },
  };
}

export function actionConfirmSupplierPurchase(
  state: CofreAppState,
  actor: UserAccount | null,
  requestId: string,
  params?: { expectedArrivalDate?: string; note?: string },
  now = new Date()
): ActionResult {
  const err = validateUserActive(actor) ?? validateManagerRole(actor!);
  if (err) return fail(state, err);

  const pr = state.purchaseRequests.find((p) => p.id === requestId);
  if (!pr || (pr.status !== 'aprovada' && pr.status !== 'parcialmente_recebida')) {
    return fail(state, 'A solicitação precisa estar aprovada para confirmar previsão do fornecedor.');
  }

  const nextDate = params?.expectedArrivalDate || pr.expectedArrivalDate;

  return {
    ok: true,
    state: {
      ...state,
      purchaseRequests: state.purchaseRequests.map((p) =>
        p.id === requestId
          ? {
              ...p,
              supplierConfirmed: true,
              supplierConfirmedAt: now.toISOString(),
              supplierConfirmationNote: params?.note?.trim() || 'Fornecimento confirmado',
              expectedArrivalDate: nextDate,
            }
          : p
      ),
    },
  };
}

export function actionRevisePurchaseForecast(
  state: CofreAppState,
  actor: UserAccount | null,
  requestId: string,
  newExpectedDate: string,
  reason: string,
  now = new Date()
): ActionResult {
  const err = validateUserActive(actor) ?? validateManagerRole(actor!);
  if (err) return fail(state, err);
  if (!newExpectedDate) return fail(state, 'Informe a nova data prevista de chegada.');
  if (!reason.trim()) return fail(state, 'Informe a justificativa da revisão de previsão.');

  const pr = state.purchaseRequests.find((p) => p.id === requestId);
  if (!pr || (pr.status !== 'aprovada' && pr.status !== 'parcialmente_recebida')) {
    return fail(state, 'Somente pedidos aprovados ou parcialmente recebidos podem revisar previsão.');
  }

  return {
    ok: true,
    state: {
      ...state,
      purchaseRequests: state.purchaseRequests.map((p) =>
        p.id === requestId
          ? {
              ...p,
              expectedArrivalDate: newExpectedDate,
              forecastHistory: [
                {
                  id: uid('frev'),
                  previousExpectedDate: p.expectedArrivalDate,
                  newExpectedDate,
                  reason: reason.trim(),
                  employeeName: actor!.name,
                  employeeMatricula: actor!.matricula,
                  timestamp: now.toISOString(),
                },
                ...p.forecastHistory,
              ],
            }
          : p
      ),
    },
  };
}

export function actionReceivePurchasePartial(
  state: CofreAppState,
  actor: UserAccount | null,
  requestId: string,
  params: {
    receivedQty: number;
    lotCode: string;
    expiryDate: string;
    operationToken?: string;
    note?: string;
  },
  now = new Date()
): ActionResult {
  const err = validateUserActive(actor);
  if (err) return fail(state, err);

  const pr = state.purchaseRequests.find((p) => p.id === requestId);
  if (!pr) return fail(state, 'Solicitação de compra não encontrada.');

  const authErr = validateBranchAuth(actor!, pr.branchId);
  if (authErr) return fail(state, authErr);

  if (pr.status !== 'aprovada' && pr.status !== 'parcialmente_recebida') {
    return fail(
      state,
      `Operação bloqueada: solicitação no estado "${pr.status}" não aceita recebimentos.`
    );
  }
  if (!Number.isInteger(params.receivedQty) || params.receivedQty <= 0) {
    return fail(state, 'A quantidade recebida deve ser um número inteiro positivo.');
  }
  if (params.receivedQty > pr.pendingQty) {
    return fail(
      state,
      `Recebimento bloqueado: quantidade (${params.receivedQty}) excede o saldo pendente (${pr.pendingQty}).`
    );
  }
  if (!params.lotCode.trim() || !params.expiryDate) {
    return fail(state, 'O recebimento exige código do lote e data de validade.');
  }

  const token =
    params.operationToken ||
    `${pr.id}:${params.lotCode.trim().toUpperCase()}:${params.receivedQty}:${now.toISOString().slice(0, 19)}`;
  if (params.operationToken && pr.receipts.some((r) => r.operationToken === params.operationToken)) {
    return fail(state, 'Operação duplicada detectada: este recebimento já foi registrado.');
  }

  const cleanLot = params.lotCode.trim().toUpperCase();
  const existingLot = state.lots.find(
    (l) =>
      l.branchId === pr.branchId &&
      l.medicationId === pr.medicationId &&
      l.lotCode === cleanLot
  );
  const targetLotId = existingLot ? existingLot.id : uid('lot');
  const prevBalance = state.lots
    .filter((l) => l.branchId === pr.branchId && l.medicationId === pr.medicationId)
    .reduce((sum, l) => sum + l.physicalQty, 0);

  const mov: StockMovement = {
    id: uid('mov'),
    timestamp: now.toISOString(),
    employeeId: actor!.id,
    employeeName: actor!.name,
    employeeMatricula: actor!.matricula,
    branchId: pr.branchId,
    medicationId: pr.medicationId,
    lotId: targetLotId,
    lotCode: cleanLot,
    type: 'entrada',
    quantityDelta: params.receivedQty,
    quantityAbs: params.receivedQty,
    previousBalance: prevBalance,
    newBalance: prevBalance + params.receivedQty,
    reason: `Recebimento${params.receivedQty < pr.pendingQty ? ' parcial' : ''} da ${pr.code} (${pr.supplierName})`,
    purchaseRequestId: pr.id,
  };

  const updatedLots = existingLot
    ? state.lots.map((l) =>
        l.id === existingLot.id ? { ...l, physicalQty: l.physicalQty + params.receivedQty } : l
      )
    : [
        ...state.lots,
        {
          id: targetLotId,
          branchId: pr.branchId,
          medicationId: pr.medicationId,
          lotCode: cleanLot,
          expiryDate: params.expiryDate,
          physicalQty: params.receivedQty,
          reservedQty: 0,
          status: 'utilizavel' as const,
        },
      ];

  const newReceivedTotal = pr.receivedQtyTotal + params.receivedQty;
  const newPendingQty = Math.max(0, pr.requestedQty - newReceivedTotal);
  const nextStatus = newPendingQty === 0 ? ('recebida' as const) : ('parcialmente_recebida' as const);

  const receiptRec: PurchaseReceiptRecord = {
    id: uid('prec'),
    operationToken: token,
    employeeName: actor!.name,
    employeeMatricula: actor!.matricula,
    timestamp: now.toISOString(),
    receivedQty: params.receivedQty,
    lotCode: cleanLot,
    expiryDate: params.expiryDate,
    note: params.note?.trim(),
  };

  return {
    ok: true,
    state: {
      ...state,
      lots: updatedLots,
      movements: [mov, ...state.movements],
      purchaseRequests: state.purchaseRequests.map((p) =>
        p.id === requestId
          ? {
              ...p,
              receivedQtyTotal: newReceivedTotal,
              pendingQty: newPendingQty,
              status: nextStatus,
              receipts: [receiptRec, ...p.receipts],
            }
          : p
      ),
    },
  };
}

export function actionCancelPurchaseRemaining(
  state: CofreAppState,
  actor: UserAccount | null,
  requestId: string,
  justification: string,
  now = new Date()
): ActionResult {
  const err = validateUserActive(actor) ?? validateManagerRole(actor!);
  if (err) return fail(state, err);
  if (!justification.trim()) {
    return fail(state, 'Cancelar a solicitação ou saldo restante exige justificativa obrigatória.');
  }

  const pr = state.purchaseRequests.find((p) => p.id === requestId);
  if (!pr) return fail(state, 'Solicitação não encontrada.');
  if (
    pr.status !== 'pendente' &&
    pr.status !== 'aguardando_aprovacao' &&
    pr.status !== 'escalonada_diretor' &&
    pr.status !== 'aprovada' &&
    pr.status !== 'parcialmente_recebida'
  ) {
    return fail(state, 'Estado atual não permite cancelamento.');
  }

  return {
    ok: true,
    state: {
      ...state,
      purchaseRequests: state.purchaseRequests.map((p) =>
        p.id === requestId
          ? {
              ...p,
              pendingQty: 0,
              status: 'cancelada',
              cancelledBy: {
                employeeName: actor!.name,
                employeeMatricula: actor!.matricula,
                timestamp: now.toISOString(),
                note: justification.trim(),
              },
            }
          : p
      ),
      generalAuditLogs: appendAudit(
        state.generalAuditLogs,
        {
          category: 'compra',
          action: `Cancelamento do saldo restante da ${pr.code}`,
          employeeName: actor!.name,
          employeeMatricula: actor!.matricula,
          previousValue: `${pr.pendingQty} pendentes`,
          newValue: '0 pendentes (cancelada)',
          justification: justification.trim(),
        },
        now
      ),
    },
  };
}

export function actionRejectPurchaseRequest(
  state: CofreAppState,
  actor: UserAccount | null,
  requestId: string,
  justification: string,
  now = new Date(),
  actingPersona?: ActingPersona
): ActionResult {
  const err = validateUserActive(actor) ?? validateManagerRole(actor!);
  if (err) return fail(state, err);
  if (!justification.trim()) return fail(state, 'Informe o motivo obrigatório da recusa.');

  const pr = state.purchaseRequests.find((p) => p.id === requestId);
  if (
    !pr ||
    (pr.status !== 'pendente' &&
      pr.status !== 'aguardando_aprovacao' &&
      pr.status !== 'escalonada_diretor')
  ) {
    return fail(state, 'Solicitação não está aguardando aprovação.');
  }

  const persona = resolveActingPersona(state, actingPersona);
  if (
    (pr.createdByActorId && pr.createdByActorId === persona.id) ||
    (pr.createdByActorName && pr.createdByActorName === persona.name)
  ) {
    return fail(
      state,
      `Segregação de funções: ${persona.name} criou este pedido e não pode recusá-lo/aprová-lo.`
    );
  }
  if (persona.roleTitle === 'Comprador') {
    return fail(
      state,
      'Segregação de funções: o papel Comprador não decide pedidos pendentes de aprovação.'
    );
  }

  return {
    ok: true,
    state: {
      ...state,
      purchaseRequests: state.purchaseRequests.map((p) =>
        p.id === requestId
          ? {
              ...p,
              pendingQty: 0,
              status: 'recusada',
              rejectedBy: {
                employeeName: `${persona.name} (${persona.roleTitle})`,
                employeeMatricula: persona.matricula,
                timestamp: now.toISOString(),
                note: justification.trim(),
              },
            }
          : p
      ),
      generalAuditLogs: appendAudit(
        state.generalAuditLogs,
        {
          category: 'compra',
          action: `RECUSA da ${pr.code}`,
          employeeName: persona.name,
          employeeMatricula: persona.matricula,
          justification: justification.trim(),
        },
        now
      ),
    },
  };
}

export function actionSimulatePurchaseEscalation10Min(
  state: CofreAppState,
  actor: UserAccount | null,
  requestId: string,
  now = new Date()
): ActionResult {
  const err = validateUserActive(actor);
  if (err) return fail(state, err);

  const pr = state.purchaseRequests.find((p) => p.id === requestId);
  if (!pr || pr.status !== 'aguardando_aprovacao') {
    return fail(state, 'Apenas pedidos aguardando aprovação podem ser escalonados.');
  }

  const nextMinutes = (pr.pendingMinutes ?? 0) + 10;
  return {
    ok: true,
    state: {
      ...state,
      purchaseRequests: state.purchaseRequests.map((p) =>
        p.id === requestId
          ? {
              ...p,
              pendingMinutes: nextMinutes,
              status: nextMinutes >= 10 ? 'escalonada_diretor' : p.status,
              escalatedToDirector: nextMinutes >= 10,
            }
          : p
      ),
      generalAuditLogs: appendAudit(
        state.generalAuditLogs,
        {
          category: 'compra',
          action: `Escalonamento da ${pr.code} para Diretor de operações (+10 min simulados sem resposta)`,
          employeeName: 'Motor de regras (simulado)',
          employeeMatricula: 'AUTO',
          previousValue: 'Aguardando aprovação do Aprovador',
          newValue: 'Escalonado p/ Diretor de operações',
        },
        now
      ),
    },
  };
}

// 4B. PERSONA & ALERT GOVERNANCE ACTIONS
export function actionSetActingPersona(
  state: CofreAppState,
  actor: UserAccount | null,
  personaId: ActingPersonaId
): ActionResult {
  const err = validateUserActive(actor);
  if (err) return fail(state, err);
  if (!ACTING_PERSONAS.some((p) => p.id === personaId)) {
    return fail(state, 'Papel fictício inválido.');
  }
  return {
    ok: true,
    state: {
      ...state,
      actingPersonaId: personaId,
    },
  };
}

export function actionAcknowledgeAlert(
  state: CofreAppState,
  actor: UserAccount | null,
  alertId: string,
  now = new Date()
): ActionResult {
  const err = validateUserActive(actor);
  if (err) return fail(state, err);

  const persona = resolveActingPersona(state);
  const existing = state.alertRuntimeState[alertId] ?? {
    acknowledged: false,
    openMinutes: 2,
  };

  return {
    ok: true,
    state: {
      ...state,
      alertRuntimeState: {
        ...state.alertRuntimeState,
        [alertId]: {
          ...existing,
          acknowledged: true,
          acknowledgedBy: `${persona.name} (${persona.roleTitle})`,
          acknowledgedAt: now.toISOString(),
        },
      },
      generalAuditLogs: appendAudit(
        state.generalAuditLogs,
        {
          category: 'alerta',
          action: `Reconhecimento do alerta ${alertId}`,
          employeeName: persona.name,
          employeeMatricula: persona.matricula,
        },
        now
      ),
    },
  };
}

export function actionSimulateAlertsPlus10Min(
  state: CofreAppState,
  actor: UserAccount | null,
  alertIds: string[],
  now = new Date()
): ActionResult {
  const err = validateUserActive(actor);
  if (err) return fail(state, err);

  const nextRuntime = { ...state.alertRuntimeState };
  for (const id of alertIds) {
    const prev = nextRuntime[id] ?? { acknowledged: false, openMinutes: 2 };
    if (!prev.acknowledged) {
      nextRuntime[id] = {
        ...prev,
        openMinutes: prev.openMinutes + 10,
      };
    }
  }

  return {
    ok: true,
    state: {
      ...state,
      alertRuntimeState: nextRuntime,
      generalAuditLogs: appendAudit(
        state.generalAuditLogs,
        {
          category: 'alerta',
          action: `Simulação +10 min sem reconhecimento em ${alertIds.length} alerta(s) ativo(s)`,
          employeeName: actor!.name,
          employeeMatricula: actor!.matricula,
        },
        now
      ),
    },
  };
}

export function actionUpdateAlertRoleConfig(
  state: CofreAppState,
  actor: UserAccount | null,
  category: AlertCategory,
  role: AlertResponsibleRole,
  now = new Date()
): ActionResult {
  const err = validateUserActive(actor) ?? validateManagerRole(actor!);
  if (err) return fail(state, err);

  const prevRole = state.alertRoleConfig[category];
  return {
    ok: true,
    state: {
      ...state,
      alertRoleConfig: {
        ...state.alertRoleConfig,
        [category]: role,
      },
      generalAuditLogs: appendAudit(
        state.generalAuditLogs,
        {
          category: 'alerta',
          action: `Alteração do responsável padrão para alertas (${category})`,
          employeeName: actor!.name,
          employeeMatricula: actor!.matricula,
          previousValue: prevRole,
          newValue: role,
        },
        now
      ),
    },
  };
}

// 5. REFRIGERATED VAULT & CONSERVATION INCIDENTS
export function actionRequestVaultOpen(
  state: CofreAppState,
  actor: UserAccount | null,
  vaultId: string,
  purpose: string,
  now = new Date()
): ActionResult {
  const err = validateUserActive(actor);
  if (err) return fail(state, err);

  const vault = state.vaults.find((v) => v.id === vaultId);
  if (!vault) return fail(state, 'Cofre não encontrado.');
  const branchErr = validateBranchAuth(actor!, vault.branchId);
  if (branchErr) return fail(state, branchErr);

  if (vault.sensorStatus === 'desconectado') {
    return fail(
      state,
      'Sensor desconectado: não é possível liberar abertura remota simulada sem leitura válida do controlador.'
    );
  }
  if (vault.doorState === 'aberta') {
    return fail(state, 'A porta do cofre já se encontra aberta.');
  }

  const { lockState } = defaultVaultGateway.requestUnlock(vault);

  return {
    ok: true,
    state: {
      ...state,
      vaults: state.vaults.map((v) => (v.id === vaultId ? { ...v, lockState } : v)),
      vaultReadings: [
        {
          id: uid('vrd'),
          vaultId,
          timestamp: now.toISOString(),
          tempC: vault.currentTempC,
          sensorStatus: vault.sensorStatus,
          eventLabel: `Abertura solicitada por ${actor!.name} (${actor!.matricula}): ${purpose.trim() || 'Acesso operacional'}`,
        },
        ...state.vaultReadings,
      ],
    },
  };
}

export function actionOpenVaultDoor(
  state: CofreAppState,
  actor: UserAccount | null,
  vaultId: string,
  purpose: string,
  now = new Date()
): ActionResult<{ session: VaultOpeningSession }> {
  const err = validateUserActive(actor);
  if (err) return fail(state, err);

  const vault = state.vaults.find((v) => v.id === vaultId);
  if (!vault) return fail(state, 'Cofre não encontrado.');
  const branchErr = validateBranchAuth(actor!, vault.branchId);
  if (branchErr) return fail(state, branchErr);

  if (vault.lockState !== 'liberada_para_abertura') {
    return fail(state, 'Solicite primeiro a liberação da fechadura por usuário autorizado.');
  }
  if (vault.doorState === 'aberta') {
    return fail(state, 'A porta já está aberta.');
  }

  const transition = defaultVaultGateway.simulateDoorTransition(vault, 'aberta');
  const session: VaultOpeningSession = {
    id: uid('vses'),
    code: `SES-${String(state.vaultSessions.length + 1).padStart(3, '0')}`,
    vaultId,
    branchId: vault.branchId,
    employeeId: actor!.id,
    employeeName: actor!.name,
    employeeMatricula: actor!.matricula,
    requestedAt: now.toISOString(),
    doorOpenedAt: now.toISOString(),
    linkedMovementIds: [],
    closedWithoutMovement: false,
    purpose: purpose.trim() || 'Retirada/conferência em cadeia fria',
  };

  return {
    ok: true,
    data: { session },
    state: {
      ...state,
      vaults: state.vaults.map((v) =>
        v.id === vaultId
          ? {
              ...v,
              doorState: transition.doorState,
              lockState: transition.lockState,
              activeSessionId: session.id,
            }
          : v
      ),
      vaultSessions: [session, ...state.vaultSessions],
      vaultReadings: [
        {
          id: uid('vrd'),
          vaultId,
          timestamp: now.toISOString(),
          tempC: vault.currentTempC,
          sensorStatus: vault.sensorStatus,
          eventLabel: `Porta aberta (${session.code}) por ${actor!.name}. Nenhuma retirada automática registrada.`,
        },
        ...state.vaultReadings,
      ],
    },
  };
}

export function actionCloseVaultDoor(
  state: CofreAppState,
  actor: UserAccount | null,
  vaultId: string,
  now = new Date()
): ActionResult {
  const err = validateUserActive(actor);
  if (err) return fail(state, err);

  const vault = state.vaults.find((v) => v.id === vaultId);
  if (!vault) return fail(state, 'Cofre não encontrado.');
  const branchErr = validateBranchAuth(actor!, vault.branchId);
  if (branchErr) return fail(state, branchErr);

  if (vault.doorState !== 'aberta') {
    return fail(state, 'A porta já está fechada.');
  }

  const transition = defaultVaultGateway.simulateDoorTransition(vault, 'fechada');
  const activeSes = state.vaultSessions.find((s) => s.id === vault.activeSessionId);
  const noMoves = (activeSes?.linkedMovementIds.length ?? 0) === 0;

  return {
    ok: true,
    state: {
      ...state,
      vaults: state.vaults.map((v) =>
        v.id === vaultId
          ? {
              ...v,
              doorState: transition.doorState,
              lockState: transition.lockState,
              activeSessionId: null,
            }
          : v
      ),
      vaultSessions: state.vaultSessions.map((s) =>
        s.id === vault.activeSessionId
          ? { ...s, doorClosedAt: now.toISOString(), closedWithoutMovement: noMoves }
          : s
      ),
      vaultReadings: [
        {
          id: uid('vrd'),
          vaultId,
          timestamp: now.toISOString(),
          tempC: vault.currentTempC,
          sensorStatus: vault.sensorStatus,
          eventLabel: noMoves
            ? `Porta fechada (${activeSes?.code ?? ''}) — ATENÇÃO: abertura sem movimentação registrada.`
            : `Porta fechada (${activeSes?.code ?? ''}) com ${activeSes?.linkedMovementIds.length} movimentação(ões) vinculada(s).`,
        },
        ...state.vaultReadings,
      ],
    },
  };
}

export function actionSimulateVaultSensorStatus(
  state: CofreAppState,
  actor: UserAccount | null,
  vaultId: string,
  sensorStatus: VaultSensorStatus,
  now = new Date()
): ActionResult {
  const err = validateUserActive(actor);
  if (err) return fail(state, err);

  const vault = state.vaults.find((v) => v.id === vaultId);
  if (!vault) return fail(state, 'Cofre não encontrado.');
  const branchErr = validateBranchAuth(actor!, vault.branchId);
  if (branchErr) return fail(state, branchErr);

  const nextTemp = sensorStatus === 'desconectado' ? null : vault.currentTempC ?? 4.3;

  return {
    ok: true,
    state: {
      ...state,
      vaults: state.vaults.map((v) =>
        v.id === vaultId
          ? {
              ...v,
              sensorStatus,
              currentTempC: nextTemp,
              lastReadingAt:
                sensorStatus === 'conectado' ? now.toISOString() : v.lastReadingAt,
            }
          : v
      ),
      vaultReadings: [
        {
          id: uid('vrd'),
          vaultId,
          timestamp: now.toISOString(),
          tempC: nextTemp,
          sensorStatus,
          eventLabel:
            sensorStatus === 'desconectado'
              ? 'Falha simulada: sensor desconectado'
              : sensorStatus === 'leitura_desatualizada'
              ? 'Alerta simulado: leitura de temperatura desatualizada'
              : 'Comunicação do sensor restabelecida (simulada)',
        },
        ...state.vaultReadings,
      ],
    },
  };
}

export function actionSimulateVaultTemperature(
  state: CofreAppState,
  actor: UserAccount | null,
  vaultId: string,
  tempC: number,
  durationMinutes: number,
  now = new Date()
): ActionResult<{ incident?: ConservationIncident }> {
  const err = validateUserActive(actor);
  if (err) return fail(state, err);

  const vault = state.vaults.find((v) => v.id === vaultId);
  if (!vault) return fail(state, 'Cofre não encontrado.');
  const branchErr = validateBranchAuth(actor!, vault.branchId);
  if (branchErr) return fail(state, branchErr);

  if (vault.sensorStatus === 'desconectado') {
    return fail(state, 'Sensor desconectado: restabeleça a comunicação antes de ler temperatura.');
  }

  const outOfRange = tempC < vault.minTempC || tempC > vault.maxTempC;
  const exceedsTolerance = outOfRange && durationMinutes > vault.toleranceMinutes;

  let updatedLots = state.lots;
  let updatedIncidents = state.conservationIncidents;
  let updatedAudits = state.generalAuditLogs;
  let createdIncident: ConservationIncident | undefined;

  if (exceedsTolerance) {
    const refrigeratedMedIds = new Set(
      state.medications.filter((m) => m.isRefrigerated).map((m) => m.id)
    );
    const affectedLots = state.lots.filter(
      (l) =>
        l.branchId === vault.branchId &&
        refrigeratedMedIds.has(l.medicationId) &&
        l.physicalQty > 0 &&
        l.status === 'utilizavel'
    );
    const code = `OC-${now.getFullYear()}-${String(
      state.conservationIncidents.length + 1
    ).padStart(3, '0')}`;

    createdIncident = {
      id: uid('inc'),
      code,
      vaultId: vault.id,
      equipmentCode: vault.equipmentCode,
      branchId: vault.branchId,
      startedAt: now.toISOString(),
      durationMinutes,
      peakTempC: tempC,
      allowedRangeLabel: `${vault.minTempC.toFixed(1)} °C a ${vault.maxTempC.toFixed(
        1
      )} °C (tolerância: ${vault.toleranceMinutes} min)`,
      readingsSummary: `Pico simulado de ${tempC.toFixed(1)} °C mantido por ${durationMinutes} min`,
      affectedLotIds: affectedLots.map((l) => l.id),
      affectedLotCodes: affectedLots.map((l) => l.lotCode),
      status: 'bloqueio_aplicado',
    };

    const affectedIds = new Set(createdIncident.affectedLotIds);
    updatedLots = state.lots.map((l) =>
      affectedIds.has(l.id)
        ? {
            ...l,
            status: 'bloqueado' as const,
            blockedReason: `Ocorrência de conservação ${code} (${tempC.toFixed(
              1
            )} °C por ${durationMinutes} min — política demonstrativa)`,
          }
        : l
    );

    updatedIncidents = [createdIncident, ...state.conservationIncidents];
    updatedAudits = appendAudit(
      updatedAudits,
      {
        category: 'ocorrencia',
        action: `Ocorrência térmica ${code} · Bloqueio preventivo em ${affectedLots.length} lote(s)`,
        employeeName: actor!.name,
        employeeMatricula: actor!.matricula,
        newValue: `${tempC.toFixed(1)} °C (${durationMinutes} min)`,
      },
      now
    );
  }

  // IMPORTANT RULE 8: Returning temperature to normal range NEVER automatically unblocks lots!
  return {
    ok: true,
    data: { incident: createdIncident },
    state: {
      ...state,
      lots: updatedLots,
      conservationIncidents: updatedIncidents,
      generalAuditLogs: updatedAudits,
      vaults: state.vaults.map((v) =>
        v.id === vaultId
          ? {
              ...v,
              currentTempC: tempC,
              lastReadingAt: now.toISOString(),
            }
          : v
      ),
      vaultReadings: [
        {
          id: uid('vrd'),
          vaultId,
          timestamp: now.toISOString(),
          tempC,
          sensorStatus: vault.sensorStatus,
          eventLabel: exceedsTolerance
            ? `EXCURSÃO TÉRMICA (${tempC.toFixed(1)} °C por ${durationMinutes} min): ocorrência ${
                createdIncident?.code
              } aberta e lotes bloqueados`
            : outOfRange
            ? `Temperatura fora da faixa (${tempC.toFixed(1)} °C por ${durationMinutes} min) dentro da tolerância`
            : `Temperatura normalizada em ${tempC.toFixed(1)} °C (lotes bloqueados permanecem bloqueados até avaliação)`,
        },
        ...state.vaultReadings,
      ],
    },
  };
}

export function actionEvaluateConservationIncident(
  state: CofreAppState,
  actor: UserAccount | null,
  incidentId: string,
  decision: 'liberar' | 'descarte',
  justification: string,
  now = new Date()
): ActionResult {
  const err = validateUserActive(actor) ?? validateManagerRole(actor!);
  if (err) return fail(state, err);
  if (!justification.trim()) {
    return fail(state, 'A avaliação técnica exige justificativa registrada.');
  }

  const inc = state.conservationIncidents.find((i) => i.id === incidentId);
  if (!inc) return fail(state, 'Ocorrência não encontrada.');
  if (inc.status === 'avaliada_liberada' || inc.status === 'avaliada_descarte') {
    return fail(state, 'Esta ocorrência já foi avaliada.');
  }

  const affectedSet = new Set(inc.affectedLotIds);
  const updatedLots =
    decision === 'liberar'
      ? state.lots.map((l) =>
          affectedSet.has(l.id) && l.status === 'bloqueado'
            ? { ...l, status: 'utilizavel' as const, blockedReason: undefined }
            : l
        )
      : state.lots.map((l) =>
          affectedSet.has(l.id)
            ? {
                ...l,
                status: 'bloqueado' as const,
                blockedReason: `Destinação/descarte definido na avaliação da ${inc.code}: ${justification.trim()}`,
              }
            : l
        );

  return {
    ok: true,
    state: {
      ...state,
      lots: updatedLots,
      conservationIncidents: state.conservationIncidents.map((i) =>
        i.id === incidentId
          ? {
              ...i,
              status: decision === 'liberar' ? 'avaliada_liberada' : 'avaliada_descarte',
              evaluatedBy: {
                employeeName: actor!.name,
                employeeMatricula: actor!.matricula,
                timestamp: now.toISOString(),
                decision,
                justification: justification.trim(),
              },
            }
          : i
      ),
      generalAuditLogs: appendAudit(
        state.generalAuditLogs,
        {
          category: 'ocorrencia',
          action: `Avaliação da ${inc.code}: ${
            decision === 'liberar' ? 'Lotes liberados para uso' : 'Lotes mantidos para descarte'
          }`,
          employeeName: actor!.name,
          employeeMatricula: actor!.matricula,
          justification: justification.trim(),
        },
        now
      ),
    },
  };
}

// 6. SETTINGS & ADMIN ACTIONS (Centralized permission + audit)
export function actionUpdateSupplierOffer(
  state: CofreAppState,
  actor: UserAccount | null,
  offerId: string,
  patch: Partial<SupplierOffer>,
  now = new Date()
): ActionResult {
  const err = validateUserActive(actor) ?? validateManagerRole(actor!);
  if (err) return fail(state, err);

  const prev = state.supplierOffers.find((o) => o.id === offerId);
  if (!prev) return fail(state, 'Oferta não encontrada.');

  return {
    ok: true,
    state: {
      ...state,
      supplierOffers: state.supplierOffers.map((o) => (o.id === offerId ? { ...o, ...patch } : o)),
      generalAuditLogs: appendAudit(
        state.generalAuditLogs,
        {
          category: 'fornecedor',
          action: `Alteração comercial em ${prev.supplierName}`,
          employeeName: actor!.name,
          employeeMatricula: actor!.matricula,
          previousValue: `R$ ${prev.pricePerBox} · mín ${prev.minOrderQty} · prazo ${prev.leadTimeDays}d · disp ${prev.availableQty}`,
          newValue: `R$ ${patch.pricePerBox ?? prev.pricePerBox} · mín ${
            patch.minOrderQty ?? prev.minOrderQty
          } · prazo ${patch.leadTimeDays ?? prev.leadTimeDays}d · disp ${
            patch.availableQty ?? prev.availableQty
          }`,
        },
        now
      ),
    },
  };
}

export function actionUpdateBranchMedPolicy(
  state: CofreAppState,
  actor: UserAccount | null,
  params: {
    branchId: string;
    medicationId: string;
    safetyStock: number;
    coverageDays: number;
    justification: string;
    isManualPolicy?: boolean;
  },
  now = new Date()
): ActionResult {
  const err = validateUserActive(actor) ?? validateManagerRole(actor!);
  if (err) return fail(state, err);
  if (!params.justification.trim()) {
    return fail(state, 'Informe uma justificativa obrigatória para alterar a política de estoque.');
  }
  if (params.safetyStock < 0 || params.coverageDays < 1) {
    return fail(state, 'Valores inválidos de estoque de segurança ou cobertura.');
  }

  const existing = state.policies.find(
    (p) => p.branchId === params.branchId && p.medicationId === params.medicationId
  );
  const prevSafety = existing?.safetyStock ?? 5;
  const prevCov = existing?.coverageDays ?? 7;

  return {
    ok: true,
    state: {
      ...state,
      policies: existing
        ? state.policies.map((p) =>
            p.id === existing.id
              ? {
                  ...p,
                  safetyStock: params.safetyStock,
                  coverageDays: params.coverageDays,
                  isManualPolicy: params.isManualPolicy ?? p.isManualPolicy,
                  manualPolicyReason: params.isManualPolicy
                    ? params.justification.trim()
                    : p.manualPolicyReason,
                }
              : p
          )
        : [
            ...state.policies,
            {
              id: uid('pol'),
              branchId: params.branchId,
              medicationId: params.medicationId,
              safetyStock: params.safetyStock,
              coverageDays: params.coverageDays,
              periodDays: 30,
              isManualPolicy: params.isManualPolicy,
              manualPolicyReason: params.isManualPolicy ? params.justification.trim() : undefined,
            },
          ],
      safetyChangeLogs: [
        {
          id: uid('saf'),
          timestamp: now.toISOString(),
          branchId: params.branchId,
          medicationId: params.medicationId,
          previousSafetyStock: prevSafety,
          newSafetyStock: params.safetyStock,
          previousCoverageDays: prevCov,
          newCoverageDays: params.coverageDays,
          justification: params.justification.trim(),
          employeeName: actor!.name,
          employeeMatricula: actor!.matricula,
        },
        ...state.safetyChangeLogs,
      ],
      generalAuditLogs: appendAudit(
        state.generalAuditLogs,
        {
          category: 'politica',
          action: 'Alteração de estoque de segurança / cobertura',
          employeeName: actor!.name,
          employeeMatricula: actor!.matricula,
          previousValue: `Segurança ${prevSafety} · Cobertura ${prevCov}d`,
          newValue: `Segurança ${params.safetyStock} · Cobertura ${params.coverageDays}d`,
          justification: params.justification.trim(),
        },
        now
      ),
    },
  };
}
