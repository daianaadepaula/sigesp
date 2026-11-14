import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileText,
  HelpCircle,
  Lock,
  PackagePlus,
  ShieldAlert,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Truck,
  UserCheck,
  X,
} from 'lucide-react';
import { useCofre } from '../context/CofreContext';
import { ACTING_PERSONAS, PURCHASE_APPROVAL_THRESHOLD } from '../data/seedData';
import { requestAiRewrite } from '../services/aiRewriteService';
import {
  ActingPersonaId,
  EvaluatedSupplierOffer,
  PurchaseRequest,
  ReplenishmentRecommendation,
  TransferOrder,
  TransportCondition,
} from '../types/cofre';
import {
  formatCurrencyBR,
  formatDateBR,
  formatDateTimeBR,
  formatNumberBR,
  purchaseStatusLabelBR,
  toISODate,
  transferStatusLabelBR,
} from '../utils/formatters';
import { StatusBadge } from './StatusBadge';

const EXCEPTION_RISK_OPTIONS = [
  'Risco de ruptura antes da chegada do fornecedor',
  'Risco de perda por validade curta do lote ofertado',
  'Risco de estoque do fornecedor não atender integralmente o pedido',
  'Excedente acima da necessidade gerando capital imobilizado',
];

export const ReposicaoComprasPage: React.FC = () => {
  const {
    state,
    currentUser,
    actingPersona,
    setActingPersona,
    recommendations,
    focusBranchId,
    setFocusBranchId,
    focusMedicationId,
    setFocusMedicationId,
    simulation,
    setSimulation,
    updateBranchMedPolicy,
    createTransferOrder,
    approveTransferOrder,
    rejectTransferOrder,
    dispatchTransferOrder,
    receiveTransferOrder,
    createPurchaseRequest,
    approvePurchaseRequest,
    simulatePurchaseEscalation10Min,
    confirmSupplierPurchase,
    revisePurchaseForecast,
    receivePurchasePartial,
    cancelPurchaseRemaining,
    rejectPurchaseRequest,
  } = useCofre();

  const [subTab, setSubTab] = useState<
    'recomendacoes' | 'transferencias' | 'compras' | 'aprovacoes'
  >('recomendacoes');
  const [explainRec, setExplainRec] = useState<ReplenishmentRecommendation | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [aiExplainResult, setAiExplainResult] = useState<{
    key: string;
    text: string;
    usedAi: boolean;
  } | null>(null);
  const [loadingExplainAi, setLoadingExplainAi] = useState(false);
  const [loadingDraftAi, setLoadingDraftAi] = useState(false);

  // Policy / safety stock editor
  const [editingPolicy, setEditingPolicy] = useState(false);
  const [newSafetyInput, setNewSafetyInput] = useState('12');
  const [newCoverageInput, setNewCoverageInput] = useState('7');
  const [policyIsManual, setPolicyIsManual] = useState(false);
  const [policyJustification, setPolicyJustification] = useState(
    'Ajuste operacional de política de reposição'
  );

  // Simulation custom days input
  const [simDaysInput, setSimDaysInput] = useState('10');

  // Purchase creation modal state (normal or exception)
  const [purchaseModal, setPurchaseModal] = useState<{
    offerEval: EvaluatedSupplierOffer;
    rec: ReplenishmentRecommendation;
    asException: boolean;
  } | null>(null);
  const [purchaseQtyInput, setPurchaseQtyInput] = useState('');
  const [purchaseJustification, setPurchaseJustification] = useState(
    'Reposição líquida após transferência interna'
  );
  const [selectedRisks, setSelectedRisks] = useState<string[]>([]);

  // Purchase approval modal (for handling revalidation failure / exception at approval time)
  const [approvePrModal, setApprovePrModal] = useState<{
    pr: PurchaseRequest;
    errorFromNormal?: string;
  } | null>(null);
  const [approveNote, setApproveNote] = useState('');
  const [approveRisks, setApproveRisks] = useState<string[]>([]);

  // Supplier confirmation modal
  const [confirmSupModal, setConfirmSupModal] = useState<PurchaseRequest | null>(null);
  const [confirmSupDate, setConfirmSupDate] = useState('');
  const [confirmSupNote, setConfirmSupNote] = useState('Confirmação de entrega registrada pelo fornecedor');

  // Forecast revision modal
  const [reviseModal, setReviseModal] = useState<PurchaseRequest | null>(null);
  const [reviseDate, setReviseDate] = useState('');
  const [reviseReason, setReviseReason] = useState('');

  // Partial purchase receipt modal
  const [receivePrModal, setReceivePrModal] = useState<PurchaseRequest | null>(null);
  const [prRecvQty, setPrRecvQty] = useState('');
  const [prRecvLot, setPrRecvLot] = useState('');
  const [prRecvExpiry, setPrRecvExpiry] = useState('');
  const [prRecvNote, setPrRecvNote] = useState('');
  const [prRecvToken, setPrRecvToken] = useState('');

  // Purchase reject / cancel remaining modals
  const [rejectPrModal, setRejectPrModal] = useState<PurchaseRequest | null>(null);
  const [rejectPrReason, setRejectPrReason] = useState('');
  const [cancelPrModal, setCancelPrModal] = useState<PurchaseRequest | null>(null);
  const [cancelPrReason, setCancelPrReason] = useState('');

  // Transfer receive modal (supports quantity divergence & transportCondition)
  const [receiveTrfModal, setReceiveTrfModal] = useState<TransferOrder | null>(null);
  const [trfRecvQty, setTrfRecvQty] = useState('');
  const [trfCondition, setTrfCondition] = useState<TransportCondition>('conforme');
  const [trfDivNote, setTrfDivNote] = useState('');

  const canManage = currentUser?.role === 'gestor' || currentUser?.role === 'administrador';
  const todayISO = toISODate(new Date());

  const selectedBranchId = focusBranchId ?? state.branches[0]?.id ?? '';
  const selectedMedId = focusMedicationId ?? state.medications[0]?.id ?? '';

  const activeRec = useMemo(() => {
    return (
      recommendations.find(
        (r) => r.branchId === selectedBranchId && r.medicationId === selectedMedId
      ) ?? recommendations[0]
    );
  }, [recommendations, selectedBranchId, selectedMedId]);

  const activeBranchObj = state.branches.find((b) => b.id === activeRec?.branchId);
  const activeMedObj = state.medications.find((m) => m.id === activeRec?.medicationId);

  const isSimulatingActive =
    simulation !== null &&
    activeRec !== undefined &&
    simulation.branchId === activeRec.branchId &&
    simulation.medicationId === activeRec.medicationId;

  const handleSimulateCoverage = (days: number) => {
    if (!activeRec || days < 1) return;
    setSimulation({
      branchId: activeRec.branchId,
      medicationId: activeRec.medicationId,
      coverageDays: days,
    });
  };

  const handleCancelSimulation = () => {
    setSimulation(null);
  };

  const handleSavePolicy = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRec) return;
    const safety = Number.parseInt(newSafetyInput, 10);
    const cov = Number.parseInt(newCoverageInput, 10);
    const res = updateBranchMedPolicy({
      branchId: activeRec.branchId,
      medicationId: activeRec.medicationId,
      safetyStock: safety,
      coverageDays: cov,
      justification: policyJustification,
      isManualPolicy: policyIsManual,
    });
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error ?? 'Erro ao atualizar política.' });
      return;
    }
    setEditingPolicy(false);
    setSimulation(null);
    setFeedback({
      type: 'ok',
      text: `Política atualizada (segurança: ${safety}, cobertura: ${cov}d) e registrada na auditoria.`,
    });
  };

  const handleRequestSuggestedTransfer = () => {
    if (!activeRec || activeRec.suggestedTransfers.length === 0) return;
    const plan = activeRec.suggestedTransfers[0];
    const res = createTransferOrder({
      medicationId: activeRec.medicationId,
      originBranchId: plan.originBranchId,
      destinationBranchId: activeRec.branchId,
      lotId: plan.lotId,
      quantity: plan.suggestedQty,
      reason: `Recomendação automática: excedente de ${plan.originBranchName} (${plan.distanceKm} km, lote ${plan.lotCode})`,
    });
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error ?? 'Erro ao solicitar transferência.' });
      return;
    }
    setFeedback({
      type: 'ok',
      text: `Transferência ${res.transfer?.code} solicitada (${plan.suggestedQty} unid. de ${plan.originBranchName} para ${activeBranchObj?.name}). Aprovação e reserva disponíveis na aba Transferências.`,
    });
    setSubTab('transferencias');
  };

  const handleOpenPurchaseModal = (offerEval: EvaluatedSupplierOffer, asException: boolean) => {
    if (!activeRec) return;
    setPurchaseModal({ offerEval, rec: activeRec, asException });
    setPurchaseQtyInput(String(offerEval.effectiveOrderQty || activeRec.remainingPurchaseQty));
    setPurchaseJustification(
      asException
        ? `Solicitação por exceção para ${activeBranchObj?.name} (${activeMedObj?.name}) — ${offerEval.offer.supplierName}`
        : `Solicitação de reposição para ${activeBranchObj?.name} (${activeMedObj?.name}) — ${offerEval.offer.supplierName}`
    );
    setSelectedRisks(asException ? [...offerEval.viabilityIssues] : []);
  };

  const handleConfirmPurchaseRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!purchaseModal) return;
    const qty = Number.parseInt(purchaseQtyInput, 10);
    const res = createPurchaseRequest({
      branchId: purchaseModal.rec.branchId,
      medicationId: purchaseModal.rec.medicationId,
      supplierOfferId: purchaseModal.offerEval.offer.id,
      requestedQty: qty,
      netNeedAtRequest: purchaseModal.rec.remainingPurchaseQty,
      justification: purchaseJustification,
      isException: purchaseModal.asException,
      exceptionRisks: purchaseModal.asException ? selectedRisks : undefined,
    });
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error ?? 'Erro ao gerar solicitação de compra.' });
      return;
    }
    setPurchaseModal(null);
    const createdPr = res.purchase;
    const isAwaitingApproval =
      createdPr?.status === 'aguardando_aprovacao' ||
      createdPr?.status === 'escalonada_diretor';
    setFeedback({
      type: 'ok',
      text: isAwaitingApproval
        ? `Pedido ${createdPr?.code} (${formatCurrencyBR(
            createdPr?.totalCost ?? 0
          )}) enviado para aprovação independente do Aprovador (acima de ${formatCurrencyBR(
            PURCHASE_APPROVAL_THRESHOLD
          )}).`
        : `Pedido ${createdPr?.code} confirmado diretamente (dentro do limite de ${formatCurrencyBR(
            PURCHASE_APPROVAL_THRESHOLD
          )}).`,
    });
    setSubTab(isAwaitingApproval ? 'aprovacoes' : 'compras');
  };

  const handleTryApprovePr = (pr: PurchaseRequest) => {
    const res = approvePurchaseRequest(pr.id);
    if (!res.ok) {
      if (res.error?.includes('Segregação de funções')) {
        setFeedback({ type: 'err', text: res.error });
        return;
      }
      // Revalidation may have failed — open exception approval modal if needed
      setApprovePrModal({ pr, errorFromNormal: res.error });
      setApproveNote(pr.justification);
      setApproveRisks(pr.exceptionRisks ?? []);
      return;
    }
    setFeedback({
      type: 'ok',
      text: `Pedido ${pr.code} aprovado por ${actingPersona.name} (${actingPersona.roleTitle}). Status alterado para Confirmado e registrado na auditoria.`,
    });
  };

  const handleConfirmApprovePrException = (e: React.FormEvent) => {
    e.preventDefault();
    if (!approvePrModal) return;
    const res = approvePurchaseRequest(approvePrModal.pr.id, {
      note: approveNote,
      allowException: true,
      exceptionRisks: approveRisks,
    });
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error ?? 'Erro na aprovação por exceção.' });
      return;
    }
    setApprovePrModal(null);
    setFeedback({
      type: 'ok',
      text: `Solicitação ${approvePrModal.pr.code} aprovada por exceção com riscos registrados.`,
    });
  };

  const handleConfirmSupplierSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmSupModal) return;
    const res = confirmSupplierPurchase(confirmSupModal.id, {
      expectedArrivalDate: confirmSupDate,
      note: confirmSupNote,
    });
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error ?? 'Erro ao confirmar fornecimento.' });
      return;
    }
    setConfirmSupModal(null);
    setFeedback({
      type: 'ok',
      text: `Fornecimento da ${confirmSupModal.code} confirmado para ${formatDateBR(confirmSupDate)}.`,
    });
  };

  const handleReviseForecastSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviseModal) return;
    const res = revisePurchaseForecast(reviseModal.id, reviseDate, reviseReason);
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error ?? 'Erro ao revisar previsão.' });
      return;
    }
    setReviseModal(null);
    setReviseReason('');
    setFeedback({
      type: 'ok',
      text: `Nova previsão (${formatDateBR(reviseDate)}) e justificativa registradas na ${reviseModal.code}.`,
    });
  };

  const handleConfirmReceivePr = (e: React.FormEvent) => {
    e.preventDefault();
    if (!receivePrModal) return;
    const res = receivePurchasePartial(receivePrModal.id, {
      receivedQty: Number.parseInt(prRecvQty, 10),
      lotCode: prRecvLot,
      expiryDate: prRecvExpiry,
      operationToken: prRecvToken,
      note: prRecvNote,
    });
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error ?? 'Erro ao receber compra.' });
      return;
    }
    setReceivePrModal(null);
    setFeedback({
      type: 'ok',
      text: `Recebimento da solicitação ${receivePrModal.code} incorporado ao estoque.`,
    });
  };

  const handleConfirmRejectPr = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectPrModal) return;
    const res = rejectPurchaseRequest(rejectPrModal.id, rejectPrReason);
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error ?? 'Erro ao recusar solicitação.' });
      return;
    }
    setRejectPrModal(null);
    setRejectPrReason('');
    setFeedback({ type: 'ok', text: `Solicitação ${rejectPrModal.code} recusada com justificativa.` });
  };

  const handleConfirmCancelPr = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelPrModal) return;
    const res = cancelPurchaseRemaining(cancelPrModal.id, cancelPrReason);
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error ?? 'Erro ao cancelar saldo.' });
      return;
    }
    setCancelPrModal(null);
    setCancelPrReason('');
    setFeedback({
      type: 'ok',
      text: `Saldo restante da solicitação ${cancelPrModal.code} cancelado com justificativa.`,
    });
  };

  const handleConfirmReceiveTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiveTrfModal) return;
    const qty = Number.parseInt(trfRecvQty, 10);
    const res = receiveTransferOrder(receiveTrfModal.id, {
      receivedQty: qty,
      transportCondition: trfCondition,
      divergenceNote: trfDivNote,
    });
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error ?? 'Erro ao receber transferência.' });
      return;
    }
    setReceiveTrfModal(null);
    setFeedback({
      type: 'ok',
      text:
        trfCondition === 'em_avaliacao_desvio'
          ? `${receiveTrfModal.code} recebida em quarentena (lote bloqueado para avaliação técnica).`
          : `${receiveTrfModal.code} recebida no destino (${qty} unid.) e incorporada ao estoque.`,
    });
  };

  const renderTransferActionButtons = (trf: TransferOrder) => {
    if (trf.status === 'solicitada') {
      return canManage ? (
        <div className="flex items-center gap-2 justify-end">
          <button
            type="button"
            onClick={() => {
              const r = approveTransferOrder(trf.id);
              setFeedback(
                r.ok
                  ? { type: 'ok', text: `${trf.code} aprovada e unidades reservadas na origem.` }
                  : { type: 'err', text: r.error ?? 'Erro' }
              );
            }}
            className="px-3 py-1 text-xs font-medium bg-[#0F294A] text-white rounded hover:bg-[#163864] cursor-pointer whitespace-nowrap"
          >
            Aprovar e reservar
          </button>
          <button
            type="button"
            onClick={() => {
              const r = rejectTransferOrder(trf.id, 'Cancelada na avaliação');
              setFeedback(
                r.ok
                  ? { type: 'ok', text: `${trf.code} recusada.` }
                  : { type: 'err', text: r.error ?? 'Erro' }
              );
            }}
            className="px-2.5 py-1 text-xs font-medium border border-slate-300 text-slate-700 rounded hover:bg-slate-50 cursor-pointer"
          >
            Recusar
          </button>
        </div>
      ) : (
        <span className="text-xs text-slate-500">Aguardando Gestor</span>
      );
    }

    if (trf.status === 'aprovada_reservada') {
      return (
        <button
          type="button"
          onClick={() => {
            const r = dispatchTransferOrder(trf.id);
            setFeedback(
              r.ok
                ? { type: 'ok', text: `${trf.code} expedida após revalidação de lote e saldo.` }
                : { type: 'err', text: r.error ?? 'Erro' }
            );
          }}
          className="px-3 py-1 text-xs font-medium bg-[#0F294A] text-white rounded hover:bg-[#163864] cursor-pointer whitespace-nowrap"
        >
          Confirmar expedição
        </button>
      );
    }

    if (trf.status === 'expedida') {
      return (
        <button
          type="button"
          onClick={() => {
            setReceiveTrfModal(trf);
            setTrfRecvQty(String(trf.dispatchedQty ?? trf.quantity));
            setTrfCondition('conforme');
            setTrfDivNote('');
          }}
          className="px-3 py-1 text-xs font-medium bg-emerald-700 text-white rounded hover:bg-emerald-800 cursor-pointer whitespace-nowrap"
        >
          Registrar recebimento
        </button>
      );
    }

    return <span className="text-xs text-slate-500">Encerrada</span>;
  };

  const pendingApprovalsCount = useMemo(
    () =>
      state.purchaseRequests.filter(
        (p) =>
          p.status === 'aguardando_aprovacao' ||
          p.status === 'escalonada_diretor' ||
          p.status === 'pendente'
      ).length,
    [state.purchaseRequests]
  );

  const handleExplainWithAi = async (rec: ReplenishmentRecommendation) => {
    const key = `${rec.branchId}-${rec.medicationId}`;
    const med = state.medications.find((m) => m.id === rec.medicationId);
    const br = state.branches.find((b) => b.id === rec.branchId);
    setLoadingExplainAi(true);
    const res = await requestAiRewrite({
      mode: 'explain',
      deterministicText: rec.explanation.plainSummary,
      contextTitle: `${med?.name ?? rec.medicationId} · ${br?.name ?? rec.branchId}`,
    });
    setAiExplainResult({ key, text: res.text, usedAi: res.usedAi });
    setLoadingExplainAi(false);
  };

  const handleDraftJustificationWithAi = async () => {
    if (!purchaseModal) return;
    const med = state.medications.find((m) => m.id === purchaseModal.rec.medicationId);
    const br = state.branches.find((b) => b.id === purchaseModal.rec.branchId);
    const qty = Number.parseInt(purchaseQtyInput, 10) || purchaseModal.offerEval.effectiveOrderQty;
    const baseDraft = `Solicitação de compra de ${qty} ${
      med?.controlUnit ?? 'caixa(s)'
    } de ${med?.name.split(' (')[0] ?? ''} para a ${br?.name ?? ''} junto ao fornecedor ${
      purchaseModal.offerEval.offer.supplierName
    } (chegada em ${formatDateBR(
      purchaseModal.offerEval.expectedArrivalDate
    )}, custo total de ${formatCurrencyBR(
      qty * purchaseModal.offerEval.offer.pricePerBox + purchaseModal.offerEval.offer.freightCost
    )}), considerando estoque disponível de ${
      purchaseModal.rec.metrics.availableUsableQty
    } e necessidade restante após transferência de ${
      purchaseModal.rec.remainingPurchaseQty
    }.`;

    setLoadingDraftAi(true);
    const res = await requestAiRewrite({
      mode: 'draft_justification',
      deterministicText: baseDraft,
      contextTitle: `${med?.name ?? ''} · ${br?.name ?? ''}`,
    });
    setPurchaseJustification(res.text);
    setLoadingDraftAi(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-semibold text-slate-900">
            Reposição e compras
          </h1>
          <p className="text-sm text-slate-600">
            Necessidade líquida, redistribuição com revalidação por etapa, comparação econômica de
            fornecedores e aprovação independente acima de R$ 10.000.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Agir como (papel fictício) */}
          <div className="flex items-center gap-2 bg-white border border-slate-300 rounded-md px-2.5 py-1.5">
            <UserCheck className="w-3.5 h-3.5 text-[#0F294A] shrink-0" aria-hidden="true" />
            <label
              htmlFor="acting-persona-select"
              className="text-xs font-medium text-slate-600 whitespace-nowrap"
            >
              Agir como (papel fictício):
            </label>
            <select
              id="acting-persona-select"
              value={actingPersona.id}
              onChange={(e) => setActingPersona(e.target.value as ActingPersonaId)}
              className="text-xs font-semibold text-[#0F294A] bg-transparent focus:outline-none cursor-pointer"
            >
              {ACTING_PERSONAS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.roleTitle})
                </option>
              ))}
            </select>
          </div>

          {/* Sub-tabs */}
          <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start flex-wrap">
            <button
              type="button"
              onClick={() => setSubTab('recomendacoes')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                subTab === 'recomendacoes'
                  ? 'bg-white text-[#0F294A] shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Recomendações ({recommendations.filter((r) => r.metrics.netNeedQty > 0).length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('transferencias')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                subTab === 'transferencias'
                  ? 'bg-white text-[#0F294A] shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Transferências ({state.transfers.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('compras')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                subTab === 'compras'
                  ? 'bg-white text-[#0F294A] shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Solicitações de compra ({state.purchaseRequests.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('aprovacoes')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                subTab === 'aprovacoes'
                  ? 'bg-white text-[#0F294A] shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Aprovações ({pendingApprovalsCount})
            </button>
          </div>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-md border text-xs flex items-center justify-between gap-3 ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-700 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-slate-600 hover:text-slate-900 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {subTab === 'recomendacoes' && (
        <div className="space-y-6">
          {/* Selector Table */}
          <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-sm font-semibold text-slate-900">
                Necessidades calculadas na rede (selecione uma linha para detalhar)
              </h2>
              <div className="flex items-center gap-2">
                <select
                  aria-label="Filtrar filial em foco"
                  value={selectedBranchId}
                  onChange={(e) => setFocusBranchId(e.target.value)}
                  className="px-2.5 py-1 text-xs border border-slate-300 rounded bg-white"
                >
                  {state.branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Filtrar medicamento em foco"
                  value={selectedMedId}
                  onChange={(e) => setFocusMedicationId(e.target.value)}
                  className="px-2.5 py-1 text-xs border border-slate-300 rounded bg-white"
                >
                  {state.medications.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                    <th className="py-2.5 px-4">Filial</th>
                    <th className="py-2.5 px-4">Medicamento</th>
                    <th className="py-2.5 px-4 text-right">Disponível</th>
                    <th className="py-2.5 px-4 text-right">Alvo</th>
                    <th className="py-2.5 px-4 text-right">Necessidade</th>
                    <th className="py-2.5 px-4 text-right">Transf. (hipótese)</th>
                    <th className="py-2.5 px-4 text-right">Restante compra</th>
                    <th className="py-2.5 px-4 text-right">Qtd. efetiva fornecedor</th>
                    <th className="py-2.5 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {recommendations
                    .filter(
                      (r) =>
                        r.metrics.netNeedQty > 0 ||
                        (r.branchId === selectedBranchId && r.medicationId === selectedMedId)
                    )
                    .map((rec) => {
                      const br = state.branches.find((b) => b.id === rec.branchId);
                      const md = state.medications.find((m) => m.id === rec.medicationId);
                      const isSelected =
                        rec.branchId === activeRec?.branchId &&
                        rec.medicationId === activeRec?.medicationId;
                      return (
                        <tr
                          key={`${rec.branchId}-${rec.medicationId}`}
                          onClick={() => {
                            setFocusBranchId(rec.branchId);
                            setFocusMedicationId(rec.medicationId);
                          }}
                          className={`cursor-pointer transition-colors ${
                            isSelected ? 'bg-slate-100' : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="py-2.5 px-4 font-medium text-slate-900">{br?.name}</td>
                          <td className="py-2.5 px-4 text-slate-900">{md?.name}</td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                            {rec.metrics.availableUsableQty}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                            {rec.metrics.targetStock}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-red-700">
                            {rec.metrics.netNeedQty}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums text-[#0F294A] font-medium">
                            {rec.totalSuggestedTransferQty}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-900">
                            {rec.remainingPurchaseQty}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                            {rec.effectivePurchaseQty}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExplainRec(rec);
                              }}
                              className="px-2.5 py-1 text-xs font-medium border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 rounded inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
                            >
                              <HelpCircle className="w-3.5 h-3.5 text-[#0F294A]" aria-hidden="true" />
                              <span>Entender recomendação</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Focused Recommendation Details */}
          {activeRec && activeBranchObj && activeMedObj && (
            <div className="space-y-6">
              {/* Formula & Parameter Controls */}
              <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
                  <div>
                    <div className="text-xs font-medium text-[#0F294A]">
                      Análise detalhada · {activeBranchObj.name} · Período base:{' '}
                      {activeRec.metrics.periodDays} dias
                    </div>
                    <h2 className="font-display text-lg font-semibold text-slate-900 mt-0.5">
                      {activeMedObj.name} ({activeMedObj.sku})
                    </h2>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setExplainRec(activeRec)}
                      className="px-3.5 py-1.5 text-xs font-medium bg-[#0F294A] hover:bg-[#163864] text-white rounded-md inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <HelpCircle className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Entender recomendação (8 respostas)</span>
                    </button>
                  </div>
                </div>

                {/* Insufficient consumption history warning */}
                {activeRec.metrics.hasInsufficientHistory && (
                  <div className="p-3.5 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-950 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                      <div>
                        <strong className="font-semibold">
                          Histórico insuficiente ou consumo zerado no período:
                        </strong>{' '}
                        o cálculo automático resulta em CMD = 0 e depende apenas do estoque de
                        segurança ({activeRec.metrics.safetyStock}). Recomenda-se definir política
                        manual justificada caso haja demanda prevista.
                      </div>
                    </div>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => {
                          setNewSafetyInput(String(activeRec.metrics.safetyStock));
                          setNewCoverageInput(String(activeRec.metrics.coverageDays));
                          setPolicyIsManual(true);
                          setPolicyJustification('Política manual por histórico de consumo zerado');
                          setEditingPolicy(true);
                        }}
                        className="px-3 py-1 text-xs font-medium bg-amber-800 text-white rounded hover:bg-amber-900 cursor-pointer"
                      >
                        Definir política manual
                      </button>
                    )}
                  </div>
                )}

                {/* Plain Decision Summary + Written Split + Explicar com IA */}
                <div className="space-y-3">
                  <div className="p-4 rounded-md bg-slate-50 border border-[#0F294A]/25 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[#0F294A]">
                          Explicação da decisão em linguagem simples
                        </span>
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700">
                          Origem: motor de regras determinístico
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={loadingExplainAi}
                        onClick={() => handleExplainWithAi(activeRec)}
                        className="px-3 py-1 text-xs font-medium border border-[#0F294A] bg-white text-[#0F294A] hover:bg-slate-100 rounded inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                      >
                        <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{loadingExplainAi ? 'Gerando...' : 'Explicar com IA'}</span>
                      </button>
                    </div>

                    {activeRec.metrics.netNeedQty > 0 && (
                      <div className="text-sm font-semibold text-slate-900">
                        Divisão recomendada:{' '}
                        {activeRec.suggestedTransfers.length > 0 && (
                          <span>
                            {activeRec.suggestedTransfers
                              .map(
                                (t) =>
                                  `${t.suggestedQty} ${activeMedObj.controlUnit}(s) por transferência da ${t.originBranchName}`
                              )
                              .join(' + ')}
                          </span>
                        )}
                        {activeRec.suggestedTransfers.length > 0 &&
                          activeRec.remainingPurchaseQty > 0 &&
                          ' + '}
                        {activeRec.remainingPurchaseQty > 0 && (
                          <span>
                            {activeRec.remainingPurchaseQty} {activeMedObj.controlUnit}(s) por compra
                          </span>
                        )}
                      </div>
                    )}

                    <p className="text-xs text-slate-700 leading-relaxed">
                      {activeRec.explanation.plainSummary}
                    </p>

                    {aiExplainResult &&
                      aiExplainResult.key === `${activeRec.branchId}-${activeRec.medicationId}` && (
                        <div className="p-3 rounded bg-white border border-slate-200 text-xs space-y-1">
                          <div className="font-semibold text-[#0F294A]">
                            {aiExplainResult.usedAi
                              ? 'Reescrita por IA (apenas texto; os números permanecem 100% do motor)'
                              : 'Texto explicativo determinístico (IA indisponível sem chave configurada)'}
                          </div>
                          <p className="text-slate-700 leading-relaxed">{aiExplainResult.text}</p>
                        </div>
                      )}
                  </div>

                  {/* Memória de cálculo + Contribuição de cada fator */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="p-3.5 rounded border border-slate-200 bg-white space-y-1.5">
                      <div className="font-semibold text-[#0F294A]">Memória de cálculo</div>
                      <ul className="space-y-1 font-mono text-[11px] text-slate-700">
                        {activeRec.explanation.formulaBreakdown.map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="p-3.5 rounded border border-slate-200 bg-white space-y-1.5">
                      <div className="font-semibold text-[#0F294A]">Contribuição de cada fator</div>
                      <ul className="space-y-1 text-slate-700">
                        <li>
                          <strong>Consumo:</strong> média{' '}
                          {formatNumberBR(activeRec.metrics.averageDailyConsumption, 2)}/dia · desvio
                          padrão σ = {formatNumberBR(activeRec.metrics.consumptionStdDev, 2)}/dia.
                        </li>
                        <li>
                          <strong>Saldo útil FEFO:</strong> {activeRec.metrics.availableUsableQty}{' '}
                          {activeMedObj.controlUnit}(s) utilizáveis (bloqueados:{' '}
                          {activeRec.metrics.blockedQty}, reservados:{' '}
                          {activeRec.metrics.reservedQty}).
                        </li>
                        <li>
                          <strong>Estoque de segurança:</strong> política{' '}
                          {activeRec.metrics.safetyStock} (estatístico Z ={' '}
                          {formatNumberBR(activeRec.metrics.zScore, 2)}:{' '}
                          {activeRec.metrics.statisticalSafetyStock}) · ponto de pedido{' '}
                          {activeRec.metrics.reorderPoint}.
                        </li>
                        <li>
                          <strong>Validade dos lotes:</strong>{' '}
                          {activeRec.metrics.nextUsableExpiryDays !== null
                            ? `próximo lote útil vence em ${activeRec.metrics.nextUsableExpiryDays} dia(s).`
                            : 'sem lote útil imediato.'}
                        </li>
                        <li>
                          <strong>Fornecedor:</strong>{' '}
                          {activeRec.bestSupplier
                            ? `${activeRec.bestSupplier.offer.supplierName} (custo econômico ${formatCurrencyBR(
                                activeRec.bestSupplier.economicTotalCost
                              )})`
                            : 'nenhum atende às condições atuais.'}
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Transparent Math Box & Policy Controls */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                  <div className="lg:col-span-7 space-y-3">
                    <div className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                      Memória da necessidade e quantidades separadas
                    </div>
                    <div className="p-4 rounded-md bg-slate-50 border border-slate-200 space-y-2 text-sm">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-slate-600">
                          Consumo médio diário ({activeRec.metrics.periodDays}d):
                        </span>
                        <span className="font-mono font-semibold text-slate-900">
                          {activeRec.metrics.netConsumptionPeriod} ÷ {activeRec.metrics.periodDays} ={' '}
                          {formatNumberBR(activeRec.metrics.averageDailyConsumption, 2)}{' '}
                          {activeMedObj.controlUnit}/dia
                        </span>
                      </div>
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-slate-600">
                          Estoque-alvo ({activeRec.metrics.coverageDays}d cobertura +{' '}
                          {activeRec.metrics.safetyStock} segurança):
                        </span>
                        <span className="font-mono font-semibold text-[#0F294A]">
                          {activeRec.metrics.targetStock} {activeMedObj.controlUnit}(s)
                        </span>
                      </div>
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-slate-600">Saldo disponível aproveitável:</span>
                        <span className="font-mono text-slate-900">
                          {activeRec.metrics.availableUsableQty} {activeMedObj.controlUnit}(s)
                          {(activeRec.metrics.reservedQty > 0 ||
                            activeRec.metrics.blockedQty > 0 ||
                            activeRec.metrics.expiredQty > 0) && (
                            <span className="text-xs text-slate-500">
                              {' '}
                              ({activeRec.metrics.reservedQty} res., {activeRec.metrics.blockedQty}{' '}
                              bloq., {activeRec.metrics.expiredQty} venc.)
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-slate-600">
                          Entradas garantidas (confirmadas e no prazo):
                        </span>
                        <span className="font-mono text-emerald-700 font-medium">
                          {activeRec.metrics.confirmedIncomingTotalQty} {activeMedObj.controlUnit}(s)
                        </span>
                      </div>
                      {(activeRec.metrics.unconfirmedApprovedPurchasesQty > 0 ||
                        activeRec.metrics.delayedOrdersCount > 0) && (
                        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
                          Excluído das entradas garantidas:{' '}
                          {activeRec.metrics.unconfirmedApprovedPurchasesQty} unid. aguardando
                          confirmação do fornecedor · {activeRec.metrics.delayedOrdersCount} pedido(s)
                          atrasado(s).
                        </div>
                      )}

                      <div className="border-t border-slate-200 pt-2 space-y-1.5 text-xs">
                        <div className="flex justify-between">
                          <span className="font-medium text-slate-900">1. Necessidade líquida:</span>
                          <span className="font-mono font-semibold text-red-700">
                            {activeRec.metrics.netNeedQty} {activeMedObj.controlUnit}(s)
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">
                            2. Atendida por transferência (hipótese):
                          </span>
                          <span className="font-mono font-medium text-[#0F294A]">
                            {activeRec.totalSuggestedTransferQty} {activeMedObj.controlUnit}(s)
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">3. Necessidade restante de compra:</span>
                          <span className="font-mono font-semibold text-slate-900">
                            {activeRec.remainingPurchaseQty} {activeMedObj.controlUnit}(s)
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">
                            4. Quantidade efetiva exigida pelo fornecedor:
                          </span>
                          <span className="font-mono font-semibold text-slate-900">
                            {activeRec.effectivePurchaseQty} {activeMedObj.controlUnit}(s)
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">
                            5. Excedente por pedido mínimo / embalagem:
                          </span>
                          <span className="font-mono font-medium text-amber-800">
                            +{activeRec.supplierExcessQty} ({formatCurrencyBR(activeRec.supplierExcessValue)})
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">6. Custo total da compra efetiva:</span>
                          <span className="font-mono font-semibold text-slate-900">
                            {activeRec.bestSupplier
                              ? formatCurrencyBR(activeRec.bestSupplier.totalCost)
                              : 'Sem oferta viável'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {activeRec.stockoutRiskBeforeArrival.hasRisk && (
                      <div className="p-3.5 rounded-md bg-red-50 border border-red-200 text-xs text-red-900 flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
                        <div>
                          <strong className="font-semibold">
                            Risco de ruptura antes da chegada:
                          </strong>{' '}
                          falta estimada a partir de{' '}
                          <span className="font-mono font-semibold">
                            {formatDateBR(activeRec.stockoutRiskBeforeArrival.estimatedStockoutDate)}
                          </span>{' '}
                          (≈{' '}
                          <span className="font-mono font-semibold">
                            {activeRec.stockoutRiskBeforeArrival.uncoveredQty}{' '}
                            {activeMedObj.controlUnit}(s)
                          </span>{' '}
                          descobertas antes da chegada prevista em{' '}
                          {formatDateBR(activeRec.stockoutRiskBeforeArrival.earliestArrivalDate)}).
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Interactive Simulation & Policy Controls */}
                  <div className="lg:col-span-5 space-y-4">
                    <div className="p-4 rounded-md border border-slate-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                          <SlidersHorizontal className="w-3.5 h-3.5 text-[#0F294A]" />
                          <span>Simular dias de cobertura</span>
                        </span>
                        {isSimulatingActive && (
                          <StatusBadge tone="info" icon="clock" label="Simulação ativa" />
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSimDaysInput('10');
                            handleSimulateCoverage(10);
                          }}
                          className="px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-[#0F294A] border border-slate-300 rounded cursor-pointer"
                        >
                          Simular 10 dias
                        </button>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={1}
                            max={90}
                            value={simDaysInput}
                            onChange={(e) => setSimDaysInput(e.target.value)}
                            aria-label="Dias para simular cobertura"
                            className="w-16 px-2 py-1 text-xs font-mono border border-slate-300 rounded"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              handleSimulateCoverage(Number.parseInt(simDaysInput, 10) || 7)
                            }
                            className="px-2.5 py-1 text-xs font-medium border border-slate-300 hover:bg-slate-50 rounded cursor-pointer"
                          >
                            Aplicar
                          </button>
                        </div>
                        {isSimulatingActive && (
                          <button
                            type="button"
                            onClick={handleCancelSimulation}
                            className="px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 border border-red-200 rounded cursor-pointer"
                          >
                            Cancelar simulação
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="p-4 rounded-md border border-slate-200 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-900">
                          Política: Segurança {activeRec.metrics.safetyStock} · Cobertura{' '}
                          {activeRec.metrics.coverageDays}d
                        </span>
                        {canManage && !editingPolicy && (
                          <button
                            type="button"
                            onClick={() => {
                              setNewSafetyInput(String(activeRec.metrics.safetyStock));
                              setNewCoverageInput(String(activeRec.metrics.coverageDays));
                              setPolicyIsManual(false);
                              setEditingPolicy(true);
                            }}
                            className="text-xs font-medium text-[#0F294A] hover:underline cursor-pointer"
                          >
                            Alterar política
                          </button>
                        )}
                      </div>

                      {editingPolicy && canManage && (
                        <form onSubmit={handleSavePolicy} className="space-y-2 pt-1">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[11px] text-slate-600 mb-0.5">
                                Segurança
                              </label>
                              <input
                                type="number"
                                min={0}
                                value={newSafetyInput}
                                onChange={(e) => setNewSafetyInput(e.target.value)}
                                className="w-full px-2.5 py-1 text-xs font-mono border border-slate-300 rounded"
                                required
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] text-slate-600 mb-0.5">
                                Cobertura (dias)
                              </label>
                              <input
                                type="number"
                                min={1}
                                value={newCoverageInput}
                                onChange={(e) => setNewCoverageInput(e.target.value)}
                                className="w-full px-2.5 py-1 text-xs font-mono border border-slate-300 rounded"
                                required
                              />
                            </div>
                          </div>
                          <input
                            type="text"
                            value={policyJustification}
                            onChange={(e) => setPolicyJustification(e.target.value)}
                            placeholder="Justificativa obrigatória da alteração"
                            className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded"
                            required
                          />
                          <div className="flex items-center gap-2">
                            <button
                              type="submit"
                              className="px-3 py-1 text-xs font-medium bg-[#0F294A] text-white rounded hover:bg-[#163864] cursor-pointer"
                            >
                              Salvar com justificativa
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingPolicy(false)}
                              className="px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
                            >
                              Cancelar
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  </div>
                </div>

                {/* Two Distinct Projections: Without Consumption vs Chronological Timeline */}
                <div className="border-t border-slate-200 pt-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="p-3.5 rounded bg-slate-50 border border-slate-200">
                      <div className="font-semibold text-slate-700">
                        Projeção A — Saldo após recebimentos, sem consumo
                      </div>
                      <div className="font-mono text-base font-semibold text-[#0F294A] mt-1">
                        {activeRec.projectedBalanceWithoutConsumption} {activeMedObj.controlUnit}(s)
                      </div>
                      <div className="text-slate-500 mt-0.5">
                        Disponível ({activeRec.metrics.availableUsableQty}) + confirmadas (
                        {activeRec.metrics.confirmedIncomingTotalQty}) + transf. (
                        {activeRec.totalSuggestedTransferQty}) + compra efetiva (
                        {activeRec.effectivePurchaseQty}). Usa a quantidade efetiva do fornecedor, não
                        apenas a necessidade restante.
                      </div>
                    </div>

                    <div className="p-3.5 rounded bg-slate-50 border border-slate-200">
                      <div className="font-semibold text-slate-700">
                        Projeção B — Saldo projetado ao fim do horizonte (com consumo entre eventos)
                      </div>
                      <div className="font-mono text-base font-semibold text-emerald-700 mt-1">
                        {formatNumberBR(activeRec.projectedBalanceEndOfHorizon, 1)}{' '}
                        {activeMedObj.controlUnit}(s)
                      </div>
                      <div className="text-slate-500 mt-0.5">
                        Simulação cronológica FEFO descontando{' '}
                        {formatNumberBR(activeRec.metrics.averageDailyConsumption, 2)}/dia, entradas
                        por data prevista e vencimentos de lotes.
                      </div>
                    </div>
                  </div>

                  {activeRec.projectedTimeline.length > 0 && (
                    <div className="overflow-x-auto border border-slate-200 rounded-md">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 font-medium text-slate-600">
                            <th className="py-2 px-3">Data</th>
                            <th className="py-2 px-3">Evento cronológico</th>
                            <th className="py-2 px-3 text-right">Entradas</th>
                            <th className="py-2 px-3 text-right">Consumo dia</th>
                            <th className="py-2 px-3 text-right">Vencimento</th>
                            <th className="py-2 px-3 text-right">Saldo projetado</th>
                            <th className="py-2 px-3 text-right">Falta / Ruptura</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {activeRec.projectedTimeline.map((st, idx) => (
                            <tr
                              key={`${st.dayOffset}-${idx}`}
                              className={st.stockoutGapToday > 0 ? 'bg-red-50/70' : ''}
                            >
                              <td className="py-2 px-3 font-mono tabular-nums">
                                {formatDateBR(st.dateISO)} (D+{st.dayOffset})
                              </td>
                              <td className="py-2 px-3 text-slate-800">{st.label}</td>
                              <td className="py-2 px-3 text-right font-mono tabular-nums text-emerald-700">
                                {st.eventDelta > 0 ? `+${st.eventDelta}` : '—'}
                              </td>
                              <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-600">
                                {st.consumptionDelta > 0 ? `-${formatNumberBR(st.consumptionDelta, 2)}` : '—'}
                              </td>
                              <td className="py-2 px-3 text-right font-mono tabular-nums text-amber-800">
                                {st.expiredDelta > 0 ? `-${st.expiredDelta}` : '—'}
                              </td>
                              <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                                {formatNumberBR(st.projectedBalance, 1)}
                              </td>
                              <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-red-700">
                                {st.stockoutGapToday > 0 ? formatNumberBR(st.stockoutGapToday, 2) : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </section>

              {/* Scenario Comparison (Same Need) */}
              {activeRec.metrics.netNeedQty > 0 && (
                <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
                  <div>
                    <h3 className="font-display text-base font-semibold text-slate-900">
                      Comparação de cenários para a mesma necessidade ({activeRec.metrics.netNeedQty}{' '}
                      {activeMedObj.controlUnit}(s))
                    </h3>
                    <p className="text-xs text-slate-600">
                      Separação entre economia estimada no desembolso, capital em estoque excedente e
                      perda potencial por vencimento evitada (valores fictícios).
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div className="p-4 rounded-md border border-slate-200 bg-slate-50/70 space-y-1.5">
                      <div className="font-semibold text-slate-900">
                        Cenário A — Compra direta sem redistribuição
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Quantidade efetiva comprada:</span>
                        <span className="font-mono font-semibold">
                          {activeRec.scenarioComparison.purchaseOnlyQty} {activeMedObj.controlUnit}(s)
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Custo total estimado (com frete):</span>
                        <span className="font-mono font-semibold text-slate-900">
                          {activeRec.scenarioComparison.purchaseOnlyOffer
                            ? formatCurrencyBR(activeRec.scenarioComparison.purchaseOnlyTotalCost)
                            : 'Sem oferta viável'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Capital em excedente de compra:</span>
                        <span className="font-mono text-amber-800">
                          {activeRec.scenarioComparison.purchaseOnlyExcessQty} unid. (
                          {formatCurrencyBR(activeRec.scenarioComparison.purchaseOnlyExcessValue)})
                        </span>
                      </div>
                    </div>

                    <div className="p-4 rounded-md border border-[#0F294A]/30 bg-slate-50 space-y-1.5">
                      <div className="font-semibold text-[#0F294A]">
                        Cenário B — Transferência interna + compra complementar
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Transferência + compra efetiva:</span>
                        <span className="font-mono font-semibold">
                          {activeRec.totalSuggestedTransferQty} + {activeRec.effectivePurchaseQty}{' '}
                          {activeMedObj.controlUnit}(s)
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Custo da compra complementar:</span>
                        <span className="font-mono font-semibold text-slate-900">
                          {formatCurrencyBR(
                            activeRec.scenarioComparison.transferPlusPurchaseTotalCost -
                              activeRec.scenarioComparison.transferCostTotal
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Custo logístico da transferência:</span>
                        <span className="font-mono text-slate-800">
                          {activeRec.scenarioComparison.transferCostKnown
                            ? formatCurrencyBR(activeRec.scenarioComparison.transferCostTotal)
                            : 'Não informado (não assumir gratuita)'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Capital em excedente de compra:</span>
                        <span className="font-mono text-amber-800">
                          {activeRec.scenarioComparison.transferPlusPurchaseExcessQty} unid. (
                          {formatCurrencyBR(
                            activeRec.scenarioComparison.transferPlusPurchaseExcessValue
                          )}
                          )
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    <div className="p-3 rounded border border-slate-200 bg-white">
                      <div className="text-slate-500">1. Economia estimada no desembolso</div>
                      <div className="font-mono text-sm font-semibold text-emerald-700 mt-0.5">
                        {activeRec.scenarioComparison.estimatedSavings !== null
                          ? formatCurrencyBR(activeRec.scenarioComparison.estimatedSavings)
                          : 'Indisponível (frete transferência não informado)'}
                      </div>
                    </div>
                    <div className="p-3 rounded border border-slate-200 bg-white">
                      <div className="text-slate-500">2. Excedente imobilizado (Cenário B vs A)</div>
                      <div className="font-mono text-sm font-semibold text-slate-900 mt-0.5">
                        {formatCurrencyBR(
                          activeRec.scenarioComparison.transferPlusPurchaseExcessValue
                        )}{' '}
                        vs {formatCurrencyBR(activeRec.scenarioComparison.purchaseOnlyExcessValue)}
                      </div>
                    </div>
                    <div className="p-3 rounded border border-slate-200 bg-white">
                      <div className="text-slate-500">
                        3. Perda potencial por vencimento evitada (valor de ref.)
                      </div>
                      <div className="font-mono text-sm font-semibold text-[#0F294A] mt-0.5">
                        {formatCurrencyBR(activeRec.scenarioComparison.potentialExpiryLossAvoided)}
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {/* Suggested Redistribution Section */}
              {activeRec.suggestedTransfers.length > 0 && (
                <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-display text-base font-semibold text-slate-900">
                          Redistribuição sugerida entre filiais
                        </h3>
                        <StatusBadge tone="info" icon="clock" label="Sugestão (hipótese)" />
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5">
                        As unidades permanecem livres na origem até que o gestor aprove e reserve a
                        transferência.
                      </p>
                    </div>
                    {canManage && (
                      <button
                        type="button"
                        onClick={handleRequestSuggestedTransfer}
                        className="px-4 py-2 text-xs font-medium bg-[#0F294A] hover:bg-[#163864] text-white rounded-md inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <Truck className="w-4 h-4" aria-hidden="true" />
                        <span>Solicitar transferência sugerida</span>
                      </button>
                    )}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                          <th className="py-2 px-4">Filial origem</th>
                          <th className="py-2 px-4 text-right">Distância</th>
                          <th className="py-2 px-4">Previsão de chegada</th>
                          <th className="py-2 px-4 text-right">Custo transf.</th>
                          <th className="py-2 px-4">Lote e validade</th>
                          <th className="py-2 px-4 text-right">Quantidade sugerida</th>
                          <th className="py-2 px-4">Capacidade de consumo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {activeRec.suggestedTransfers.map((t) => (
                          <tr key={`${t.originBranchId}-${t.lotId}`}>
                            <td className="py-2.5 px-4 font-medium text-slate-900">
                              {t.originBranchName}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono">{t.distanceKm} km</td>
                            <td className="py-2.5 px-4 font-mono text-xs">
                              {formatDateBR(t.expectedArrivalDate)} ({t.transitDays}d)
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono text-xs">
                              {t.estimatedTransferCost !== null
                                ? formatCurrencyBR(t.estimatedTransferCost)
                                : 'Não informado'}
                            </td>
                            <td className="py-2.5 px-4 font-mono text-xs">
                              {t.lotCode} · {formatDateBR(t.lotExpiryDate)} ({t.daysUntilLotExpiry}d)
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono font-semibold text-[#0F294A]">
                              {t.suggestedQty} {activeMedObj.controlUnit}(s)
                            </td>
                            <td className="py-2.5 px-4 text-xs text-emerald-800">
                              Consome na validade (capacidade residual: {t.maxConsumableBeforeExpiry})
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* Supplier Comparison Table + Detailed Economic Cost Bars + De quem comprar */}
              <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-display text-base font-semibold text-slate-900">
                        Comparação de custo detalhada para {activeRec.remainingPurchaseQty}{' '}
                        {activeMedObj.controlUnit}(s) restantes
                      </h3>
                      <p className="text-xs text-slate-500">
                        Custo econômico total = compra + frete + carregamento (15% a.a.) + risco de
                        falta (R$ 2.000/dia descoberto). Ofertas com prazo acima de 10 dias ficam
                        fora da comparação principal.
                      </p>
                    </div>
                  </div>

                  {activeRec.remainingPurchaseQty > 0 && activeRec.bestSupplier === null && (
                    <div className="p-3.5 rounded-md bg-red-50 border border-red-200 text-xs text-red-900 flex items-start gap-2">
                      <ShieldAlert className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
                      <div>
                        <strong className="font-semibold block">
                          Nenhum fornecedor atende às condições atuais
                        </strong>
                        <span>
                          A aprovação pelo fluxo normal está bloqueada. Uma eventual contratação por
                          exceção exige gestor autorizado, justificativa obrigatória e registro
                          explícito dos riscos assumidos.
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {activeRec.remainingPurchaseQty === 0 ? (
                  <div className="p-5 text-sm text-slate-600">
                    Nenhuma compra necessária para os parâmetros atuais (necessidade coberta pelo
                    estoque local, entradas confirmadas e garantidas no prazo ou transferência
                    sugerida).
                  </div>
                ) : (() => {
                  const includedOffers = activeRec.supplierComparison.filter(
                    (s) => !s.excludedByLeadTime
                  );
                  const excludedOffers = activeRec.supplierComparison.filter(
                    (s) => s.excludedByLeadTime
                  );
                  const maxEconomic = Math.max(
                    1,
                    ...includedOffers.map((s) => s.economicTotalCost)
                  );

                  return (
                    <div className="space-y-5 p-5">
                      {/* Card "De quem comprar" */}
                      {activeRec.bestSupplier && (() => {
                        const best = activeRec.bestSupplier;
                        const needsApproval = best.totalCost > PURCHASE_APPROVAL_THRESHOLD;
                        return (
                          <div className="p-4 rounded-lg border border-[#0F294A] bg-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="space-y-1">
                              <div className="text-xs font-semibold uppercase tracking-wide text-[#0F294A]">
                                De quem comprar
                              </div>
                              <div className="text-base font-display font-semibold text-slate-900">
                                {best.offer.supplierName} · {best.effectiveOrderQty}{' '}
                                {activeMedObj.controlUnit}(s)
                              </div>
                              <div className="text-xs text-slate-600 flex flex-wrap gap-x-3 gap-y-1">
                                <span>
                                  Pedido:{' '}
                                  <strong className="font-mono text-slate-900">
                                    {formatCurrencyBR(best.totalCost)}
                                  </strong>{' '}
                                  (compra + frete)
                                </span>
                                <span>·</span>
                                <span>
                                  Custo econômico total:{' '}
                                  <strong className="font-mono text-[#0F294A]">
                                    {formatCurrencyBR(best.economicTotalCost)}
                                  </strong>
                                </span>
                                <span>·</span>
                                <span>
                                  Chegada prevista:{' '}
                                  <strong className="font-mono">
                                    {formatDateBR(best.expectedArrivalDate)} ({best.offer.leadTimeDays}d)
                                  </strong>
                                </span>
                              </div>
                              {needsApproval && (
                                <div className="text-[11px] text-amber-800 font-medium">
                                  Acima de {formatCurrencyBR(PURCHASE_APPROVAL_THRESHOLD)}: exige
                                  aprovação independente de um Aprovador.
                                </div>
                              )}
                            </div>

                            {canManage ? (
                              <button
                                type="button"
                                onClick={() => handleOpenPurchaseModal(best, false)}
                                className="px-4 py-2 text-xs font-medium bg-[#0F294A] hover:bg-[#163864] text-white rounded-md inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                <ShoppingCart className="w-4 h-4" aria-hidden="true" />
                                <span>
                                  {needsApproval
                                    ? 'Enviar para aprovação'
                                    : `Comprar com ${best.offer.supplierName}`}
                                </span>
                              </button>
                            ) : (
                              <span className="text-xs text-slate-500">Requer perfil Gestor</span>
                            )}
                          </div>
                        );
                      })()}

                      {/* Stacked horizontal cost bars */}
                      {includedOffers.length > 0 && (
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <span className="font-semibold text-slate-800">
                              Composição do custo econômico total por fornecedor (prazo ≤ 10 dias)
                            </span>
                            <div className="flex flex-wrap gap-3 text-[11px] text-slate-600">
                              <span className="inline-flex items-center gap-1">
                                <span className="w-2.5 h-2.5 rounded-sm bg-[#0F294A]" /> Compra
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <span className="w-2.5 h-2.5 rounded-sm bg-sky-600" /> Frete
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" /> Carregamento (15% a.a.)
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <span className="w-2.5 h-2.5 rounded-sm bg-red-600" /> Risco de falta (R$ 2.000/dia)
                              </span>
                            </div>
                          </div>

                          <div className="space-y-2.5">
                            {includedOffers.map((s) => {
                              const merch = s.effectiveOrderQty * s.offer.pricePerBox;
                              const freight = s.offer.freightCost;
                              const carry = s.carryingCost;
                              const risk = s.stockoutRiskCost;
                              const merchW = (merch / maxEconomic) * 100;
                              const freightW = (freight / maxEconomic) * 100;
                              const carryW = (carry / maxEconomic) * 100;
                              const riskW = (risk / maxEconomic) * 100;
                              return (
                                <div key={s.offer.id} className="space-y-1 text-xs">
                                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                                    <span className="font-medium text-slate-900">
                                      {s.offer.supplierName} ({s.offer.leadTimeDays}d){' '}
                                      {s.isBestChoice && (
                                        <span className="text-[#0F294A] font-semibold">
                                          · Menor custo econômico
                                        </span>
                                      )}
                                    </span>
                                    <span className="font-mono text-[11px] text-slate-600 tabular-nums">
                                      {formatCurrencyBR(merch)} + {formatCurrencyBR(freight)} +{' '}
                                      {formatCurrencyBR(carry)} + {formatCurrencyBR(risk)} (
                                      {s.stockoutRiskDays}d falta) ={' '}
                                      <strong className="text-slate-900">
                                        {formatCurrencyBR(s.economicTotalCost)}
                                      </strong>
                                    </span>
                                  </div>
                                  <div className="w-full h-3.5 rounded bg-slate-100 overflow-hidden flex">
                                    <div
                                      style={{ width: `${merchW}%` }}
                                      className="bg-[#0F294A] h-full"
                                      title={`Compra: ${formatCurrencyBR(merch)}`}
                                    />
                                    <div
                                      style={{ width: `${freightW}%` }}
                                      className="bg-sky-600 h-full"
                                      title={`Frete: ${formatCurrencyBR(freight)}`}
                                    />
                                    <div
                                      style={{ width: `${carryW}%` }}
                                      className="bg-amber-500 h-full"
                                      title={`Carregamento: ${formatCurrencyBR(carry)}`}
                                    />
                                    <div
                                      style={{ width: `${riskW}%` }}
                                      className="bg-red-600 h-full"
                                      title={`Risco de falta (${s.stockoutRiskDays}d): ${formatCurrencyBR(
                                        risk
                                      )}`}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Detailed Comparison Table (included offers) */}
                      <div className="overflow-x-auto border border-slate-200 rounded-md">
                        <table className="w-full text-left border-collapse text-sm">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                              <th className="py-2.5 px-3">Fornecedor</th>
                              <th className="py-2.5 px-3 text-right">Preço</th>
                              <th className="py-2.5 px-3 text-right">Disp.</th>
                              <th className="py-2.5 px-3">Previsão</th>
                              <th className="py-2.5 px-3 text-right">Frete</th>
                              <th className="py-2.5 px-3 text-right">Carreg.</th>
                              <th className="py-2.5 px-3 text-right">Risco falta</th>
                              <th className="py-2.5 px-3">Pagto. (info.)</th>
                              <th className="py-2.5 px-3">Validade</th>
                              <th className="py-2.5 px-3 text-right">Qtd. efet.</th>
                              <th className="py-2.5 px-3 text-right">Custo pedido</th>
                              <th className="py-2.5 px-3 text-right">Custo econômico</th>
                              <th className="py-2.5 px-3">Viabilidade</th>
                              <th className="py-2.5 px-3 text-right">Ação</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 text-xs">
                            {includedOffers.map((s) => {
                              const needsApproval = s.totalCost > PURCHASE_APPROVAL_THRESHOLD;
                              return (
                                <tr
                                  key={s.offer.id}
                                  className={s.isBestChoice ? 'bg-slate-50' : 'hover:bg-slate-50'}
                                >
                                  <td className="py-3 px-3 font-medium text-slate-900">
                                    <div>{s.offer.supplierName}</div>
                                    {s.isBestChoice && (
                                      <div className="mt-1">
                                        <StatusBadge
                                          tone="nominal"
                                          icon="check"
                                          label="Melhor oferta viável"
                                        />
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-3 px-3 text-right font-mono tabular-nums">
                                    {formatCurrencyBR(s.offer.pricePerBox)}
                                  </td>
                                  <td className="py-3 px-3 text-right font-mono tabular-nums">
                                    {s.offer.availableQty}
                                  </td>
                                  <td className="py-3 px-3 font-mono tabular-nums whitespace-nowrap">
                                    {formatDateBR(s.expectedArrivalDate)} ({s.offer.leadTimeDays}d)
                                  </td>
                                  <td className="py-3 px-3 text-right font-mono tabular-nums">
                                    {s.offer.freightCost === 0
                                      ? 'Grátis'
                                      : formatCurrencyBR(s.offer.freightCost)}
                                  </td>
                                  <td className="py-3 px-3 text-right font-mono tabular-nums">
                                    {formatCurrencyBR(s.carryingCost)}
                                  </td>
                                  <td className="py-3 px-3 text-right font-mono tabular-nums">
                                    {s.stockoutRiskCost > 0 ? (
                                      <span className="text-red-700 font-medium">
                                        {formatCurrencyBR(s.stockoutRiskCost)} ({s.stockoutRiskDays}d)
                                      </span>
                                    ) : (
                                      'R$ 0,00'
                                    )}
                                  </td>
                                  <td className="py-3 px-3 text-slate-600">{s.offer.paymentTerms}</td>
                                  <td className="py-3 px-3 font-mono tabular-nums whitespace-nowrap">
                                    {formatDateBR(s.offer.lotExpiryDate)}
                                  </td>
                                  <td className="py-3 px-3 text-right font-mono font-semibold tabular-nums">
                                    {s.effectiveOrderQty}
                                  </td>
                                  <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700">
                                    {formatCurrencyBR(s.totalCost)}
                                  </td>
                                  <td className="py-3 px-3 text-right font-mono font-semibold tabular-nums text-[#0F294A]">
                                    {formatCurrencyBR(s.economicTotalCost)}
                                  </td>
                                  <td className="py-3 px-3 max-w-[180px]">
                                    {s.isViable ? (
                                      <span className="text-emerald-700 font-medium">
                                        Viável (estoque, prazo e validade)
                                      </span>
                                    ) : (
                                      <span className="text-red-700 font-medium">
                                        Inviável: {s.viabilityIssues.join('; ')}
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-3 px-3 text-right">
                                    {canManage ? (
                                      s.isViable ? (
                                        <button
                                          type="button"
                                          onClick={() => handleOpenPurchaseModal(s, false)}
                                          className={`px-3 py-1.5 text-xs font-medium rounded whitespace-nowrap cursor-pointer ${
                                            s.isBestChoice
                                              ? 'bg-[#0F294A] text-white hover:bg-[#163864]'
                                              : 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
                                          }`}
                                        >
                                          {needsApproval
                                            ? 'Enviar p/ aprovação'
                                            : 'Comprar'}
                                        </button>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => handleOpenPurchaseModal(s, true)}
                                          className="px-3 py-1.5 text-xs font-medium border border-red-300 bg-red-50 text-red-800 hover:bg-red-100 rounded whitespace-nowrap cursor-pointer"
                                        >
                                          Solicitar por exceção
                                        </button>
                                      )
                                    ) : (
                                      <span className="text-xs text-slate-400">Somente Gestor</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Excluded (> 10 days lead time) */}
                      {excludedOffers.length > 0 && (
                        <div className="p-4 rounded-md bg-slate-50 border border-slate-200 space-y-2">
                          <div className="text-xs font-semibold text-slate-800">
                            Fora da comparação (prazo acima de 10 dias)
                          </div>
                          <div className="divide-y divide-slate-200 text-xs">
                            {excludedOffers.map((s) => (
                              <div
                                key={s.offer.id}
                                className="py-2 flex flex-wrap items-center justify-between gap-2"
                              >
                                <div>
                                  <span className="font-semibold text-slate-900">
                                    {s.offer.supplierName}
                                  </span>{' '}
                                  · Prazo{' '}
                                  <span className="font-mono font-semibold text-red-700">
                                    {s.offer.leadTimeDays} dias
                                  </span>{' '}
                                  · Preço {formatCurrencyBR(s.offer.pricePerBox)} · Total pedido{' '}
                                  {formatCurrencyBR(s.totalCost)} ·{' '}
                                  <span className="text-red-700">
                                    {s.viabilityIssues.join('; ') ||
                                      'Prazo superior a 10 dias'}
                                  </span>
                                </div>
                                {canManage && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenPurchaseModal(s, true)}
                                    className="px-2.5 py-1 text-xs border border-red-300 bg-white text-red-800 hover:bg-red-50 rounded cursor-pointer"
                                  >
                                    Solicitar por exceção
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </section>
            </div>
          )}
        </div>
      )}

      {/* Transfers Workflow Tab */}
      {subTab === 'transferencias' && (
        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Transferências entre filiais (revalidação de lote, saldo e validade em cada etapa)
            </h2>
          </div>
          {state.transfers.length === 0 ? (
            <div className="p-6 text-sm text-slate-600">
              Nenhuma transferência registrada até o momento.
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {state.transfers.map((trf) => {
                const med = state.medications.find((m) => m.id === trf.medicationId);
                const orig = state.branches.find((b) => b.id === trf.originBranchId);
                const dest = state.branches.find((b) => b.id === trf.destinationBranchId);
                const isDelayed =
                  (trf.status === 'aprovada_reservada' || trf.status === 'expedida') &&
                  trf.expectedArrivalDate < todayISO;
                return (
                  <div key={trf.id} className="p-5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-[#0F294A]">
                            {trf.code}
                          </span>
                          <StatusBadge
                            tone={
                              trf.status === 'recebida'
                                ? 'nominal'
                                : trf.status === 'recusada'
                                ? 'danger'
                                : trf.status === 'solicitada'
                                ? 'warning'
                                : 'info'
                            }
                            icon={
                              trf.status === 'recebida'
                                ? 'check'
                                : trf.status === 'recusada'
                                ? 'x'
                                : 'truck'
                            }
                            label={transferStatusLabelBR(trf.status)}
                          />
                          {isDelayed && (
                            <StatusBadge tone="danger" icon="warn" label="Entrega atrasada" />
                          )}
                          {trf.transportCondition === 'em_avaliacao_desvio' && (
                            <StatusBadge
                              tone="danger"
                              icon="lock"
                              label="Recebida em quarentena"
                            />
                          )}
                        </div>
                        <div className="text-sm font-medium text-slate-900">
                          {med?.name} · {trf.quantity} {med?.controlUnit}(s) · Lote {trf.lotCode}{' '}
                          (val. {formatDateBR(trf.lotExpiryDate)})
                        </div>
                        <div className="text-xs text-slate-600 flex flex-wrap items-center gap-1.5">
                          <span>{orig?.name}</span>
                          <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{dest?.name}</span>
                          <span aria-hidden="true">·</span>
                          <span>{trf.distanceKm} km</span>
                          <span aria-hidden="true">·</span>
                          <span>Previsão: {formatDateBR(trf.expectedArrivalDate)}</span>
                          {trf.receivedQty !== undefined && trf.receivedQty !== trf.quantity && (
                            <span className="text-amber-800 font-medium">
                              · Recebido com divergência: {trf.receivedQty}/{trf.quantity} (
                              {trf.divergenceNote})
                            </span>
                          )}
                        </div>
                      </div>
                      <div>{renderTransferActionButtons(trf)}</div>
                    </div>

                    {/* Step Audit Trail */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs pt-2 border-t border-slate-100">
                      <div className="p-2 rounded bg-slate-50">
                        <div className="font-medium text-slate-700">1. Solicitada</div>
                        <div className="text-slate-600">
                          {trf.requestedBy.employeeName} ({trf.requestedBy.employeeMatricula})
                        </div>
                        <div className="font-mono text-slate-500">
                          {formatDateTimeBR(trf.requestedBy.timestamp)}
                        </div>
                      </div>
                      <div className="p-2 rounded bg-slate-50">
                        <div className="font-medium text-slate-700">2. Aprovada e reservada</div>
                        {trf.approvedBy ? (
                          <>
                            <div className="text-slate-600">
                              {trf.approvedBy.employeeName} ({trf.approvedBy.employeeMatricula})
                            </div>
                            <div className="font-mono text-slate-500">
                              {formatDateTimeBR(trf.approvedBy.timestamp)}
                            </div>
                          </>
                        ) : (
                          <div className="text-slate-400">Pendente</div>
                        )}
                      </div>
                      <div className="p-2 rounded bg-slate-50">
                        <div className="font-medium text-slate-700">3. Expedida</div>
                        {trf.dispatchedBy ? (
                          <>
                            <div className="text-slate-600">
                              {trf.dispatchedBy.employeeName} ({trf.dispatchedBy.employeeMatricula})
                            </div>
                            <div className="font-mono text-slate-500">
                              {formatDateTimeBR(trf.dispatchedBy.timestamp)}
                            </div>
                          </>
                        ) : (
                          <div className="text-slate-400">Pendente</div>
                        )}
                      </div>
                      <div className="p-2 rounded bg-slate-50">
                        <div className="font-medium text-slate-700">4. Recebida</div>
                        {trf.receivedBy ? (
                          <>
                            <div className="text-slate-600">
                              {trf.receivedBy.employeeName} ({trf.receivedBy.employeeMatricula})
                            </div>
                            <div className="font-mono text-slate-500">
                              {formatDateTimeBR(trf.receivedBy.timestamp)}
                            </div>
                          </>
                        ) : (
                          <div className="text-slate-400">Pendente</div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Purchase Requests Workflow Tab */}
      {subTab === 'compras' && (
        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Solicitações internas de compra (aprovação, confirmação de fornecedor e recebimentos parciais)
            </h2>
          </div>
          {state.purchaseRequests.length === 0 ? (
            <div className="p-6 text-sm text-slate-600">
              Nenhuma solicitação de compra gerada. Utilize a tabela de comparação de fornecedores na
              aba Recomendações.
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {state.purchaseRequests.map((pr) => {
                const med = state.medications.find((m) => m.id === pr.medicationId);
                const br = state.branches.find((b) => b.id === pr.branchId);
                const isDelayed =
                  (pr.status === 'aprovada' || pr.status === 'parcialmente_recebida') &&
                  pr.pendingQty > 0 &&
                  pr.expectedArrivalDate < todayISO;
                const canReceiveHere =
                  (pr.status === 'aprovada' || pr.status === 'parcialmente_recebida') &&
                  pr.pendingQty > 0 &&
                  currentUser?.authorizedBranchIds.includes(pr.branchId);

                return (
                  <div key={pr.id} className="p-5 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-[#0F294A]">
                            {pr.code}
                          </span>
                          <StatusBadge
                            tone={
                              pr.status === 'recebida'
                                ? 'nominal'
                                : pr.status === 'recusada' || pr.status === 'cancelada'
                                ? 'danger'
                                : pr.status === 'pendente' ||
                                  pr.status === 'aguardando_aprovacao' ||
                                  pr.status === 'escalonada_diretor' ||
                                  pr.status === 'parcialmente_recebida'
                                ? 'warning'
                                : 'info'
                            }
                            icon={
                              pr.status === 'recebida'
                                ? 'check'
                                : pr.status === 'recusada' || pr.status === 'cancelada'
                                ? 'x'
                                : 'clock'
                            }
                            label={purchaseStatusLabelBR(pr.status, pr.supplierConfirmed)}
                          />
                          {pr.isException && (
                            <StatusBadge tone="danger" icon="warn" label="Aprovada por exceção" />
                          )}
                          {(pr.status === 'aprovada' || pr.status === 'parcialmente_recebida') &&
                            (pr.supplierConfirmed ? (
                              <StatusBadge
                                tone="nominal"
                                icon="check"
                                label="Fornecimento confirmado"
                              />
                            ) : (
                              <StatusBadge
                                tone="warning"
                                icon="clock"
                                label="Aguardando confirmação do fornecedor"
                              />
                            ))}
                          {isDelayed && (
                            <StatusBadge tone="danger" icon="warn" label="Atrasado (fora da previsão)" />
                          )}
                        </div>
                        <div className="text-sm font-medium text-slate-900">
                          {br?.name} · {med?.name} · Solicitado:{' '}
                          <span className="font-mono">{pr.requestedQty}</span> · Recebido:{' '}
                          <span className="font-mono text-emerald-700">{pr.receivedQtyTotal}</span> ·
                          Pendente:{' '}
                          <span className="font-mono font-semibold text-[#0F294A]">
                            {pr.pendingQty}
                          </span>{' '}
                          · <span className="font-mono">{formatCurrencyBR(pr.totalCost)}</span>
                        </div>
                        <div className="text-xs text-slate-600">
                          {pr.supplierName} · Chegada prevista:{' '}
                          <span className="font-mono font-medium">
                            {formatDateBR(pr.expectedArrivalDate)}
                          </span>{' '}
                          · Pagamento (informativo): {pr.paymentTerms} · Justificativa:{' '}
                          {pr.justification}
                        </div>
                        {pr.isException && pr.exceptionRisks && pr.exceptionRisks.length > 0 && (
                          <div className="text-xs text-red-800 bg-red-50 border border-red-200 rounded px-2.5 py-1">
                            Riscos assumidos na exceção: {pr.exceptionRisks.join('; ')}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {(pr.status === 'aguardando_aprovacao' ||
                          pr.status === 'escalonada_diretor') && (
                          <button
                            type="button"
                            onClick={() => setSubTab('aprovacoes')}
                            className="px-3 py-1.5 text-xs font-medium bg-[#0F294A] text-white rounded hover:bg-[#163864] cursor-pointer"
                          >
                            Gerenciar em Aprovações
                          </button>
                        )}
                        {pr.status === 'pendente' && canManage && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleTryApprovePr(pr)}
                              className="px-3 py-1.5 text-xs font-medium bg-[#0F294A] text-white rounded hover:bg-[#163864] cursor-pointer"
                            >
                              Aprovar internamente
                            </button>
                            <button
                              type="button"
                              onClick={() => setRejectPrModal(pr)}
                              className="px-3 py-1.5 text-xs font-medium border border-red-300 text-red-700 rounded hover:bg-red-50 cursor-pointer"
                            >
                              Recusar
                            </button>
                          </>
                        )}

                        {(pr.status === 'aprovada' || pr.status === 'parcialmente_recebida') &&
                          canManage && (
                            <>
                              {!pr.supplierConfirmed && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setConfirmSupModal(pr);
                                    setConfirmSupDate(pr.expectedArrivalDate);
                                  }}
                                  className="px-3 py-1.5 text-xs font-medium border border-[#0F294A] text-[#0F294A] rounded hover:bg-slate-50 cursor-pointer"
                                >
                                  Confirmar fornecedor
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setReviseModal(pr);
                                  setReviseDate(pr.expectedArrivalDate);
                                  setReviseReason('');
                                }}
                                className="px-3 py-1.5 text-xs font-medium border border-slate-300 text-slate-700 rounded hover:bg-slate-50 inline-flex items-center gap-1 cursor-pointer"
                              >
                                <CalendarClock className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>Revisar previsão</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setCancelPrModal(pr);
                                  setCancelPrReason('');
                                }}
                                className="px-2.5 py-1.5 text-xs font-medium border border-red-200 text-red-700 rounded hover:bg-red-50 cursor-pointer"
                              >
                                Cancelar saldo
                              </button>
                            </>
                          )}

                        {canReceiveHere && (
                          <button
                            type="button"
                            onClick={() => {
                              setReceivePrModal(pr);
                              setPrRecvQty(String(pr.pendingQty));
                              setPrRecvLot(`LOT-${pr.code.replace('SC-', '')}-${pr.receipts.length + 1}`);
                              const d = new Date();
                              d.setDate(d.getDate() + 365);
                              setPrRecvExpiry(d.toISOString().slice(0, 10));
                              setPrRecvNote('');
                              setPrRecvToken(`tok-${pr.id}-${Date.now()}`);
                            }}
                            className="px-3 py-1.5 text-xs font-medium bg-emerald-700 text-white rounded hover:bg-emerald-800 inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <PackagePlus className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Registrar recebimento ({pr.pendingQty} pend.)</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Forecast Revisions History */}
                    {pr.forecastHistory.length > 0 && (
                      <div className="text-xs bg-amber-50/60 border border-amber-200 rounded p-2.5 space-y-1">
                        <div className="font-semibold text-amber-900">
                          Revisões de previsão registradas:
                        </div>
                        {pr.forecastHistory.map((rev) => (
                          <div key={rev.id} className="text-amber-900">
                            {formatDateBR(rev.previousExpectedDate)} →{' '}
                            <strong>{formatDateBR(rev.newExpectedDate)}</strong> por{' '}
                            {rev.employeeName} ({rev.employeeMatricula}) — {rev.reason}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Partial Receipts History */}
                    {pr.receipts.length > 0 && (
                      <div className="text-xs bg-emerald-50/50 border border-emerald-200 rounded p-2.5 space-y-1">
                        <div className="font-semibold text-emerald-900">
                          Recebimentos incorporados ao estoque ({pr.receipts.length}):
                        </div>
                        {pr.receipts.map((rec) => (
                          <div key={rec.id} className="text-emerald-900">
                            +{rec.receivedQty} unid. · Lote <span className="font-mono">{rec.lotCode}</span> ·
                            Val. {formatDateBR(rec.expiryDate)} · por {rec.employeeName} (
                            {rec.employeeMatricula}) em {formatDateTimeBR(rec.timestamp)}
                            {rec.note ? ` — ${rec.note}` : ''}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-1 pt-2 border-t border-slate-100">
                      <span>
                        Solicitada por {pr.requestedBy.employeeName} ({pr.requestedBy.employeeMatricula}) em{' '}
                        {formatDateTimeBR(pr.requestedBy.timestamp)}
                      </span>
                      {pr.approvedBy && (
                        <span>
                          · Aprovada por {pr.approvedBy.employeeName} em{' '}
                          {formatDateTimeBR(pr.approvedBy.timestamp)}
                        </span>
                      )}
                      {pr.rejectedBy && (
                        <span className="text-red-700">
                          · Recusada por {pr.rejectedBy.employeeName}: {pr.rejectedBy.note}
                        </span>
                      )}
                      {pr.cancelledBy && (
                        <span className="text-red-700">
                          · Saldo cancelado por {pr.cancelledBy.employeeName}: {pr.cancelledBy.note}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Independent Approvals Tab (Segregation of Functions > R$ 10.000) */}
      {subTab === 'aprovacoes' && (() => {
        const pendingOrders = state.purchaseRequests.filter(
          (p) =>
            p.status === 'aguardando_aprovacao' ||
            p.status === 'escalonada_diretor' ||
            p.status === 'pendente'
        );
        const decidedOrders = state.purchaseRequests
          .filter(
            (p) =>
              p.status === 'aprovada' ||
              p.status === 'recusada' ||
              p.status === 'parcialmente_recebida' ||
              p.status === 'recebida'
          )
          .slice(0, 8);

        return (
          <div className="space-y-6">
            <section className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-700">
                Agindo agora como:{' '}
                <strong className="text-[#0F294A]">
                  {actingPersona.name} ({actingPersona.roleTitle})
                </strong>{' '}
                · {actingPersona.description}
              </div>
              <span className="text-[11px] font-mono text-slate-500">
                Alçada independente acima de {formatCurrencyBR(PURCHASE_APPROVAL_THRESHOLD)}
              </span>
            </section>

            <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200">
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Pedidos pendentes de aprovação independente ({pendingOrders.length})
                </h2>
                <p className="text-xs text-slate-500">
                  Quem cria o pedido não pode aprová-lo ou recusá-lo (segregação de funções). Sem
                  resposta após 10 min simulados, o pedido escalona para o Diretor de operações.
                </p>
              </div>

              {pendingOrders.length === 0 ? (
                <div className="p-6 text-sm text-slate-600">
                  Nenhum pedido aguardando aprovação independente no momento.
                </div>
              ) : (
                <div className="divide-y divide-slate-200">
                  {pendingOrders.map((pr) => {
                    const med = state.medications.find((m) => m.id === pr.medicationId);
                    const br = state.branches.find((b) => b.id === pr.branchId);
                    const isSameCreator =
                      (Boolean(pr.createdByActorId) && pr.createdByActorId === actingPersona.id) ||
                      (Boolean(pr.createdByActorName) &&
                        pr.createdByActorName === actingPersona.name);
                    const isBuyerRole = actingPersona.roleTitle === 'Comprador';
                    const isSegregationBlocked = isSameCreator || isBuyerRole;

                    return (
                      <div key={pr.id} className="p-5 space-y-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-sm font-semibold text-[#0F294A]">
                                {pr.code}
                              </span>
                              <StatusBadge
                                tone={pr.status === 'escalonada_diretor' ? 'danger' : 'warning'}
                                icon={pr.status === 'escalonada_diretor' ? 'warn' : 'clock'}
                                label={purchaseStatusLabelBR(pr.status, pr.supplierConfirmed)}
                              />
                              <span className="text-xs font-mono text-slate-500">
                                Aguardando há {pr.pendingMinutes ?? 0} min simulados
                              </span>
                            </div>
                            <div className="text-sm font-medium text-slate-900">
                              {br?.name} · {med?.name} · {pr.requestedQty} {med?.controlUnit}(s) ·{' '}
                              <span className="font-mono font-semibold text-[#0F294A]">
                                {formatCurrencyBR(pr.totalCost)}
                              </span>
                            </div>
                            <div className="text-xs text-slate-600">
                              Fornecedor: {pr.supplierName} · Chegada prevista:{' '}
                              {formatDateBR(pr.expectedArrivalDate)} · Criado por:{' '}
                              <strong>
                                {pr.createdByActorName ?? pr.requestedBy.employeeName}
                              </strong>{' '}
                              · Justificativa: {pr.justification}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {pr.status === 'aguardando_aprovacao' && (
                              <button
                                type="button"
                                onClick={() => {
                                  const r = simulatePurchaseEscalation10Min(pr.id);
                                  setFeedback(
                                    r.ok
                                      ? {
                                          type: 'ok',
                                          text: `${pr.code} escalonado para Diretor de operações após +10 min simulados sem resposta.`,
                                        }
                                      : { type: 'err', text: r.error ?? 'Erro ao escalonar.' }
                                  );
                                }}
                                className="px-3 py-1.5 text-xs font-medium border border-slate-300 text-slate-700 rounded hover:bg-slate-50 inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>Simular +10 min sem resposta</span>
                              </button>
                            )}

                            <button
                              type="button"
                              disabled={!canManage || isSegregationBlocked}
                              onClick={() => handleTryApprovePr(pr)}
                              className="px-3.5 py-1.5 text-xs font-medium bg-[#0F294A] text-white rounded hover:bg-[#163864] disabled:bg-slate-200 disabled:text-slate-400 cursor-pointer disabled:cursor-not-allowed"
                            >
                              Aprovar
                            </button>
                            <button
                              type="button"
                              disabled={!canManage || isSegregationBlocked}
                              onClick={() => setRejectPrModal(pr)}
                              className="px-3 py-1.5 text-xs font-medium border border-red-300 text-red-700 rounded hover:bg-red-50 disabled:border-slate-200 disabled:text-slate-400 cursor-pointer disabled:cursor-not-allowed"
                            >
                              Recusar
                            </button>
                          </div>
                        </div>

                        {isSegregationBlocked && (
                          <div className="p-3 rounded bg-amber-50 border border-amber-200 text-xs text-amber-950 flex items-start gap-2">
                            <Lock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
                            <span>
                              <strong>Segregação de funções:</strong>{' '}
                              {isSameCreator
                                ? `${actingPersona.name} criou este pedido e não pode aprová-lo ou recusá-lo.`
                                : 'O papel Comprador não decide pedidos pendentes de aprovação.'}{' '}
                              Altere o seletor <strong>“Agir como (papel fictício)”</strong> no topo
                              para <strong>Helena Vasconcelos (Aprovador)</strong> ou{' '}
                              <strong>Carlos Mendes (Diretor de operações)</strong>.
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {decidedOrders.length > 0 && (
              <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-200">
                  <h3 className="font-display text-sm font-semibold text-slate-900">
                    Decisões recentes
                  </h3>
                </div>
                <div className="divide-y divide-slate-200 text-xs">
                  {decidedOrders.map((pr) => {
                    const med = state.medications.find((m) => m.id === pr.medicationId);
                    return (
                      <div
                        key={pr.id}
                        className="px-5 py-3 flex flex-wrap items-center justify-between gap-2"
                      >
                        <div>
                          <span className="font-mono font-semibold text-[#0F294A]">{pr.code}</span>{' '}
                          · {med?.name.split(' (')[0]} · {pr.supplierName} ·{' '}
                          <span className="font-mono">{formatCurrencyBR(pr.totalCost)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge
                            tone={pr.status === 'recusada' ? 'danger' : 'nominal'}
                            icon={pr.status === 'recusada' ? 'x' : 'check'}
                            label={purchaseStatusLabelBR(pr.status, pr.supplierConfirmed)}
                          />
                          {pr.approvedBy && (
                            <span className="text-slate-500">por {pr.approvedBy.employeeName}</span>
                          )}
                          {pr.rejectedBy && (
                            <span className="text-red-700">
                              por {pr.rejectedBy.employeeName} ({pr.rejectedBy.note})
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        );
      })()}

      {/* Modal: "Entender recomendação" (8 required answers) */}
      {explainRec && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 bg-[#0F294A] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4" aria-hidden="true" />
                <h3 className="font-display text-base font-semibold">
                  Entender recomendação ·{' '}
                  {state.branches.find((b) => b.id === explainRec.branchId)?.name} ·{' '}
                  {state.medications.find((m) => m.id === explainRec.medicationId)?.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setExplainRec(null)}
                className="p-1 rounded hover:bg-white/10 cursor-pointer"
                aria-label="Fechar explicação"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5 text-sm">
              <div className="space-y-2">
                <h4 className="font-display text-xs font-semibold uppercase tracking-wide text-[#0F294A]">
                  Memória de cálculo e saldos do item
                </h4>
                <ul className="p-3.5 rounded bg-slate-50 border border-slate-200 space-y-1.5 text-xs font-mono text-slate-800">
                  {explainRec.explanation.formulaBreakdown.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded border border-slate-200">
                  <div className="font-semibold text-[#0F294A] mb-1">1. Por que agir agora?</div>
                  <p className="text-slate-700 leading-relaxed">{explainRec.explanation.whyActNow}</p>
                </div>
                <div className="p-3.5 rounded border border-slate-200">
                  <div className="font-semibold text-[#0F294A] mb-1">
                    2. Quanto transferir e quanto comprar?
                  </div>
                  <p className="text-slate-700 leading-relaxed">
                    {explainRec.explanation.howMuchTransferAndBuy}
                  </p>
                </div>
                <div className="p-3.5 rounded border border-slate-200">
                  <div className="font-semibold text-[#0F294A] mb-1">
                    3. Qual filial e qual fornecedor?
                  </div>
                  <p className="text-slate-700 leading-relaxed">
                    {explainRec.explanation.whichBranchAndSupplier}
                  </p>
                </div>
                <div className="p-3.5 rounded border border-slate-200">
                  <div className="font-semibold text-[#0F294A] mb-1">4. Quando chega?</div>
                  <p className="text-slate-700 leading-relaxed">{explainRec.explanation.whenArrives}</p>
                </div>
                <div className="p-3.5 rounded border border-slate-200">
                  <div className="font-semibold text-[#0F294A] mb-1">
                    5. Há risco de ruptura antes da chegada?
                  </div>
                  <p className="text-slate-700 leading-relaxed">
                    {explainRec.explanation.stockoutBeforeArrival}
                  </p>
                </div>
                <div className="p-3.5 rounded border border-slate-200">
                  <div className="font-semibold text-[#0F294A] mb-1">6. Qual excedente é gerado?</div>
                  <p className="text-slate-700 leading-relaxed">
                    {explainRec.explanation.excessCreated}
                  </p>
                </div>
                <div className="p-3.5 rounded border border-slate-200">
                  <div className="font-semibold text-[#0F294A] mb-1">
                    7. Qual o risco de vencimento?
                  </div>
                  <p className="text-slate-700 leading-relaxed">{explainRec.explanation.expiryRisk}</p>
                </div>
                <div className="p-3.5 rounded border border-slate-200">
                  <div className="font-semibold text-[#0F294A] mb-1">
                    8. O que falta confirmar ou informar?
                  </div>
                  <p className="text-slate-700 leading-relaxed">
                    {explainRec.explanation.missingDataOrConfirmations}
                  </p>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setExplainRec(null)}
                  className="px-4 py-2 text-xs font-medium bg-[#0F294A] text-white rounded hover:bg-[#163864] cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Generate Purchase Request (Normal or Exception) */}
      {purchaseModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-lg w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-display text-base font-semibold text-slate-900 flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-[#0F294A]" aria-hidden="true" />
                <span>
                  {purchaseModal.asException
                    ? 'Solicitação de compra por EXCEÇÃO'
                    : 'Gerar solicitação interna de compra'}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setPurchaseModal(null)}
                className="text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmPurchaseRequest} className="space-y-4 text-sm">
              <div className="p-3 rounded bg-slate-50 border border-slate-200 text-xs space-y-1">
                <div className="font-semibold text-slate-900">
                  {purchaseModal.offerEval.offer.supplierName}
                </div>
                <div className="text-slate-600">
                  Preço: {formatCurrencyBR(purchaseModal.offerEval.offer.pricePerBox)} · Frete:{' '}
                  {formatCurrencyBR(purchaseModal.offerEval.offer.freightCost)} · Mínimo:{' '}
                  {purchaseModal.offerEval.offer.minOrderQty} · Pagamento (informativo):{' '}
                  {purchaseModal.offerEval.offer.paymentTerms}
                </div>
                {purchaseModal.asException && (
                  <div className="text-red-700 font-medium pt-1">
                    Motivos de inviabilidade: {purchaseModal.offerEval.viabilityIssues.join('; ')}
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="pr-qty" className="block text-xs font-medium text-slate-700 mb-1">
                  Quantidade a solicitar (sugerida efetiva:{' '}
                  {purchaseModal.offerEval.effectiveOrderQty})
                </label>
                <input
                  id="pr-qty"
                  type="number"
                  min={1}
                  value={purchaseQtyInput}
                  onChange={(e) => setPurchaseQtyInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
                  required
                />
              </div>

              {purchaseModal.asException && (
                <div className="space-y-2 p-3 rounded bg-red-50 border border-red-200 text-xs">
                  <div className="font-semibold text-red-900">
                    Registro explícito dos riscos assumidos na exceção (selecione ao menos 1):
                  </div>
                  {Array.from(
                    new Set([
                      ...purchaseModal.offerEval.viabilityIssues,
                      ...EXCEPTION_RISK_OPTIONS,
                    ])
                  ).map((risk) => (
                    <label key={risk} className="flex items-start gap-2 cursor-pointer text-red-950">
                      <input
                        type="checkbox"
                        checked={selectedRisks.includes(risk)}
                        onChange={(e) =>
                          setSelectedRisks((prev) =>
                            e.target.checked ? [...prev, risk] : prev.filter((r) => r !== risk)
                          )
                        }
                        className="mt-0.5"
                      />
                      <span>{risk}</span>
                    </label>
                  ))}
                </div>
              )}

              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label htmlFor="pr-just" className="block text-xs font-medium text-slate-700">
                    Justificativa obrigatória
                  </label>
                  <button
                    type="button"
                    disabled={loadingDraftAi}
                    onClick={handleDraftJustificationWithAi}
                    className="px-2.5 py-1 text-[11px] font-medium border border-[#0F294A] text-[#0F294A] rounded hover:bg-slate-50 inline-flex items-center gap-1 cursor-pointer disabled:opacity-60"
                  >
                    <Sparkles className="w-3 h-3" aria-hidden="true" />
                    <span>{loadingDraftAi ? 'Redigindo...' : 'Redigir com IA'}</span>
                  </button>
                </div>
                <textarea
                  id="pr-just"
                  rows={3}
                  value={purchaseJustification}
                  onChange={(e) => setPurchaseJustification(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
                  required
                />
              </div>

              {(() => {
                const qty = Number.parseInt(purchaseQtyInput, 10) || 0;
                const estTotal =
                  qty * purchaseModal.offerEval.offer.pricePerBox +
                  purchaseModal.offerEval.offer.freightCost;
                const needsApproval = estTotal > PURCHASE_APPROVAL_THRESHOLD;
                return (
                  <>
                    <div className="p-3 rounded bg-slate-50 border border-slate-200 space-y-1 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">Total estimado do pedido:</span>
                        <span className="font-mono font-semibold text-sm text-[#0F294A]">
                          {formatCurrencyBR(estTotal)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600">
                        <span>Chegada prevista:</span>
                        <span className="font-mono font-medium text-slate-900">
                          {formatDateBR(purchaseModal.offerEval.expectedArrivalDate)} (
                          {purchaseModal.offerEval.offer.leadTimeDays}d)
                        </span>
                      </div>
                      <div
                        className={`pt-1 font-medium ${
                          needsApproval ? 'text-amber-800' : 'text-emerald-700'
                        }`}
                      >
                        {needsApproval
                          ? `Acima de ${formatCurrencyBR(
                              PURCHASE_APPROVAL_THRESHOLD
                            )}: ficará "Aguardando aprovação do Aprovador".`
                          : `Até ${formatCurrencyBR(
                              PURCHASE_APPROVAL_THRESHOLD
                            )}: será confirmado diretamente como "Confirmado".`}
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setPurchaseModal(null)}
                        className="px-3.5 py-2 text-xs font-medium border border-slate-300 rounded text-slate-700 hover:bg-slate-50 cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className={`px-4 py-2 text-xs font-medium text-white rounded cursor-pointer ${
                          purchaseModal.asException
                            ? 'bg-red-700 hover:bg-red-800'
                            : 'bg-[#0F294A] hover:bg-[#163864]'
                        }`}
                      >
                        {purchaseModal.asException
                          ? 'Registrar solicitação por exceção'
                          : needsApproval
                          ? 'Enviar para aprovação'
                          : 'Confirmar compra'}
                      </button>
                    </div>
                  </>
                );
              })()}
            </form>
          </div>
        </div>
      )}

      {/* Modal: Approve Purchase Request with Exception (when revalidation fails at approval) */}
      {approvePrModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-lg w-full p-5 space-y-4">
            <h3 className="font-display text-base font-semibold text-red-900">
              Revalidação na aprovação falhou — {approvePrModal.pr.code}
            </h3>
            <p className="text-xs text-red-800 bg-red-50 border border-red-200 rounded p-3">
              {approvePrModal.errorFromNormal}
            </p>
            <form onSubmit={handleConfirmApprovePrException} className="space-y-3 text-xs">
              <div className="space-y-1.5">
                <div className="font-semibold text-slate-800">Riscos assumidos na aprovação:</div>
                {EXCEPTION_RISK_OPTIONS.map((risk) => (
                  <label key={risk} className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={approveRisks.includes(risk)}
                      onChange={(e) =>
                        setApproveRisks((prev) =>
                          e.target.checked ? [...prev, risk] : prev.filter((r) => r !== risk)
                        )
                      }
                      className="mt-0.5"
                    />
                    <span>{risk}</span>
                  </label>
                ))}
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Justificativa do gestor para aprovar por exceção
                </label>
                <textarea
                  rows={2}
                  value={approveNote}
                  onChange={(e) => setApproveNote(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded"
                  required
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setApprovePrModal(null)}
                  className="px-3.5 py-2 border border-slate-300 rounded cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-medium bg-red-700 text-white rounded hover:bg-red-800 cursor-pointer"
                >
                  Aprovar por exceção
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Supplier Confirmation */}
      {confirmSupModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-5 space-y-4">
            <h3 className="font-display text-base font-semibold text-slate-900">
              Confirmar fornecimento · {confirmSupModal.code}
            </h3>
            <p className="text-xs text-slate-600">
              Aprovação interna não significa entrega garantida. Confirme aqui após aceite formal e
              previsão do fornecedor.
            </p>
            <form onSubmit={handleConfirmSupplierSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Data prevista de chegada confirmada
                </label>
                <input
                  type="date"
                  value={confirmSupDate}
                  onChange={(e) => setConfirmSupDate(e.target.value)}
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded"
                  required
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Observação / protocolo</label>
                <input
                  type="text"
                  value={confirmSupNote}
                  onChange={(e) => setConfirmSupNote(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded"
                  required
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmSupModal(null)}
                  className="px-3.5 py-2 border border-slate-300 rounded cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-medium bg-[#0F294A] text-white rounded hover:bg-[#163864] cursor-pointer"
                >
                  Confirmar fornecimento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Revise Purchase Forecast */}
      {reviseModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-5 space-y-4">
            <h3 className="font-display text-base font-semibold text-slate-900">
              Revisar previsão de chegada · {reviseModal.code}
            </h3>
            <form onSubmit={handleReviseForecastSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Nova data prevista de chegada
                </label>
                <input
                  type="date"
                  value={reviseDate}
                  onChange={(e) => setReviseDate(e.target.value)}
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded"
                  required
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Justificativa obrigatória da revisão
                </label>
                <textarea
                  rows={2}
                  value={reviseReason}
                  onChange={(e) => setReviseReason(e.target.value)}
                  placeholder="Ex: Reprogramação de rota frigorífica pelo fornecedor"
                  className="w-full px-3 py-2 border border-slate-300 rounded"
                  required
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReviseModal(null)}
                  className="px-3.5 py-2 border border-slate-300 rounded cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-medium bg-[#0F294A] text-white rounded hover:bg-[#163864] cursor-pointer"
                >
                  Salvar nova previsão
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Receive Purchase Partial or Full */}
      {receivePrModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-display text-base font-semibold text-slate-900">
                Receber compra {receivePrModal.code} (pendente: {receivePrModal.pendingQty})
              </h3>
              <button
                type="button"
                onClick={() => setReceivePrModal(null)}
                className="text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleConfirmReceivePr} className="space-y-3 text-sm">
              <p className="text-xs text-slate-600">
                Aceita recebimento parcial (menor que o pendente) em múltiplos lotes. Quantidades
                acima de {receivePrModal.pendingQty} são bloqueadas.
              </p>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Quantidade recebida neste lote (máx. {receivePrModal.pendingQty})
                </label>
                <input
                  type="number"
                  min={1}
                  max={receivePrModal.pendingQty}
                  value={prRecvQty}
                  onChange={(e) => setPrRecvQty(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Código do lote</label>
                <input
                  type="text"
                  value={prRecvLot}
                  onChange={(e) => setPrRecvLot(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Data de validade
                </label>
                <input
                  type="date"
                  value={prRecvExpiry}
                  onChange={(e) => setPrRecvExpiry(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Observação (opcional)
                </label>
                <input
                  type="text"
                  value={prRecvNote}
                  onChange={(e) => setPrRecvNote(e.target.value)}
                  placeholder="Ex: Entrega parcial 1/2"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReceivePrModal(null)}
                  className="px-3.5 py-2 text-xs border border-slate-300 rounded cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-medium bg-emerald-700 text-white rounded hover:bg-emerald-800 cursor-pointer"
                >
                  Confirmar recebimento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Receive Transfer (with Divergence & Quarantine support) */}
      {receiveTrfModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-5 space-y-4">
            <h3 className="font-display text-base font-semibold text-slate-900">
              Receber transferência {receiveTrfModal.code}
            </h3>
            <form onSubmit={handleConfirmReceiveTransfer} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Quantidade recebida (expedida: {receiveTrfModal.dispatchedQty ?? receiveTrfModal.quantity})
                </label>
                <input
                  type="number"
                  min={1}
                  value={trfRecvQty}
                  onChange={(e) => setTrfRecvQty(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded"
                  required
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Condição de transporte no recebimento
                </label>
                <select
                  value={trfCondition}
                  onChange={(e) => setTrfCondition(e.target.value as TransportCondition)}
                  className="w-full px-3 py-2 border border-slate-300 rounded bg-white"
                >
                  <option value="conforme">Conforme (disponibilizar para uso)</option>
                  <option value="em_avaliacao_desvio">
                    Em avaliação / desvio térmico (receber como lote bloqueado)
                  </option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Observação (obrigatória se houver divergência ou desvio)
                </label>
                <textarea
                  rows={2}
                  value={trfDivNote}
                  onChange={(e) => setTrfDivNote(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded"
                  required={
                    Number.parseInt(trfRecvQty, 10) !== receiveTrfModal.quantity ||
                    trfCondition === 'em_avaliacao_desvio'
                  }
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReceiveTrfModal(null)}
                  className="px-3.5 py-2 border border-slate-300 rounded cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-medium bg-emerald-700 text-white rounded hover:bg-emerald-800 cursor-pointer"
                >
                  Confirmar recebimento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Reject Purchase Request */}
      {rejectPrModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-5 space-y-4">
            <h3 className="font-display text-base font-semibold text-slate-900">
              Recusar solicitação {rejectPrModal.code}
            </h3>
            <form onSubmit={handleConfirmRejectPr} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Justificativa obrigatória da recusa
                </label>
                <textarea
                  rows={3}
                  value={rejectPrReason}
                  onChange={(e) => setRejectPrReason(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded"
                  required
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRejectPrModal(null)}
                  className="px-3.5 py-2 text-xs border border-slate-300 rounded cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-medium bg-red-700 text-white rounded hover:bg-red-800 cursor-pointer"
                >
                  Confirmar recusa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Cancel Remaining Balance */}
      {cancelPrModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-5 space-y-4">
            <h3 className="font-display text-base font-semibold text-slate-900">
              Cancelar saldo restante · {cancelPrModal.code} ({cancelPrModal.pendingQty} pendentes)
            </h3>
            <form onSubmit={handleConfirmCancelPr} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Justificativa obrigatória para cancelar o saldo
                </label>
                <textarea
                  rows={3}
                  value={cancelPrReason}
                  onChange={(e) => setCancelPrReason(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded"
                  required
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCancelPrModal(null)}
                  className="px-3.5 py-2 text-xs border border-slate-300 rounded cursor-pointer"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-medium bg-red-700 text-white rounded hover:bg-red-800 cursor-pointer"
                >
                  Cancelar saldo restante
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
