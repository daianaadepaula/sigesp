# SIGESP — Sistema Inteligente de Gestão de Estoques e Suprimentos Preditivos

> **7ª Edição do Hackathon Connect 7.0**  
> *Desafio proposto por: **Einsan Tech** & **OMG 360***  
> *Projeto desenvolvido em equipe como Prova de Conceito (PoC) / Protótipo Funcional.*

---

## 📹 Demonstração e Apresentação (Pitch)

### 📊 Slides da Apresentação
Acesse os slides oficiais do pitch apresentados no desafio:

[![Apresentação de Slides](https://img.shields.io/badge/Apresenta%C3%A7%C3%A3o-Google_Slides-E37400?style=for-the-badge&logo=google-slides&logoColor=white)](https://docs.google.com/presentation/d/e/2PACX-1vQqUGrIG0kDUJyCM6-iGCN99YPJ9TihCxzLMWQIKR7iM3i_wPTz5mTD_A-F4mbjlHLvEN7o9Ecg02wP/pub?start=false&loop=false&delayms=3000)

👉 **Visualizar Slides:** [Clique aqui para abrir a apresentação](https://docs.google.com/presentation/d/e/2PACX-1vQqUGrIG0kDUJyCM6-iGCN99YPJ9TihCxzLMWQIKR7iM3i_wPTz5mTD_A-F4mbjlHLvEN7o9Ecg02wP/pub?start=false&loop=false&delayms=3000)

### 🎥 Vídeo de Demonstração do Protótipo
Assista à demonstração prática dos fluxos do protótipo e à apresentação da solução:

[![Demonstração do SIGESP](https://img.shields.io/badge/V%C3%ADdeo_de_Demonstra%C3%A7%C3%A3o-Assistir_no_YouTube-red?style=for-the-badge&logo=youtube)](https://youtu.be/z-5q2SfOWLc)

👉 **Assistir ao Vídeo:** [Clique aqui para ver a demonstração no YouTube](https://youtu.be/z-5q2SfOWLc)

---

## 1. Resumo do Projeto e Solução (Desafio Einsan Tech & OMG 360)

Desenvolvido durante a **7ª edição do Hackathon Connect 7.0** para o desafio da **Einsan Tech** e **OMG 360**, o **SIGESP** transforma registros de movimentação, consumo e cadeia de frio dos cofres refrigerados *Medical Security* em decisões inteligentes de reposição e compra para farmácias, clínicas e hospitais.

### O Desafio
Medicamentos termolábeis e de alto custo exigem disponibilidade ininterrupta para não comprometer o atendimento ao paciente, mas sem gerar imobilização excessiva de capital de giro nem perdas financeiras irreversíveis por expiração de validade ou quebra na cadeia de temperatura.

### A Solução
O SIGESP soluciona esse gargalo com uma abordagem orientada a regras determinísticas e explicáveis:
* **Controle por Lote e Validade (FEFO):** Priorização do consumo do lote com vencimento mais próximo (*First Expire, First Out*), mitigando desperdícios.
* **Cadeia de Frio e Proteção:** Monitoramento simulado de sensores do cofre refrigerado (temperatura, porta aberta e incidentes de conservação), bloqueando automaticamente lotes sob risco até liberação técnica.
* **Priorização de Transferência entre Filiais:** Antes de emitir uma ordem de compra externa, o sistema verifica a rede de unidades e prioriza a transferência interna quando viável e permitida pelas regras de transporte.
* **Comparação pelo Custo Econômico Total:** Avaliação transparente de fornecedores considerando não apenas o preço unitário, mas frete, pedido mínimo, prazo de entrega, carregamento financeiro e risco de ruptura.
* **Governança e Alertas Automáticos:** Alçadas de aprovação para valores expressivos, controle de duplo fator para acesso ao cofre e escalonamento automático de alertas para os papéis responsáveis.
* **Modelo de Negócio Escalável:** Arquitetura pensada para expansão como serviço (SaaS), atendendo desde redes locais até grandes cooperativas e operadoras de saúde.

---

## 2. Impacto para o Comércio Local

O SIGESP fortalece o comércio local e regional ao tornar a cadeia de suprimentos de medicamentos mais previsível, integrada e eficiente:

* **Estímulo a Distribuidores Regionais:** Ao prever necessidades de abastecimento com antecedência e comparar prazos reais de entrega, a plataforma viabiliza compras programadas junto a fornecedores e distribuidores da própria região, reduzindo a dependência de compras emergenciais de outros estados.
* **Eliminação de Compras de Emergência:** A antecipação de rupturas evita fretes aéreos urgentes ou ágio de preços praticados em compras de última hora.
* **Redução Drástica de Desperdício:** A rotação inteligente de medicamentos de alto custo protege o fluxo de caixa dos estabelecimentos de saúde locais.
* **Geração de Oportunidades no Ecossistema:** Abre frentes de negócios locais para empresas de tecnologia, parceiros de implantação, suporte técnico especializado e manutenção dos equipamentos e cofres na região.

---

## 3. Impacto para as Associações Comerciais

O SIGESP oferece às **Associações Comerciais** uma ferramenta prática e replicável para liderar a inovação setorial e apoiar a competitividade dos seus associados:

* **Aceleração da Transformação Digital:** Proporciona um modelo moderno de gestão baseado em dados acessível para pequenas e médias farmácias, clínicas e distribuidoras associadas.
* **Conexão e Fortalecimento B2B:** Cria canais de articulação direta entre produtores/distribuidores locais e a ponta consumidora (hospitais e farmácias associadas), incentivando que o capital circule no próprio ecossistema local.
* **Programas de Modernização e Capacitação:** Serve como base para iniciativas de modernização empresarial orientadas a indicadores (KPIs de perdas, rupturas e custos de suprimentos) promovidas pelas associações comerciais e entidades de apoio empresarial (como SEBRAE e federações).

---

## 4. Evidências de Validação e Estágio Atual

O SIGESP foi construído e validado como uma **Prova de Conceito (PoC) / Protótipo Funcional Completo** durante o Hackathon Connect 7.0:

### Validações Concluídas
* **Protótipo Interativo Navegável:** Interface com jornadas completas de usuário simulando a rotina de farmacêuticos, gestores e compradores.
* **Monitoramento e Abertura Segura:** Simulação de sensores de temperatura do cofre refrigerado, registro de incidentes de excursão térmica e controle em duas etapas.
* **Motor de Regras Auditável:** Validação de múltiplos cenários de negócio automatizados (transferências elegíveis, regras de transporte térmico, cálculo de ruptura na linha do tempo e aprovações alçadas).
* **Simulador de Impacto Financeiro (90 dias):** Projeção comparativa demonstrando a economia gerada em perdas evitadas versus custos operacionais.
* **Explicações Assistidas:** Justificativas técnicas automatizadas para embasar requisições de compras e auditorias sem inconsistências.

### Estágio Atual
> **Status:** Protótipo funcional validado conceitualmente com base de dados fictícios de demonstração.
> 
> **Próximos Passos:**
> 1. Testes assistidos de usabilidade com gestores de farmácia hospitalar e clínicas associadas.
> 2. Integração via API/firmware com os sensores físicos e travas eletromecânicas dos cofres *Medical Security*.
> 3. Conexão com sistemas hospitalares e ERPs legados de gestão de estoque.

---

## 5. Equipe do Projeto

> Este projeto foi desenvolvido de forma colaborativa e multidisciplinar pela equipe durante a **7ª edição do Hackathon Connect 7.0**:

* **Alessandra Kafka** — *Líder* — [LinkedIn](https://linkedin.com)
* **Pedro Heinrich** — [LinkedIn](https://linkedin.com)
* **Elizabeth Oliveira** —  [LinkedIn](https://linkedin.com)
* **Daiana de Paula** — [LinkedIn](https://linkedin.com)
* **Léo Matias Araújo** — [LinkedIn](https://linkedin.com)

---

<div align="center">
  <sub>Desenvolvido com dedicação para o <b>Hackathon Connect 7.0</b> · Desafio <b>Einsan Tech & OMG 360</b></sub>
</div>
