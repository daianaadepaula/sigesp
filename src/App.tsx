/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AlertasPage } from './components/AlertasPage';
import { AppLayout } from './components/AppLayout';
import { CofreConservacaoPage } from './components/CofreConservacaoPage';
import { ConfiguracoesPage } from './components/ConfiguracoesPage';
import { FiliaisEstoquesPage } from './components/FiliaisEstoquesPage';
import { HistoricoPage } from './components/HistoricoPage';
import { ImpactoPage } from './components/ImpactoPage';
import { LoginScreen } from './components/LoginScreen';
import { MovimentacoesPage } from './components/MovimentacoesPage';
import { PainelPage } from './components/PainelPage';
import { ReposicaoComprasPage } from './components/ReposicaoComprasPage';
import { CofreProvider, useCofre } from './context/CofreContext';

const MainShell: React.FC = () => {
  const { currentUser, activeTab } = useCofre();

  if (!currentUser) {
    return <LoginScreen />;
  }

  return (
    <AppLayout>
      {activeTab === 'painel' && <PainelPage />}
      {activeTab === 'cofre' && <CofreConservacaoPage />}
      {activeTab === 'filiais' && <FiliaisEstoquesPage />}
      {activeTab === 'impacto' && <ImpactoPage />}
      {activeTab === 'movimentacoes' && <MovimentacoesPage />}
      {activeTab === 'alertas' && <AlertasPage />}
      {activeTab === 'reposicao' && <ReposicaoComprasPage />}
      {activeTab === 'historico' && <HistoricoPage />}
      {activeTab === 'configuracoes' && <ConfiguracoesPage />}
    </AppLayout>
  );
};

export default function App() {
  return (
    <CofreProvider>
      <MainShell />
    </CofreProvider>
  );
}
