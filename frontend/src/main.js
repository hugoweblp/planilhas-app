const API_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000/api' : '/api'; // Usa o caminho relativo do servidor

let notaAtual = null; // Memória da nota em edição
let loteAtual = []; // Notas do upload atual (Carrossel)
let indexLote = 0;   // Posição no lote
let historicoCompleto = []; // Cache do histórico para filtros rápidos
let chartVolume = null;
let chartStatus = null;
let pollingInterval = null; // Para monitorar assinatura em tempo real

// Função Utilitária para Animação de Números (Count Up)
function animateValue(id, start, end, duration, isCurrency = false) {
    const obj = document.getElementById(id);
    if (!obj) return;
    
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const value = progress * (end - start) + start;
        
        if (isCurrency) {
            obj.innerText = new Intl.NumberFormat('pt-BR', {
                style: 'currency',
                currency: 'BRL'
            }).format(value);
        } else {
            obj.innerText = Math.floor(value);
        }
        
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

// Efeito de Terminal Hacker para o Scanner
let scannerInterval = null;
function iniciarConsoleScanner(qtd) {
    const textEl = document.querySelector('.scanner-text');
    if (!textEl) return;
    
    const labelNota = qtd > 1 ? 'notas' : 'nota';
    
    const messages = [
        `> Lendo ${qtd} ${labelNota}...`,
        "> Extraindo tags do XML...",
        "> Identificando CNPJ e Escola... OK",
        "> Capturando CFOP e Valores...",
        "> Injetando no modelo Excel... OK",
        "> Sistema pronto para exibição!"
    ];
    
    textEl.innerHTML = "> Iniciando varredura profunda...<span style='animation: blink 1s infinite'>_</span>";
    
    let i = 0;
    scannerInterval = setInterval(() => {
        if (i < messages.length) {
            textEl.innerHTML = messages[i] + "<span style='animation: blink 1s infinite'>_</span>";
            i++;
        }
    }, 600);
}

function pararConsoleScanner() {
    if (scannerInterval) clearInterval(scannerInterval);
    const textEl = document.querySelector('.scanner-text');
    if (textEl) textEl.innerHTML = "Processando XML...";
}

document.addEventListener('DOMContentLoaded', () => {
    // 🛡️ PROTEÇÃO DE ROTA: Verifica se o usuário está logado
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user'));

    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    // Personaliza a barra lateral com os dados do usuário
    if (user) {
        const usernameEl = document.querySelector('.username');
        const avatarEl = document.querySelector('.avatar');
        const userplanEl = document.querySelector('.userplan');

        if (usernameEl) usernameEl.innerText = user.nome;
        if (avatarEl) avatarEl.innerText = user.nome.substring(0, 2).toUpperCase();
        if (userplanEl) userplanEl.innerText = user.nivel === 'admin' ? 'Administrador' : 'Operador';
    }

    // Lógica de Logout
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.onclick = () => {
            if (confirm('Deseja realmente sair do sistema?')) {
                localStorage.clear();
                window.location.href = '/login.html';
            }
        };
    }

    // Inicialização do Dashboard
    inicializarNavegacao();
    restaurarUltimaView(); // Adicionado para persistir F5
    carregarHistorico();
    configurarUpload();
    configurarModal();
    inicializarGraficos();
    
    // Atualiza a data do topo automaticamente (ID correto: display-date)
    setTimeout(() => {
        const dateEl = document.getElementById('display-date');
        if (dateEl) {
            const options = { day: 'numeric', month: 'long' };
            dateEl.innerText = `Hoje, ${new Date().toLocaleDateString('pt-BR', options)}`;
        }
    }, 500);

    // Inicia o monitoramento global de status (F5 Automático a cada 10s)
    iniciarPollingGlobal();
});

function iniciarPollingGlobal() {
    setInterval(() => {
        const currentView = localStorage.getItem('lastView');
        const currentSchool = localStorage.getItem('lastSchool');
        
        if (currentSchool && currentView === 'view-escola-dashboard') {
            window.verNotasDaEscola(currentSchool);
        } else if (currentView === 'nav-dashboard' || currentView === 'nav-historico') {
            carregarHistorico();
        }
    }, 10000); // 10 segundos
}

function restaurarUltimaView() {
    const lastView = localStorage.getItem('lastView') || 'nav-dashboard';
    const lastSchool = localStorage.getItem('lastSchool');

    if (lastSchool && lastView === 'view-escola-dashboard') {
        window.verNotasDaEscola(lastSchool);
    } else {
        const btn = document.getElementById(lastView);
        if (btn) btn.click();
    }
}

/**
 * Motor de Navegação SPA (Troca de Telas)
 */
function inicializarNavegacao() {
    const navItems = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.view-content');
    const headerTitle = document.querySelector('.header-title h1');
    const headerSub = document.querySelector('.header-title p');

    const infoTelas = {
        'nav-dashboard': { t: 'Dashboard', s: 'Bem-vindo de volta ao seu controle PDDE.' },
        'nav-novo': { t: 'Novo Processamento', s: 'Suba seus arquivos XML para gerar o kit.' },
        'nav-historico': { t: 'Histórico Completo', s: 'Consulte todos os processos gerados.' },
        'nav-escolas': { t: 'Escolas Atendidas', s: 'Gestão de endereços e dados das entidades.' },
        'nav-config': { t: 'Configurações', s: 'Ajustes globais do sistema.' }
    };

    navItems.forEach(item => {
        item.onclick = (e) => {
            e.preventDefault();
            const id = item.id;
            if (!id) return;

            const viewTarget = id.replace('nav-', 'view-');

            // 1. Atualiza botões da Sidebar
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');

            // 2. Alterna as Views
            views.forEach(v => {
                if (v.id === viewTarget) {
                    v.style.display = 'block';
                    v.classList.add('active');
                } else {
                    v.style.display = 'none';
                    v.classList.remove('active');
                }
            });

            // 3. Atualiza o Título do Topo
            if (infoTelas[id]) {
                headerTitle.innerText = infoTelas[id].t;
                headerSub.innerText = infoTelas[id].s;
            }

            // 4. Carrega dados específicos se necessário
            if (id === 'nav-escolas') {
                carregarEscolas();
            }
            if (id === 'nav-historico') {
                carregarHistorico();
            }

            // Salva o estado da navegação
            localStorage.setItem('lastView', id);
        };
    });

    // Botão de Cadastro Manual
    const btnManual = document.getElementById('btn-manual-school');
    if (btnManual) {
        btnManual.onclick = () => abrirModalCadastroEscola();
    }
}

async function carregarEscolas() {
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            console.error('❌ Token não encontrado. Redirecionando...');
            return;
        }

        const response = await axios.get(`${API_URL}/schools`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        console.log('🏛️ Resposta da API Escolas:', response.data);
        
        if (response.data.success) {
            renderizarTabelaEscolas(response.data.schools);
        }
    } catch (error) {
        console.error('❌ Erro crítico ao carregar escolas:', error.response ? error.response.status : error.message);
    }
}

/**
 * Abre o modal de cadastro preenchido para edição
 */
async function abrirEdicaoEscolaManual(cnpj) {
    try {
        const token = localStorage.getItem('token');
        const response = await axios.get(`${API_URL}/schools`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const school = response.data.schools.find(s => s.cnpj === cnpj);
        if (school) {
            abrirModalCadastroEscola(school, null);
        }
    } catch (error) {
        console.error('Erro ao abrir edição:', error);
    }
}

function renderizarTabelaEscolas(schools) {
    const tableBody = document.getElementById('escolas-body');
    if (!tableBody) return;

    try {
        if (!Array.isArray(schools) || schools.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 40px; color: #94a3b8;">Nenhuma escola cadastrada ainda.</td></tr>';
            return;
        }

        tableBody.innerHTML = schools.map(school => {
            // Extração segura de variáveis
            const razaoSocial = school.razao_social || 'Escola sem nome';
            const municipio = school.municipio || '---';
            const uf = school.uf || '--';
            
            // Tratamento blindado para o CNPJ (pode vir como número do SQLite ou nulo)
            let cnpjRaw = school.cnpj ? String(school.cnpj) : '';
            let cnpjFormatado = 'CNPJ Inválido/Vazio';
            
            if (cnpjRaw) {
                // Se o CNPJ tiver 13 dígitos (perdeu o zero à esquerda), adiciona o 0
                if (cnpjRaw.length === 13) cnpjRaw = '0' + cnpjRaw;
                
                // Aplica a máscara apenas se tiver os 14 dígitos
                if (cnpjRaw.length === 14) {
                    cnpjFormatado = cnpjRaw.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
                } else {
                    cnpjFormatado = cnpjRaw; // Mostra como está se for muito exótico
                }
            }

            return `
                <tr onclick="window.verNotasDaEscola('${school.cnpj || ''}')" style="cursor: pointer;">
                    <td>
                        <div style="font-weight: 600; color: #f8fafc;">${razaoSocial}</div>
                    </td>
                    <td style="font-family: monospace; color: var(--accent-primary);">${cnpjFormatado}</td>
                    <td style="color: #94a3b8;">${municipio} - ${uf}</td>
                    <td style="display: flex; gap: 8px;">
                        <button class="btn-icon" title="Ver Notas desta Escola" style="background: rgba(59, 130, 246, 0.1); color: #60a5fa;">
                            <i data-lucide="list"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
        
        if (window.lucide) window.lucide.createIcons();
    } catch (err) {
        console.error('❌ Erro fatal ao renderizar tabela de escolas:', err);
        tableBody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 20px; color: #ef4444; font-weight: bold;">Erro de Exibição: ${err.message}</td></tr>`;
    }
}

window.abrirEdicaoEscolaManual = abrirEdicaoEscolaManual; // Torna global para o onclick

/**
 * Filtra o histórico para mostrar apenas notas de uma escola específica
 */
window.verNotasDaEscola = async (cnpj) => {
    if (!cnpj) return;
    
    // Tratamento forte do CNPJ (remove qualquer caractere estranho)
    const cleanCnpj = String(cnpj).replace(/\D/g, '').padStart(14, '0');
    
    try {
        const token = localStorage.getItem('token');
        
        // Busca os dados reais da escola no Backend
        const [historyRes, statsRes] = await Promise.all([
            axios.get(`${API_URL}/history/${cleanCnpj}`, { headers: { 'Authorization': `Bearer ${token}` } }),
            axios.get(`${API_URL}/stats/escola/${cleanCnpj}`, { headers: { 'Authorization': `Bearer ${token}` } })
        ]);

        if (historyRes.data.success) {
            const notas = historyRes.data.history;
            const escolaNome = notas.length > 0 ? notas[0].escola_nome : 'Escola Sem Notas';

            // 1. Atualiza Títulos
            document.getElementById('escola-dash-title').innerText = escolaNome;
            document.getElementById('escola-dash-subtitle').innerText = `CNPJ: ${cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")}`;

            // 2. Renderiza a tabela local
            const tbody = document.getElementById('escola-history-body');
            tbody.innerHTML = notas.map(n => {
                const date = new Date(n.criado_em).toLocaleDateString('pt-BR');
                const val = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n.valor_total || 0);
                
                const status = n.status || 'PENDENTE';
                const isPendente = status === 'PENDENTE';
                const isReentrega = status === 'REENTREGAR';
                let badgeClass = 'status-assinado';
                let badgeText = 'Assinado';
                if (isPendente) { badgeClass = 'status-pendente'; badgeText = 'Pendente'; }
                else if (isReentrega) { badgeClass = 'status-reentregar'; badgeText = 'Reentregar'; }

                return `
                    <tr>
                      <td><input type="checkbox" class="note-checkbox" data-chave="${n.chave}" onclick="updateBulkActionsVisibility()" style="cursor: pointer;"></td>
                      <td style="color: var(--text-dim);">${date}</td>
                      <td>
                        <div style="font-weight: 600; color: #f8fafc;">Nº ${n.numero}</div>
                        <div style="font-size: 0.75rem; color: #94a3b8;">Chave: ${String(n.chave || '').substring(0,20)}...</div>
                      </td>
                      <td style="font-weight: 600; color: #10b981;">${val}</td>
                      <td>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span class="status-badge ${badgeClass}" style="margin:0;">${badgeText}</span>
                            <div style="display: flex; gap: 4px; font-size: 10px; font-family: monospace;">
                                <span title="Gerado ${n.gerado_qtd || 1}x" style="padding: 2px 4px; border-radius: 4px; background: rgba(59,130,246,0.1); color: #60a5fa; border: 1px solid rgba(59,130,246,0.2);">G:${n.gerado_qtd || 1}</span>
                                <span title="Impresso ${n.impresso_qtd || 0}x" style="padding: 2px 4px; border-radius: 4px; background: rgba(168,85,247,0.1); color: #c084fc; border: 1px solid rgba(168,85,247,0.2);">I:${n.impresso_qtd || 0}</span>
                                <span title="Entregue ${n.entregue_qtd || 0}x" style="padding: 2px 4px; border-radius: 4px; background: rgba(34,197,94,0.1); color: #4ade80; border: 1px solid rgba(34,197,94,0.2);">E:${n.entregue_qtd || 0}</span>
                            </div>
                        </div>
                      </td>
                      <td style="display: flex; gap: 8px;">
                          <button class="btn-action" onclick="verHistoricoAssinaturas('${n.chave}')" title="Histórico de Entregas" style="width: 32px; height: 32px; font-size: 0.8rem;">
                              <i data-lucide="clipboard-list"></i>
                          </button>
                          <button class="btn-action" onclick="baixarKit('${n.chave}', '${n.status}')" title="Baixar / Assinar" style="width: 32px; height: 32px; font-size: 0.8rem;">
                              <i data-lucide="download"></i>
                          </button>
                      </td>
                    </tr>
                `;
            }).join('');
            
            if (notas.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-dim); padding: 20px;">Nenhuma nota encontrada para esta escola.</td></tr>`;
            }
            
            // 3. Atualiza os cards estatísticos
            if (statsRes.data.success) {
                const s = statsRes.data.stats;
                animateValue('escola-dash-kits', 0, s.total_geracoes || 0, 1000);
                animateValue('escola-dash-concluidas', 0, s.processadas || 0, 1000);
                animateValue('escola-dash-valor', 0, s.valor_total || 0, 1000, true);
            }

            // 4. Mostra a View da Escola e esconde as outras
            document.querySelectorAll('.view-content').forEach(el => el.style.display = 'none');
            document.getElementById('view-escola-dashboard').style.display = 'block';
            
            // 5. Remove seleção do menu lateral
            document.querySelectorAll('.menu-item').forEach(btn => btn.classList.remove('active'));

            // Salva o estado para o F5
            localStorage.setItem('lastView', 'view-escola-dashboard');
            localStorage.setItem('lastSchool', cleanCnpj);

            if (window.lucide) window.lucide.createIcons();
        }
    } catch (error) {
        console.error('Erro ao entrar na pasta da escola:', error);
        alert('Erro ao carregar arquivos da escola.');
    }
};

window.voltarParaEscolas = () => {
    document.querySelectorAll('.view-content').forEach(el => el.style.display = 'none');
    document.getElementById('view-escolas').style.display = 'block';
    
    // Marca o botão de Escolas no menu
    document.querySelectorAll('.menu-item').forEach(btn => btn.classList.remove('active'));
    const btnEscolas = document.querySelector('[data-tab="escolas"]');
    if(btnEscolas) btnEscolas.classList.add('active');
};

window.toggleSelectAllNotes = (master) => {
    const checkboxes = document.querySelectorAll('.note-checkbox');
    checkboxes.forEach(cb => cb.checked = master.checked);
    updateBulkActionsVisibility();
};

window.updateBulkActionsVisibility = () => {
    const selected = document.querySelectorAll('.note-checkbox:checked');
    const bulkDiv = document.getElementById('bulk-actions');
    if (selected.length > 0) {
        bulkDiv.style.display = 'block';
    } else {
        bulkDiv.style.display = 'none';
        document.getElementById('select-all-notes').checked = false;
    }
};

window.baixarLoteSelecionado = async () => {
    const selectedCheckboxes = Array.from(document.querySelectorAll('.note-checkbox:checked'));
    const selectedChaves = selectedCheckboxes.map(cb => cb.dataset.chave);
    
    if (selectedChaves.length === 0) return;

    // Verificamos se há alguma nota pendente ou que precise de reentrega
    // Para simplificar, vamos buscar o status das notas selecionadas no DOM
    const notasStatus = selectedCheckboxes.map(cb => {
        const row = cb.closest('tr');
        const badge = row.querySelector('.status-badge');
        return badge.innerText.toUpperCase();
    });

    const temPendentes = notasStatus.some(s => s === 'PENDENTE' || s === 'REENTREGAR');

    if (!temPendentes) {
        // Todas estão ASSINADAS, baixa o ZIP do lote direto
        const token = localStorage.getItem('token');
        const downloadUrl = `${API_URL}/download-bulk?chaves=${selectedChaves.join(',')}&token=${token}`;
        
        // Dispara o download em uma nova aba
        window.open(downloadUrl, '_blank');
        
        // Atualiza os dados da escola na tela após um curtíssimo delay para o DB processar
        setTimeout(() => {
            const cnpj = document.getElementById('escola-dash-subtitle').innerText.replace(/\D/g, '');
            window.verNotasDaEscola(cnpj);
        }, 500);
        return;
    }

    // Se houver pendentes, solicita assinatura do lote
    const modal = document.getElementById('signature-request-modal');
    if (modal) {
        modal.dataset.notaId = selectedChaves.join(',');
        modal.dataset.isBulk = 'true';
        
        // Reset modal
        document.getElementById('link-display-area').style.display = 'none';
        document.getElementById('rec-nome').value = '';
        document.getElementById('rec-cpf').value = '';
        document.getElementById('rec-whatsapp').value = '';
        const btn = document.getElementById('btn-send-sig');
        btn.innerText = 'Enviar Link de Assinatura (Lote)';
        btn.disabled = false;
        
        modal.classList.add('active');
    }
};

async function carregarHistorico() {
    try {
        const token = localStorage.getItem('token');
        const response = await axios.get(`${API_URL}/history`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.data.success) {
            console.log('📜 Histórico carregado:', response.data.history.length);
            historicoCompleto = response.data.history;
            renderizarHistorico(historicoCompleto);
            atualizarEstatisticas(historicoCompleto);
            atualizarGraficos(historicoCompleto);
        }
    } catch (error) {
        console.error('Erro ao carregar histórico:', error);
    }
}

function renderizarHistorico(history) {
    const dashBody = document.getElementById('history-body-dash');
    const fullBody = document.getElementById('historico-completo-body');
    
    if (!history || history.length === 0) {
        const empty = '<tr><td colspan="5" style="text-align: center; padding: 40px; color: var(--text-dim);">Nenhum registro encontrado.</td></tr>';
        if (dashBody) dashBody.innerHTML = empty;
        if (fullBody) fullBody.innerHTML = empty;
        return;
    }

    const renderRow = (item) => {
        const cnpj = item.cnpj_escola || item.escola_cnpj || '';
        const nome = item.escola_nome || 'Escola não identificada';
        const status = item.status || 'PENDENTE';
        const isPendente = status === 'PENDENTE';
        const isReentrega = status === 'REENTREGAR';
        
        let badgeClass = 'status-assinado';
        let badgeText = 'Assinado';
        
        if (isPendente) {
            badgeClass = 'status-pendente';
            badgeText = 'Pendente';
        } else if (isReentrega) {
            badgeClass = 'status-reentregar';
            badgeText = 'Reentregar';
        }
        
        return `
            <tr>
                <td>
                    <div class="school-info">
                        <span class="school-name">${nome}</span>
                        <span class="school-cnpj">${cnpj}</span>
                    </div>
                </td>
                <td><span class="nota-tag">NF ${item.numero || '---'}</span></td>
                <td><span class="price-tag">R$ ${(item.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></td>
                <td>
                    <span class="badge ${badgeClass}">${badgeText}</span>
                    <div style="margin-top: 6px; display: flex; gap: 4px; font-size: 10px; font-family: monospace;">
                        <span title="Gerado ${item.gerado_qtd || 1} vez(es)" style="padding: 2px 4px; border-radius: 3px; background: rgba(59,130,246,0.1); color: #60a5fa; border: 1px solid rgba(59,130,246,0.2);">G:${item.gerado_qtd || 1}</span>
                        <span title="Impresso ${item.impresso_qtd || 0} vez(es)" style="padding: 2px 4px; border-radius: 3px; background: rgba(168,85,247,0.1); color: #c084fc; border: 1px solid rgba(168,85,247,0.2);">I:${item.impresso_qtd || 0}</span>
                        <span title="Entregue ${item.entregue_qtd || 0} vez(es)" style="padding: 2px 4px; border-radius: 3px; background: rgba(34,197,94,0.1); color: #4ade80; border: 1px solid rgba(34,197,94,0.2);">E:${item.entregue_qtd || 0}</span>
                    </div>
                </td>
                <td>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn-action" style="background: transparent; border: 1px solid rgba(255,255,255,0.1); color: var(--text-dim);" onclick="window.verHistoricoAssinaturas('${item.chave}')" title="Histórico de Entregas">
                            <i data-lucide="clipboard-list"></i>
                        </button>
                        <button class="btn-action" onclick="window.baixarKit('${item.chave}', '${status}')" title="Baixar Kit">
                            <i data-lucide="download"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    };

    if (dashBody) dashBody.innerHTML = history.slice(0, 15).map(item => renderRow(item)).join('');
    if (fullBody) fullBody.innerHTML = history.map(item => renderRow(item)).join('');
    
    if (window.lucide) window.lucide.createIcons();
}

/**
 * Filtra o histórico para mostrar apenas uma escola (Entrar na pasta)
 */
window.entrarNaEscola = (cnpj, nome) => {
    if (!cnpj) return;
    const filtrado = historicoCompleto.filter(item => (item.cnpj_escola === cnpj || item.escola_cnpj === cnpj));
    
    // Atualiza os corpos das tabelas
    renderizarHistorico(filtrado);

    // Atualiza o título para dar o feedback visual de "dentro da pasta"
    const titles = document.querySelectorAll('.history-card h2, #view-historico h2');
    titles.forEach(t => {
        if (!t.dataset.original) t.dataset.original = t.innerText;
        t.innerText = `Arquivos de: ${nome}`;
    });

    // Adiciona um botão de "voltar" se não existir
    const headers = document.querySelectorAll('.history-card .card-header, #view-historico .card-header');
    headers.forEach(h => {
        if (!h.querySelector('.btn-voltar')) {
            const btn = document.createElement('button');
            btn.className = 'btn-voltar';
            btn.innerHTML = '← Ver Todos';
            btn.style.cssText = 'background: rgba(255,255,255,0.1); border:none; color:#fff; padding:5px 12px; border-radius:6px; cursor:pointer; margin-top:10px; font-size:0.8rem;';
            btn.onclick = () => {
                renderizarHistorico(historicoCompleto);
                titles.forEach(t => t.innerText = t.dataset.original || 'Atividade Recente');
                btn.remove();
            };
            h.appendChild(btn);
        }
    });
};

function atualizarEstatisticas(notas) {
    const total = notas.reduce((acc, n) => acc + n.valor_total, 0);
    const escolasUnicas = new Set(notas.map(n => n.cnpj_escola)).size;
    
    animateValue('count-notes', 0, notas.length, 1000);
    animateValue('total-value', 0, total, 1000, true);
    animateValue('count-schools', 0, escolasUnicas, 1000);
}

/**
 * Gráficos Neon com ApexCharts
 */
function inicializarGraficos() {
    const volumeOptions = {
        chart: { 
            type: 'area', 
            height: 250, 
            toolbar: { show: false }, 
            zoom: { enabled: false }, 
            animations: { enabled: true, easing: 'easeinout', speed: 800 }, 
            background: 'transparent',
            dropShadow: { enabled: true, top: 10, left: 0, blur: 20, opacity: 0.3, color: '#ffffff' }
        },
        stroke: { curve: 'smooth', width: 3, colors: ['#ffffff'] },
        fill: { 
            type: 'gradient', 
            gradient: { 
                shadeIntensity: 1, 
                opacityFrom: 0.5, 
                opacityTo: 0, 
                stops: [0, 90, 100],
                colorStops: [
                    { offset: 0, color: '#ffffff', opacity: 0.4 },
                    { offset: 100, color: '#ffffff', opacity: 0 }
                ]
            } 
        },
        markers: { size: 6, colors: ['#ffffff'], strokeColors: '#030000', strokeWidth: 3, hover: { size: 8 } },
        dataLabels: { enabled: false },
        colors: ['#ffffff'],
        xaxis: { 
            categories: [], 
            labels: { style: { colors: '#94a3b8', fontFamily: 'Manrope', fontSize: '11px' } }, 
            axisBorder: { show: false }, 
            axisTicks: { show: false } 
        },
        yaxis: { show: false },
        grid: { show: false },
        theme: { mode: 'dark' },
        series: [{ name: 'Volume Total', data: [] }]
    };

    const statusOptions = {
        chart: { type: 'donut', height: 280, background: 'transparent' },
        colors: ['#ffffff', '#ff0000', '#880000'], // Assinados, Pendentes, Reentregar
        stroke: { width: 0 },
        plotOptions: {
            pie: {
                donut: {
                    size: '85%',
                    labels: {
                        show: true,
                        total: {
                            show: true,
                            label: 'TOTAL',
                            fontSize: '12px',
                            fontFamily: 'Outfit',
                            fontWeight: 600,
                            color: '#8a8aa3',
                            formatter: () => '---'
                        },
                        value: {
                            show: true,
                            fontSize: '28px',
                            fontFamily: 'Outfit',
                            fontWeight: 700,
                            color: '#ffffff',
                            offsetY: 8
                        }
                    }
                }
            }
        },
        legend: { show: false },
        dataLabels: { enabled: false },
        series: [0, 0, 0]
    };

    if (document.getElementById('chart-volume')) {
        chartVolume = new ApexCharts(document.getElementById('chart-volume'), volumeOptions);
        chartVolume.render();
    }
    if (document.getElementById('chart-status')) {
        chartStatus = new ApexCharts(document.getElementById('chart-status'), statusOptions);
        chartStatus.render();
    }
}

function atualizarGraficos(history) {
    if (!chartVolume || !chartStatus) return;

    // 1. Processa Volume por Data
    const volumesByDate = {};
    history.forEach(item => {
        const date = new Date(item.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        volumesByDate[date] = (volumesByDate[date] || 0) + (item.valor_total || 0);
    });

    const dates = Object.keys(volumesByDate).sort();
    const values = dates.map(d => volumesByDate[d]);

    // Se tiver apenas um dia, mantém 'area' mas com marcadores ativos
    chartVolume.updateOptions({
        xaxis: { categories: dates },
        markers: { size: values.length === 1 ? 8 : 5 }
    });
    chartVolume.updateSeries([{ name: 'Volume Processado', data: values }]);

    // 2. Processa Status (Padronizado Neon)
    const assinados = history.filter(n => n.status === 'ASSINADO').length;
    const reentregar = history.filter(n => n.status === 'REENTREGAR').length;
    const pendentes = history.filter(n => n.status === 'PENDENTE').length;

    chartStatus.updateOptions({
        labels: ['Assinados', 'Pendentes', 'Reentregar'],
        colors: ['#ffffff', '#ff0000', '#880000'], // Cores Sincronizadas com as Pílulas
        chart: {
            dropShadow: { enabled: true, top: 0, left: 0, blur: 15, opacity: 0.3, color: '#ffffff' }
        },
        plotOptions: {
            pie: {
                donut: {
                    size: '82%',
                    labels: {
                        show: true,
                        total: {
                            show: true,
                            label: 'TOTAL',
                            fontSize: '12px',
                            fontFamily: 'Outfit',
                            fontWeight: 600,
                            color: '#64748b',
                            formatter: () => history.length
                        },
                        value: {
                            show: true,
                            fontSize: '28px',
                            fontFamily: 'Outfit',
                            fontWeight: 700,
                            color: '#ffffff',
                            offsetY: 8
                        }
                    }
                }
            }
        }
    });
    chartStatus.updateSeries([assinados, pendentes, reentregar]);
}

function configurarUpload() {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    if (!dropZone || !fileInput) return;

    dropZone.onclick = () => fileInput.click();
    dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add('active'); };
    ['dragleave', 'dragend'].forEach(type => {
        dropZone.addEventListener(type, () => dropZone.classList.remove('active'));
    });
    dropZone.ondrop = (e) => {
        e.preventDefault();
        dropZone.classList.remove('active');
        handleFiles(e.dataTransfer.files);
    };
    fileInput.onchange = (e) => handleFiles(e.target.files);
}

async function handleFiles(files) {
    if (!files || files.length === 0) return;

    const arquivosXML = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.xml'));
    if (arquivosXML.length === 0) {
        alert("Nenhum arquivo XML válido foi selecionado.");
        return;
    }
    
    // Mostra o Scanner de Luxo e o Terminal
    const scanner = document.getElementById('scanner-modal');
    if (scanner) {
        scanner.style.display = 'flex';
        iniciarConsoleScanner(arquivosXML.length);
    }

    const formData = new FormData();
    // Converte FileList em Array para garantir compatibilidade total
    arquivosXML.forEach(file => {
        formData.append('xmls', file);
    });

    try {
        const token = localStorage.getItem('token');
        
        const startTime = Date.now();
        const response = await axios.post(`${API_URL}/upload`, formData, {
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'multipart/form-data'
            }
        });
        
        // Garante que o Scanner de Luxo apareça por pelo menos 4 segundos
        // Isso dá tempo para o usuário ver o "Console Hacker" trabalhar!
        const tempoDecorrido = Date.now() - startTime;
        if (tempoDecorrido < 4000) {
            await new Promise(resolve => setTimeout(resolve, 4000 - tempoDecorrido));
        }

        if (response.data.success) {
            // Se houver falhas parciais (alguns XMLs bons e outros ruins), avisa o usuário
            if (response.data.falhas && response.data.falhas.length > 0) {
                const falhasStr = response.data.falhas.map(f => `- ${f.arquivo}:\n  ${f.erro}`).join('\n\n');
                alert(`⚠️ Lote processado, mas com alguns arquivos defeituosos que foram ignorados:\n\n${falhasStr}`);
            }

            // --- NOVO: Verificação de Notas Duplicadas (Apenas Aviso, sem bloqueio) ---
            const duplicadas = response.data.notas.filter(n => n.duplicada);
            
            if (duplicadas.length > 0) {
                const qtd = duplicadas.length;
                setTimeout(() => {
                    alert(`⚠️ Aviso: ${qtd} nota(s) deste lote já existem no sistema.\n\nO sistema vai permitir que você re-gere todas elas normalmente. O histórico será atualizado com a nova versão!`);
                }, 500);
            }

            // Inicializa o Carrossel com TODAS as notas (novas e duplicadas)
            loteAtual = response.data.notas;
            indexLote = 0;

            if (loteAtual.length > 1) {
                document.getElementById('carousel-controls').style.display = 'flex';
            } else {
                document.getElementById('carousel-controls').style.display = 'none';
            }

            if (loteAtual.length > 0) {
                abrirModalEdicao(loteAtual[0]);
            }
        }
    } catch (error) { 
        console.error('Erro no upload:', error);
        const serverMessage = error.response?.data?.error || 'Erro desconhecido no servidor.';
        alert(`Erro ao processar XML:\n${serverMessage}`);
    } finally {
        const scanner = document.getElementById('scanner-modal');
        if (scanner) {
            scanner.style.display = 'none';
            pararConsoleScanner();
        }
    }
}

/**
 * CONFIRMAÇÃO: Mostra os dados da escola encontrada no banco
 */
function abrirModalConfirmacaoEscola(school, nota) {
    const modal = document.getElementById('confirm-school-modal');
    if (!modal) return;

    document.getElementById('conf-school-nome').innerText = school.razao_social;
    document.getElementById('conf-school-cnpj').innerText = school.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
    document.getElementById('conf-school-endereco').innerText = `${school.logradouro}, ${school.municipio} - ${school.uf}`;

    modal.classList.add('active');

    // Botão: Prosseguir para as Planilhas
    document.getElementById('btn-proceed-to-edit').onclick = () => {
        modal.classList.remove('active');
        
        // Verifica duplicidade antes de abrir o editor
        if (nota.isDuplicada) {
            const msg = `⚠️ NOTA DUPLICADA\n\nA NF nº ${nota.nota.numero} já existe no histórico.\n\nDeseja abrir para edição e gerar novos arquivos mesmo assim?`;
            if (!confirm(msg)) return;
        }
        
        abrirModalEdicao(nota);
    };

    // Botão: Editar Cadastro
    document.getElementById('btn-edit-school-data').onclick = () => {
        modal.classList.remove('active');
        abrirModalCadastroEscola({
            cnpj: school.cnpj,
            razao_social: school.razao_social,
            logradouro: school.logradouro,
            municipio: school.municipio,
            uf: school.uf
        }, null); // null porque não tem "originalFiles" para reprocessar, apenas salvar
    };

    // Botão: Errado / Trocar
    document.getElementById('btn-wrong-school').onclick = () => {
        modal.classList.remove('active');
        alert('Upload cancelado. Verifique os dados da escola ou o XML enviado.');
    };
}

/**
 * GATEKEEPER: Modal de Cadastro de Escola
 */
function abrirModalCadastroEscola(schoolData = null, originalFiles = null) {
    const modal = document.getElementById('school-modal');
    if (!modal) return;

    // Limpa ou Preenche campos
    document.getElementById('new-school-cnpj').value = schoolData ? schoolData.cnpj : '';
    document.getElementById('new-school-cnpj').readOnly = !!schoolData; // Se tem dados, trava o CNPJ
    
    document.getElementById('new-school-razao_social').value = schoolData ? schoolData.razao_social : '';
    document.getElementById('new-school-logradouro').value = schoolData ? schoolData.logradouro : '';
    document.getElementById('new-school-municipio').value = schoolData ? schoolData.municipio : '';
    document.getElementById('new-school-uf').value = schoolData ? schoolData.uf : '';

    modal.classList.add('active');

    // Botão Cancelar
    document.getElementById('btn-cancel-school').onclick = () => modal.classList.remove('active');
    document.getElementById('close-school-modal').onclick = () => modal.classList.remove('active');

    // Botão Salvar e Continuar
    document.getElementById('btn-save-school').onclick = async () => {
        try {
            const token = localStorage.getItem('token');
            const data = {
                cnpj: document.getElementById('new-school-cnpj').value,
                razao_social: document.getElementById('new-school-razao_social').value,
                logradouro: document.getElementById('new-school-logradouro').value,
                municipio: document.getElementById('new-school-municipio').value,
                uf: document.getElementById('new-school-uf').value
            };

            await axios.post(`${API_URL}/schools`, data, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            modal.classList.remove('active');
            
            // Atualiza a lista de escolas globalmente
            carregarEscolas();
            
            // Tenta processar os arquivos novamente agora que a escola existe/foi atualizada
            if (originalFiles) {
                handleFiles(originalFiles);
            } else {
                alert('Cadastro salvo com sucesso!');
            }
            
        } catch (error) {
            console.error('Erro ao salvar escola:', error);
            alert('Erro ao salvar os dados da escola. Tente novamente.');
        }
    };
}

function configurarModal() {
    const btnClose = document.getElementById('close-modal');
    const btnCancel = document.getElementById('btn-cancel');
    const btnFinalize = document.getElementById('btn-finalize');
    const editModal = document.getElementById('edit-modal');

    if (btnClose) btnClose.onclick = () => editModal.classList.remove('active');
    if (btnCancel) btnCancel.onclick = () => editModal.classList.remove('active');
    
    if (btnFinalize) btnFinalize.onclick = () => {
        console.log('🚀 Botão Gerar Kit clicado!');
        finalizarEdicao();
    };

    // Configura botões do Carrossel
    const btnPrev = document.getElementById('btn-prev-note');
    const btnNext = document.getElementById('btn-next-note');
    
    if (btnPrev) btnPrev.onclick = () => {
        console.log('⬅️ Anterior clicado');
        navegarLote(-1);
    };
    if (btnNext) btnNext.onclick = () => {
        console.log('➡️ Próximo clicado');
        navegarLote(1);
    };

    // Lógica das Setinhas
    const setupGlobalInput = (id, base) => {
        const input = document.getElementById(id);
        if (!input) return;
        let lastVal = 0;
        input.onfocus = () => { lastVal = parseFloat(input.value); };
        input.oninput = (e) => {
            const current = parseFloat(e.target.value);
            if (isNaN(current)) return;
            const delta = current > lastVal ? 1 : -1;

            // TRAVA GLOBAL: Se estiver diminuindo, verifica se alguém já chegou em 0%
            if (delta === -1) {
                const limiteAtingido = notaAtual.produtos.some(p => p.percentuais[base] <= 0);
                if (limiteAtingido) {
                    alert('⚠️ LIMITE ATINGIDO: Não é possível diminuir mais, pois alguns itens já estão no valor original da Base 01.');
                    atualizarTotaisNoRodape(); // Volta o número do input para o valor real
                    return;
                }
            }

            notaAtual.produtos.forEach((_, index) => {
                const novoPerc = (notaAtual.produtos[index].percentuais[base] || 0) + delta;
                window.updatePrice(index, base, novoPerc);
            });
            lastVal = current;
            renderizarItensEdicao();
        };
    };

    setupGlobalInput('global-total-p2', 'p2');
    setupGlobalInput('global-total-p3', 'p3');

    if (btnFinalize) {
        btnFinalize.onclick = () => {
            console.log('🚀 Botão Gerar Kit clicado!');
            finalizarEdicao();
        };
    }
}

async function finalizarEdicao() {
    const btnFinalize = document.getElementById('btn-finalize');
    const editModal = document.getElementById('edit-modal');
    if (!notaAtual) return;

    try {
        if (btnFinalize) {
            btnFinalize.disabled = true;
            btnFinalize.innerHTML = '<i data-lucide="loader" class="spin"></i> Salvando...';
        }
        
        console.log('📦 Finalizando nota:', notaAtual.nota.numero);
        const response = await axios.post(`${API_URL}/generate`, notaAtual);
        
        if (response.data.success) {
            // Marca a nota atual como salva
            notaAtual.salva = true;

            // Feedback visual rápido no botão
            if (btnFinalize) {
                btnFinalize.style.background = 'linear-gradient(135deg, #008800, #004400)';
                btnFinalize.innerHTML = '<i data-lucide="check"></i> Salvo com Sucesso!';
            }
            
            // Pequeno delay para o usuário ver o sucesso antes de trocar
            setTimeout(() => {
                // Verifica se TODAS as notas do lote foram salvas
                const todasSalvas = loteAtual.every(n => n.salva);

                if (!todasSalvas) {
                    // Encontra a próxima nota NÃO SALVA (busca circular)
                    let nextUnsaved = -1;
                    for (let i = 1; i < loteAtual.length; i++) {
                        const checkIdx = (indexLote + i) % loteAtual.length;
                        if (!loteAtual[checkIdx].salva) {
                            nextUnsaved = checkIdx;
                            break;
                        }
                    }

                    // Pula para a próxima nota não salva
                    if (nextUnsaved !== -1) {
                        indexLote = nextUnsaved;
                        abrirModalEdicao(loteAtual[indexLote]);
                    }
                    
                    // Restaura o botão para a próxima nota
                    if (btnFinalize) {
                        btnFinalize.style.background = '';
                        btnFinalize.disabled = false;
                        btnFinalize.innerHTML = '<i data-lucide="check-circle"></i> Finalizar e Gerar Kit';
                    }
                } else {
                    // Era a última, fecha tudo e atualiza
                    if (editModal) editModal.classList.remove('active');
                    carregarHistorico();
                    alert('✨ Lote concluído! Todos os kits foram gerados e salvos no sistema.');
                }
                if (window.lucide) window.lucide.createIcons();
            }, 800);
        }
    } catch (error) {
        console.error('Erro ao gerar kit:', error);
        alert('Erro ao gerar kit. Verifique se os dados estão corretos.');
        if (btnFinalize) {
            btnFinalize.disabled = false;
            btnFinalize.innerHTML = '<i data-lucide="check-circle"></i> Finalizar e Gerar Kit';
        }
    }
}

function navegarLote(direcao) {
    const novoIndex = indexLote + direcao;
    if (novoIndex >= 0 && novoIndex < loteAtual.length) {
        indexLote = novoIndex;
        abrirModalEdicao(loteAtual[indexLote]);
    }
}

function abrirModalEdicao(nota) {
    notaAtual = nota;
    const modal = document.getElementById('edit-modal');
    if (!modal) return;

    // Atualiza info do Carrossel com indicadores visuais (bolinhas verdes para salvas)
    const carouselInfo = document.getElementById('carousel-info');
    if (carouselInfo) {
        let indicators = loteAtual.map((n, idx) => {
            let color = n.salva ? '#10b981' : (idx === indexLote ? '#3b82f6' : '#475569');
            let outline = idx === indexLote ? 'box-shadow: 0 0 0 2px #1e293b, 0 0 0 4px #3b82f6;' : '';
            return `<span style="display:inline-block; width:10px; height:10px; border-radius:50%; background-color:${color}; ${outline} margin: 0 3px; transition: all 0.3s;" title="Nota ${idx+1}"></span>`;
        }).join('');
        
        carouselInfo.innerHTML = `<div style="display:flex; align-items:center; gap: 12px;">
            <span style="font-size: 14px; font-weight: 600;">${indexLote + 1} / ${loteAtual.length}</span>
            <div style="display:flex; align-items:center;">${indicators}</div>
        </div>`;
    }

    // Atualiza o botão de finalizar caso a nota já tenha sido salva
    const btnFinalize = document.getElementById('btn-finalize');
    if (btnFinalize) {
        if (nota.salva) {
            btnFinalize.style.background = 'linear-gradient(135deg, #059669, #047857)';
            btnFinalize.innerHTML = '<i data-lucide="check-circle"></i> Atualizar Kit (Já Salvo)';
            btnFinalize.disabled = false;
        } else {
            btnFinalize.style.background = '';
            btnFinalize.innerHTML = '<i data-lucide="check-circle"></i> Finalizar e Gerar Kit';
            btnFinalize.disabled = false;
        }
    }

    // Trava botões de navegação se necessário
    const btnPrev = document.getElementById('btn-prev-note');
    const btnNext = document.getElementById('btn-next-note');
    if (btnPrev) btnPrev.disabled = indexLote === 0;
    if (btnNext) btnNext.disabled = indexLote === loteAtual.length - 1;

    document.getElementById('modal-title').innerText = `Editando Nota: ${nota.nota.numero}`;
    document.getElementById('modal-total').innerText = nota.nota.valorTotalFmt;
    
    // Preenche os campos de cabeçalho
    document.getElementById('edit-nota-data').value = nota.nota.dataISO;
    document.getElementById('edit-escola-1').value = nota.comprador.nome1 || nota.comprador.nome;
    document.getElementById('edit-escola-2').value = nota.comprador.nome2 || nota.comprador.nome;
    document.getElementById('edit-escola-3').value = nota.comprador.nome3 || nota.comprador.nome;
    
    const endBase = nota.comprador.enderecoAPI || nota.comprador.enderecoCompleto;
    document.getElementById('edit-endereco-1').value = nota.comprador.endereco1 || endBase;
    document.getElementById('edit-endereco-2').value = nota.comprador.endereco2 || endBase;
    document.getElementById('edit-endereco-3').value = nota.comprador.endereco3 || endBase;

    // Inicializa no objeto se estiver vazio
    if (!notaAtual.comprador.nome1) notaAtual.comprador.nome1 = nota.comprador.nome;
    if (!notaAtual.comprador.nome2) notaAtual.comprador.nome2 = nota.comprador.nome;
    if (!notaAtual.comprador.nome3) notaAtual.comprador.nome3 = nota.comprador.nome;
    
    if (!notaAtual.comprador.endereco1) notaAtual.comprador.endereco1 = endBase;
    if (!notaAtual.comprador.endereco2) notaAtual.comprador.endereco2 = endBase;
    if (!notaAtual.comprador.endereco3) notaAtual.comprador.endereco3 = endBase;

    // Listeners para sincronizar edições
    document.getElementById('edit-nota-data').oninput = (e) => { notaAtual.nota.dataISO = e.target.value; };
    document.getElementById('edit-escola-1').oninput = (e) => { notaAtual.comprador.nome1 = e.target.value; };
    document.getElementById('edit-escola-2').oninput = (e) => { notaAtual.comprador.nome2 = e.target.value; };
    document.getElementById('edit-escola-3').oninput = (e) => { notaAtual.comprador.nome3 = e.target.value; };
    
    document.getElementById('edit-endereco-1').oninput = (e) => { notaAtual.comprador.endereco1 = e.target.value; };
    document.getElementById('edit-endereco-2').oninput = (e) => { notaAtual.comprador.endereco2 = e.target.value; };
    document.getElementById('edit-endereco-3').oninput = (e) => { notaAtual.comprador.endereco3 = e.target.value; };

    // Cache de sugestões por campo (persiste enquanto o modal estiver aberto)
    const iaCache = {};

    window.humanizarEspecifico = async (fieldId) => {
        fecharPicker();
        const input = document.getElementById(fieldId);
        const btn = input.nextElementSibling;
        const valorOriginal = input.value || (fieldId.includes('escola') ? nota.comprador.nome : endBase);

        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader" class="spinner-ia"></i>';
        if (window.lucide) window.lucide.createIcons();

        try {
            const response = await axios.post(`${API_URL}/humanize`, {
                texto: valorOriginal,
                jaGeradas: iaCache[fieldId] || []
            });
            if (response.data.success) {
                const novas = response.data.variacoes;
                if (!iaCache[fieldId]) iaCache[fieldId] = [];
                // Adiciona novas ao topo do cache sem duplicatas
                novas.forEach(v => {
                    if (!iaCache[fieldId].includes(v)) iaCache[fieldId].unshift(v);
                });
                mostrarPicker(fieldId, novas, iaCache[fieldId]);
            }
        } catch (error) {
            console.error('Erro na IA específica:', error);
            alert('💡 Erro ao humanizar este campo. Verifique o console.');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="sparkles"></i>';
            if (window.lucide) window.lucide.createIcons();
        }
    };

    function mostrarPicker(fieldId, novas, cache) {
        fecharPicker();
        const input = document.getElementById(fieldId);
        const container = input.closest('.input-with-button');

        const cacheAntigo = cache.filter(v => !novas.includes(v));

        const picker = document.createElement('div');
        picker.id = 'ia-picker';
        picker.className = 'ia-picker';
        picker.innerHTML = `
            <div class="ia-picker-header">
                <span>✨ Escolha uma variação</span>
                <button class="ia-picker-close" onclick="fecharPicker()">×</button>
            </div>
            <div class="ia-picker-section-label">Novas sugestões</div>
            ${novas.map(v => `<div class="ia-picker-option" data-field="${fieldId}" data-valor="${v.replace(/"/g, '&quot;')}">${v}</div>`).join('')}
            ${cacheAntigo.length > 0 ? `
                <div class="ia-picker-section-label ia-picker-section-cache">Sugestões anteriores</div>
                ${cacheAntigo.map(v => `<div class="ia-picker-option ia-picker-option-cached" data-field="${fieldId}" data-valor="${v.replace(/"/g, '&quot;')}">${v}</div>`).join('')}
            ` : ''}
        `;

        picker.querySelectorAll('.ia-picker-option').forEach(el => {
            el.addEventListener('click', () => {
                aplicarVariacao(el.dataset.field, el.dataset.valor);
            });
        });

        container.appendChild(picker);

        setTimeout(() => {
            document.addEventListener('click', clickForaPicker);
        }, 0);
    }

    function clickForaPicker(e) {
        const picker = document.getElementById('ia-picker');
        if (picker && !picker.contains(e.target)) {
            fecharPicker();
        } else {
            document.addEventListener('click', clickForaPicker, { once: true });
        }
    }

    window.fecharPicker = () => {
        const picker = document.getElementById('ia-picker');
        if (picker) picker.remove();
        document.removeEventListener('click', clickForaPicker);
    };

    window.aplicarVariacao = (fieldId, valor) => {
        const input = document.getElementById(fieldId);
        input.value = valor;
        const parts = fieldId.split('-');
        const prop = parts[1];
        const num = parts[2];
        if (prop === 'escola') notaAtual.comprador[`nome${num}`] = valor;
        else notaAtual.comprador[`endereco${num}`] = valor;
        fecharPicker();
    };

    renderizarItensEdicao();
    document.getElementById('edit-modal').classList.add('active');
    if (window.lucide) window.lucide.createIcons();
}

function renderizarItensEdicao() {
    const editTableBody = document.getElementById('edit-table-body');
    editTableBody.innerHTML = notaAtual.produtos.map((prod, index) => `
        <tr>
            <td>${index + 1}</td>
            <td>${prod.descricao}</td>
            <td>${prod.quantidade}</td>
            <td>R$ ${prod.precos.p1.toFixed(2)}</td>
            <td>
                <input type="number" class="edit-input p2" value="${Math.round(prod.percentuais.p2)}" onchange="window.updatePrice(${index}, 'p2', this.value)">
                <span id="price-${index}-p2" class="price-tag">R$ ${prod.precos.p2.toFixed(2)}</span>
            </td>
            <td>
                <input type="number" class="edit-input p3" value="${Math.round(prod.percentuais.p3)}" onchange="window.updatePrice(${index}, 'p3', this.value)">
                <span id="price-${index}-p3" class="price-tag">R$ ${prod.precos.p3.toFixed(2)}</span>
            </td>
        </tr>
    `).join('');
    atualizarTotaisNoRodape();
}

function atualizarTotaisNoRodape() {
    if (!notaAtual) return;
    const totalP2 = notaAtual.produtos.reduce((acc, p) => acc + (p.precos.p2 * p.quantidade), 0);
    const totalP3 = notaAtual.produtos.reduce((acc, p) => acc + (p.precos.p3 * p.quantidade), 0);
    document.getElementById('global-total-p2').value = totalP2.toFixed(2);
    document.getElementById('global-total-p3').value = totalP3.toFixed(2);
}

window.updatePrice = (index, base, novoPercentual) => {
    const p = notaAtual.produtos[index];
    const perc = Math.round(parseFloat(novoPercentual) || 0);
    
    // TRAVA DE SEGURANÇA: Não pode ser menor que a Base 01 (0%)
    if (perc < 0) {
        alert(`⚠️ BLOQUEIO: O item "${p.descricao}" não pode ter valor inferior à Base 01.`);
        renderizarItensEdicao(); // Reseta o input para o valor anterior
        return;
    }
    
    p.percentuais[base] = perc;
    p.precos[base] = Number((p.valorUnit * (1 + perc/100)).toFixed(2));
    
    const span = document.getElementById(`price-${index}-${base}`);
    if (span) span.innerText = `R$ ${p.precos[base].toFixed(2)}`;
    
    /* Badges de Status Unificados e Vibrantes */
    const style = document.createElement('style');
    style.innerHTML = `
        .badge {
            padding: 6px 16px;
            border-radius: 20px;
            font-size: 0.75rem;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            text-shadow: 0 0 5px rgba(255,255,255,0.2);
            border: 1px solid rgba(255,255,255,0.1);
        }

        .status-assinado {
            background: #00ffa3 !important;
            color: #030000 !important;
            box-shadow: 0 0 15px rgba(0, 255, 163, 0.4);
        }

        .status-pendente {
            background: #ff0055 !important;
            color: #ffffff !important;
            box-shadow: 0 0 15px rgba(255, 0, 85, 0.4);
        }

        .status-reentregar {
            background: #00d4ff !important;
            color: #030000 !important;
            box-shadow: 0 0 15px rgba(0, 212, 255, 0.4);
        }
    `;
    document.head.appendChild(style);

    atualizarTotaisNoRodape();
};

/**
 * Marca uma nota como assinada/concluída
 */
window.assinarNota = async (id) => {
    if (!confirm('Deseja marcar esta nota como ASSINADA e CONCLUÍDA?')) return;
    try {
        const token = localStorage.getItem('token');
        const response = await axios.post(`${API_URL}/notas/sign/${id}`, {}, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.data.success) {
            alert('✓ Nota assinada com sucesso!');
            carregarHistorico();
        }
    } catch (error) {
        console.error('Erro ao assinar:', error);
        alert('Erro ao processar assinatura.');
    }
};

window.baixarKit = async (id, status) => {
    if (status === 'PENDENTE' || status === 'REENTREGAR') {
        const modal = document.getElementById('signature-request-modal');
        if (modal) {
            modal.dataset.notaId = id;
            // Limpa o estado anterior
            document.getElementById('link-display-area').style.display = 'none';
            document.getElementById('rec-nome').value = '';
            document.getElementById('rec-cpf').value = '';
            document.getElementById('rec-whatsapp').value = '';
            const btn = document.getElementById('btn-send-sig');
            btn.innerText = 'Enviar Link de Assinatura';
            btn.style.background = '';
            btn.disabled = false;
            
            modal.classList.add('active');
        }
        return;
    }
    
    // Tenta baixar a nota
    const token = localStorage.getItem('token');
    
    try {
        const response = await axios.get(`${API_URL}/download/${id}?token=${token}`, { responseType: 'blob' });
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `KIT_PDDE_${id.substring(0, 10)}.zip`);
        document.body.appendChild(link);
        link.click();
        link.parentNode.removeChild(link);

        // Incrementar contador de impressões no servidor
        await axios.post(`${API_URL}/notas/track-print/${id}`, {}, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        // Recarregar para atualizar o contador visual (I: x)
        carregarHistorico();
    } catch (e) {
        if (e.response && e.response.status === 403) {
            alert('O link de download expirou (limite de 2h). Por favor, solicite uma nova assinatura para liberar os arquivos.');
            carregarHistorico();
        } else {
            alert('Erro ao baixar o arquivo.');
        }
    }
};

window.verHistoricoAssinaturas = async (id) => {
    try {
        const token = localStorage.getItem('token');
        const response = await axios.get(`${API_URL}/notas/${id}/entregas`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.data.success) {
            const tbody = document.getElementById('signature-history-body');
            const entregas = response.data.entregas;
            if (entregas.length === 0) {
                tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--text-dim); padding: 20px;">Nenhuma entrega registrada ainda.</td></tr>';
            } else {
                tbody.innerHTML = entregas.map(e => `
                    <tr>
                        <td style="font-size: 0.85rem; color: var(--text-dim);">
                            ${new Date(e.data_hora).toLocaleString('pt-BR')}
                        </td>
                        <td style="font-weight: 600;">${e.recebido_por || 'N/A'}</td>
                        <td style="text-align: center;">
                            ${e.signature_path ? `<a href="/output/assinaturas/${e.signature_path}" target="_blank" style="color: var(--primary); text-decoration: none;"><i data-lucide="image"></i> Ver</a>` : '-'}
                        </td>
                    </tr>
                `).join('');
            }
            document.getElementById('signature-history-modal').classList.add('active');
            if (window.lucide) window.lucide.createIcons();
        }
    } catch (e) {
        console.error(e);
        alert('Erro ao carregar histórico de entregas.');
    }
};

/**
 * Envia a solicitação de assinatura para o recebedor
 */
window.enviarSolicitacaoAssinatura = async () => {
    const modal = document.getElementById('signature-request-modal');
    const id = modal.dataset.notaId;
    
    const data = {
        recebedor_nome: document.getElementById('rec-nome').value,
        recebedor_cpf: document.getElementById('rec-cpf').value,
        recebedor_whatsapp: document.getElementById('rec-whatsapp').value
    };

    if (!data.recebedor_nome || !data.recebedor_cpf || !data.recebedor_whatsapp) {
        alert('Por favor, preencha todos os dados do recebedor.');
        return;
    }

    try {
        const btn = document.getElementById('btn-send-sig');
        btn.innerText = 'Enviando...';
        btn.disabled = true;

        const token = localStorage.getItem('token');
        const isBulk = modal.dataset.isBulk === 'true';
        const endpoint = isBulk ? 'request-signature-bulk' : 'request-signature';
        
        const payload = { ...data };
        if (isBulk) payload.chaves = id.split(',');

        const response = await axios.post(`${API_URL}/notas/${endpoint}${isBulk ? '' : '/' + id}`, payload, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.data.success) {
            const link = response.data.link;
            console.log('🔗 LINK DE ASSINATURA GERADO:', link);
            
            // Exibe a área do link no modal
            document.getElementById('link-display-area').style.display = 'block';
            document.getElementById('generated-link-input').value = link;

            // Atualiza o botão para estado de espera
            btn.innerHTML = '<i data-lucide="loader-2" class="animate-spin"></i> AGUARDANDO ASSINATURA...';
            btn.style.background = 'linear-gradient(135deg, #440000, #220000)';
            
            // Inicia o Polling
            iniciarPollingAssinatura(id);
            
            // Re-renderiza ícones do Lucide
            if (window.lucide) window.lucide.createIcons();
        }
    } catch (error) {
        console.error('Erro ao enviar solicitação:', error);
        alert('Erro ao enviar link de assinatura.');
        const btn = document.getElementById('btn-send-sig');
        btn.innerText = 'Enviar Link de Assinatura';
        btn.disabled = false;
    }
};

/**
 * Utilitários para o link de assinatura
 */
window.copiarLinkAssinatura = () => {
    const input = document.getElementById('generated-link-input');
    input.select();
    document.execCommand('copy');
    alert('✓ Link copiado para a área de transferência!');
};

window.abrirLinkAssinatura = () => {
    const link = document.getElementById('generated-link-input').value;
    if (link) window.open(link, '_blank');
};

/**
 * Monitora se o documento foi assinado
 */
function iniciarPollingAssinatura(id) {
    if (pollingInterval) clearInterval(pollingInterval);

    pollingInterval = setInterval(async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await axios.get(`${API_URL}/nota-status/${id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.data.success && response.data.status === 'ASSINADO') {
                clearInterval(pollingInterval);
                pollingInterval = null;
                
                const modal = document.getElementById('signature-request-modal');
                modal.classList.remove('active');
                
                // Feedback visual de sucesso
                alert('🚀 SUCESSO! O documento foi assinado pelo recebedor.');
                
                // Atualiza a tela atual (Dashboard ou Escola)
                const currentSchool = localStorage.getItem('lastSchool');
                if (currentSchool) {
                    window.verNotasDaEscola(currentSchool);
                } else {
                    carregarHistorico();
                }
            }
        } catch (error) {
            console.error('Erro no polling:', error);
        }
    }, 3000); // Verifica a cada 3 segundos
}
