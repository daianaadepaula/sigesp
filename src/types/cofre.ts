export type UserRole = 'funcionario' | 'gestor' | 'administrador';

export interface UserAccount {
  id: string;
  name: string;
  matricula: string;
  cpf: string; // Stored only for demo login matching; NEVER written to audit logs
  password: string; // Fictitious demo password; NEVER written to audit logs
  totpSeedLabel: string; // Simulated 2FA demo code; NOT real cryptographic TOTP
  role: UserRole;
  authorizedBranchIds: string[];
  active: boolean;
}

export interface BranchDistance {
  toBranchId: string;
  distanceKm: number;
  transitDays: number; // 0 = mesmo dia
  estimatedTransferCost?: number | null; // null/undefined = custo não informado
}

export interface Branch {
  id: string;
  name: string;
  code: string;
  address: string;
  cityState: string;
  alertDaysBeforeExpiry: number;
  distances: BranchDistance[];
}

export interface Medication {
  id: string;
  sku: string;
  barcode: string;
  name: string;
  activeIngredient: string;
  concentration: string;
  pharmaceuticalForm: string;
  presentation: string;
  controlUnit: string; // e.g., 'caixa' | 'frasco'
  unitCostReference: number; // Valor unitário fictício para estimativas financeiras
  isRefrigerated: boolean; // Exige conservação em cofre refrigerado
}

export type LotStatus = 'utilizavel' | 'vencido' | 'bloqueado';

export interface StockLot {
  id: string;
  branchId: string;
  medicationId: string;
  lotCode: string;
  expiryDate: string; // ISO YYYY-MM-DD
  physicalQty: number;
  reservedQty: number;
  status: LotStatus;
  blockedReason?: string;
}

export interface BranchMedicationPolicy {
  id: string;
  branchId: string;
  medicationId: string;
  safetyStock: number;
  coverageDays: number;
  periodDays: number; // Default 30
  isManualPolicy?: boolean;
  manualPolicyReason?: string;
}

export type MovementType =
  | 'entrada'
  | 'saida_consumo'
  | 'perda'
  | 'ajuste'
  | 'expedicao'
  | 'recebimento'
  | 'estorno';

export interface StockMovement {
  id: string;
  timestamp: string; // ISO datetime
  employeeId: string;
  employeeName: string;
  employeeMatricula: string;
  branchId: string;
  medicationId: string;
  lotId: string;
  lotCode: string;
  type: MovementType;
  quantityDelta: number;
  quantityAbs: number;
  previousBalance: number;
  newBalance: number;
  reason: string;
  transferGroupId?: string;
  originBranchId?: string;
  destinationBranchId?: string;
  reversedMovementId?: string;
  purchaseRequestId?: string;
  vaultSessionId?: string;
  missingVaultSessionWarning?: boolean;
}

export type AccessResult =
  | 'sucesso'
  | 'falha_credenciais'
  | 'falha_segundo_fator'
  | 'logout';

export interface AccessLog {
  id: string;
  timestamp: string;
  employeeName: string;
  employeeMatricula: string;
  roleLabel: string;
  branchId?: string;
  branchName?: string;
  result: AccessResult;
  detail: string;
}

export type TransferStatus =
  | 'solicitada'
  | 'aprovada_reservada'
  | 'expedida'
  | 'recebida'
  | 'recusada';

export interface TransferStepAudit {
  employeeName: string;
  employeeMatricula: string;
  timestamp: string;
  note?: string;
}

export interface ForecastRevision {
  id: string;
  previousExpectedDate: string;
  newExpectedDate: string;
  reason: string;
  employeeName: string;
  employeeMatricula: string;
  timestamp: string;
}

export type TransportCondition = 'conforme' | 'em_avaliacao_desvio';

export interface TransferOrder {
  id: string;
  code: string;
  medicationId: string;
  originBranchId: string;
  destinationBranchId: string;
  lotId: string;
  lotCode: string;
  lotExpiryDate: string;
  quantity: number;
  dispatchedQty?: number;
  receivedQty?: number;
  divergenceNote?: string;
  transportCondition?: TransportCondition;
  distanceKm: number;
  transitDays: number;
  estimatedTransferCost?: number | null;
  expectedArrivalDate: string; // ISO YYYY-MM-DD
  forecastHistory: ForecastRevision[];
  status: TransferStatus;
  reason: string;
  requestedBy: TransferStepAudit;
  approvedBy?: TransferStepAudit;
  dispatchedBy?: TransferStepAudit;
  receivedBy?: TransferStepAudit;
  rejectedBy?: TransferStepAudit;
}

export interface SupplierOffer {
  id: string;
  supplierName: string;
  medicationId: string;
  pricePerBox: number;
  availableQty: number;
  leadTimeDays: number;
  freightCost: number;
  minOrderQty: number;
  packMultiple: number;
  paymentTerms: string;
  lotExpiryDate: string;
}

export type PurchaseStatus =
  | 'pendente'
  | 'aguardando_aprovacao'
  | 'escalonada_diretor'
  | 'aprovada'
  | 'parcialmente_recebida'
  | 'recebida'
  | 'recusada'
  | 'cancelada';

export interface PurchaseReceiptRecord {
  id: string;
  operationToken: string;
  employeeName: string;
  employeeMatricula: string;
  timestamp: string;
  receivedQty: number;
  lotCode: string;
  expiryDate: string;
  note?: string;
}

export interface PurchaseRequest {
  id: string;
  code: string;
  branchId: string;
  medicationId: string;
  supplierOfferId: string;
  supplierName: string;
  requestedQty: number;
  receivedQtyTotal: number;
  pendingQty: number;
  netNeedAtRequest: number;
  excessQty: number;
  unitPrice: number;
  freightCost: number;
  totalCost: number;
  leadTimeDays: number;
  paymentTerms: string;
  expectedArrivalDate: string; // ISO YYYY-MM-DD
  supplierConfirmed: boolean;
  supplierConfirmedAt?: string;
  supplierConfirmationNote?: string;
  forecastHistory: ForecastRevision[];
  status: PurchaseStatus;
  isException?: boolean;
  exceptionRisks?: string[];
  justification: string;
  requestedBy: TransferStepAudit;
  approvedBy?: TransferStepAudit;
  rejectedBy?: TransferStepAudit;
  cancelledBy?: TransferStepAudit;
  receipts: PurchaseReceiptRecord[];
  createdByActorId?: string;
  createdByActorName?: string;
  createdByActorRole?: string;
  approvedByActorName?: string;
  pendingMinutes?: number;
  escalatedToDirector?: boolean;
}

export interface SafetyStockChangeLog {
  id: string;
  timestamp: string;
  branchId: string;
  medicationId: string;
  previousSafetyStock: number;
  newSafetyStock: number;
  previousCoverageDays: number;
  newCoverageDays: number;
  justification: string;
  employeeName: string;
  employeeMatricula: string;
}

export interface GeneralAuditLog {
  id: string;
  timestamp: string;
  category:
    | 'politica'
    | 'fornecedor'
    | 'usuario'
    | 'filial'
    | 'cofre'
    | 'ocorrencia'
    | 'compra'
    | 'transferencia'
    | 'alerta';
  action: string;
  employeeName: string;
  employeeMatricula: string;
  previousValue?: string;
  newValue?: string;
  justification?: string;
}

// Refrigerated Vault & Conservation Types
export type VaultDoorState = 'fechada' | 'aberta';
export type VaultLockState = 'travada' | 'liberada_para_abertura' | 'destravada';
export type VaultSensorStatus = 'conectado' | 'leitura_desatualizada' | 'desconectado';

export interface VaultOpeningSession {
  id: string;
  code: string;
  vaultId: string;
  branchId: string;
  employeeId: string;
  employeeName: string;
  employeeMatricula: string;
  requestedAt: string;
  doorOpenedAt?: string;
  doorClosedAt?: string;
  linkedMovementIds: string[];
  closedWithoutMovement: boolean;
  purpose: string;
}

export interface VaultReadingEvent {
  id: string;
  vaultId: string;
  timestamp: string;
  tempC: number | null;
  sensorStatus: VaultSensorStatus;
  eventLabel: string;
}

export interface RefrigeratedVault {
  id: string;
  equipmentCode: string;
  branchId: string;
  label: string;
  doorState: VaultDoorState;
  lockState: VaultLockState;
  currentTempC: number | null;
  minTempC: number;
  maxTempC: number;
  toleranceMinutes: number;
  lastReadingAt: string;
  sensorStatus: VaultSensorStatus;
  requireSessionForColdChain: boolean;
  activeSessionId: string | null;
}

export type IncidentStatus = 'aberta' | 'bloqueio_aplicado' | 'avaliada_liberada' | 'avaliada_descarte';

export interface ConservationIncident {
  id: string;
  code: string;
  vaultId: string;
  equipmentCode: string;
  branchId: string;
  startedAt: string;
  durationMinutes: number;
  peakTempC: number;
  allowedRangeLabel: string;
  readingsSummary: string;
  affectedLotIds: string[];
  affectedLotCodes: string[];
  status: IncidentStatus;
  evaluatedBy?: {
    employeeName: string;
    employeeMatricula: string;
    timestamp: string;
    decision: 'liberar' | 'descarte';
    justification: string;
  };
}

// Acting Persona (Segregation of Functions in Purchase Approval)
export type ActingPersonaId = 'persona-comprador' | 'persona-aprovador' | 'persona-diretor';

export interface ActingPersona {
  id: ActingPersonaId;
  name: string;
  matricula: string;
  roleTitle: 'Comprador' | 'Aprovador' | 'Diretor de operações';
  systemRole: UserRole;
  description: string;
}

// Operational Alerts with Responsible Role & Escalation
export type AlertSeverity = 'critica' | 'alta' | 'informativa';
export type AlertStatus = 'novo' | 'reconhecido' | 'escalonado';

export type AlertCategory =
  | 'temperatura_fora_faixa'
  | 'porta_aberta'
  | 'acesso_negado'
  | 'falha_equipamento'
  | 'estoque_baixo'
  | 'lote_vencimento'
  | 'compra_acima_limite';

export type AlertResponsibleRole =
  | 'Responsável técnico'
  | 'Gestor de estoque'
  | 'Responsável pela locação'
  | 'Comprador'
  | 'Aprovador'
  | 'Diretor de operações';

export type AlertRoleConfig = Record<AlertCategory, AlertResponsibleRole>;

export interface AlertRuntimeEntry {
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  openMinutes: number;
}

export interface OperationalAlert {
  id: string;
  category: AlertCategory;
  severity: AlertSeverity;
  title: string;
  detail: string;
  branchId?: string;
  branchName: string;
  baseResponsibleRole: AlertResponsibleRole;
  currentResponsibleRole: AlertResponsibleRole;
  escalationChain: AlertResponsibleRole[];
  status: AlertStatus;
  openMinutes: number;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  targetTab: 'cofre' | 'alertas' | 'reposicao' | 'historico';
}

// 90-Day Impact Simulation Types
export interface ImpactPolicyMetrics {
  policyName: string;
  demandServed: number;
  totalDemand: number;
  costPerServedUnit: number;
  cogs: number; // compras + frete + estoque inicial - estoque final
  carryingCost: number;
  stockoutCost: number;
  totalPeriodCost: number;
  expiryLosses: number; // já incluídas no totalPeriodCost (via perda no estoque final)
  avgIdleCapital: number; // saldo médio fora da soma
  stockoutDays: number;
  purchasesCount: number;
  transfersCount: number;
  initialInventoryValue: number;
  finalInventoryValue: number;
  purchasesPlusFreight: number;
}

export interface ImpactDetailRow {
  branchId: string;
  branchName: string;
  medicationId: string;
  medicationName: string;
  controlUnit: string;
  demandTotal: number;
  baselineServed: number;
  recommendedServed: number;
  baselineStockoutDays: number;
  recommendedStockoutDays: number;
  baselineCostPerUnit: number;
  recommendedCostPerUnit: number;
  baselineAvgCapital: number;
  recommendedAvgCapital: number;
}

export interface ImpactSimulationResult {
  seed: number;
  horizonDays: number;
  zScore: number;
  carryingRateAnnual: number;
  stockoutCostPerDay: number;
  baseline: ImpactPolicyMetrics;
  recommended: ImpactPolicyMetrics;
  dailySeries: {
    day: number;
    baselineCapital: number;
    recommendedCapital: number;
    baselineCumulativeServed: number;
    recommendedCumulativeServed: number;
  }[];
  detailRows: ImpactDetailRow[];
  assumptions: string[];
}

export interface CofreAppState {
  schemaVersion: number;
  isDemoBannerActive: boolean;
  demoStepCompleted: number;
  actingPersonaId: ActingPersonaId;
  alertRoleConfig: AlertRoleConfig;
  alertRuntimeState: Record<string, AlertRuntimeEntry>;
  users: UserAccount[];
  branches: Branch[];
  medications: Medication[];
  lots: StockLot[];
  policies: BranchMedicationPolicy[];
  movements: StockMovement[];
  accessLogs: AccessLog[];
  transfers: TransferOrder[];
  supplierOffers: SupplierOffer[];
  purchaseRequests: PurchaseRequest[];
  safetyChangeLogs: SafetyStockChangeLog[];
  generalAuditLogs: GeneralAuditLog[];
  vaults: RefrigeratedVault[];
  vaultSessions: VaultOpeningSession[];
  vaultReadings: VaultReadingEvent[];
  conservationIncidents: ConservationIncident[];
}

export interface BranchMedicationMetrics {
  branchId: string;
  medicationId: string;
  periodDays: number;
  netConsumptionPeriod: number;
  hasInsufficientHistory: boolean;
  averageDailyConsumption: number;
  consumptionStdDev: number;
  zScore: number;
  statisticalSafetyStock: number;
  reorderPoint: number;
  physicalUsableQty: number;
  reservedQty: number;
  blockedQty: number;
  expiredQty: number;
  totalPhysicalAllLots: number;
  availableUsableQty: number;
  safetyStock: number;
  coverageDays: number;
  targetStock: number;
  confirmedIncomingTransfersQty: number;
  confirmedIncomingPurchasesQty: number;
  unconfirmedApprovedPurchasesQty: number;
  delayedOrdersCount: number;
  confirmedIncomingTotalQty: number;
  netNeedQty: number;
  excessQty: number;
  nextUsableExpiryDate: string | null;
  nextUsableExpiryDays: number | null;
  riskOfExpiryBeforeUseQty: number;
  estimatedStockoutDate: string | null;
  daysUntilStockout: number | null;
}

export interface SuggestedTransferPlan {
  originBranchId: string;
  originBranchName: string;
  distanceKm: number;
  transitDays: number;
  estimatedTransferCost: number | null;
  expectedArrivalDate: string;
  lotId: string;
  lotCode: string;
  lotExpiryDate: string;
  daysUntilLotExpiry: number;
  suggestedQty: number;
  originBalanceBefore: number;
  originBalanceAfterDispatch: number;
  originTargetStock: number;
  canConsumeBeforeExpiry: boolean;
  maxConsumableBeforeExpiry: number;
}

export interface EvaluatedSupplierOffer {
  offer: SupplierOffer;
  effectiveOrderQty: number;
  excessOverNeedQty: number;
  excessValue: number;
  totalCost: number;
  carryingCost: number;
  stockoutRiskDays: number;
  stockoutRiskCost: number;
  economicTotalCost: number;
  excludedByLeadTime: boolean;
  expectedArrivalDate: string;
  isWithinStock: boolean;
  hasSufficientShelfLife: boolean;
  arrivesBeforeStockout: boolean;
  isViable: boolean;
  viabilityIssues: string[];
  isBestChoice: boolean;
}

export interface TimelineStep {
  dayOffset: number;
  dateISO: string;
  label: string;
  eventDelta: number;
  consumptionDelta: number;
  expiredDelta: number;
  projectedBalance: number;
  stockoutGapToday: number;
}

export interface ScenarioComparison {
  purchaseOnlyOffer: EvaluatedSupplierOffer | null;
  purchaseOnlyQty: number;
  purchaseOnlyTotalCost: number;
  purchaseOnlyFreight: number;
  purchaseOnlyExcessQty: number;
  purchaseOnlyExcessValue: number;
  transferPlusPurchaseTotalCost: number;
  transferPlusPurchaseFreight: number;
  transferCostKnown: boolean;
  transferCostTotal: number;
  transferPlusPurchaseExcessQty: number;
  transferPlusPurchaseExcessValue: number;
  estimatedSavings: number | null;
  potentialExpiryLossAvoided: number;
}

export interface ReplenishmentRecommendation {
  branchId: string;
  medicationId: string;
  metrics: BranchMedicationMetrics;
  suggestedTransfers: SuggestedTransferPlan[];
  totalSuggestedTransferQty: number;
  remainingPurchaseQty: number;
  effectivePurchaseQty: number;
  supplierExcessQty: number;
  supplierExcessValue: number;
  projectedBalanceWithoutConsumption: number;
  projectedTimeline: TimelineStep[];
  projectedBalanceEndOfHorizon: number;
  stockoutRiskBeforeArrival: {
    hasRisk: boolean;
    estimatedStockoutDate: string | null;
    uncoveredQty: number;
    earliestArrivalDate: string | null;
  };
  supplierComparison: EvaluatedSupplierOffer[];
  bestSupplier: EvaluatedSupplierOffer | null;
  scenarioComparison: ScenarioComparison;
  explanation: {
    whyActNow: string;
    howMuchTransferAndBuy: string;
    whichBranchAndSupplier: string;
    whenArrives: string;
    stockoutBeforeArrival: string;
    excessCreated: string;
    expiryRisk: string;
    missingDataOrConfirmations: string;
    formulaBreakdown: string[];
    plainSummary: string;
  };
}
