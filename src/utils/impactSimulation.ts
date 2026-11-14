import {
  CofreAppState,
  ImpactDetailRow,
  ImpactPolicyMetrics,
  ImpactSimulationResult,
  Medication,
  SupplierOffer,
} from '../types/cofre';
import {
  ANNUAL_CARRYING_RATE,
  calculateBranchMedicationMetrics,
  DAILY_STOCKOUT_PENALTY_BRL,
  getDistanceBetweenBranches,
  isLotUsable,
  MAX_COMPARISON_LEAD_TIME_DAYS,
} from './calculations';
import { daysBetweenDates } from './formatters';

export const IMPACT_SIMULATION_SEED = 20261114;
export const IMPACT_HORIZON_DAYS = 90;

// Deterministic Mulberry32 PRNG so both policies always face the exact same daily demand
function createSeededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SimLot {
  qty: number;
  expiryDay: number;
  arrivalOrder: number;
  unitCost: number;
}

interface PendingDelivery {
  arrivalDay: number;
  qty: number;
  expiryDay: number;
  unitCost: number;
  medId: string;
  branchId: string;
}

function getUnitReferenceCost(med: Medication, offers: SupplierOffer[]): number {
  const medOffers = offers.filter((o) => o.medicationId === med.id);
  if (medOffers.length === 0) return med.unitCostReference;
  return Math.min(...medOffers.map((o) => o.pricePerBox));
}

function runPolicyOverDemand(
  mode: 'baseline' | 'recommended',
  state: CofreAppState,
  demandMatrix: Record<string, number[]>,
  avgDailyMap: Record<string, number>,
  stdDevMap: Record<string, number>,
  now: Date
): {
  metrics: ImpactPolicyMetrics;
  dailyCapital: number[];
  dailyCumulativeServed: number[];
  perPair: Record<
    string,
    {
      demandTotal: number;
      served: number;
      stockoutDays: number;
      cogs: number;
      carryingCost: number;
      stockoutCost: number;
      avgCapital: number;
    }
  >;
} {
  const lotPool = new Map<string, SimLot[]>();
  const arrivalSeq = new Map<string, number>();
  const pendingOrders: PendingDelivery[] = [];

  let initialInventoryValue = 0;
  let purchasesPlusFreight = 0;
  let purchasesCount = 0;
  let transfersCount = 0;
  let expiryLosses = 0;
  let totalStockoutDays = 0;
  let totalDemandAll = 0;
  let totalServedAll = 0;

  const pairStats = new Map<
    string,
    {
      demandTotal: number;
      served: number;
      stockoutDays: number;
      initialVal: number;
      purchasesFreight: number;
      carryingSum: number;
      capitalSum: number;
    }
  >();

  for (const branch of state.branches) {
    for (const med of state.medications) {
      const key = `${branch.id}::${med.id}`;
      const unitRef = getUnitReferenceCost(med, state.supplierOffers);
      const usableLots = state.lots
        .filter((l) => l.branchId === branch.id && l.medicationId === med.id && isLotUsable(l, now))
        .map((l, idx) => ({
          qty: Math.max(0, l.physicalQty - l.reservedQty),
          expiryDay: Math.max(1, daysBetweenDates(now, l.expiryDate)),
          arrivalOrder: idx,
          unitCost: unitRef,
        }))
        .filter((l) => l.qty > 0);

      // In baseline (no FEFO), sort longer expiry / older receipt order first to mimic unguided FIFO shelf picking
      if (mode === 'baseline') {
        usableLots.sort((a, b) => b.expiryDay - a.expiryDay);
      } else {
        usableLots.sort((a, b) => a.expiryDay - b.expiryDay);
      }

      lotPool.set(key, usableLots);
      arrivalSeq.set(key, usableLots.length);

      const initVal = usableLots.reduce((sum, l) => sum + l.qty * l.unitCost, 0);
      initialInventoryValue += initVal;
      pairStats.set(key, {
        demandTotal: 0,
        served: 0,
        stockoutDays: 0,
        initialVal: initVal,
        purchasesFreight: 0,
        carryingSum: 0,
        capitalSum: 0,
      });
    }
  }

  const dailyCapital: number[] = [];
  const dailyCumulativeServed: number[] = [];

  for (let day = 1; day <= IMPACT_HORIZON_DAYS; day++) {
    // 1. Receive scheduled deliveries for today
    for (const ord of pendingOrders) {
      if (ord.arrivalDay !== day) continue;
      const key = `${ord.branchId}::${ord.medId}`;
      const pool = lotPool.get(key) ?? [];
      const seq = (arrivalSeq.get(key) ?? 0) + 1;
      arrivalSeq.set(key, seq);
      pool.push({
        qty: ord.qty,
        expiryDay: ord.expiryDay,
        arrivalOrder: seq,
        unitCost: ord.unitCost,
      });
      if (mode === 'recommended') {
        pool.sort((a, b) => a.expiryDay - b.expiryDay);
      }
      lotPool.set(key, pool);
    }

    // 2. Expire lots past expiryDay
    for (const branch of state.branches) {
      for (const med of state.medications) {
        const key = `${branch.id}::${med.id}`;
        const pool = lotPool.get(key) ?? [];
        const alive: SimLot[] = [];
        for (const l of pool) {
          if (l.expiryDay < day && l.qty > 0) {
            expiryLosses += l.qty * l.unitCost;
          } else if (l.qty > 0) {
            alive.push(l);
          }
        }
        lotPool.set(key, alive);
      }
    }

    // 3. Serve today's fixed demand
    for (const branch of state.branches) {
      for (const med of state.medications) {
        const key = `${branch.id}::${med.id}`;
        const pool = lotPool.get(key) ?? [];
        const demandToday = demandMatrix[key]?.[day - 1] ?? 0;
        const ps = pairStats.get(key)!;
        ps.demandTotal += demandToday;
        totalDemandAll += demandToday;

        if (mode === 'recommended') {
          pool.sort((a, b) => a.expiryDay - b.expiryDay);
        } else {
          // Baseline picks newest/longest-expiry lots first when FEFO isn't enforced (realistic shelf behavior)
          pool.sort((a, b) => b.arrivalOrder - a.arrivalOrder);
        }

        let remainingDemand = demandToday;
        let servedToday = 0;
        for (const l of pool) {
          if (remainingDemand <= 0) break;
          if (l.qty <= 0) continue;
          const take = Math.min(l.qty, remainingDemand);
          l.qty -= take;
          remainingDemand -= take;
          servedToday += take;
        }

        ps.served += servedToday;
        totalServedAll += servedToday;

        if (remainingDemand > 0) {
          ps.stockoutDays += 1;
          totalStockoutDays += 1;
        }
      }
    }

    // 4. Replenishment decision at end of day
    for (const med of state.medications) {
      const medOffers = state.supplierOffers.filter((o) => o.medicationId === med.id);

      for (const branch of state.branches) {
        const key = `${branch.id}::${med.id}`;
        const pool = lotPool.get(key) ?? [];
        const onHand = pool.reduce((s, l) => s + l.qty, 0);
        const onOrder = pendingOrders
          .filter((o) => o.branchId === branch.id && o.medId === med.id && o.arrivalDay > day)
          .reduce((s, o) => s + o.qty, 0);
        const stockPosition = onHand + onOrder;
        const avgDaily = avgDailyMap[key] ?? 0;
        const stdDev = stdDevMap[key] ?? 0;
        const ps = pairStats.get(key)!;

        if (avgDaily <= 0) continue;

        if (mode === 'baseline') {
          // Baseline policy: reorder when stockPosition < 7 days, order up to 21 days, lowest unit price, no transfers
          const triggerPoint = avgDaily * 7;
          const orderUpTo = Math.ceil(avgDaily * 21);
          if (stockPosition < triggerPoint) {
            const rawNeed = Math.max(1, orderUpTo - stockPosition);
            const sortedByPrice = [...medOffers].sort((a, b) => a.pricePerBox - b.pricePerBox);
            const chosen = sortedByPrice[0];
            if (chosen) {
              const baseQty = Math.max(rawNeed, chosen.minOrderQty);
              const mult = Math.max(1, chosen.packMultiple);
              const qty = Math.ceil(baseQty / mult) * mult;
              const spend = qty * chosen.pricePerBox + chosen.freightCost;
              purchasesPlusFreight += spend;
              ps.purchasesFreight += spend;
              purchasesCount += 1;
              pendingOrders.push({
                arrivalDay: day + Math.max(1, chosen.leadTimeDays),
                qty,
                expiryDay: day + Math.max(45, daysBetweenDates(now, chosen.lotExpiryDate)),
                unitCost: chosen.pricePerBox,
                medId: med.id,
                branchId: branch.id,
              });
            }
          }
        } else {
          // Recommended rule engine: Z=1.65 statistical safety stock + 7d coverage, FEFO, transfer first, lowest economic total cost (<=10d)
          const policy = state.policies.find(
            (p) => p.branchId === branch.id && p.medicationId === med.id
          );
          const statSafety = Math.ceil(1.65 * stdDev * Math.sqrt(2));
          const safety = Math.max(policy?.safetyStock ?? 2, statSafety);
          const coverage = policy?.coverageDays ?? 7;
          const targetStock = Math.ceil(avgDaily * coverage + safety);
          const reorderPoint = Math.ceil(avgDaily * 2 + safety);

          if (stockPosition <= reorderPoint) {
            let need = Math.max(0, targetStock - stockPosition);

            // Step A: Transfer excess from closest branch before purchasing
            if (need > 0) {
              const candidates = state.branches
                .filter((orig) => orig.id !== branch.id)
                .map((orig) => ({
                  orig,
                  dist: getDistanceBetweenBranches(state.branches, orig.id, branch.id),
                }))
                .filter((c) => c.dist !== null)
                .sort((a, b) => a.dist!.distanceKm - b.dist!.distanceKm);

              for (const { orig, dist } of candidates) {
                if (need <= 0 || !dist) break;
                const origKey = `${orig.id}::${med.id}`;
                const origPool = (lotPool.get(origKey) ?? []).sort((a, b) => a.expiryDay - b.expiryDay);
                const origOnHand = origPool.reduce((s, l) => s + l.qty, 0);
                const origAvg = avgDailyMap[origKey] ?? 0;
                const origSafety =
                  state.policies.find((p) => p.branchId === orig.id && p.medicationId === med.id)
                    ?.safetyStock ?? 3;
                const origTarget = Math.ceil(origAvg * 7 + origSafety);
                let origSurplus = Math.max(0, origOnHand - origTarget);
                if (origSurplus <= 0) continue;

                for (const lot of origPool) {
                  if (need <= 0 || origSurplus <= 0) break;
                  if (lot.qty <= 0) continue;
                  const daysValidAfterTransit = lot.expiryDay - day - dist.transitDays;
                  if (daysValidAfterTransit <= 0) continue;
                  const take = Math.min(need, origSurplus, lot.qty);
                  if (take > 0) {
                    lot.qty -= take;
                    origSurplus -= take;
                    need -= take;
                    transfersCount += 1;
                    const trfCost = dist.estimatedTransferCost ?? 0;
                    purchasesPlusFreight += trfCost;
                    ps.purchasesFreight += trfCost;
                    pendingOrders.push({
                      arrivalDay: day + Math.max(0, dist.transitDays),
                      qty: take,
                      expiryDay: lot.expiryDay,
                      unitCost: lot.unitCost,
                      medId: med.id,
                      branchId: branch.id,
                    });
                  }
                }
              }
            }

            // Step B: Complementary purchase from best economic supplier (leadTime <= 10d)
            if (need > 0) {
              const daysLeftLocal = avgDaily > 0 ? onHand / avgDaily : 99;
              const eligible = medOffers.filter(
                (o) => o.leadTimeDays <= MAX_COMPARISON_LEAD_TIME_DAYS && o.availableQty >= need
              );
              const scored = eligible
                .map((offer) => {
                  const baseQty = Math.max(need, offer.minOrderQty);
                  const mult = Math.max(1, offer.packMultiple);
                  const qty = Math.ceil(baseQty / mult) * mult;
                  const merch = qty * offer.pricePerBox;
                  const carry = Math.round(
                    merch * ANNUAL_CARRYING_RATE * (Math.max(coverage, 7) / 365)
                  );
                  const riskDays = Math.max(0, offer.leadTimeDays - Math.floor(daysLeftLocal));
                  const riskCost = riskDays * DAILY_STOCKOUT_PENALTY_BRL;
                  const econ = merch + offer.freightCost + carry + riskCost;
                  return { offer, qty, econ };
                })
                .sort((a, b) => a.econ - b.econ);

              const best = scored[0];
              if (best) {
                const spend = best.qty * best.offer.pricePerBox + best.offer.freightCost;
                purchasesPlusFreight += spend;
                ps.purchasesFreight += spend;
                purchasesCount += 1;
                pendingOrders.push({
                  arrivalDay: day + Math.max(1, best.offer.leadTimeDays),
                  qty: best.qty,
                  expiryDay: day + Math.max(45, daysBetweenDates(now, best.offer.lotExpiryDate)),
                  unitCost: best.offer.pricePerBox,
                  medId: med.id,
                  branchId: branch.id,
                });
              }
            }
          }
        }
      }
    }

    // 5. Compute end-of-day inventory capital & carrying charge
    let dayCap = 0;
    for (const branch of state.branches) {
      for (const med of state.medications) {
        const key = `${branch.id}::${med.id}`;
        const pool = lotPool.get(key) ?? [];
        const val = pool.reduce((s, l) => s + l.qty * l.unitCost, 0);
        dayCap += val;
        const ps = pairStats.get(key)!;
        ps.capitalSum += val;
        ps.carryingSum += val * (ANNUAL_CARRYING_RATE / 365);
      }
    }
    dailyCapital.push(Math.round(dayCap));
    dailyCumulativeServed.push(totalServedAll);
  }

  // Final inventory value & per-pair summary
  let finalInventoryValue = 0;
  let totalCarrying = 0;
  const perPair: Record<
    string,
    {
      demandTotal: number;
      served: number;
      stockoutDays: number;
      cogs: number;
      carryingCost: number;
      stockoutCost: number;
      avgCapital: number;
    }
  > = {};

  for (const branch of state.branches) {
    for (const med of state.medications) {
      const key = `${branch.id}::${med.id}`;
      const pool = lotPool.get(key) ?? [];
      const endVal = pool.reduce((s, l) => s + l.qty * l.unitCost, 0);
      finalInventoryValue += endVal;

      const ps = pairStats.get(key)!;
      const pairCogs = ps.purchasesFreight + ps.initialVal - endVal;
      const pairCarry = Math.round(ps.carryingSum);
      const pairStockout = ps.stockoutDays * DAILY_STOCKOUT_PENALTY_BRL;
      totalCarrying += pairCarry;

      perPair[key] = {
        demandTotal: ps.demandTotal,
        served: ps.served,
        stockoutDays: ps.stockoutDays,
        cogs: pairCogs,
        carryingCost: pairCarry,
        stockoutCost: pairStockout,
        avgCapital: Math.round(ps.capitalSum / IMPACT_HORIZON_DAYS),
      };
    }
  }

  const cogs = purchasesPlusFreight + initialInventoryValue - finalInventoryValue;
  const stockoutCost = totalStockoutDays * DAILY_STOCKOUT_PENALTY_BRL;
  const totalPeriodCost = cogs + totalCarrying + stockoutCost;
  const avgIdleCapital = Math.round(
    dailyCapital.reduce((s, v) => s + v, 0) / Math.max(1, dailyCapital.length)
  );
  const costPerServedUnit = totalServedAll > 0 ? totalPeriodCost / totalServedAll : 0;

  return {
    metrics: {
      policyName:
        mode === 'baseline'
          ? 'Política atual (linha de base)'
          : 'Política recomendada (motor de regras)',
      demandServed: totalServedAll,
      totalDemand: totalDemandAll,
      costPerServedUnit: Number(costPerServedUnit.toFixed(2)),
      cogs: Math.round(cogs),
      carryingCost: Math.round(totalCarrying),
      stockoutCost: Math.round(stockoutCost),
      totalPeriodCost: Math.round(totalPeriodCost),
      expiryLosses: Math.round(expiryLosses),
      avgIdleCapital,
      stockoutDays: totalStockoutDays,
      purchasesCount,
      transfersCount,
      initialInventoryValue: Math.round(initialInventoryValue),
      finalInventoryValue: Math.round(finalInventoryValue),
      purchasesPlusFreight: Math.round(purchasesPlusFreight),
    },
    dailyCapital,
    dailyCumulativeServed,
    perPair,
  };
}

export function runImpactSimulation90Days(
  state: CofreAppState,
  now = new Date()
): ImpactSimulationResult {
  const rng = createSeededRng(IMPACT_SIMULATION_SEED);
  const demandMatrix: Record<string, number[]> = {};
  const avgDailyMap: Record<string, number> = {};
  const stdDevMap: Record<string, number> = {};

  for (const branch of state.branches) {
    for (const med of state.medications) {
      const key = `${branch.id}::${med.id}`;
      const metrics = calculateBranchMedicationMetrics(state, branch.id, med.id, now);
      const mean = metrics.averageDailyConsumption;
      avgDailyMap[key] = mean;
      stdDevMap[key] = metrics.consumptionStdDev;

      const series: number[] = [];
      for (let d = 0; d < IMPACT_HORIZON_DAYS; d++) {
        if (mean <= 0) {
          series.push(0);
          continue;
        }
        // Generate realistic daily demand wave + stochastic shock using fixed seed 20261114
        const u1 = rng();
        const u2 = rng();
        const seasonal = 1 + 0.18 * Math.sin((d / 7) * Math.PI);
        const spike = u2 > 0.88 ? 1.45 : u2 < 0.14 ? 0.55 : 1.0;
        const val = Math.max(0, Math.round(mean * seasonal * spike + (u1 - 0.45) * Math.max(1, mean * 0.4)));
        series.push(val);
      }
      demandMatrix[key] = series;
    }
  }

  const baselineRun = runPolicyOverDemand(
    'baseline',
    state,
    demandMatrix,
    avgDailyMap,
    stdDevMap,
    now
  );
  const recommendedRun = runPolicyOverDemand(
    'recommended',
    state,
    demandMatrix,
    avgDailyMap,
    stdDevMap,
    now
  );

  const dailySeries = Array.from({ length: IMPACT_HORIZON_DAYS }, (_, idx) => ({
    day: idx + 1,
    baselineCapital: baselineRun.dailyCapital[idx] ?? 0,
    recommendedCapital: recommendedRun.dailyCapital[idx] ?? 0,
    baselineCumulativeServed: baselineRun.dailyCumulativeServed[idx] ?? 0,
    recommendedCumulativeServed: recommendedRun.dailyCumulativeServed[idx] ?? 0,
  }));

  const detailRows: ImpactDetailRow[] = [];
  for (const branch of state.branches) {
    for (const med of state.medications) {
      const key = `${branch.id}::${med.id}`;
      const b = baselineRun.perPair[key];
      const r = recommendedRun.perPair[key];
      const bTotal = b.cogs + b.carryingCost + b.stockoutCost;
      const rTotal = r.cogs + r.carryingCost + r.stockoutCost;
      detailRows.push({
        branchId: branch.id,
        branchName: branch.name,
        medicationId: med.id,
        medicationName: med.name,
        controlUnit: med.controlUnit,
        demandTotal: b.demandTotal,
        baselineServed: b.served,
        recommendedServed: r.served,
        baselineStockoutDays: b.stockoutDays,
        recommendedStockoutDays: r.stockoutDays,
        baselineCostPerUnit: b.served > 0 ? Number((bTotal / b.served).toFixed(2)) : 0,
        recommendedCostPerUnit: r.served > 0 ? Number((rTotal / r.served).toFixed(2)) : 0,
        baselineAvgCapital: b.avgCapital,
        recommendedAvgCapital: r.avgCapital,
      });
    }
  }

  return {
    seed: IMPACT_SIMULATION_SEED,
    horizonDays: IMPACT_HORIZON_DAYS,
    zScore: 1.65,
    carryingRateAnnual: ANNUAL_CARRYING_RATE,
    stockoutCostPerDay: DAILY_STOCKOUT_PENALTY_BRL,
    baseline: baselineRun.metrics,
    recommended: recommendedRun.metrics,
    dailySeries,
    detailRows,
    assumptions: [
      'Série de demanda fixa de 90 dias gerada com semente determinística 20261114; ambas as políticas enfrentam exatamente os mesmos pedidos diários, lotes iniciais e fornecedores.',
      'Política atual (linha de base): parâmetro definido para comparação nesta prova de conceito (não vem de dado histórico de cliente) — repõe abaixo de 7 dias até 21 dias, compra pelo menor preço unitário, sem FEFO e sem transferências entre unidades.',
      'Política recomendada: usa o motor de regras com fator Z = 1,65, prioridade FEFO, transferência de excedentes antes da compra e seleção pelo menor custo econômico total (excluindo prazos acima de 10 dias).',
      'Custo de falta realizado fixado em R$ 2.000 por dia com ruptura por unidade/medicamento (parâmetro ilustrativo de análise, não um dado contábil real).',
      'Custo de carregar estoque calculado a 15% ao ano pro-rata sobre o valor diário em estoque.',
      'Perdas por vencimento já estão embutidas no custo das mercadorias (unidades vencidas saem do estoque final); o capital imobilizado médio é exibido fora da soma do período.',
    ],
  };
}
