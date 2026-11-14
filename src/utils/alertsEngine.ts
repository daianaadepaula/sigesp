import {
  AlertCategory,
  AlertResponsibleRole,
  AlertStatus,
  CofreAppState,
  OperationalAlert,
  ReplenishmentRecommendation,
} from '../types/cofre';
import { isLotExpired } from './calculations';
import { daysBetweenDates, formatCurrencyBR, formatNumberBR } from './formatters';

export const AVAILABLE_ALERT_ROLES: AlertResponsibleRole[] = [
  'Responsável técnico',
  'Gestor de estoque',
  'Responsável pela locação',
  'Comprador',
  'Aprovador',
  'Diretor de operações',
];

export const ESCALATION_NEXT_ROLE: Record<AlertResponsibleRole, AlertResponsibleRole | null> = {
  'Responsável técnico': 'Gestor de estoque',
  'Gestor de estoque': 'Diretor de operações',
  'Responsável pela locação': 'Diretor de operações',
  Comprador: 'Aprovador',
  Aprovador: 'Diretor de operações',
  'Diretor de operações': null,
};

export const ESCALATION_MINUTES_THRESHOLD = 10;

export function buildEscalationChain(baseRole: AlertResponsibleRole): AlertResponsibleRole[] {
  const chain: AlertResponsibleRole[] = [baseRole];
  let curr: AlertResponsibleRole | null = baseRole;
  const seen = new Set<AlertResponsibleRole>([baseRole]);
  while (curr) {
    const next: AlertResponsibleRole | null = ESCALATION_NEXT_ROLE[curr];
    if (!next || seen.has(next)) break;
    chain.push(next);
    seen.add(next);
    curr = next;
  }
  return chain;
}

export function resolveAlertRoleAndStatus(
  baseRole: AlertResponsibleRole,
  acknowledged: boolean,
  openMinutes: number
): {
  currentResponsibleRole: AlertResponsibleRole;
  escalationChain: AlertResponsibleRole[];
  status: AlertStatus;
} {
  const chain = buildEscalationChain(baseRole);
  if (acknowledged) {
    return {
      currentResponsibleRole: baseRole,
      escalationChain: chain,
      status: 'reconhecido',
    };
  }
  if (openMinutes >= ESCALATION_MINUTES_THRESHOLD && chain.length > 1) {
    return {
      currentResponsibleRole: chain[1],
      escalationChain: chain,
      status: 'escalonado',
    };
  }
  return {
    currentResponsibleRole: baseRole,
    escalationChain: chain,
    status: 'novo',
  };
}

export function computeOperationalAlerts(
  state: CofreAppState,
  recommendations: ReplenishmentRecommendation[],
  now = new Date()
): OperationalAlert[] {
  const alerts: OperationalAlert[] = [];

  const pushAlert = (params: {
    id: string;
    category: AlertCategory;
    severity: OperationalAlert['severity'];
    title: string;
    detail: string;
    branchId?: string;
    branchName: string;
    targetTab: OperationalAlert['targetTab'];
    defaultOpenMinutes?: number;
  }) => {
    const runtime = state.alertRuntimeState[params.id];
    const openMinutes = runtime?.openMinutes ?? params.defaultOpenMinutes ?? 2;
    const acknowledged = runtime?.acknowledged ?? false;
    const baseRole = state.alertRoleConfig[params.category] ?? 'Gestor de estoque';
    const resolved = resolveAlertRoleAndStatus(baseRole, acknowledged, openMinutes);

    alerts.push({
      id: params.id,
      category: params.category,
      severity: params.severity,
      title: params.title,
      detail: params.detail,
      branchId: params.branchId,
      branchName: params.branchName,
      baseResponsibleRole: baseRole,
      currentResponsibleRole: resolved.currentResponsibleRole,
      escalationChain: resolved.escalationChain,
      status: resolved.status,
      openMinutes,
      acknowledged,
      acknowledgedBy: runtime?.acknowledgedBy,
      acknowledgedAt: runtime?.acknowledgedAt,
      targetTab: params.targetTab,
    });
  };

  // 1. Open thermal excursions / out-of-range temperature
  for (const inc of state.conservationIncidents) {
    if (inc.status === 'avaliada_liberada' || inc.status === 'avaliada_descarte') continue;
    const br = state.branches.find((b) => b.id === inc.branchId);
    pushAlert({
      id: `alt-inc-${inc.id}`,
      category: 'temperatura_fora_faixa',
      severity: 'critica',
      title: `Excursão térmica ${inc.code} · ${inc.equipmentCode} (${inc.peakTempC.toFixed(1)} °C)`,
      detail: `${inc.readingsSummary}. ${inc.affectedLotCodes.length} lote(s) em bloqueio preventivo: ${
        inc.affectedLotCodes.join(', ') || 'nenhum'
      }.`,
      branchId: inc.branchId,
      branchName: br?.name ?? inc.branchId,
      targetTab: 'cofre',
      defaultOpenMinutes: 4,
    });
  }

  for (const vault of state.vaults) {
    const br = state.branches.find((b) => b.id === vault.branchId);
    if (
      vault.currentTempC !== null &&
      (vault.currentTempC < vault.minTempC || vault.currentTempC > vault.maxTempC)
    ) {
      pushAlert({
        id: `alt-temp-${vault.id}`,
        category: 'temperatura_fora_faixa',
        severity: 'critica',
        title: `Temperatura fora da faixa em ${vault.equipmentCode} (${vault.currentTempC.toFixed(1)} °C)`,
        detail: `Faixa segura: ${vault.minTempC.toFixed(1)} °C a ${vault.maxTempC.toFixed(
          1
        )} °C. Verifique o isolamento e lotes refrigerados.`,
        branchId: vault.branchId,
        branchName: br?.name ?? vault.branchId,
        targetTab: 'cofre',
        defaultOpenMinutes: 5,
      });
    }

    if (vault.sensorStatus !== 'conectado') {
      pushAlert({
        id: `alt-sensor-${vault.id}`,
        category: 'falha_equipamento',
        severity: vault.sensorStatus === 'desconectado' ? 'critica' : 'alta',
        title: `Falha de telemetria em ${vault.equipmentCode} (${
          vault.sensorStatus === 'desconectado' ? 'Sensor desconectado' : 'Leitura desatualizada'
        })`,
        detail:
          vault.sensorStatus === 'desconectado'
            ? 'Abertura remota bloqueada até restabelecimento do controlador.'
            : 'Última leitura acima da janela esperada.',
        branchId: vault.branchId,
        branchName: br?.name ?? vault.branchId,
        targetTab: 'cofre',
        defaultOpenMinutes: 3,
      });
    }

    if (vault.doorState === 'aberta') {
      pushAlert({
        id: `alt-door-${vault.id}`,
        category: 'porta_aberta',
        severity: 'alta',
        title: `Porta aberta no cofre ${vault.equipmentCode}`,
        detail: `Sessão ativa vinculada: ${vault.activeSessionId ? 'Sim' : 'Sem sessão ativa'}. Feche após concluir a movimentação.`,
        branchId: vault.branchId,
        branchName: br?.name ?? vault.branchId,
        targetTab: 'cofre',
        defaultOpenMinutes: 2,
      });
    }
  }

  // 2. Denied access / authentication failures
  const failedAccess = state.accessLogs.filter(
    (l) => l.result === 'falha_credenciais' || l.result === 'falha_segundo_fator'
  );
  if (failedAccess.length > 0) {
    const latest = failedAccess[0];
    pushAlert({
      id: 'alt-access-denied',
      category: 'acesso_negado',
      severity: failedAccess.length >= 3 ? 'alta' : 'informativa',
      title: `${failedAccess.length} tentativa(s) de acesso negada(s)`,
      detail: `Última ocorrência: ${latest.employeeName} (${latest.detail}).`,
      branchId: latest.branchId,
      branchName: latest.branchName ?? 'Rede',
      targetTab: 'historico',
      defaultOpenMinutes: 1,
    });
  }

  // 3. Pending purchase approvals > R$ 10.000
  for (const pr of state.purchaseRequests) {
    if (pr.status === 'aguardando_aprovacao' || pr.status === 'escalonada_diretor') {
      const br = state.branches.find((b) => b.id === pr.branchId);
      const med = state.medications.find((m) => m.id === pr.medicationId);
      pushAlert({
        id: `alt-pr-${pr.id}`,
        category: 'compra_acima_limite',
        severity: pr.status === 'escalonada_diretor' ? 'critica' : 'alta',
        title: `${pr.code} aguardando aprovação independente (${formatCurrencyBR(pr.totalCost)})`,
        detail: `${med?.name ?? pr.medicationId} · Criado por ${
          pr.createdByActorName ?? pr.requestedBy.employeeName
        } · ${pr.supplierName}.`,
        branchId: pr.branchId,
        branchName: br?.name ?? pr.branchId,
        targetTab: 'reposicao',
        defaultOpenMinutes: pr.pendingMinutes ?? 2,
      });
    }
  }

  // 4. Low stock / stockout risk before arrival
  for (const rec of recommendations) {
    if (rec.metrics.netNeedQty <= 0) continue;
    const br = state.branches.find((b) => b.id === rec.branchId);
    const med = state.medications.find((m) => m.id === rec.medicationId);
    const isCritical =
      rec.stockoutRiskBeforeArrival.hasRisk ||
      rec.metrics.availableUsableQty <= rec.metrics.safetyStock;

    pushAlert({
      id: `alt-stock-${rec.branchId}-${rec.medicationId}`,
      category: 'estoque_baixo',
      severity: isCritical ? 'critica' : 'alta',
      title: `Necessidade de reposição: ${med?.name.split(' (')[0] ?? rec.medicationId} (${br?.name ?? ''})`,
      detail: `Saldo útil FEFO: ${rec.metrics.availableUsableQty} ${
        med?.controlUnit ?? 'un'
      } (alvo: ${rec.metrics.targetStock}, consumo ${formatNumberBR(
        rec.metrics.averageDailyConsumption,
        2
      )}/dia). Reposição: ${rec.totalSuggestedTransferQty} transf. + ${
        rec.remainingPurchaseQty
      } compra.`,
      branchId: rec.branchId,
      branchName: br?.name ?? rec.branchId,
      targetTab: 'reposicao',
      defaultOpenMinutes: 3,
    });
  }

  // 5. Quarantined, expired, or near-expiry lots (dynamic from state.lots!)
  for (const lot of state.lots) {
    if (lot.physicalQty <= 0) continue;
    const br = state.branches.find((b) => b.id === lot.branchId);
    const med = state.medications.find((m) => m.id === lot.medicationId);
    if (!br || !med) continue;
    const daysLeft = daysBetweenDates(now, lot.expiryDate);
    const expired = isLotExpired(lot, now);

    if (lot.status === 'bloqueado') {
      pushAlert({
        id: `alt-lot-blk-${lot.id}`,
        category: 'lote_vencimento',
        severity: daysLeft <= 10 ? 'alta' : 'informativa',
        title: `Lote ${lot.lotCode} em quarentena (${med.name.split(' (')[0]})`,
        detail: `Lote ${lot.lotCode} possui saldo real de ${lot.physicalQty} ${med.controlUnit}(s), validade restante de ${daysLeft} dia(s) e está em quarentena (fora do saldo útil).`,
        branchId: lot.branchId,
        branchName: br.name,
        targetTab: 'alertas',
        defaultOpenMinutes: 4,
      });
    } else if (expired || daysLeft <= br.alertDaysBeforeExpiry) {
      pushAlert({
        id: `alt-lot-exp-${lot.id}`,
        category: 'lote_vencimento',
        severity: expired || daysLeft <= 7 ? 'alta' : 'informativa',
        title: expired
          ? `Lote ${lot.lotCode} vencido (${med.name.split(' (')[0]})`
          : `Lote ${lot.lotCode} vence em ${daysLeft} dia(s)`,
        detail: `${lot.physicalQty} ${med.controlUnit}(s) na ${br.name}. ${
          expired
            ? 'Impedido de dispensação e transferência.'
            : 'Avalie aproveitamento em outra filial pela tela Alertas.'
        }`,
        branchId: lot.branchId,
        branchName: br.name,
        targetTab: 'alertas',
        defaultOpenMinutes: 2,
      });
    }
  }

  const sevRank: Record<OperationalAlert['severity'], number> = {
    critica: 0,
    alta: 1,
    informativa: 2,
  };
  return alerts.sort((a, b) => {
    if (a.acknowledged !== b.acknowledged) return a.acknowledged ? 1 : -1;
    if (sevRank[a.severity] !== sevRank[b.severity]) return sevRank[a.severity] - sevRank[b.severity];
    return b.openMinutes - a.openMinutes;
  });
}
