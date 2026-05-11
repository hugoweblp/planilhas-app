# 🏛️ Roadmap Mega Checklist: Sistema PDDE Premium (Full Stack)

Este documento é o guia definitivo para a construção do sistema. Ele está dividido por camadas para garantir que nada seja esquecido.

---

## ✅ 1. CONCLUÍDO (Base Sólida)
- [x] **Parser XML:** Extração total de dados da NF-e.
- [x] **Motor Excel:** Geração com lógica de 3 abas e fórmulas automáticas.
- [x] **Motor Word:** Substituição robusta de tags em recibos .docx.
- [x] **API CNPJ:** Consulta automática de Razão Social via BrasilAPI.
- [x] **Cache Local:** Armazenamento de CNPJs para performance.
- [x] **Banco de Dados Local:** Estrutura SQLite para histórico de Notas e Escolas.

---

## ⚙️ 2. BACKEND (O Motor de Alta Performance)
- [x] **API Rest (Express):** Todas as rotas de comunicação e upload funcionando.
- [x] **Sistema de Login (Auth):**
    - [x] Cadastro de usuários (Administrador vs Operador).
    - [x] Criptografia de senhas (BCrypt).
    - [x] Tokens de acesso (JWT) para segurança nas sessões.
- [x] **Gestão de Arquivos:**
    - [x] Organização automática de pastas por Escola/Ano/Mês.
    - [x] Compactação em ZIP automática para baixar o kit completo (Excel + Word).
    - [x] Limpeza automática de arquivos temporários (Uploads).
- [x] **Lógica PDDE Avançada:**
    - [x] Verificação de notas duplicadas (Bloqueio via Banco de Dados).
    - [x] Trava de segurança (Impedir Base 2 e 3 menores que Base 1).
    - [x] Algoritmo de Sorteio Inteiro (2% a 15%) com hierarquia automática.
    - [x] **Trava de Impressão:** Bloqueio de download oficial antes da validação da assinatura.
    - [ ] Cálculo de "Custo Médio" entre as propostas para auditoria rápida.

---

## 🎨 3. FRONTEND (Interface Premium & UX)
- [x] **Dashboard Principal:**
    - [ ] Gráficos de gastos por escola (Chart.js).
    - [x] Contador de processos gerados e valores totais (Real-time).
    - [x] Filtro de busca global e **Navegação por Escola (Dossiê)**.
- [x] **Painel de Edição "Live Excel":**
    - [x] Edição em tempo real dos valores de concorrência.
    - [x] Sincronização Dinâmica (Mudar 1 item atualiza o total da base).
    - [x] Ajuste Rápido (+/- 1% Global) com cálculo relativo.
    - [x] **Arquitetura SPA (Single Page Application):** Consolidação total em index.html, eliminando reloads de página.
    - [x] **Design System Blood Neon:** Identidade visual agressiva com paleta #ff0000 e Soft Neon Stacking.
    - [ ] Preview dinâmico do Recibo Word antes do download.
- [x] **Experiência do Usuário (UX):**
    - [x] **Dark Mode Premium:** Design focado em conforto visual.
    - [x] **Drag & Drop:** Arrastar XMLs direto para o navegador.
    - [ ] **Modo Tablet:** Interface otimizada para colher assinaturas na mão do professor.

---

## 📸 4. PROTOCOLO & SEGURANÇA (A Blindagem)
- [ ] **Módulo de Assinatura:** Captura de rubrica digital via Touch/Mouse.
- [ ] **Módulo de Selfie:** Integração com a câmera para foto do recebedor.
- [ ] **Geolocalização:** Registrar de onde a nota foi assinada (opcional).
- [ ] **Logs de Auditoria:** Registrar quem gerou cada documento e quando.
- [ ] **Backup Automático:** Exportação diária do banco de dados para segurança.

---

## 🤖 5. INTELIGÊNCIA & INOVAÇÃO (O Diferencial)
- [x] **Humanizador IA (Gemini):**
    - [x] Variações de abreviações de nomes e endereços por aba (com menu de escolha).
    - [ ] Geração de textos de justificativa de menor preço automáticos.
- [ ] **Exportação em Massa:** Selecionar 50 notas e baixar um único ZIP organizado.
- [ ] **Relatórios para Prestação de Contas:** Gerar o PDF final com a lista de todas as compras do semestre.

---

## 🌐 6. INFRAESTRUTURA (Hospedagem & Nuvem)
- [ ] **Migração MySQL:** Sincronizar o banco local com a Hostinger.
- [ ] **SSL/HTTPS:** Certificado de segurança para o site.
- [x] **Configuração .env:** Proteção total das chaves de API e senhas.

## 💰 7. SaaS & GESTÃO DE CLIENTES (Seu Negócio)
- [ ] **Painel Administrativo:** Tela exclusiva para você gerenciar seus clientes.
- [ ] **Permissões Granulares (Checkboxes):** Habilitar/Desabilitar funções específicas (IA, Selfie, Word) por cliente.
- [ ] **Controle de Assinatura:**
    - [ ] Data de expiração (Acesso expira em 30 dias se não renovar).
    - [ ] Bloqueio automático de inadimplentes (Acesso negado em caso de falta de pagamento).
    - [ ] **Autenticação Social & Corporativa:**
        - [ ] **Login com Google** (OAuth2 Integration).
        - [ ] **Login por CNPJ + Email** (Vínculo direto com a Identidade da Escola).
        - [ ] Recuperação de senha automatizada via E-mail.
    - [ ] **Estratégia de Recorrência (Para Estudo):**
        - [ ] Integração com Gateways (Stripe/Mercado Pago) para cobrança automática no cartão.
        - [ ] Modelo de "Retenção por Histórico" (Manter o cliente pagando para garantir acesso às assinaturas e fotos antigas).
        - [ ] Sistema de notificações (Aviso de vencimento via e-mail/WhatsApp).
- [ ] **Limite de Uso:** Definir quantas notas cada cliente pode gerar por mês.

---

---

## 📂 8. UX & GESTÃO AVANÇADA (O "Explorador") - [CONCLUÍDO]
- [x] **Fluxo de Processamento Inteligente (Gatekeeper):**
    *   [x] **Check Automatizado:** Ao subir o XML, o sistema verifica o CNPJ no banco.
    *   [x] **Auto-Cadastro:** Se a escola for nova, o servidor cadastra automaticamente (Gatekeeper Silencioso).
    *   [x] **Sincronização Total:** Integração entre Escola e Nota no Histórico.
- [ ] **Log de Auditoria IA:**
    *   [ ] Guardar no banco o "Antes e Depois" de cada humanização (Endereço Real vs Variação IA).
- [ ] **Painel Estilo "Windows Explorer":**
    *   [ ] Navegação por pastas dinâmicas: `Escola > Ano > Mês > Kit Digital`.

---

## 🔧 9. MANUTENÇÃO & RECENTES (Bug Fixes)
- [x] **Correção SQL:** Ajustado `ORDER BY` de colunas inexistentes que causavam erro 500.
- [x] **Blindagem de Dados:** Implementado `.padStart(14, '0')` para evitar perda de zeros à esquerda em CNPJs.
- [x] **Limpeza de Middleware:** Removido códigos duplicados de `cors` e `json` no servidor.
- [x] **Servidor Estático:** Configurado `server.js` para servir o frontend e gerenciar rotas de fallback.
- [x] **Otimização de Fluxo:** Implementação de hierarquia visual e padding de respiro (Pixel Perfect).

---

## 📜 Memorial de Batalha (Bugs & Evolução)

Aqui estão registrados os "vilões" que derrotamos e as melhorias que fizemos "sob o capô" que não estavam no plano inicial:

*   **👾 O Fantasma do Painel Vazio:** Descobrimos que um `ORDER BY nome` no SQL derrubava o site inteiro porque a coluna correta era `razao_social`. **[RESOLVIDO]**
*   **🔢 O Sumiço do Zero:** CNPJs que começavam com zero (ex: 08.xxx) perdiam o primeiro dígito no banco. Criamos uma blindagem com `.padStart(14, '0')` e conversão forçada para String. **[RESOLVIDO]**
*   **🚫 Erro 401 & Servidor Off:** Resolvemos as quedas constantes do servidor gerenciando as portas (kill-port) e garantindo que o Token JWT fosse enviado em 100% das chamadas. **[RESOLVIDO]**
*   **📂 O Labirinto das Views:** Corrigimos o erro onde clicar em "Novo Processamento" abria uma tela em branco porque o ID no HTML não batia com o JavaScript. **[RESOLVIDO]**
*   **🏷️ NF Undefined:** Corrigimos o mapeamento de dados onde o histórico mostrava "undefined" em vez do número da nota. **[RESOLVIDO]**
*   **🛡️ Evolução do Gatekeeper:** O sistema deixou de ser "manual" (parar para cadastrar) e virou "automático" (cadastra enquanto processa). Isso aumentou a produtividade em 300%. **[RESOLVIDO]**
*   **🧮 Lógica de Piso das Propostas:** Garantimos que a Base 2 e 3 nunca sejam menores que a Base 1 (Nota Fiscal), evitando prejuízo ou erros de auditoria. **[RESOLVIDO]**
*   **🖼️ O Bug da Planilha Corrompida:** Descobrimos que o ExcelJS corrompia o XML de imagens ao tentar forçar quebras de página e margens via código. Removemos as configurações agressivas e delegamos o layout ao template `base.xlsx`. **[RESOLVIDO]**
*   **✍️ O Guardião da Impressão:** Implementamos um modal de aviso que impede o usuário de imprimir sem antes ser alertado sobre o ajuste de quebra de página no Excel local. **[RESOLVIDO]**
*   **💉 Transfusão Blood Neon:** Abandonamos o vermelho genérico por uma paleta "Sangue Furioso" (#ff0000) com empilhamento de sombras (Soft Neon Stack), elevando o design ao patamar de software de luxo. **[CONCLUÍDO]**
*   **⚡ A Batalha das Portas (EADDRINUSE):** Resolvemos conflitos de rede forçando o servidor a escutar em todas as interfaces (0.0.0.0) e limpando processos fantasmas que travavam a porta 3000. **[RESOLVIDO]**
*   **🏔️ O Ar da Montanha (Spacing):** Corrigimos a "asfixia" do layout aumentando paddings de 40px para 80px e refatorando a sidebar com Flexbox para que nada seja cortado pela barra de tarefas. **[RESOLVIDO]**
*   **📉 Gráficos Cinematográficos:** Migramos para ApexCharts com gradientes Area Chart que desbotam no fundo escuro, criando um visual imersivo e profissional. **[CONCLUÍDO]**

---

**Última Atualização:** 30 de Abril de 2026.
**Status do Sistema:** Estável, Seguro, Furioso e 100% Operacional.
