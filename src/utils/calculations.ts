import {
  Branch,
  BranchMedicationMetrics,
  CofreAppState,
  EvaluatedSupplierOffer,
  Medication,
  ReplenishmentRecommendation,
  ScenarioComparison,
  StockLot,
  SuggestedTransferPlan,
  TimelineStep,
} from '../types/cofre';
import {
  addDaysISO,
  addDaysToDate,
  daysBetweenDates,
  formatCurrencyBR,
  formatDateBR,
  formatNumberBR,
  toISODate,
} from './formatters';

export interface SimulationOverride {
  branchId: string;
  medicationId: string;
  coverageDays?: number;
  safetyStock?: number;
}

export function isLotExpired(lot: StockLot, now = new Date()): boolean {
  return lot.status === 'vencido' || daysBetweenDates(now, lot.expiryDate) < 0;
}

export function isLotUsable(lot: StockLot, now = new Date()): boolean {
  return lot.status === 'utilizavel' && !isLotExpired(lot, now);
}

export function getLotAvailableQty(lot: StockLot, now = new Date()): number {
  if (!isLotUsable(lot, now)) return 0;
  return Math.max(0, lot.physicalQty - lot.reservedQty);
}

export function getDistanceBetweenBranches(
  branches: Branch[],
  fromBranchId: string,
  toBranchId: string
): { distanceKm: number; transitDays: number; estimatedTransferCost: number | null } | null {
  if (fromBranchId === toBranchId) {
    return { distanceKm: 0, transitDays: 0, estimatedTransferCost: 0 };
  }
  const fromBranch = branches.find((b) => b.id === fromBranchId);
  const found = fromBranch?.distances.find((d) => d.toBranchId === toBranchId);
  if (found) {
    return {
      distanceKm: found.distanceKm,
      transitDays: found.transitDays,
      estimatedTransferCost:
        found.estimatedTransferCost === undefined ? null : found.estimatedTransferCost,
    };
  }
  const toBranch = branches.find((b) => b.id === toBranchId);
  const reverse = toBranch?.distances.find((d) => d.toBranchId === fromBranchId);
  if (reverse) {
    return {
      distanceKm: reverse.distanceKm,
      transitDays: reverse.transitDays,
      estimatedTransferCost:
        reverse.estimatedTransferCost === undefined ? null : reverse.estimatedTransferCost,
    };
  }
  return null;
}

export function calculateBranchMedicationMetrics(
  state: CofreAppState,
  branchId: string,
  medicationId: string,
  now = new Date(),
  override?: SimulationOverride | null
): BranchMedicationMetrics {
  const todayISO = toISODate(now);
  const policy = state.policies.find(
    (p) => p.branchId === branchId && p.medicationId === medicationId
  );

  const periodDays = policy?.periodDays ?? 30;
  const useOverride =
    override && override.branchId === branchId && override.medicationId === medicationId;
  const safetyStock =
    useOverride && override.safetyStock !== undefined
      ? override.safetyStock
      : policy?.safetyStock ?? 5;
  const coverageDays =
    useOverride && override.coverageDays !== undefined
      ? override.coverageDays
      : policy?.coverageDays ?? 7;

  const cutoffStart = addDaysToDate(now, -periodDays);
  cutoffStart.setHours(0, 0, 0, 0);

  const consumptionMovements = state.movements.filter(
    (m) =>
      m.branchId === branchId &&
      m.medicationId === medicationId &&
      m.type === 'saida_consumo' &&
      new Date(m.timestamp) >= cutoffStart
  );
  const consumptionIds = new Set(consumptionMovements.map((m) => m.id));
  const reversedConsumptionQty = state.movements
    .filter(
      (m) =>
        m.branchId === branchId &&
        m.medicationId === medicationId &&
        m.type === 'estorno' &&
        m.reversedMovementId &&
        consumptionIds.has(m.reversedMovementId)
    )
    .reduce((acc, m) => acc + Math.max(0, m.quantityDelta), 0);

  const grossConsumption = consumptionMovements.reduce((acc, m) => acc + m.quantityAbs, 0);
  const netConsumptionPeriod = Math.max(0, grossConsumption - reversedConsumptionQty);
  const hasInsufficientHistory = netConsumptionPeriod <= 0;
  const averageDailyConsumption = periodDays > 0 ? netConsumptionPeriod / periodDays : 0;

  // Daily consumption standard deviation across the lookback window (for Z = 1.65 safety stock memory)
  const dailyTotals = new Array<number>(Math.max(1, periodDays)).fill(0);
  for (const m of consumptionMovements) {
    const dayIdx = Math.min(
      dailyTotals.length - 1,
      Math.max(0, periodDays - 1 - Math.max(0, daysBetweenDates(new Date(m.timestamp), toISODate(now))))
    );
    dailyTotals[dayIdx] += m.quantityAbs;
  }
  const variance =
    dailyTotals.reduce((acc, val) => acc + Math.pow(val - averageDailyConsumption, 2), 0) /
    dailyTotals.length;
  const consumptionStdDev = Number(Math.sqrt(variance).toFixed(2));
  const zScore = 1.65;
  const statisticalSafetyStock = hasInsufficientHistory
    ? 0
    : Math.ceil(zScore * consumptionStdDev * Math.sqrt(2));

  const branchLots = state.lots.filter(
    (l) => l.branchId === branchId && l.medicationId === medicationId
  );

  const usableLots = branchLots
    .filter((l) => isLotUsable(l, now))
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));

  const physicalUsableQty = usableLots.reduce((sum, l) => sum + l.physicalQty, 0);
  const reservedQty = usableLots.reduce((sum, l) => sum + l.reservedQty, 0);
  const availableUsableQty = usableLots.reduce(
    (sum, l) => sum + Math.max(0, l.physicalQty - l.reservedQty),
    0
  );

  const expiredQty = branchLots
    .filter((l) => isLotExpired(l, now))
    .reduce((sum, l) => sum + l.physicalQty, 0);

  const blockedQty = branchLots
    .filter((l) => l.status === 'bloqueado' && !isLotExpired(l, now))
    .reduce((sum, l) => sum + l.physicalQty, 0);

  const totalPhysicalAllLots = branchLots.reduce((sum, l) => sum + l.physicalQty, 0);

  const targetStock = Math.ceil(averageDailyConsumption * coverageDays + safetyStock);
  const reorderPoint = Math.ceil(averageDailyConsumption * 2 + safetyStock);
  const horizonEndISO = addDaysISO(now, Math.max(coverageDays, 7));

  // Real expected arrival date checks (exclude delayed orders from automatic guaranteed arrival!)
  let delayedOrdersCount = 0;

  const confirmedIncomingTransfersQty = state.transfers
    .filter((t) => {
      if (t.destinationBranchId !== branchId || t.medicationId !== medicationId) return false;
      if (t.status !== 'aprovada_reservada' && t.status !== 'expedida') return false;
      if (t.expectedArrivalDate < todayISO) {
        delayedOrdersCount++;
        return false; // Atrasada: não entra como chegada garantida até nova previsão
      }
      return t.expectedArrivalDate <= horizonEndISO;
    })
    .reduce((sum, t) => sum + t.quantity, 0);

  let unconfirmedApprovedPurchasesQty = 0;

  const confirmedIncomingPurchasesQty = state.purchaseRequests
    .filter((pr) => {
      if (pr.branchId !== branchId || pr.medicationId !== medicationId) return false;
      if (pr.status !== 'aprovada' && pr.status !== 'parcialmente_recebida') return false;
      if (pr.pendingQty <= 0) return false;
      if (!pr.supplierConfirmed) {
        unconfirmedApprovedPurchasesQty += pr.pendingQty;
        return false; // Aprovação interna sem confirmação do fornecedor não entra como garantida
      }
      if (pr.expectedArrivalDate < todayISO) {
        delayedOrdersCount++;
        return false; // Pedido atrasado não é tratado como chegada garantida
      }
      return pr.expectedArrivalDate <= addDaysISO(now, Math.max(coverageDays + 3, 10));
    })
    .reduce((sum, pr) => sum + pr.pendingQty, 0);

  const confirmedIncomingTotalQty =
    confirmedIncomingTransfersQty + confirmedIncomingPurchasesQty;

  const netNeedQty = Math.max(
    0,
    targetStock - availableUsableQty - confirmedIncomingTotalQty
  );
  const excessQty = Math.max(0, availableUsableQty - targetStock);

  const nextLotWithStock = usableLots.find((l) => l.physicalQty - l.reservedQty > 0);
  const nextUsableExpiryDate = nextLotWithStock ? nextLotWithStock.expiryDate : null;
  const nextUsableExpiryDays = nextLotWithStock
    ? daysBetweenDates(now, nextLotWithStock.expiryDate)
    : null;

  // Estimate units at risk of expiring before use (FEFO)
  let riskOfExpiryBeforeUseQty = 0;
  let cumulativeDaysConsumed = 0;
  for (const lot of usableLots) {
    const avail = Math.max(0, lot.physicalQty - lot.reservedQty);
    if (avail <= 0) continue;
    const daysLeft = daysBetweenDates(now, lot.expiryDate);
    if (averageDailyConsumption <= 0) {
      if (daysLeft <= 30) riskOfExpiryBeforeUseQty += avail;
      continue;
    }
    const maxConsumableBeforeExpiry = Math.max(
      0,
      Math.floor((daysLeft - cumulativeDaysConsumed) * averageDailyConsumption)
    );
    if (avail > maxConsumableBeforeExpiry) {
      riskOfExpiryBeforeUseQty += avail - maxConsumableBeforeExpiry;
      cumulativeDaysConsumed += maxConsumableBeforeExpiry / averageDailyConsumption;
    } else {
      cumulativeDaysConsumed += avail / averageDailyConsumption;
    }
  }

  const daysUntilStockout =
    averageDailyConsumption > 0 ? availableUsableQty / averageDailyConsumption : null;
  const estimatedStockoutDate =
    daysUntilStockout !== null ? addDaysISO(now, Math.floor(daysUntilStockout)) : null;

  return {
    branchId,
    medicationId,
    periodDays,
    netConsumptionPeriod,
    hasInsufficientHistory,
    averageDailyConsumption,
    consumptionStdDev,
    zScore,
    statisticalSafetyStock,
    reorderPoint,
    physicalUsableQty,
    reservedQty,
    blockedQty,
    expiredQty,
    totalPhysicalAllLots,
    availableUsableQty,
    safetyStock,
    coverageDays,
    targetStock,
    confirmedIncomingTransfersQty,
    confirmedIncomingPurchasesQty,
    unconfirmedApprovedPurchasesQty,
    delayedOrdersCount,
    confirmedIncomingTotalQty,
    netNeedQty,
    excessQty,
    nextUsableExpiryDate,
    nextUsableExpiryDays,
    riskOfExpiryBeforeUseQty,
    estimatedStockoutDate,
    daysUntilStockout,
  };
}

export const ANNUAL_CARRYING_RATE = 0.15;
export const DAILY_STOCKOUT_PENALTY_BRL = 2000;
export const MAX_COMPARISON_LEAD_TIME_DAYS = 10;

export function evaluateSupplierOffers(
  state: CofreAppState,
  medicationId: string,
  purchaseQty: number,
  coverageDays: number,
  daysUntilStockoutBeforePurchase: number | null,
  now = new Date()
): { evaluated: EvaluatedSupplierOffer[]; best: EvaluatedSupplierOffer | null } {
  const offers = state.supplierOffers.filter((o) => o.medicationId === medicationId);

  const preliminary: EvaluatedSupplierOffer[] = offers.map((offer) => {
    const expectedArrivalDate = addDaysISO(now, offer.leadTimeDays);
    const excludedByLeadTime = offer.leadTimeDays > MAX_COMPARISON_LEAD_TIME_DAYS;

    if (purchaseQty <= 0) {
      const shelfDays = daysBetweenDates(now, offer.lotExpiryDate);
      const hasShelf = shelfDays > offer.leadTimeDays + coverageDays;
      const hasStock = offer.availableQty > 0;
      const issues: string[] = [];
      if (excludedByLeadTime) {
        issues.push(`Prazo acima de ${MAX_COMPARISON_LEAD_TIME_DAYS} dias (fora da comparação)`);
      }
      if (!hasStock) issues.push('Estoque do fornecedor zerado');
      if (!hasShelf) issues.push(`Validade insuficiente (${shelfDays} dias)`);
      return {
        offer,
        effectiveOrderQty: 0,
        excessOverNeedQty: 0,
        excessValue: 0,
        totalCost: 0,
        carryingCost: 0,
        stockoutRiskDays: 0,
        stockoutRiskCost: 0,
        economicTotalCost: 0,
        excludedByLeadTime,
        expectedArrivalDate,
        isWithinStock: hasStock,
        hasSufficientShelfLife: hasShelf,
        arrivesBeforeStockout: true,
        isViable: !excludedByLeadTime && hasStock && hasShelf,
        viabilityIssues: issues,
        isBestChoice: false,
      };
    }

    const baseQty = Math.max(purchaseQty, offer.minOrderQty);
    const multiple = Math.max(1, offer.packMultiple);
    const effectiveOrderQty = Math.ceil(baseQty / multiple) * multiple;
    const excessOverNeedQty = effectiveOrderQty - purchaseQty;
    const excessValue = excessOverNeedQty * offer.pricePerBox;
    const merchandiseSubtotal = effectiveOrderQty * offer.pricePerBox;
    const totalCost = merchandiseSubtotal + offer.freightCost;
    const carryingCost = Math.round(
      merchandiseSubtotal * ANNUAL_CARRYING_RATE * (Math.max(coverageDays, 7) / 365)
    );

    const isWithinStock = offer.availableQty >= effectiveOrderQty;
    const shelfDays = daysBetweenDates(now, offer.lotExpiryDate);
    const hasSufficientShelfLife = shelfDays >= offer.leadTimeDays + coverageDays + 15;
    const arrivesBeforeStockout =
      daysUntilStockoutBeforePurchase === null ||
      offer.leadTimeDays <= Math.ceil(daysUntilStockoutBeforePurchase);

    const stockoutRiskDays =
      daysUntilStockoutBeforePurchase === null
        ? 0
        : Math.max(0, offer.leadTimeDays - Math.floor(daysUntilStockoutBeforePurchase));
    const stockoutRiskCost = stockoutRiskDays * DAILY_STOCKOUT_PENALTY_BRL;
    const economicTotalCost = totalCost + carryingCost + stockoutRiskCost;

    const viabilityIssues: string[] = [];
    if (excludedByLeadTime) {
      viabilityIssues.push(
        `Prazo de ${offer.leadTimeDays} dias excede o limite de ${MAX_COMPARISON_LEAD_TIME_DAYS} dias (fora da comparação principal)`
      );
    }
    if (!isWithinStock) {
      viabilityIssues.push(
        `Estoque insuficiente (${offer.availableQty} disp. < ${effectiveOrderQty} exigidas)`
      );
    }
    if (!hasSufficientShelfLife) {
      viabilityIssues.push(
        `Validade insuficiente (${shelfDays} dias para prazo de ${offer.leadTimeDays}d + cobertura de ${coverageDays}d)`
      );
    }
    if (!arrivesBeforeStockout) {
      viabilityIssues.push(
        `Chegada após ruptura (${offer.leadTimeDays}d > ${formatNumberBR(
          daysUntilStockoutBeforePurchase ?? 0,
          1
        )}d de estoque · risco de ${stockoutRiskDays} dia(s) = ${formatCurrencyBR(stockoutRiskCost)})`
      );
    }

    const isViable =
      !excludedByLeadTime && isWithinStock && hasSufficientShelfLife && arrivesBeforeStockout;

    return {
      offer,
      effectiveOrderQty,
      excessOverNeedQty,
      excessValue,
      totalCost,
      carryingCost,
      stockoutRiskDays,
      stockoutRiskCost,
      economicTotalCost,
      excludedByLeadTime,
      expectedArrivalDate,
      isWithinStock,
      hasSufficientShelfLife,
      arrivesBeforeStockout,
      isViable,
      viabilityIssues,
      isBestChoice: false,
    };
  });

  const sorted = [...preliminary].sort((a, b) => {
    if (a.excludedByLeadTime !== b.excludedByLeadTime) return a.excludedByLeadTime ? 1 : -1;
    if (a.isViable !== b.isViable) return a.isViable ? -1 : 1;
    if (a.economicTotalCost !== b.economicTotalCost) return a.economicTotalCost - b.economicTotalCost;
    if (a.totalCost !== b.totalCost) return a.totalCost - b.totalCost;
    return a.offer.leadTimeDays - b.offer.leadTimeDays;
  });

  // CRITICAL RULE 1: Never select an unviable offer as best!
  let best: EvaluatedSupplierOffer | null = null;
  if (purchaseQty > 0) {
    const viableBest = sorted.find((s) => s.isViable) ?? null;
    if (viableBest) {
      viableBest.isBestChoice = true;
      best = viableBest;
    }
  }

  return { evaluated: sorted, best };
}

interface TimelineLot {
  qty: number;
  expiryDayOffset: number;
}

interface TimelineArrival {
  dayOffset: number;
  qty: number;
  expiryDayOffset: number;
  label: string;
}

export function simulateChronologicalTimeline(
  initialLots: TimelineLot[],
  arrivals: TimelineArrival[],
  dailyConsumption: number,
  horizonDays: number,
  now = new Date()
): {
  steps: TimelineStep[];
  firstStockoutDate: string | null;
  uncoveredQty: number;
  balanceEndOfHorizon: number;
} {
  // Deep copy lots sorted FEFO
  let pool: TimelineLot[] = initialLots
    .filter((l) => l.qty > 0)
    .map((l) => ({ ...l }))
    .sort((a, b) => a.expiryDayOffset - b.expiryDayOffset);

  const steps: TimelineStep[] = [];
  let firstStockoutDate: string | null = null;
  let uncoveredQty = 0;

  for (let d = 0; d <= horizonDays; d++) {
    const dateISO = addDaysISO(now, d);
    let eventDelta = 0;
    let expiredDelta = 0;
    const dayLabels: string[] = [];

    // 1. Expire lots past expiryDayOffset
    const stillValid: TimelineLot[] = [];
    for (const l of pool) {
      if (l.expiryDayOffset < d) {
        expiredDelta += l.qty;
      } else {
        stillValid.push(l);
      }
    }
    pool = stillValid;
    if (expiredDelta > 0) {
      dayLabels.push(`Vencimento (-${expiredDelta})`);
    }

    // 2. Process arrivals scheduled for day d
    const todayArrivals = arrivals.filter((a) => a.dayOffset === d);
    for (const arr of todayArrivals) {
      if (arr.qty > 0) {
        pool.push({ qty: arr.qty, expiryDayOffset: arr.expiryDayOffset });
        eventDelta += arr.qty;
        dayLabels.push(`${arr.label} (+${arr.qty})`);
      }
    }
    pool.sort((a, b) => a.expiryDayOffset - b.expiryDayOffset);

    // 3. Deduct consumption for day d (from day 1..horizonDays, or day 0 if d>0)
    let consumptionDelta = 0;
    let stockoutGapToday = 0;
    if (d > 0 && dailyConsumption > 0) {
      let toConsume = dailyConsumption;
      for (const l of pool) {
        if (toConsume <= 0) break;
        if (l.qty <= 0) continue;
        const used = Math.min(l.qty, toConsume);
        l.qty -= used;
        toConsume -= used;
        consumptionDelta += used;
      }
      if (toConsume > 1e-6) {
        stockoutGapToday = toConsume;
        uncoveredQty += toConsume;
        if (!firstStockoutDate) {
          firstStockoutDate = dateISO;
        }
        dayLabels.push(`Ruptura (-${formatNumberBR(toConsume, 2)})`);
      }
    }

    const totalAvail = pool.reduce((sum, l) => sum + l.qty, 0);

    // Record key steps (day 0, event days, stockout days, last day)
    if (d === 0 || d === horizonDays || eventDelta > 0 || expiredDelta > 0 || stockoutGapToday > 0) {
      steps.push({
        dayOffset: d,
        dateISO,
        label:
          dayLabels.length > 0
            ? dayLabels.join(' · ')
            : d === 0
            ? 'Saldo inicial disponível'
            : `Fim do horizonte (${d}d)`,
        eventDelta,
        consumptionDelta: Number(consumptionDelta.toFixed(2)),
        expiredDelta,
        projectedBalance: Number(totalAvail.toFixed(2)),
        stockoutGapToday: Number(stockoutGapToday.toFixed(2)),
      });
    }
  }

  const lastBal = pool.reduce((sum, l) => sum + l.qty, 0);
  return {
    steps,
    firstStockoutDate,
    uncoveredQty: Math.ceil(uncoveredQty),
    balanceEndOfHorizon: Number(lastBal.toFixed(2)),
  };
}

export function computeAllRecommendations(
  state: CofreAppState,
  now = new Date(),
  override?: SimulationOverride | null
): ReplenishmentRecommendation[] {
  const todayISO = toISODate(now);
  const metricsMap = new Map<string, BranchMedicationMetrics>();

  for (const branch of state.branches) {
    for (const med of state.medications) {
      const m = calculateBranchMedicationMetrics(state, branch.id, med.id, now, override);
      metricsMap.set(`${branch.id}::${med.id}`, m);
    }
  }

  const virtualLotAllocated = new Map<string, number>();
  const virtualOriginExcessUsed = new Map<string, number>();
  // Track already suggested incoming lots per destination to prevent double-counting consumption capacity!
  const virtualDestIncomingLots = new Map<string, { qty: number; expiryDate: string }[]>();

  const results: ReplenishmentRecommendation[] = [];

  for (const med of state.medications) {
    const branchPairs = state.branches
      .map((b) => ({
        branch: b,
        metrics: metricsMap.get(`${b.id}::${med.id}`)!,
      }))
      .sort((a, b) => {
        const aDays = a.metrics.daysUntilStockout ?? 9999;
        const bDays = b.metrics.daysUntilStockout ?? 9999;
        return aDays - bDays;
      });

    for (const { branch, metrics } of branchPairs) {
      const suggestedTransfers: SuggestedTransferPlan[] = [];
      let remainingNeed = metrics.netNeedQty;

      // Confirmed incoming transfers + confirmed purchases already heading to this branch
      const confirmedTransferLots = state.transfers
        .filter(
          (t) =>
            t.destinationBranchId === branch.id &&
            t.medicationId === med.id &&
            (t.status === 'aprovada_reservada' || t.status === 'expedida') &&
            t.expectedArrivalDate >= todayISO
        )
        .map((t) => ({ qty: t.quantity, expiryDate: t.lotExpiryDate }));

      if (remainingNeed > 0) {
        const candidates = state.branches
          .filter((orig) => orig.id !== branch.id)
          .map((orig) => ({
            orig,
            dist: getDistanceBetweenBranches(state.branches, orig.id, branch.id),
            origMetrics: metricsMap.get(`${orig.id}::${med.id}`)!,
          }))
          .filter((c) => c.dist !== null)
          .sort((a, b) => a.dist!.distanceKm - b.dist!.distanceKm);

        for (const { orig, dist, origMetrics } of candidates) {
          if (remainingNeed <= 0 || !dist) break;

          const originKey = `${orig.id}::${med.id}`;
          const alreadyAllocatedFromOrigin = virtualOriginExcessUsed.get(originKey) ?? 0;
          const originExcessRemaining = Math.max(
            0,
            origMetrics.excessQty - alreadyAllocatedFromOrigin
          );
          if (originExcessRemaining <= 0) continue;

          const originLots = state.lots
            .filter(
              (l) => l.branchId === orig.id && l.medicationId === med.id && isLotUsable(l, now)
            )
            .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));

          const destLots = state.lots.filter(
            (l) => l.branchId === branch.id && l.medicationId === med.id && isLotUsable(l, now)
          );
          const destKey = `${branch.id}::${med.id}`;
          const prevSuggestedDestLots = virtualDestIncomingLots.get(destKey) ?? [];

          let originBranchUsedNow = 0;

          for (const lot of originLots) {
            if (remainingNeed <= 0) break;
            const availLot = Math.max(
              0,
              lot.physicalQty - lot.reservedQty - (virtualLotAllocated.get(lot.id) ?? 0)
            );
            if (availLot <= 0) continue;

            const daysUntilLotExpiry = daysBetweenDates(now, lot.expiryDate);
            const remainingDaysAfterTransit = daysUntilLotExpiry - dist.transitDays;

            // Combined FEFO capacity: subtract existing destination lots AND confirmed/already-suggested incoming lots expiring on or before this lot!
            let maxConsumableBeforeExpiry = 0;
            if (remainingDaysAfterTransit > 0 && metrics.averageDailyConsumption > 0) {
              const earlierLocalStock = destLots
                .filter((dl) => dl.expiryDate <= lot.expiryDate)
                .reduce((sum, dl) => sum + Math.max(0, dl.physicalQty - dl.reservedQty), 0);
              const earlierConfirmedIncoming = confirmedTransferLots
                .filter((cl) => cl.expiryDate <= lot.expiryDate)
                .reduce((sum, cl) => sum + cl.qty, 0);
              const earlierSuggestedIncoming = prevSuggestedDestLots
                .filter((sl) => sl.expiryDate <= lot.expiryDate)
                .reduce((sum, sl) => sum + sl.qty, 0);

              const totalEarlierStock =
                earlierLocalStock + earlierConfirmedIncoming + earlierSuggestedIncoming;
              const totalCapacityInWindow =
                remainingDaysAfterTransit * metrics.averageDailyConsumption;
              maxConsumableBeforeExpiry = Math.max(
                0,
                Math.floor(totalCapacityInWindow - totalEarlierStock)
              );
            }

            const canConsumeBeforeExpiry = maxConsumableBeforeExpiry > 0;
            const maxOriginFromPool = originExcessRemaining - originBranchUsedNow;
            const qtyToTake = Math.min(
              remainingNeed,
              maxOriginFromPool,
              availLot,
              maxConsumableBeforeExpiry
            );

            if (qtyToTake > 0) {
              suggestedTransfers.push({
                originBranchId: orig.id,
                originBranchName: orig.name,
                distanceKm: dist.distanceKm,
                transitDays: dist.transitDays,
                estimatedTransferCost: dist.estimatedTransferCost,
                expectedArrivalDate: addDaysISO(now, dist.transitDays),
                lotId: lot.id,
                lotCode: lot.lotCode,
                lotExpiryDate: lot.expiryDate,
                daysUntilLotExpiry,
                suggestedQty: qtyToTake,
                originBalanceBefore: origMetrics.availableUsableQty - alreadyAllocatedFromOrigin,
                originBalanceAfterDispatch:
                  origMetrics.availableUsableQty - alreadyAllocatedFromOrigin - qtyToTake,
                originTargetStock: origMetrics.targetStock,
                canConsumeBeforeExpiry,
                maxConsumableBeforeExpiry,
              });

              remainingNeed -= qtyToTake;
              originBranchUsedNow += qtyToTake;
              virtualLotAllocated.set(
                lot.id,
                (virtualLotAllocated.get(lot.id) ?? 0) + qtyToTake
              );
              virtualOriginExcessUsed.set(
                originKey,
                (virtualOriginExcessUsed.get(originKey) ?? 0) + qtyToTake
              );
              virtualDestIncomingLots.set(destKey, [
                ...prevSuggestedDestLots,
                { qty: qtyToTake, expiryDate: lot.expiryDate },
              ]);
            }
          }
        }
      }

      const totalSuggestedTransferQty = suggestedTransfers.reduce(
        (sum, t) => sum + t.suggestedQty,
        0
      );
      const remainingPurchaseQty = Math.max(0, metrics.netNeedQty - totalSuggestedTransferQty);

      const guaranteedStockBeforeHypothesis =
        metrics.availableUsableQty + metrics.confirmedIncomingTotalQty;

      const daysUntilStockoutBeforePurchase =
        metrics.averageDailyConsumption > 0
          ? guaranteedStockBeforeHypothesis / metrics.averageDailyConsumption
          : null;

      const { evaluated: supplierComparison, best: bestSupplier } = evaluateSupplierOffers(
        state,
        med.id,
        remainingPurchaseQty,
        metrics.coverageDays,
        daysUntilStockoutBeforePurchase,
        now
      );

      // CRITICAL RULE 2: Projections use EFFECTIVE purchase quantity (not just remaining need!)
      const effectivePurchaseQty =
        remainingPurchaseQty > 0
          ? bestSupplier
            ? bestSupplier.effectiveOrderQty
            : remainingPurchaseQty
          : 0;

      const supplierExcessQty =
        remainingPurchaseQty > 0 && bestSupplier ? bestSupplier.excessOverNeedQty : 0;
      const supplierExcessValue =
        remainingPurchaseQty > 0 && bestSupplier ? bestSupplier.excessValue : 0;

      const projectedBalanceWithoutConsumption =
        metrics.availableUsableQty +
        metrics.confirmedIncomingTotalQty +
        totalSuggestedTransferQty +
        effectivePurchaseQty;

      // Chronological timeline simulation (discounting consumption between events!)
      const destUsableLots: TimelineLot[] = state.lots
        .filter((l) => l.branchId === branch.id && l.medicationId === med.id && isLotUsable(l, now))
        .map((l) => ({
          qty: Math.max(0, l.physicalQty - l.reservedQty),
          expiryDayOffset: daysBetweenDates(now, l.expiryDate),
        }));

      const arrivals: TimelineArrival[] = [];

      for (const trf of state.transfers) {
        if (
          trf.destinationBranchId === branch.id &&
          trf.medicationId === med.id &&
          (trf.status === 'aprovada_reservada' || trf.status === 'expedida') &&
          trf.expectedArrivalDate >= todayISO
        ) {
          arrivals.push({
            dayOffset: Math.max(0, daysBetweenDates(now, trf.expectedArrivalDate)),
            qty: trf.quantity,
            expiryDayOffset: daysBetweenDates(now, trf.lotExpiryDate),
            label: `Transf. ${trf.code}`,
          });
        }
      }

      for (const pr of state.purchaseRequests) {
        if (
          pr.branchId === branch.id &&
          pr.medicationId === med.id &&
          (pr.status === 'aprovada' || pr.status === 'parcialmente_recebida') &&
          pr.supplierConfirmed &&
          pr.pendingQty > 0 &&
          pr.expectedArrivalDate >= todayISO
        ) {
          arrivals.push({
            dayOffset: Math.max(0, daysBetweenDates(now, pr.expectedArrivalDate)),
            qty: pr.pendingQty,
            expiryDayOffset: 180,
            label: `Compra ${pr.code}`,
          });
        }
      }

      for (const st of suggestedTransfers) {
        arrivals.push({
          dayOffset: Math.max(0, st.transitDays),
          qty: st.suggestedQty,
          expiryDayOffset: st.daysUntilLotExpiry,
          label: `Transf. sugerida (${st.originBranchName})`,
        });
      }

      if (remainingPurchaseQty > 0 && bestSupplier) {
        arrivals.push({
          dayOffset: Math.max(0, bestSupplier.offer.leadTimeDays),
          qty: bestSupplier.effectiveOrderQty,
          expiryDayOffset: daysBetweenDates(now, bestSupplier.offer.lotExpiryDate),
          label: `Compra sugerida (${bestSupplier.offer.supplierName.split(' —')[0]})`,
        });
      }

      const maxArrivalDay =
        arrivals.length > 0 ? Math.max(...arrivals.map((a) => a.dayOffset)) : 0;
      const horizonDays = Math.max(metrics.coverageDays, maxArrivalDay + 2);

      const timelineRes = simulateChronologicalTimeline(
        destUsableLots,
        arrivals,
        metrics.averageDailyConsumption,
        horizonDays,
        now
      );

      const earliestArrivalDate =
        arrivals.length > 0
          ? addDaysISO(now, Math.min(...arrivals.map((a) => a.dayOffset)))
          : null;

      // Also evaluate scenario comparison: Direct Purchase (no redistribution) vs Transfer + Complementary Purchase
      const directEval = evaluateSupplierOffers(
        state,
        med.id,
        metrics.netNeedQty,
        metrics.coverageDays,
        metrics.daysUntilStockout,
        now
      );
      const purchaseOnlyOffer = directEval.best;
      const purchaseOnlyQty = purchaseOnlyOffer
        ? purchaseOnlyOffer.effectiveOrderQty
        : metrics.netNeedQty;
      const purchaseOnlyTotalCost = purchaseOnlyOffer ? purchaseOnlyOffer.totalCost : 0;
      const purchaseOnlyFreight = purchaseOnlyOffer ? purchaseOnlyOffer.offer.freightCost : 0;
      const purchaseOnlyExcessQty = purchaseOnlyOffer ? purchaseOnlyOffer.excessOverNeedQty : 0;
      const purchaseOnlyExcessValue = purchaseOnlyOffer ? purchaseOnlyOffer.excessValue : 0;

      const transferCostKnown = suggestedTransfers.every(
        (t) => t.estimatedTransferCost !== null
      );
      const transferCostTotal = transferCostKnown
        ? suggestedTransfers.reduce((sum, t) => sum + (t.estimatedTransferCost ?? 0), 0)
        : 0;

      const compPurchaseCost =
        remainingPurchaseQty > 0 && bestSupplier ? bestSupplier.totalCost : 0;
      const compPurchaseFreight =
        remainingPurchaseQty > 0 && bestSupplier ? bestSupplier.offer.freightCost : 0;

      const transferPlusPurchaseTotalCost =
        compPurchaseCost + (transferCostKnown ? transferCostTotal : 0);

      const estimatedSavings =
        purchaseOnlyOffer && transferCostKnown
          ? purchaseOnlyTotalCost - transferPlusPurchaseTotalCost
          : null;

      // Potential loss avoided on expiring excess rescued by transfers
      const potentialExpiryLossAvoided = suggestedTransfers.reduce((sum, t) => {
        if (t.daysUntilLotExpiry <= 30) {
          return sum + t.suggestedQty * med.unitCostReference;
        }
        return sum;
      }, 0);

      const scenarioComparison: ScenarioComparison = {
        purchaseOnlyOffer,
        purchaseOnlyQty,
        purchaseOnlyTotalCost,
        purchaseOnlyFreight,
        purchaseOnlyExcessQty,
        purchaseOnlyExcessValue,
        transferPlusPurchaseTotalCost,
        transferPlusPurchaseFreight: compPurchaseFreight,
        transferCostKnown,
        transferCostTotal,
        transferPlusPurchaseExcessQty: supplierExcessQty,
        transferPlusPurchaseExcessValue: supplierExcessValue,
        estimatedSavings,
        potentialExpiryLossAvoided,
      };

      const blockedLotsHere = state.lots.filter(
        (l) =>
          l.branchId === branch.id &&
          l.medicationId === med.id &&
          l.status === 'bloqueado' &&
          l.physicalQty > 0
      );

      const explanation = buildFullExplanation(
        branch,
        med,
        metrics,
        suggestedTransfers,
        totalSuggestedTransferQty,
        remainingPurchaseQty,
        effectivePurchaseQty,
        supplierExcessQty,
        supplierExcessValue,
        supplierComparison,
        bestSupplier,
        timelineRes,
        earliestArrivalDate,
        scenarioComparison,
        blockedLotsHere,
        now
      );

      results.push({
        branchId: branch.id,
        medicationId: med.id,
        metrics,
        suggestedTransfers,
        totalSuggestedTransferQty,
        remainingPurchaseQty,
        effectivePurchaseQty,
        supplierExcessQty,
        supplierExcessValue,
        projectedBalanceWithoutConsumption,
        projectedTimeline: timelineRes.steps,
        projectedBalanceEndOfHorizon: timelineRes.balanceEndOfHorizon,
        stockoutRiskBeforeArrival: {
          hasRisk: timelineRes.uncoveredQty > 0,
          estimatedStockoutDate: timelineRes.firstStockoutDate,
          uncoveredQty: timelineRes.uncoveredQty,
          earliestArrivalDate,
        },
        supplierComparison,
        bestSupplier,
        scenarioComparison,
        explanation,
      });
    }
  }

  return results;
}

function buildFullExplanation(
  branch: Branch,
  med: Medication,
  metrics: BranchMedicationMetrics,
  transfers: SuggestedTransferPlan[],
  totalTransfer: number,
  remainingPurchase: number,
  effectivePurchaseQty: number,
  supplierExcessQty: number,
  supplierExcessValue: number,
  allSuppliers: EvaluatedSupplierOffer[],
  bestSupplier: EvaluatedSupplierOffer | null,
  timelineRes: {
    firstStockoutDate: string | null;
    uncoveredQty: number;
    balanceEndOfHorizon: number;
  },
  earliestArrivalDate: string | null,
  scenarioComparison: ScenarioComparison,
  blockedLotsHere: StockLot[],
  now: Date
) {
  const cmdStr = formatNumberBR(metrics.averageDailyConsumption, 2);
  const formulaBreakdown = [
    `Consumo médio diário (CMD) = ${metrics.netConsumptionPeriod} ${med.controlUnit}(s) ÷ ${metrics.periodDays} dias = ${cmdStr} ${med.controlUnit}/dia (desvio padrão diário: ${formatNumberBR(metrics.consumptionStdDev, 2)})`,
    `Estoque de segurança = ${metrics.safetyStock} ${med.controlUnit}(s) na política (ref. estatística Z = ${formatNumberBR(metrics.zScore, 2)}: ${metrics.statisticalSafetyStock}) · Ponto de pedido = ${metrics.reorderPoint}`,
    `Estoque-alvo = (${cmdStr} × ${metrics.coverageDays}d cobertura) + ${metrics.safetyStock} (segurança) = ${metrics.targetStock} ${med.controlUnit}(s)`,
    `Saldo utilizável FEFO = ${metrics.physicalUsableQty} físico − ${metrics.reservedQty} reservado = ${metrics.availableUsableQty} (bloqueado: ${metrics.blockedQty}, vencido: ${metrics.expiredQty})`,
    `Entradas garantidas (confirmadas e no prazo) = ${metrics.confirmedIncomingTotalQty} ${med.controlUnit}(s)`,
    `Necessidade líquida = máx(0; ${metrics.targetStock} − ${metrics.availableUsableQty} − ${metrics.confirmedIncomingTotalQty}) = ${metrics.netNeedQty} ${med.controlUnit}(s)`,
    `Divisão: ${totalTransfer} ${med.controlUnit}(s) por transferência + ${remainingPurchase} ${med.controlUnit}(s) por compra (efetiva fornecedor: ${effectivePurchaseQty})`,
  ];

  const whyActNow = metrics.hasInsufficientHistory
    ? `Atenção: não há consumo registrado nos últimos ${metrics.periodDays} dias para ${med.name} na ${branch.name}. O cálculo automático não possui base estatística confiável; avalie política manual justificada.`
    : metrics.netNeedQty === 0
    ? `A ${branch.name} atende atualmente o estoque-alvo de ${metrics.targetStock} ${med.controlUnit}(s) com ${metrics.availableUsableQty} disponíveis e ${metrics.confirmedIncomingTotalQty} entradas confirmadas.`
    : `O saldo utilizável (${metrics.availableUsableQty}) está abaixo do alvo (${metrics.targetStock}) ao ritmo de ${cmdStr} ${med.controlUnit}/dia.${
        metrics.estimatedStockoutDate
          ? ` Sem reposição, a ruptura estimada ocorre em ${formatDateBR(
              metrics.estimatedStockoutDate
            )}.`
          : ''
      }`;

  const howMuchTransferAndBuy =
    metrics.netNeedQty === 0
      ? 'Necessidade líquida igual a zero: 0 para transferir e 0 para comprar.'
      : transfers.length > 0
      ? `${totalTransfer} ${med.controlUnit}(s) por transferência da ${transfers[0].originBranchName} + ${remainingPurchase} ${med.controlUnit}(s) por compra${
          effectivePurchaseQty !== remainingPurchase
            ? ` (compra efetiva de ${effectivePurchaseQty} devido ao pedido mínimo/múltiplo do fornecedor)`
            : ''
        }.`
      : `0 por transferência + ${remainingPurchase} ${med.controlUnit}(s) por compra${
          effectivePurchaseQty !== remainingPurchase
            ? ` (compra efetiva de ${effectivePurchaseQty} por pedido mínimo/múltiplo)`
            : ''
        }.`;

  let whichBranchAndSupplier = '';
  if (transfers.length > 0) {
    const t = transfers[0];
    whichBranchAndSupplier += `Transferência sugerida da ${t.originBranchName} (${t.distanceKm} km, lote ${t.lotCode} com validade ${formatDateBR(
      t.lotExpiryDate
    )}). `;
  } else if (metrics.netNeedQty > 0) {
    whichBranchAndSupplier += 'Nenhuma filial possui excedente aproveitável antes da validade. ';
  }

  if (remainingPurchase > 0) {
    if (bestSupplier) {
      whichBranchAndSupplier += `Fornecedor selecionado pelo menor custo econômico total: ${bestSupplier.offer.supplierName} (${formatCurrencyBR(
        bestSupplier.economicTotalCost
      )}, sendo ${formatCurrencyBR(bestSupplier.totalCost)} compra+frete e ${formatCurrencyBR(
        bestSupplier.carryingCost
      )} carregamento; entrega em ${bestSupplier.offer.leadTimeDays}d). Condições de pagamento (${
        bestSupplier.offer.paymentTerms
      }) são apenas informativas.`;
    } else if (allSuppliers.length > 0) {
      whichBranchAndSupplier +=
        'Nenhum fornecedor atende às condições atuais (bloqueado para compra normal; exige exceção justificada do gestor).';
    } else {
      whichBranchAndSupplier += 'Sem ofertas de fornecedor cadastradas.';
    }
  }

  const whenArrives =
    earliestArrivalDate !== null
      ? `Primeira chegada prevista em ${formatDateBR(earliestArrivalDate)}${
          bestSupplier && remainingPurchase > 0
            ? ` e compra complementar prevista para ${formatDateBR(
                bestSupplier.expectedArrivalDate
              )}`
            : ''
        }.`
      : 'Sem entregas programadas ou sugeridas.';

  const stockoutBeforeArrival =
    timelineRes.uncoveredQty > 0
      ? `Sim: há risco de falta antes da chegada a partir de ${formatDateBR(
          timelineRes.firstStockoutDate
        )}, com demanda descoberta estimada de ${timelineRes.uncoveredQty} ${med.controlUnit}(s).`
      : 'Não há falta projetada antes das chegadas previstas na linha do tempo atual.';

  const excessCreated =
    supplierExcessQty > 0
      ? `Sim: o pedido mínimo/múltiplo gera ${supplierExcessQty} ${med.controlUnit}(s) excedente(s), equivalente a ${formatCurrencyBR(
          supplierExcessValue
        )} de capital adicional em estoque.`
      : 'Nenhum excedente adicional será gerado por pedido mínimo ou múltiplo.';

  const expiryRisk =
    metrics.riskOfExpiryBeforeUseQty > 0
      ? `Há ${metrics.riskOfExpiryBeforeUseQty} ${med.controlUnit}(s) locais com risco de vencer antes do consumo.`
      : transfers.some((t) => t.daysUntilLotExpiry <= 30)
      ? `O lote transferido vence em breve (${transfers[0].daysUntilLotExpiry} dias), mas será consumido dentro da validade e evita perda estimada de ${formatCurrencyBR(
          scenarioComparison.potentialExpiryLossAvoided
        )}.`
      : 'Sem risco iminente de vencimento nos lotes utilizáveis desta filial.';

  const missingParts: string[] = [];
  if (metrics.hasInsufficientHistory) missingParts.push('histórico de consumo suficiente');
  if (metrics.unconfirmedApprovedPurchasesQty > 0) {
    missingParts.push(
      `confirmação de fornecedor para ${metrics.unconfirmedApprovedPurchasesQty} unid. aprovadas internamente`
    );
  }
  if (metrics.delayedOrdersCount > 0) {
    missingParts.push(
      `revisão de previsão para ${metrics.delayedOrdersCount} pedido(s) atrasado(s)`
    );
  }
  if (!scenarioComparison.transferCostKnown && totalTransfer > 0) {
    missingParts.push('custo estimado de transporte entre filiais (não cadastrado)');
  }
  const missingDataOrConfirmations =
    missingParts.length > 0
      ? `Pendências identificadas: ${missingParts.join('; ')}.`
      : 'Todos os parâmetros operacionais necessários para esta análise estão preenchidos.';

  // Plain-language deterministic explanation (for display & optional AI rewrite)
  const blockedNote =
    blockedLotsHere.length > 0
      ? ` Lote ${blockedLotsHere[0].lotCode} possui saldo real de ${blockedLotsHere[0].physicalQty} ${med.controlUnit}(s), validade restante de ${Math.max(
          0,
          daysBetweenDates(now, blockedLotsHere[0].expiryDate)
        )} dia(s) e está em quarentena (fora do saldo útil).`
      : '';

  const plainSummary =
    metrics.netNeedQty === 0
      ? `Na ${branch.name}, o saldo útil FEFO de ${metrics.availableUsableQty} ${med.controlUnit}(s) atende ao estoque-alvo de ${metrics.targetStock} ${med.controlUnit}(s) (consumo de ${cmdStr}/dia e segurança de ${metrics.safetyStock} com referência Z = 1,65). Não é necessário transferir nem comprar agora.${blockedNote}`
      : `Na ${branch.name}, o consumo é de ${cmdStr} ${med.controlUnit}/dia e o estoque de segurança é de ${metrics.safetyStock} ${med.controlUnit}(s) (Z = 1,65), definindo estoque-alvo de ${metrics.targetStock} ${med.controlUnit}(s). Com saldo útil FEFO de ${metrics.availableUsableQty} ${med.controlUnit}(s) e ${metrics.confirmedIncomingTotalQty} entrada(s) confirmada(s), falta repor ${metrics.netNeedQty} ${med.controlUnit}(s): ${howMuchTransferAndBuy} ${
          bestSupplier
            ? `Melhor opção de compra: ${bestSupplier.offer.supplierName}, com custo econômico total de ${formatCurrencyBR(
                bestSupplier.economicTotalCost
              )} (entrega em ${bestSupplier.offer.leadTimeDays} dias).`
            : 'Nenhum fornecedor atende às condições atuais.'
        }${blockedNote}`;

  return {
    whyActNow,
    howMuchTransferAndBuy,
    whichBranchAndSupplier,
    whenArrives,
    stockoutBeforeArrival,
    excessCreated,
    expiryRisk,
    missingDataOrConfirmations,
    formulaBreakdown,
    plainSummary,
  };
}

export interface BranchNeedMatch {
  branch: Branch;
  distanceKm: number;
  transitDays: number;
  metrics: BranchMedicationMetrics;
  netNeedQty: number;
  maxConsumableBeforeExpiry: number;
  suggestedTransferQty: number;
  eligible: boolean;
  reasonIfIneligible?: string;
}

export function findBranchesNeedingLot(
  state: CofreAppState,
  sourceLot: StockLot,
  now = new Date()
): BranchNeedMatch[] {
  const todayISO = toISODate(now);
  const daysUntilExpiry = daysBetweenDates(now, sourceLot.expiryDate);
  const availableInLot = getLotAvailableQty(sourceLot, now);
  const matches: BranchNeedMatch[] = [];

  for (const branch of state.branches) {
    if (branch.id === sourceLot.branchId) continue;

    const dist = getDistanceBetweenBranches(state.branches, sourceLot.branchId, branch.id);
    if (!dist) continue;

    const metrics = calculateBranchMedicationMetrics(
      state,
      branch.id,
      sourceLot.medicationId,
      now
    );

    const remainingDaysAfterTransit = daysUntilExpiry - dist.transitDays;
    const destLots = state.lots.filter(
      (l) =>
        l.branchId === branch.id &&
        l.medicationId === sourceLot.medicationId &&
        isLotUsable(l, now)
    );
    const earlierLocalStock = destLots
      .filter((dl) => dl.expiryDate <= sourceLot.expiryDate)
      .reduce((sum, dl) => sum + Math.max(0, dl.physicalQty - dl.reservedQty), 0);

    const earlierIncomingTransfers = state.transfers
      .filter(
        (t) =>
          t.destinationBranchId === branch.id &&
          t.medicationId === sourceLot.medicationId &&
          (t.status === 'aprovada_reservada' || t.status === 'expedida') &&
          t.expectedArrivalDate >= todayISO &&
          t.lotExpiryDate <= sourceLot.expiryDate
      )
      .reduce((sum, t) => sum + t.quantity, 0);

    const earlierStock = earlierLocalStock + earlierIncomingTransfers;

    let maxConsumableBeforeExpiry = 0;
    if (remainingDaysAfterTransit > 0 && metrics.averageDailyConsumption > 0) {
      maxConsumableBeforeExpiry = Math.max(
        0,
        Math.floor(remainingDaysAfterTransit * metrics.averageDailyConsumption - earlierStock)
      );
    }

    const suggestedTransferQty = Math.min(
      availableInLot,
      metrics.netNeedQty,
      maxConsumableBeforeExpiry
    );

    let eligible = true;
    let reasonIfIneligible: string | undefined;

    if (sourceLot.status === 'bloqueado') {
      eligible = false;
      reasonIfIneligible = 'Lote bloqueado e impedido de transferência para uso.';
    } else if (daysUntilExpiry < 0) {
      eligible = false;
      reasonIfIneligible = 'Lote vencido e não pode ser transferido para uso.';
    } else if (remainingDaysAfterTransit <= 0) {
      eligible = false;
      reasonIfIneligible = `Prazo de transporte (${dist.transitDays} dia(s)) iguala ou ultrapassa os ${daysUntilExpiry} dia(s) restantes de validade.`;
    } else if (metrics.averageDailyConsumption <= 0) {
      eligible = false;
      reasonIfIneligible = 'Filial não possui histórico de consumo ativo nos últimos 30 dias.';
    } else if (maxConsumableBeforeExpiry <= 0) {
      eligible = false;
      reasonIfIneligible = `Não consegue consumir antes do vencimento (${daysUntilExpiry}d): estoque/chegadas anteriores (${earlierStock} unid.) e transporte (${dist.transitDays}d) consomem toda a janela.`;
    } else if (metrics.netNeedQty <= 0) {
      eligible = false;
      reasonIfIneligible = `Sem necessidade líquida: saldo disponível (${metrics.availableUsableQty}) e entradas confirmadas (${metrics.confirmedIncomingTotalQty}) já atendem ao alvo (${metrics.targetStock}).`;
    }

    matches.push({
      branch,
      distanceKm: dist.distanceKm,
      transitDays: dist.transitDays,
      metrics,
      netNeedQty: metrics.netNeedQty,
      maxConsumableBeforeExpiry,
      suggestedTransferQty,
      eligible,
      reasonIfIneligible,
    });
  }

  return matches.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    return a.distanceKm - b.distanceKm;
  });
}
