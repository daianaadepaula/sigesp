import React, { useState } from 'react';
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  KeyRound,
  Lock,
  ShieldCheck,
  Smartphone,
  UserCheck,
} from 'lucide-react';
import { useCofre } from '../context/CofreContext';
import { UserAccount } from '../types/cofre';
import { formatCpfInput, roleLabelBR } from '../utils/formatters';

export const LoginScreen: React.FC = () => {
  const { state, verifyCredentialsStep1, verifySecondFactorStep2 } = useCofre();
  const [step, setStep] = useState<1 | 2>(1);
  const [cpf, setCpf] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [pendingUser, setPendingUser] = useState<UserAccount | null>(null);
  const [isDemoSelection, setIsDemoSelection] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleStep1Submit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const res = verifyCredentialsStep1(cpf, password);
    if (!res.ok || !res.user) {
      setErrorMsg(res.error ?? 'Falha na validação.');
      return;
    }
    setPendingUser(res.user);
    setTotpCode('');
    setStep(2);
  };

  const handleStep2Submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingUser) return;
    setErrorMsg(null);
    const res = verifySecondFactorStep2(pendingUser.id, totpCode);
    if (!res.ok) {
      setErrorMsg(res.error ?? 'Código inválido.');
    }
  };

  const handleSelectDemoAccount = (user: UserAccount) => {
    setErrorMsg(null);
    setIsDemoSelection(true);
    setCpf(formatCpfInput(user.cpf));
    setPassword(user.password);
    const res = verifyCredentialsStep1(user.cpf, user.password);
    if (res.ok && res.user) {
      setPendingUser(res.user);
      setTotpCode('');
      setStep(2);
    }
  };

  const branchNamesForUser = (user: UserAccount) =>
    user.authorizedBranchIds
      .map((id) => state.branches.find((b) => b.id === id)?.name ?? id)
      .join(', ');

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => {
              setStep(1);
              setPendingUser(null);
              setIsDemoSelection(false);
              setErrorMsg(null);
              setTotpCode('');
            }}
            title="Voltar ao início da tela de acesso"
            className="flex items-center gap-3 text-left hover:opacity-85 transition-opacity cursor-pointer"
          >
            <div className="w-9 h-9 rounded-md bg-[#0F294A] text-white flex items-center justify-center font-display font-bold text-sm shrink-0">
              S
            </div>
            <span className="font-display font-semibold text-base sm:text-lg text-[#0F294A]">
              SIGESP - Sistema de Gerenciamento de Produtos
            </span>
          </button>
          <div className="text-xs text-slate-600 hidden sm:block">
            Prova de conceito · Dados fictícios · Persistência local no navegador
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-lg p-7 flex flex-col justify-between">
            <div>
              <p className="text-xs font-medium text-[#0F294A] uppercase tracking-wide mb-2">
                Cofre refrigerado de alto custo · OMG 360
              </p>
              <h1 className="font-display text-2xl font-semibold text-slate-900 leading-tight mb-3 text-balance">
                Controle de conservação, reposição entre filiais e compras explicáveis
              </h1>
              <p className="text-sm text-slate-600 leading-relaxed mb-6">
                Demonstração completa do fluxo: abertura simulada do cofre refrigerado, movimentação
                por medicamento e lote, cálculo de necessidade, transferência elegível e comparação
                transparente de fornecedores.
              </p>

              <div className="border-t border-slate-200 pt-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-display text-sm font-semibold text-slate-900 flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-[#0F294A]" aria-hidden="true" />
                    <span>Usar conta de demonstração</span>
                  </h2>
                  <span className="text-xs text-slate-500">Sem dados pessoais</span>
                </div>
                <p className="text-xs text-slate-600 mb-3">
                  Selecione um perfil fictício para preencher a 1ª etapa e testar o segundo fator
                  simulado (não é TOTP criptográfico real):
                </p>

                <div className="space-y-2.5">
                  {state.users.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => handleSelectDemoAccount(user)}
                      className="w-full text-left border border-slate-200 hover:border-[#0F294A] hover:bg-slate-50 rounded-md p-3 transition-colors flex items-center justify-between gap-4 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                          <span>{roleLabelBR(user.role)}</span>
                          <span className="text-slate-300" aria-hidden="true">·</span>
                          <span className="font-normal text-slate-700 truncate">{user.name}</span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-2">
                          <span className="font-mono">{user.matricula}</span>
                          <span aria-hidden="true">·</span>
                          <span>{branchNamesForUser(user)}</span>
                        </div>
                      </div>
                      <span className="text-xs font-medium text-[#0F294A] whitespace-nowrap shrink-0">
                        Testar acesso
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 text-xs text-slate-500 space-y-1">
              <div>
                Modo demonstração: segundo fator simulado e armazenamento local no navegador
                (sem sincronização real entre dispositivos).
              </div>
              <div>
                Senhas, códigos de verificação e CPF completo nunca são gravados nos registros de
                auditoria.
              </div>
            </div>
          </div>

          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-lg p-7 flex flex-col justify-center">
            <div className="mb-6">
              <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                <span className={step === 1 ? 'font-semibold text-[#0F294A]' : 'text-emerald-700 font-medium'}>
                  Etapa 1: CPF e senha
                </span>
                <span aria-hidden="true">/</span>
                <span className={step === 2 ? 'font-semibold text-[#0F294A]' : 'text-slate-400'}>
                  Etapa 2: Segundo fator simulado
                </span>
              </div>
              <h2 className="font-display text-xl font-semibold text-slate-900">
                {step === 1 ? 'Acesso individual ao SIGESP' : 'Verificação em duas etapas (simulada)'}
              </h2>
            </div>

            {errorMsg && (
              <div
                role="alert"
                className="mb-4 p-3 rounded-md bg-red-50 border border-red-200 text-xs text-red-800"
              >
                {errorMsg}
              </div>
            )}

            {step === 1 ? (
              <form onSubmit={handleStep1Submit} className="space-y-4">
                <div>
                  <label htmlFor="login-cpf" className="block text-sm font-medium text-slate-700 mb-1.5">
                    CPF fictício do colaborador
                  </label>
                  <input
                    id="login-cpf"
                    type="text"
                    inputMode="numeric"
                    value={cpf}
                    onChange={(e) => setCpf(formatCpfInput(e.target.value))}
                    placeholder="000.000.000-00"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#0F294A] focus:border-[#0F294A] font-mono"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="login-password" className="block text-sm font-medium text-slate-700 mb-1.5">
                    Senha de demonstração
                  </label>
                  <input
                    id="login-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Digite sua senha"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#0F294A] focus:border-[#0F294A]"
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 px-4 bg-[#0F294A] hover:bg-[#163864] text-white text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <KeyRound className="w-4 h-4" aria-hidden="true" />
                  <span>Continuar para segundo fator simulado</span>
                </button>

                <div className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={() => handleSelectDemoAccount(state.users[1])}
                    className="text-xs font-medium text-[#0F294A] hover:underline cursor-pointer"
                  >
                    Atalho rápido: Usar conta de demonstração (Gestor)
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleStep2Submit} className="space-y-4">
                {pendingUser && (
                  <div className="p-3.5 rounded-md bg-slate-50 border border-slate-200 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-900">{pendingUser.name}</span>
                      <span className="font-mono text-slate-600">{pendingUser.matricula}</span>
                    </div>
                    <div className="text-slate-600 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                      <span>Perfil: {roleLabelBR(pendingUser.role)}</span>
                    </div>
                  </div>
                )}

                {pendingUser && (
                  <div className="p-3.5 rounded-md bg-slate-50 border border-slate-300 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[#0F294A] flex items-center gap-1.5">
                        <Smartphone className="w-4 h-4" aria-hidden="true" />
                        <span>Segundo fator simulado (apenas PoC)</span>
                      </span>
                      {isDemoSelection && (
                        <span className="text-xs text-emerald-700 font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                          1ª etapa validada
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600">
                      Código fictício fixo desta conta para simular a 2ª etapa (não é TOTP real):
                    </p>
                    <div className="flex items-center justify-between gap-3 bg-white border border-slate-200 rounded px-3 py-2">
                      <span className="font-mono text-lg font-semibold tracking-widest text-[#0F294A]">
                        {pendingUser.totpSeedLabel}
                      </span>
                      <button
                        type="button"
                        onClick={() => setTotpCode(pendingUser.totpSeedLabel)}
                        className="px-3 py-1 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 rounded transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Preencher código
                      </button>
                    </div>
                  </div>
                )}

                <div>
                  <label htmlFor="login-totp" className="block text-sm font-medium text-slate-700 mb-1.5">
                    Código de verificação (6 dígitos)
                  </label>
                  <input
                    id="login-totp"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="w-full px-3.5 py-2.5 text-base tracking-widest font-mono border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#0F294A] focus:border-[#0F294A]"
                    required
                  />
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setStep(1);
                      setPendingUser(null);
                      setErrorMsg(null);
                    }}
                    className="px-4 py-2.5 border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                    <span>Voltar</span>
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 px-4 bg-[#0F294A] hover:bg-[#163864] text-white text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                    <span>Confirmar acesso</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </main>

      <footer className="bg-white border-t border-slate-200 px-6 py-3">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" aria-hidden="true" />
            <span>SIGESP - Sistema de Gerenciamento de Produtos — PoC local (sem sincronização em nuvem)</span>
          </span>
          <span>Dados, colaboradores, fornecedores e integrações com equipamento são simulados.</span>
        </div>
      </footer>
    </div>
  );
};
