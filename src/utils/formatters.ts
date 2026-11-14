import {
  AccessResult,
  AlertCategory,
  AlertSeverity,
  AlertStatus,
  IncidentStatus,
  MovementType,
  PurchaseStatus,
  TransferStatus,
  UserRole,
  VaultSensorStatus,
} from '../types/cofre';

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const numberFormatter = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 2,
});

export function formatCurrencyBR(value: number): string {
  return currencyFormatter.format(value);
}

export function formatNumberBR(value: number, maxDecimals = 2): string {
  if (maxDecimals === 2) return numberFormatter.format(value);
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: maxDecimals }).format(value);
}

export function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDaysToDate(baseDate: Date, days: number): Date {
  const copy = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function addDaysISO(baseDate: Date, days: number): string {
  return toISODate(addDaysToDate(baseDate, days));
}

export function parseISODateLocal(isoDate: string): Date {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function daysBetweenDates(fromDate: Date, toISODateStr: string): number {
  const start = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
  const target = parseISODateLocal(toISODateStr);
  const diffMs = target.getTime() - start.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export function formatDateBR(isoOrDate: string | Date | null | undefined): string {
  if (!isoOrDate) return '—';
  const d =
    typeof isoOrDate === 'string'
      ? isoOrDate.length <= 10
        ? parseISODateLocal(isoOrDate)
        : new Date(isoOrDate)
      : isoOrDate;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}

export function formatDateTimeBR(isoStr: string | null | undefined): string {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatCpfInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export function stripCpfDigits(raw: string): string {
  return raw.replace(/\D/g, '');
}

export function roleLabelBR(role: UserRole): string {
  switch (role) {
    case 'funcionario':
      return 'Funcionário';
    case 'gestor':
      return 'Gestor';
    case 'administrador':
      return 'Administrador';
  }
}

export function movementTypeLabelBR(type: MovementType): string {
  switch (type) {
    case 'entrada':
      return 'Entrada';
    case 'saida_consumo':
      return 'Saída por consumo';
    case 'perda':
      return 'Perda';
    case 'ajuste':
      return 'Ajuste';
    case 'expedicao':
      return 'Expedição';
    case 'recebimento':
      return 'Recebimento';
    case 'estorno':
      return 'Estorno';
  }
}

export function transferStatusLabelBR(status: TransferStatus): string {
  switch (status) {
    case 'solicitada':
      return 'Solicitada';
    case 'aprovada_reservada':
      return 'Aprovada e reservada';
    case 'expedida':
      return 'Expedida (em trânsito)';
    case 'recebida':
      return 'Recebida';
    case 'recusada':
      return 'Recusada';
  }
}

export function purchaseStatusLabelBR(status: PurchaseStatus, supplierConfirmed = false): string {
  switch (status) {
    case 'pendente':
      return 'Pendente de aprovação';
    case 'aguardando_aprovacao':
      return 'Aguardando aprovação do Aprovador';
    case 'escalonada_diretor':
      return 'Escalonado p/ Diretor de operações';
    case 'aprovada':
      return supplierConfirmed ? 'Confirmado' : 'Confirmado (aguard. previsão)';
    case 'parcialmente_recebida':
      return 'Parcialmente recebida';
    case 'recebida':
      return 'Recebida';
    case 'recusada':
      return 'Recusada';
    case 'cancelada':
      return 'Cancelada';
  }
}

export function alertSeverityLabelBR(severity: AlertSeverity): string {
  switch (severity) {
    case 'critica':
      return 'Crítica';
    case 'alta':
      return 'Alta';
    case 'informativa':
      return 'Informativa';
  }
}

export function alertStatusLabelBR(status: AlertStatus): string {
  switch (status) {
    case 'novo':
      return 'Novo';
    case 'reconhecido':
      return 'Reconhecido';
    case 'escalonado':
      return 'Escalonado';
  }
}

export function alertCategoryLabelBR(category: AlertCategory): string {
  switch (category) {
    case 'temperatura_fora_faixa':
      return 'Temperatura fora da faixa';
    case 'porta_aberta':
      return 'Porta aberta / violação de cofre';
    case 'acesso_negado':
      return 'Acesso negado / falha de autenticação';
    case 'falha_equipamento':
      return 'Falha de sensor / equipamento';
    case 'estoque_baixo':
      return 'Estoque baixo / risco de ruptura';
    case 'lote_vencimento':
      return 'Lote vencido, bloqueado ou próximo ao vencimento';
    case 'compra_acima_limite':
      return 'Compra acima de R$ 10.000 pendente';
  }
}

export function accessResultLabelBR(result: AccessResult): string {
  switch (result) {
    case 'sucesso':
      return 'Acesso autorizado';
    case 'falha_credenciais':
      return 'Falha na senha ou CPF';
    case 'falha_segundo_fator':
      return 'Falha no código simulado';
    case 'logout':
      return 'Saída do sistema';
  }
}

export function sensorStatusLabelBR(status: VaultSensorStatus): string {
  switch (status) {
    case 'conectado':
      return 'Sensor conectado';
    case 'leitura_desatualizada':
      return 'Leitura desatualizada';
    case 'desconectado':
      return 'Sensor desconectado';
  }
}

export function incidentStatusLabelBR(status: IncidentStatus): string {
  switch (status) {
    case 'aberta':
      return 'Ocorrência aberta';
    case 'bloqueio_aplicado':
      return 'Lotes bloqueados para avaliação';
    case 'avaliada_liberada':
      return 'Avaliada · Liberada para uso';
    case 'avaliada_descarte':
      return 'Avaliada · Destinação/descarte';
  }
}
