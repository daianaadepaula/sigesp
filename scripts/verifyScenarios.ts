import assert from 'node:assert/strict';
import { ACTING_PERSONAS, createInitialDemoState } from '../src/data/seedData';
import { computeOperationalAlerts } from '../src/utils/alertsEngine';
import {
  calculateBranchMedicationMetrics,
  computeAllRecommendations,
  evaluateSupplierOffers,
  simulateChronologicalTimeline,
} from '../src/utils/calculations';
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
  actionRequestVaultOpen,
  actionReverseMovement,
  actionRevisePurchaseForecast,
  actionSimulateAlertsPlus10Min,
  actionSimulatePurchaseEscalation10Min,
  actionSimulateVaultSensorStatus,
  actionSimulateVaultTemperature,
  actionUpdateAlertRoleConfig,
  migrateAppState,
} from '../src/utils/cofreActions';
import { addDaysISO, addDaysToDate } from '../src/utils/formatters';
import { runImpactSimulation90Days } from '../src/utils/impactSimulation';

const now = new Date('2026-06-15T12:00:00.000Z');
const baseState = createInitialDemoState(now);
const funcUser = baseState.users.find((u) => u.id === 'usr-func')!;
const gestorUser = baseState.users.find((u) => u.id === 'usr-gestor')!;

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`✓ [${passed}] ${name}`);
}

// 1. Nenhuma oferta viável (best === null, bloqueio normal, exceção com risco funciona)
test('Cenário 1: Nenhuma oferta viável retorna best = null e bloqueia fluxo normal', () => {
  const s = structuredClone(baseState);
  // Tornar todas ofertas de med-img inviáveis (estoque insuficiente e validade curta)
  for (const o of s.supplierOffers.filter((x) => x.medicationId === 'med-img')) {
    o.availableQty = 2;
    o.lotExpiryDate = addDaysISO(now, 5);
  }
  const res = evaluateSupplierOffers(s, 'med-img', 10, 7, 4, now);
  assert.equal(res.best, null);
  assert.ok(res.evaluated.every((e) => !e.isViable && !e.isBestChoice));

  // Criação normal deve falhar
  const normalCreate = actionCreatePurchaseRequest(
    s,
    gestorUser,
    {
      branchId: 'branch-bairro',
      medicationId: 'med-img',
      supplierOfferId: 'sup-img-a',
      requestedQty: 10,
      netNeedAtRequest: 10,
      justification: 'Teste normal',
    },
    now
  );
  assert.equal(normalCreate.ok, false);

  // Criação por exceção com riscos deve funcionar
  const excCreate = actionCreatePurchaseRequest(
    s,
    gestorUser,
    {
      branchId: 'branch-bairro',
      medicationId: 'med-img',
      supplierOfferId: 'sup-img-a',
      requestedQty: 10,
      netNeedAtRequest: 10,
      justification: 'Exceção emergencial documentada',
      isException: true,
      exceptionRisks: ['Risco de validade curta'],
    },
    now
  );
  assert.equal(excCreate.ok, true);
  assert.equal(excCreate.data?.purchase.isException, true);
});

// 2. Pedido mínimo maior que a necessidade (8 + 100 = 108, não 19)
test('Cenário 2: Pedido mínimo 100 com saldo 8 e necessidade restante 11 projeta saldo 108 (sem consumo)', () => {
  const s = structuredClone(baseState);
  // Ajustar med-amx na Filial Bairro: saldo=8, consumo=57 (alvo 19), centro=40 e alvo=40 (sem excedente no centro)
  s.lots = s.lots.map((l) =>
    l.id === 'lot-amx-ct-1' ? { ...l, physicalQty: 28 } : l // 28 + 12 = 40 = alvo centro (excedente 0)
  );
  // Ajustar ofertas amx: ambas com pedido mínimo 100
  for (const o of s.supplierOffers.filter((x) => x.medicationId === 'med-amx')) {
    o.minOrderQty = 100;
  }
  const recs = computeAllRecommendations(s, now);
  const rec = recs.find((r) => r.branchId === 'branch-bairro' && r.medicationId === 'med-amx')!;
  assert.equal(rec.metrics.availableUsableQty, 8);
  assert.equal(rec.metrics.netNeedQty, 11);
  assert.equal(rec.totalSuggestedTransferQty, 0);
  assert.equal(rec.remainingPurchaseQty, 11);
  assert.equal(rec.effectivePurchaseQty, 100);
  assert.equal(rec.supplierExcessQty, 89);
  assert.equal(rec.projectedBalanceWithoutConsumption, 108);
});

// 2b. Projeção temporal não esconde falta anterior a chegada futura
test('Cenário 2b: Ruptura anterior à chegada futura é detectada na linha do tempo', () => {
  const sim = simulateChronologicalTimeline(
    [{ qty: 2, expiryDayOffset: 30 }],
    [{ dayOffset: 5, qty: 100, expiryDayOffset: 100, label: 'Compra' }],
    1,
    10,
    now
  );
  assert.ok(sim.firstStockoutDate !== null);
  assert.equal(sim.firstStockoutDate, addDaysISO(now, 3));
  assert.equal(sim.uncoveredQty, 2);
});

// 3. Compra atrasada não entra como chegada garantida e permite revisão de previsão
test('Cenário 3: Compra atrasada é marcada e excluída das entradas garantidas até revisão', () => {
  let s = structuredClone(baseState);
  const create = actionCreatePurchaseRequest(
    s,
    gestorUser,
    {
      branchId: 'branch-bairro',
      medicationId: 'med-img',
      supplierOfferId: 'sup-img-a',
      requestedQty: 10,
      netNeedAtRequest: 6,
      justification: 'Compra teste atraso',
    },
    now
  );
  assert.equal(create.ok, true);
  s = create.state;
  const prId = create.data!.purchase.id;

  // Aprovar com Aprovador independente (Helena Vasconcelos) e confirmar fornecimento
  s = actionApprovePurchaseRequest(
    s,
    gestorUser,
    prId,
    { actingPersona: ACTING_PERSONAS[1] },
    now
  ).state;
  s = actionConfirmSupplierPurchase(
    s,
    gestorUser,
    prId,
    { expectedArrivalDate: addDaysISO(now, -2) }, // Já venceu há 2 dias!
    now
  ).state;

  const metricsDelayed = calculateBranchMedicationMetrics(s, 'branch-bairro', 'med-img', now);
  assert.equal(metricsDelayed.delayedOrdersCount, 1);
  assert.equal(metricsDelayed.confirmedIncomingPurchasesQty, 0);

  // Revisar previsão para daqui a 2 dias -> passa a contar!
  const rev = actionRevisePurchaseForecast(
    s,
    gestorUser,
    prId,
    addDaysISO(now, 2),
    'Nova janela de entrega frigorífica',
    now
  );
  assert.equal(rev.ok, true);
  const metricsRevised = calculateBranchMedicationMetrics(rev.state, 'branch-bairro', 'med-img', now);
  assert.equal(metricsRevised.delayedOrdersCount, 0);
  assert.equal(metricsRevised.confirmedIncomingPurchasesQty, 10);
});

// 4. Recebimento parcial (100 -> recebe 20 -> pendente 80; bloqueia 90; cancela restante com justificativa)
test('Cenário 4: Recebimento parcial acumula entradas, bloqueia excesso sobre pendente e cancela saldo', () => {
  let s = structuredClone(baseState);
  for (const o of s.supplierOffers.filter((x) => x.medicationId === 'med-img')) {
    o.availableQty = 200;
  }
  const create = actionCreatePurchaseRequest(
    s,
    gestorUser,
    {
      branchId: 'branch-bairro',
      medicationId: 'med-img',
      supplierOfferId: 'sup-img-a',
      requestedQty: 20,
      netNeedAtRequest: 6,
      justification: 'Pedido para teste parcial',
    },
    now
  );
  assert.equal(create.ok, true);
  s = create.state;
  const prId = create.data!.purchase.id;
  s = actionApprovePurchaseRequest(
    s,
    gestorUser,
    prId,
    { actingPersona: ACTING_PERSONAS[1] },
    now
  ).state;
  s = actionConfirmSupplierPurchase(s, gestorUser, prId, {}, now).state;

  // Receber 5 unidades
  const r1 = actionReceivePurchasePartial(
    s,
    funcUser,
    prId,
    {
      receivedQty: 5,
      lotCode: 'LOT-PARC-1',
      expiryDate: addDaysISO(now, 200),
      operationToken: 'tok-1',
    },
    now
  );
  assert.equal(r1.ok, true);
  s = r1.state;
  const prAfter1 = s.purchaseRequests.find((p) => p.id === prId)!;
  assert.equal(prAfter1.status, 'parcialmente_recebida');
  assert.equal(prAfter1.receivedQtyTotal, 5);
  assert.equal(prAfter1.pendingQty, 15);

  // Bloquear recebimento maior que o saldo pendente (18 > 15)
  const rOver = actionReceivePurchasePartial(
    s,
    funcUser,
    prId,
    {
      receivedQty: 18,
      lotCode: 'LOT-PARC-2',
      expiryDate: addDaysISO(now, 200),
      operationToken: 'tok-over',
    },
    now
  );
  assert.equal(rOver.ok, false);

  // Cancelar saldo restante exige justificativa
  const cNoJust = actionCancelPurchaseRemaining(s, gestorUser, prId, '   ', now);
  assert.equal(cNoJust.ok, false);
  const cOk = actionCancelPurchaseRemaining(s, gestorUser, prId, 'Saldo cancelado em comum acordo', now);
  assert.equal(cOk.ok, true);
  assert.equal(cOk.state.purchaseRequests.find((p) => p.id === prId)!.pendingQty, 0);
  assert.equal(cOk.state.purchaseRequests.find((p) => p.id === prId)!.status, 'cancelada');
});

// 5. Lote vence após aprovação e antes da expedição -> bloqueado na expedição
test('Cenário 5: Lote vencido após aprovação da transferência é bloqueado na expedição', () => {
  let s = structuredClone(baseState);
  const trfRes = actionCreateTransferOrder(
    s,
    gestorUser,
    {
      medicationId: 'med-img',
      originBranchId: 'branch-centro',
      destinationBranchId: 'branch-bairro',
      lotId: 'lot-img-ct-2', // vence em 22 dias a partir de `now`
      quantity: 3,
      reason: 'Aproveitamento lote curto',
    },
    now
  );
  assert.equal(trfRes.ok, true);
  s = trfRes.state;
  const trfId = trfRes.data!.transfer.id;

  const appRes = actionApproveTransferOrder(s, gestorUser, trfId, now);
  assert.equal(appRes.ok, true);
  s = appRes.state;

  // Avançar data 25 dias (lote vence após aprovação!)
  const futureDate = addDaysToDate(now, 25);
  const dispRes = actionDispatchTransferOrder(s, gestorUser, trfId, futureDate);
  assert.equal(dispRes.ok, false);
  assert.ok(dispRes.error?.includes('venceu'));
});

// 6. Usuário sem autorização para a filial
test('Cenário 6: Usuário restrito à Filial Bairro é bloqueado ao operar Filial Centro', () => {
  const movFail = actionRegisterMovement(
    baseState,
    funcUser, // somente branch-bairro
    {
      branchId: 'branch-centro',
      medicationId: 'med-img',
      lotId: 'lot-img-ct-1',
      type: 'saida_consumo',
      quantity: 1,
      reason: 'Tentativa não autorizada',
    },
    now
  );
  assert.equal(movFail.ok, false);

  const vaultFail = actionRequestVaultOpen(baseState, funcUser, 'vault-centro', 'Abrir outra filial', now);
  assert.equal(vaultFail.ok, false);
});

// 7. Operação duplicada
test('Cenário 7: Bloqueia recebimento duplicado por operationToken e estorno duplicado', () => {
  let s = structuredClone(baseState);
  const create = actionCreatePurchaseRequest(
    s,
    gestorUser,
    {
      branchId: 'branch-bairro',
      medicationId: 'med-img',
      supplierOfferId: 'sup-img-a',
      requestedQty: 10,
      netNeedAtRequest: 6,
      justification: 'Teste idempotência',
    },
    now
  );
  s = actionApprovePurchaseRequest(
    create.state,
    gestorUser,
    create.data!.purchase.id,
    { actingPersona: ACTING_PERSONAS[1] },
    now
  ).state;
  const prId = create.data!.purchase.id;

  const r1 = actionReceivePurchasePartial(
    s,
    funcUser,
    prId,
    {
      receivedQty: 4,
      lotCode: 'LOT-DUP',
      expiryDate: addDaysISO(now, 200),
      operationToken: 'unique-token-123',
    },
    now
  );
  assert.equal(r1.ok, true);

  const rDup = actionReceivePurchasePartial(
    r1.state,
    funcUser,
    prId,
    {
      receivedQty: 4,
      lotCode: 'LOT-DUP',
      expiryDate: addDaysISO(now, 200),
      operationToken: 'unique-token-123',
    },
    now
  );
  assert.equal(rDup.ok, false);

  // Estorno duplicado
  const movId = r1.state.movements[0].id;
  const rev1 = actionReverseMovement(r1.state, funcUser, movId, 'Estorno 1', now);
  assert.equal(rev1.ok, true);
  const revDup = actionReverseMovement(rev1.state, funcUser, movId, 'Estorno 2', now);
  assert.equal(revDup.ok, false);
});

// 8. Vários lotes chegando antes do mesmo vencimento (capacidade combinada no destino)
test('Cenário 8: Considera lotes existentes + entradas confirmadas no destino antes de aprovar novo aproveitamento curto', () => {
  const s = structuredClone(baseState);
  // Bairro consome ~0.93/dia de med-img (28/30). Já tem 4 unid.
  // Se houver uma transferência já aprovada chegando no Bairro com 18 unid. vencendo em 20d,
  // a capacidade restante para outro lote vencendo em 22d cai bastante!
  s.transfers.push({
    id: 'trf-pre',
    code: 'TRF-2026-900',
    medicationId: 'med-img',
    originBranchId: 'branch-norte',
    destinationBranchId: 'branch-bairro',
    lotId: 'lot-img-nt-1',
    lotCode: 'IMG-NT-301',
    lotExpiryDate: addDaysISO(now, 20),
    quantity: 18,
    distanceKm: 11,
    transitDays: 1,
    expectedArrivalDate: addDaysISO(now, 1),
    forecastHistory: [],
    status: 'aprovada_reservada',
    reason: 'Pré-existente',
    requestedBy: { employeeName: 'Mariana', employeeMatricula: 'MAT-0218', timestamp: now.toISOString() },
  });
  const recs = computeAllRecommendations(s, now);
  const recBairro = recs.find((r) => r.branchId === 'branch-bairro' && r.medicationId === 'med-img')!;
  // Com 4 local + 18 confirmadas = 22 já acima do alvo (~10), netNeedQty deve ser 0 e sem nova sugestão!
  assert.equal(recBairro.metrics.netNeedQty, 0);
  assert.equal(recBairro.totalSuggestedTransferQty, 0);
});

// 9. Sensor desconectado
test('Cenário 9: Sensor desconectado bloqueia solicitação de abertura do cofre e leitura térmica', () => {
  const sDisc = actionSimulateVaultSensorStatus(baseState, gestorUser, 'vault-bairro', 'desconectado', now);
  assert.equal(sDisc.ok, true);

  const reqFail = actionRequestVaultOpen(sDisc.state, funcUser, 'vault-bairro', 'Retirada', now);
  assert.equal(reqFail.ok, false);

  const tempFail = actionSimulateVaultTemperature(sDisc.state, gestorUser, 'vault-bairro', 4.5, 5, now);
  assert.equal(tempFail.ok, false);
});

// 10. Temperatura normalizada com lote ainda bloqueado até avaliação técnica
test('Cenário 10: Excursão bloqueia lotes refrigerados e retorno a 4,3 °C mantém bloqueio até avaliação', () => {
  const exc = actionSimulateVaultTemperature(baseState, gestorUser, 'vault-bairro', 11.4, 28, now);
  assert.equal(exc.ok, true);
  assert.ok(exc.data?.incident);
  const lotAfterExc = exc.state.lots.find((l) => l.id === 'lot-img-br-1')!;
  assert.equal(lotAfterExc.status, 'bloqueado');

  // Normalizar temperatura para 4.3 °C NÃO pode desbloquear o lote!
  const norm = actionSimulateVaultTemperature(exc.state, gestorUser, 'vault-bairro', 4.3, 5, now);
  assert.equal(norm.ok, true);
  const lotAfterNorm = norm.state.lots.find((l) => l.id === 'lot-img-br-1')!;
  assert.equal(lotAfterNorm.status, 'bloqueado');

  // Avaliar ocorrência liberando manualmente -> desbloqueia
  const evalRes = actionEvaluateConservationIncident(
    norm.state,
    gestorUser,
    exc.data!.incident!.id,
    'liberar',
    'Estabilidade validada pela qualidade farmacêutica',
    now
  );
  assert.equal(evalRes.ok, true);
  assert.equal(evalRes.state.lots.find((l) => l.id === 'lot-img-br-1')!.status, 'utilizavel');
});

// 11. Estorno de operação vinculada + divergência / quarentena em transferência
test('Cenário 11: Estorno preserva coerência de transferência recebida e compra parcial', () => {
  let s = structuredClone(baseState);
  const cr = actionCreateTransferOrder(
    s,
    gestorUser,
    {
      medicationId: 'med-img',
      originBranchId: 'branch-centro',
      destinationBranchId: 'branch-bairro',
      lotId: 'lot-img-ct-2',
      quantity: 3,
      reason: 'Teste estorno transferência',
    },
    now
  );
  s = actionApproveTransferOrder(cr.state, gestorUser, cr.data!.transfer.id, now).state;
  s = actionDispatchTransferOrder(s, gestorUser, cr.data!.transfer.id, now).state;
  const dispMovId = s.movements[0].id;
  s = actionReceiveTransferOrder(
    s,
    funcUser,
    cr.data!.transfer.id,
    { receivedQty: 3, transportCondition: 'conforme' },
    now
  ).state;
  const recvMovId = s.movements[0].id;

  // Estornar expedição enquanto transferência está recebida deve ser bloqueado!
  const failRevDisp = actionReverseMovement(s, gestorUser, dispMovId, 'Tentativa inválida', now);
  assert.equal(failRevDisp.ok, false);

  // Estornar recebimento no destino reverte transferência para expedida
  const okRevRecv = actionReverseMovement(s, funcUser, recvMovId, 'Recebimento lançado em duplicidade', now);
  assert.equal(okRevRecv.ok, true);
  assert.equal(okRevRecv.state.transfers[0].status, 'expedida');
});

// 12. Migração v1 -> v3 e Sessão do Cofre sem movimentação
test('Cenário 12: Migração de estado v1 e sinalização de abertura de cofre sem movimentação', () => {
  const migrated = migrateAppState({ users: [], branches: [], medications: [] }, now);
  assert.equal(migrated.schemaVersion, 3);
  assert.ok(migrated.vaults.length >= 3);

  const directOpen = actionOpenVaultDoor(baseState, funcUser, 'vault-bairro', 'Sem solicitação', now);
  assert.equal(directOpen.ok, false);

  const reqOpen = actionRequestVaultOpen(baseState, funcUser, 'vault-bairro', 'Conferência visual', now);
  assert.equal(reqOpen.ok, true);
  const openRes = actionOpenVaultDoor(reqOpen.state, funcUser, 'vault-bairro', 'Conferência visual', now);
  assert.equal(openRes.ok, true);
  const closeRes = actionCloseVaultDoor(openRes.state, funcUser, 'vault-bairro', now);
  assert.equal(closeRes.ok, true);
  assert.equal(closeRes.state.vaultSessions[0].closedWithoutMovement, true);
});

// 13. Comparação econômica detalhada (Anticorpo Monoclonal 150 mg · Centro)
test('Cenário 13: Anticorpo Monoclonal Centro calcula 1 transf + 2 compra, R$ 19.134 vs R$ 22.101 e exclui > 10d', () => {
  const recs = computeAllRecommendations(baseState, now);
  const rec = recs.find((r) => r.branchId === 'branch-centro' && r.medicationId === 'med-mab')!;
  assert.ok(rec);
  assert.equal(rec.totalSuggestedTransferQty, 1);
  assert.equal(rec.remainingPurchaseQty, 2);
  assert.ok(rec.bestSupplier?.offer.supplierName.startsWith('Fornecedor A'));
  assert.equal(rec.bestSupplier?.economicTotalCost, 19134);

  const forB = rec.supplierComparison.find((s) => s.offer.supplierName.startsWith('Fornecedor B'))!;
  assert.equal(forB.economicTotalCost, 22101);
  assert.equal(forB.stockoutRiskDays, 2);
  assert.equal(forB.stockoutRiskCost, 4000);

  const forC = rec.supplierComparison.find((s) => s.offer.supplierName.startsWith('Fornecedor C'))!;
  assert.equal(forC.excludedByLeadTime, true);
  assert.equal(forC.isViable, false);

  const recBairroMab = recs.find(
    (r) => r.branchId === 'branch-bairro' && r.medicationId === 'med-mab'
  )!;
  assert.ok(recBairroMab.explanation.plainSummary.includes('FIC-GLP-26B'));
});

// 14. Simulação de impacto de 90 dias (semente fixa 20261114)
test('Cenário 14: Simulação de impacto 90d é determinística (20261114) e calcula todos os 8 indicadores', () => {
  const sim1 = runImpactSimulation90Days(baseState, now);
  const sim2 = runImpactSimulation90Days(baseState, now);
  assert.equal(sim1.seed, 20261114);
  assert.equal(sim1.horizonDays, 90);
  assert.equal(sim1.baseline.demandServed, sim2.baseline.demandServed);
  assert.equal(sim1.recommended.demandServed, sim2.recommended.demandServed);
  assert.equal(sim1.recommended.totalPeriodCost, sim2.recommended.totalPeriodCost);

  assert.equal(
    sim1.baseline.totalPeriodCost,
    sim1.baseline.cogs + sim1.baseline.carryingCost + sim1.baseline.stockoutCost
  );
  assert.equal(
    sim1.recommended.totalPeriodCost,
    sim1.recommended.cogs + sim1.recommended.carryingCost + sim1.recommended.stockoutCost
  );
  assert.ok(sim1.recommended.demandServed >= sim1.baseline.demandServed);
  assert.ok(sim1.recommended.stockoutDays <= sim1.baseline.stockoutDays);
});

// 15. Aprovação independente (> R$ 10.000), segregação de funções e escalonamento +10 min
test('Cenário 15: Compra > R$ 10.000 exige aprovação independente, bloqueia criador e escalona +10 min', () => {
  let s = structuredClone(baseState);
  // Compra abaixo de R$ 10.000 confirma diretamente
  const lowPr = actionCreatePurchaseRequest(
    s,
    gestorUser,
    {
      branchId: 'branch-bairro',
      medicationId: 'med-amx',
      supplierOfferId: 'sup-amx-a',
      requestedQty: 20,
      netNeedAtRequest: 11,
      justification: 'Compra abaixo de 10k',
    },
    now
  );
  assert.equal(lowPr.ok, true);
  assert.equal(lowPr.data!.purchase.status, 'aprovada');
  assert.equal(lowPr.data!.purchase.supplierConfirmed, true);

  // Compra acima de R$ 10.000 (Fornecedor A med-mab = 19.080) vai para aguardando_aprovacao
  s = lowPr.state;
  const highPr = actionCreatePurchaseRequest(
    s,
    gestorUser,
    {
      branchId: 'branch-centro',
      medicationId: 'med-mab',
      supplierOfferId: 'sup-mab-a',
      requestedQty: 2,
      netNeedAtRequest: 2,
      justification: 'Reposição Anticorpo Monoclonal',
    },
    now
  );
  assert.equal(highPr.ok, true);
  assert.equal(highPr.data!.purchase.status, 'aguardando_aprovacao');
  const highId = highPr.data!.purchase.id;
  s = highPr.state;

  // Criador (Comprador Bruno Azevedo) NÃO pode aprovar nem recusar
  const selfApprove = actionApprovePurchaseRequest(s, gestorUser, highId, {}, now);
  assert.equal(selfApprove.ok, false);
  assert.ok(selfApprove.error?.includes('Segregação de funções'));

  const selfReject = actionRejectPurchaseRequest(s, gestorUser, highId, 'Teste recusa', now);
  assert.equal(selfReject.ok, false);

  // Simular +10 min sem resposta escalona para Diretor de operações
  const esc = actionSimulatePurchaseEscalation10Min(s, gestorUser, highId, now);
  assert.equal(esc.ok, true);
  assert.equal(
    esc.state.purchaseRequests.find((p) => p.id === highId)!.status,
    'escalonada_diretor'
  );
  s = esc.state;

  // Aprovador independente (Helena Vasconcelos) aprova -> Confirmado + log APROVAÇÃO
  const appOk = actionApprovePurchaseRequest(
    s,
    gestorUser,
    highId,
    { actingPersona: ACTING_PERSONAS[1] },
    now
  );
  assert.equal(appOk.ok, true);
  const finalPr = appOk.state.purchaseRequests.find((p) => p.id === highId)!;
  assert.equal(finalPr.status, 'aprovada');
  assert.equal(finalPr.supplierConfirmed, true);
  assert.ok(appOk.state.generalAuditLogs[0].action.includes('APROVAÇÃO'));
});

// 16. Alertas dinâmicos (FIC-GLP-26B), reconhecimento, configuração e escalonamento +10 min
test('Cenário 16: Alertas detectam lote FIC-GLP-26B e escalonam responsáveis após +10 min', () => {
  let s = structuredClone(baseState);
  const recs = computeAllRecommendations(s, now);
  const initialAlerts = computeOperationalAlerts(s, recs, now);

  const ficAlert = initialAlerts.find((a) => a.title.includes('FIC-GLP-26B'));
  assert.ok(ficAlert, 'Deve listar alerta dinâmico do lote em quarentena FIC-GLP-26B');
  assert.equal(ficAlert!.currentResponsibleRole, 'Gestor de estoque');
  assert.equal(ficAlert!.status, 'novo');

  // +10 min sem reconhecimento escalona Gestor de estoque -> Diretor de operações
  const escRes = actionSimulateAlertsPlus10Min(s, gestorUser, [ficAlert!.id], now);
  assert.equal(escRes.ok, true);
  s = escRes.state;
  const escalated = computeOperationalAlerts(s, recs, now).find((a) => a.id === ficAlert!.id)!;
  assert.equal(escalated.status, 'escalonado');
  assert.equal(escalated.currentResponsibleRole, 'Diretor de operações');

  // Excursão térmica inicia com Responsável técnico e escalona para Gestor de estoque após +10 min
  const exc = actionSimulateVaultTemperature(s, gestorUser, 'vault-bairro', 11.2, 25, now);
  assert.equal(exc.ok, true);
  const excAlerts = computeOperationalAlerts(exc.state, recs, now);
  const tempAlert = excAlerts.find((a) => a.category === 'temperatura_fora_faixa')!;
  assert.equal(tempAlert.currentResponsibleRole, 'Responsável técnico');
  const excEsc = actionSimulateAlertsPlus10Min(exc.state, gestorUser, [tempAlert.id], now);
  const tempEsc = computeOperationalAlerts(excEsc.state, recs, now).find(
    (a) => a.id === tempAlert.id
  )!;
  assert.equal(tempEsc.currentResponsibleRole, 'Gestor de estoque');

  // Reconhecimento limpa status para reconhecido
  const ackRes = actionAcknowledgeAlert(s, gestorUser, ficAlert!.id, now);
  assert.equal(ackRes.ok, true);
  const acked = computeOperationalAlerts(ackRes.state, recs, now).find((a) => a.id === ficAlert!.id)!;
  assert.equal(acked.status, 'reconhecido');
  assert.equal(acked.acknowledged, true);

  // Alterar responsável padrão de estoque_baixo para Comprador reflete imediatamente
  const cfgRes = actionUpdateAlertRoleConfig(s, gestorUser, 'estoque_baixo', 'Comprador', now);
  assert.equal(cfgRes.ok, true);
  const stockAlert = computeOperationalAlerts(cfgRes.state, recs, now).find(
    (a) => a.category === 'estoque_baixo'
  )!;
  assert.equal(stockAlert.baseResponsibleRole, 'Comprador');
});

console.log(`\nTodos os ${passed} cenários executados e aprovados com sucesso.`);
