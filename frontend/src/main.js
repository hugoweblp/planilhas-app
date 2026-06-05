const API_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000/api' : '/api'; // Usa o caminho relativo do servidor

// Fase 4: cookie HttpOnly é a fonte de autenticação padrão
axios.defaults.withCredentials = true;

// Modo simulação: admin atuando como outra empresa injeta Bearer do s_token
axios.interceptors.request.use(config => {
    const simToken = localStorage.getItem('token');
    if (localStorage.getItem('admin_token') && simToken) {
        config.headers['Authorization'] = `Bearer ${simToken}`;
    }
    return config;
});

// Trava Financeira: intercepta 403 de assinatura expirada e redireciona ao login
axios.interceptors.response.use(
    response => response,
    error => {
        const data = error.response?.data;
        if (error.response?.status === 403 && data?.assinaturaExpirada) {
            window.showPremiumAlert?.({
                type: 'error',
                title: 'Assinatura Expirada',
                message: data.error || 'Sua assinatura venceu. Entre em contato com o suporte Kitfy para renovar o acesso.',
                confirmText: 'Entendido'
            }).finally(() => {
                localStorage.clear();
                window.location.href = 'login.html';
            });
        }
        return Promise.reject(error);
    }
);

/**
 * 👑 PREMIUM ALERT SYSTEM
 * Substitui os alertas nativos do navegador por Modais de Alta Fidelidade
 */
window.showPremiumAlert = function(options) {
    return new Promise((resolve) => {
        const modal = document.getElementById('premium-alert-modal');
        if (!modal) {
            console.warn('Premium alert fallback:', options.message);
            if (options.type === 'confirm') return resolve(confirm(options.message));
            alert(options.message);
            return resolve(true);
        }

        const titleEl = document.getElementById('premium-alert-title');
        const messageEl = document.getElementById('premium-alert-message');
        const iconEl = document.getElementById('premium-alert-icon');
        const actionsEl = document.getElementById('premium-alert-actions');
        const glowEl = document.getElementById('premium-alert-glow');

        let config = { title: options.title || 'Aviso', icon: 'alert-triangle', color: '#f59e0b', bgGlow: 'rgba(245, 158, 11, 0.4)' };

        if (options.type === 'success') {
            config = { title: options.title || 'Sucesso', icon: 'check-circle', color: '#10b981', bgGlow: 'rgba(16, 185, 129, 0.4)' };
        } else if (options.type === 'error') {
            config = { title: options.title || 'Atenção Necessária', icon: 'x-octagon', color: '#ef4444', bgGlow: 'rgba(239, 68, 68, 0.4)' };
        } else if (options.type === 'confirm') {
            config = { title: options.title || 'Confirmação', icon: 'help-circle', color: '#3b82f6', bgGlow: 'rgba(59, 130, 246, 0.4)' };
        }

        titleEl.innerText = config.title;
        messageEl.innerText = options.message;
        
        iconEl.innerHTML = `<i data-lucide="${config.icon}" style="width: 32px; height: 32px;"></i>`;
        iconEl.style.background = `${config.color}15`;
        iconEl.style.color = config.color;
        iconEl.style.border = `1px solid ${config.color}30`;
        iconEl.style.boxShadow = `0 0 20px ${config.color}20`;
        glowEl.style.background = config.bgGlow;

        actionsEl.innerHTML = '';
        const closeModal = (result) => { modal.classList.remove('active'); resolve(result); };

        if (options.type === 'confirm') {
            const btnCancel = document.createElement('button');
            btnCancel.className = 'btn-action';
            btnCancel.style.cssText = 'flex: 1; padding: 12px; border-radius: 12px; background: rgba(255,255,255,0.05); color: var(--text-dim); border: 1px solid rgba(255,255,255,0.1); cursor: pointer; transition: 0.3s; font-weight: 600; font-family: Outfit, sans-serif;';
            btnCancel.innerText = options.cancelText || 'Cancelar';
            btnCancel.onclick = () => closeModal(false);
            btnCancel.onmouseover = () => btnCancel.style.background = 'rgba(255,255,255,0.1)';
            btnCancel.onmouseout = () => btnCancel.style.background = 'rgba(255,255,255,0.05)';

            const btnConfirm = document.createElement('button');
            btnConfirm.className = 'btn-primary';
            btnConfirm.style.cssText = `flex: 1; padding: 12px; border-radius: 12px; background: linear-gradient(135deg, ${config.color}, ${config.color}dd); border: none; box-shadow: 0 4px 15px ${config.color}40; cursor: pointer; font-weight: 600; font-family: Outfit, sans-serif;`;
            btnConfirm.innerText = options.confirmText || 'Confirmar';
            btnConfirm.onclick = () => closeModal(true);

            actionsEl.appendChild(btnCancel);
            actionsEl.appendChild(btnConfirm);
        } else {
            const btnOk = document.createElement('button');
            btnOk.className = 'btn-primary';
            btnOk.style.cssText = `width: 100%; padding: 12px; border-radius: 12px; background: linear-gradient(135deg, ${config.color}, ${config.color}dd); border: none; box-shadow: 0 4px 15px ${config.color}40; cursor: pointer; font-weight: 600; font-family: Outfit, sans-serif; letter-spacing: 0.5px;`;
            btnOk.innerText = 'Entendido';
            btnOk.onclick = () => closeModal(true);
            actionsEl.appendChild(btnOk);
        }

        modal.classList.add('active');
        if (window.lucide) window.lucide.createIcons();
    });
};

// Sobrescreve o alert nativo silenciosamente
window.alert = function(message) {
    let type = 'warning';
    let title = 'Aviso do Sistema';
    const msgLower = String(message).toLowerCase();
    
    if (msgLower.includes('sucesso') || msgLower.includes('✓')) {
        type = 'success';
        title = 'Operação Concluída';
        message = message.replace('✓ ', '').replace('⚠️ ', '');
    } else if (msgLower.includes('erro') || msgLower.includes('bloqueio') || msgLower.includes('limite') || msgLower.includes('falha')) {
        type = 'error';
        title = 'Atenção Necessária';
        message = message.replace('⚠️ ', '');
    } else if (msgLower.includes('aviso') || msgLower.includes('atenção')) {
        type = 'warning';
        message = message.replace('⚠️ ', '');
    }

    return window.showPremiumAlert({ title, message, type });
};

let notaAtual = null; // Memória da nota em edição
let loteAtual = []; // Notas do upload atual (Carrossel)
let indexLote = 0;   // Posição no lote
let historicoCompleto = []; // Cache do histórico para filtros rápidos
let chartVolume = null;
let chartStatus = null;
let pollingInterval = null; // Para monitorar assinatura em tempo real
let escolasCache = []; // Cache para busca instantânea

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
    const user = JSON.parse(localStorage.getItem('user'));

    if (!user) {
        window.location.href = 'login.html';
        return;
    }

    // 🛡️ TRAVA E SIMULAÇÃO DE ADMIN
    const adminToken = localStorage.getItem('admin_token');
    const adminUser = adminToken ? JSON.parse(localStorage.getItem('admin_user')) : null;

    // Se temos um admin_token no localStorage, significa que estamos no modo de simulação.
    const originalUser = adminUser || user;
    const isOriginalAdmin = originalUser && ['admin', 'super_admin', 'master'].includes(originalUser.nivel?.toLowerCase());

    const urlParams = new URLSearchParams(window.location.search);
    const cnpjTarget = urlParams.get('simular');

    if (cnpjTarget) {
        if (isOriginalAdmin) {
            // Backup dos dados do Admin original (se ainda não tiver backup)
            if (!localStorage.getItem('admin_token')) {
                localStorage.setItem('admin_token', 'simulating');
                localStorage.setItem('admin_user', JSON.stringify(user));
            }

            // Autenticação via cookie HttpOnly — sem header manual
            axios.post('/api/internal/debug-account', { id_target: cnpjTarget })
            .then(res => {
                if (res.data && res.data.s_token) {
                    localStorage.setItem('token', res.data.s_token);
                    localStorage.setItem('user', JSON.stringify(res.data.u_meta || { nivel: 'operador', nome: 'Admin Simulado' }));
                    
                    // Limpar query string
                    window.history.replaceState({}, document.title, window.location.pathname);
                    
                    // Recarregar para assumir a nova empresa
                    window.location.reload();
                } else {
                    window.alert('⚠️ Erro ao obter tokens de simulação.');
                    window.location.href = 'sys-lib-v2.html';
                }
            })
            .catch(err => {
                console.error('Erro na simulação:', err);
                window.alert('⚠️ Falha ao se conectar com a simulação: ' + (err.response?.data?.error || err.message));
                window.location.href = 'sys-lib-v2.html';
            });
            return; // Interrompe carregamento enquanto faz redirecionamento
        } else {
            window.location.href = 'login.html';
            return;
        }
    } else {
        // Se for admin e NÃO estiver no modo de simulação, redireciona para a Sala Central
        if (isOriginalAdmin && !adminToken) {
            window.location.href = 'sys-lib-v2.html';
            return;
        }
    }

    // Personaliza a barra lateral com os dados do usuário
    if (user) {
        const usernameEl = document.querySelector('.username');
        const avatarEl = document.querySelector('.avatar');
        const userplanEl = document.querySelector('.userplan');

        if (usernameEl) usernameEl.innerText = user.nome || 'Kitfy User';
        if (avatarEl) avatarEl.innerText = String(user.nome || 'KI').substring(0, 2).toUpperCase();
        const nivelLabel = { admin: 'Administrador', super_admin: 'Administrador', master: 'Master', gestor: 'Gestor' };
        if (userplanEl) userplanEl.innerText = nivelLabel[user.nivel] || 'Operador';
        
        // --- FASE 3: Liberação do Menu da Equipe (RBAC) ---
        if (user.nivel === 'gestor' || user.nivel === 'admin' || user.nivel === 'super_admin') {
            const navEquipe = document.getElementById('nav-equipe');
            const equipeDiv = document.getElementById('equipe-divider');
            if (navEquipe) navEquipe.style.display = 'flex';
            if (equipeDiv) equipeDiv.style.display = 'block';
        }


    }

    // Lógica de Logout
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.onclick = async () => {
            const res = await window.showPremiumAlert({
                type: 'confirm',
                title: 'Desconectar',
                message: 'Deseja realmente sair do sistema e encerrar sua sessão?',
                confirmText: 'Sim, Sair',
                cancelText: 'Cancelar'
            });
            if (res) {
                await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
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
        'nav-config': { t: 'Configurações', s: 'Ajustes globais do sistema.' },
        'nav-equipe': { t: 'Minha Equipe', s: 'Gestão de permissões e acessos dos operadores.' }
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

            if (id === 'nav-equipe') {
                carregarEquipe();
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
        const response = await axios.get(`${API_URL}/schools`);
        
        console.log('🏛️ Resposta da API Escolas:', response.data);
        
        if (response.data.success) {
            escolasCache = response.data.schools;
            renderizarGridEscolas(escolasCache);
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
        const response = await axios.get(`${API_URL}/schools`);
        const school = response.data.schools.find(s => s.cnpj === cnpj);
        if (school) {
            abrirModalCadastroEscola(school, null);
        }
    } catch (error) {
        console.error('Erro ao abrir edição:', error);
    }
}

/**
 * Filtro em tempo real para o diretório de escolas
 */
window.filtrarEscolas = (termo) => {
    const termoLower = termo.toLowerCase();
    const filtradas = escolasCache.filter(s => 
        (s.razao_social || '').toLowerCase().includes(termoLower) ||
        (s.cnpj || '').toString().includes(termoLower)
    );
    renderizarGridEscolas(filtradas);
};

function renderizarGridEscolas(schools) {
    const grid = document.getElementById('escolas-grid');
    if (!grid) return;

    try {
        // Card de "Adicionar Nova" (Sempre presente no início)
        let html = `
            <div class="card tilt-card" style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 220px; border: 2px dashed rgba(255,255,255,0.1); background: rgba(255,255,255,0.01); cursor: pointer; transition: 0.3s;" onclick="abrirModalNovaEscola()">
                <div style="background: rgba(255,255,255,0.05); width: 60px; height: 60px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 15px;">
                    <i data-lucide="plus" style="width: 30px; color: var(--text-dim);"></i>
                </div>
                <p style="font-size: 0.9rem; font-weight: 700; color: var(--text-dim); text-transform: uppercase; letter-spacing: 1px;">Nova Unidade</p>
            </div>
        `;

        if (!Array.isArray(schools) || schools.length === 0) {
            if (escolasCache.length > 0) { // Se tem cache mas o filtro zerou
                grid.innerHTML = html + '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-dim);">Nenhuma escola encontrada com este termo.</div>';
            } else {
                grid.innerHTML = html;
            }
            if (window.lucide) window.lucide.createIcons();
            return;
        }

        html += schools.map(school => {
            const nome = school.razao_social || 'Escola sem nome';
            const iniciais = nome.substring(0, 2).toUpperCase();
            const municipio = school.municipio || 'Santarém';
            const uf = school.uf || 'PA';
            
            // Máscara de CNPJ
            let cnpjRaw = school.cnpj ? String(school.cnpj).padStart(14, '0') : '';
            let cnpjFormatado = cnpjRaw.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");

            return `
                <div class="card stat-card tilt-card" onclick="window.verNotasDaEscola('${school.cnpj}')" style="flex-direction: column; align-items: flex-start; padding: 30px; min-height: 220px; gap: 0;">
                    <div style="display: flex; justify-content: space-between; width: 100%; margin-bottom: 20px;">
                        <div style="background: var(--primary); color: #fff; width: 50px; height: 50px; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 1.2rem; box-shadow: 0 5px 15px rgba(255,0,0,0.2);">
                            ${iniciais}
                        </div>
                        <div style="background: rgba(255,255,255,0.05); padding: 5px 12px; border-radius: 50px; font-size: 0.65rem; font-weight: 800; color: var(--text-dim); display: flex; align-items: center; gap: 5px; height: fit-content;">
                            <i data-lucide="map-pin" style="width: 10px;"></i> ${municipio}-${uf}
                        </div>
                    </div>
                    
                    <h3 style="font-size: 1rem; margin: 0 0 8px 0; line-height: 1.3; color: #fff; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; height: 2.6em;">
                        ${nome.toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}
                    </h3>
                    
                    <p style="font-family: monospace; color: var(--primary); font-size: 0.8rem; margin-bottom: 20px; font-weight: 600;">${cnpjFormatado}</p>
                    
                    <div style="width: 100%; height: 1px; background: linear-gradient(90deg, var(--border), transparent); margin-bottom: 20px;"></div>
                    
                    <button class="btn-primary" style="width: 100%; background: transparent; border: 1px solid rgba(255,255,255,0.1); font-size: 0.75rem; padding: 10px; box-shadow: none;">
                        Acessar Pasta da Unidade <i data-lucide="chevron-right" style="width: 14px; margin-left: 5px;"></i>
                    </button>
                </div>
            `;
        }).join('');
        
        grid.innerHTML = html;
        if (window.lucide) window.lucide.createIcons();
    } catch (err) {
        console.error('❌ Erro ao renderizar grid de escolas:', err);
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
        // Busca os dados reais da escola no Backend
        const [historyRes, statsRes] = await Promise.all([
            axios.get(`${API_URL}/history/${cleanCnpj}`),
            axios.get(`${API_URL}/stats/escola/${cleanCnpj}`)
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
        // Todas estão ASSINADAS — POST para evitar chaves de NF-e em logs de acesso
        const resp = await fetch(`${API_URL}/download-bulk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ chaves: selectedChaves })
        });
        if (!resp.ok) { const msg = await resp.text(); return showNotification(msg || 'Erro no download.', 'error'); }
        const blob = await resp.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `LOTE_PDDE_${Date.now()}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(blobUrl);
        
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
        document.getElementById('generated-link-input').value = '';
        document.getElementById('rec-nome').value = '';
        document.getElementById('rec-cpf').value = '';
        document.getElementById('rec-whatsapp').value = '';
        const btn = document.getElementById('btn-send-sig');
        btn.innerHTML = '<i data-lucide="send" style="width:16px;"></i> Enviar Link via WhatsApp (Lote)';
        btn.style.background = '';
        btn.disabled = false;

        modal.classList.add('active');
    }
};

async function carregarHistorico() {
    try {
        const response = await axios.get(`${API_URL}/history`);
        
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
        const cnpjFmt = cnpj ? cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : '';
        const nome = item.escola_nome || (cnpjFmt ? `Escola ${cnpjFmt}` : 'Escola não identificada');
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
        const startTime = Date.now();
        const response = await axios.post(`${API_URL}/upload`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
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
        const data = error.response?.data;
        const serverMessage = data?.error || 'Erro desconhecido no servidor.';
        const falhas = data?.falhas;
        const detalhe = falhas?.length
            ? '\n\nDetalhe:\n' + falhas.map(f => `• ${f.arquivo}: ${f.erro}`).join('\n')
            : '';
        showNotification(`${serverMessage}${detalhe}`, 'error');
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
    document.getElementById('btn-proceed-to-edit').onclick = async () => {
        modal.classList.remove('active');
        
        // Verifica duplicidade antes de abrir o editor
        if (nota.isDuplicada) {
            const res = await window.showPremiumAlert({
                type: 'warning',
                title: 'Nota Duplicada no Histórico',
                message: `A NF nº ${nota.nota.numero} já existe no sistema.\n\nDeseja abrir para edição e gerar novos arquivos mesmo assim?`,
                confirmText: 'Sim, Prosseguir',
                cancelText: 'Cancelar'
            });
            if (!res) return;
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
            const data = {
                cnpj: document.getElementById('new-school-cnpj').value,
                razao_social: document.getElementById('new-school-razao_social').value,
                logradouro: document.getElementById('new-school-logradouro').value,
                municipio: document.getElementById('new-school-municipio').value,
                uf: document.getElementById('new-school-uf').value
            };

            await axios.post(`${API_URL}/schools`, data);

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

    // Lógica de Rateio Global Blindada (Substitui setinhas nativas bugadas)
    window.ajustarMassa = (base, delta) => {
        if (!notaAtual) return;
        
        // TRAVA GLOBAL: Se estiver diminuindo, verifica se alguém já chegou em 0%
        if (delta === -1) {
            const limiteAtingido = notaAtual.produtos.some(p => (p.percentuais[base] || 0) <= 0);
            if (limiteAtingido) {
                alert('⚠️ LIMITE ATINGIDO: Não é possível diminuir mais, pois alguns itens já estão no valor original da Base 01.');
                return;
            }
        }

        notaAtual.produtos.forEach((_, index) => {
            const novoPerc = (notaAtual.produtos[index].percentuais[base] || 0) + delta;
            window.updatePrice(index, base, novoPerc);
        });
        renderizarItensEdicao();
    };

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

        const rect = container.getBoundingClientRect();

        const picker = document.createElement('div');
        picker.id = 'ia-picker';
        picker.className = 'ia-picker';
        
        // Ejetando do DOM local para não sofrer clipping (Portal)
        picker.style.position = 'fixed';
        picker.style.top = `${rect.bottom + 8}px`;
        picker.style.left = `${rect.left}px`;
        picker.style.width = `${rect.width}px`;
        picker.style.zIndex = '9999999';

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

        document.body.appendChild(picker);

        setTimeout(() => {
            document.addEventListener('click', clickForaPicker);
            // Proteção para o dropdown não flutuar caso o usuário role a tela do modal
            document.querySelector('.modal-content')?.addEventListener('scroll', fecharPicker, { once: true, capture: true });
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
    if (!editTableBody) return;

    editTableBody.innerHTML = notaAtual.produtos.map((prod, index) => {
        const p1 = (prod.precos.p1 || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const p2 = (prod.precos.p2 || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const p3 = (prod.precos.p3 || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const perc2 = Math.round(prod.percentuais.p2 || 0);
        const perc3 = Math.round(prod.percentuais.p3 || 0);

        return `
            <tr style="background: rgba(255,255,255,0.01); transition: 0.3s; border-radius: 12px; margin-bottom: 10px;">
                <td style="padding: 20px 15px; border-radius: 12px 0 0 12px; color: var(--text-dim); font-size: 0.75rem; font-family: monospace;">${String(index + 1).padStart(2, '0')}</td>
                <td style="padding: 20px 15px;">
                    <div style="font-weight: 700; color: #fff; font-size: 0.9rem; letter-spacing: -0.3px;">${prod.descricao}</div>
                </td>
                <td style="padding: 20px 15px; text-align: center;">
                    <span style="background: rgba(255,255,255,0.05); padding: 4px 10px; border-radius: 6px; font-size: 0.8rem; font-weight: 700; color: var(--text-dim);">${prod.quantidade}</span>
                </td>
                <td style="padding: 20px 15px; text-align: right;">
                    <div style="display: inline-flex; align-items: center; background: rgba(34, 197, 94, 0.05); border: 1px solid rgba(34, 197, 94, 0.1); padding: 8px 12px; border-radius: 10px; color: #22c55e; font-weight: 800; font-family: 'Outfit'; font-size: 0.85rem;">
                        <span style="font-size: 0.65rem; margin-right: 5px; opacity: 0.7;">R$</span> ${p1}
                    </div>
                </td>
                
                <!-- Ajuste Base 02 -->
                <td style="padding: 20px 15px;">
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
                        <div style="display: flex; align-items: center; gap: 5px; background: rgba(0,0,0,0.3); padding: 5px; border-radius: 10px; border: 1px solid var(--border);">
                            <input type="number" 
                                class="edit-input-micro" 
                                value="${perc2}" 
                                onchange="window.updatePrice(${index}, 'p2', this.value)"
                                style="width: 45px; background: transparent; border: none; color: #fff; text-align: center; font-weight: 800; font-size: 0.85rem; outline: none;">
                            <span style="font-size: 0.65rem; color: var(--text-dim); margin-right: 5px;">%</span>
                        </div>
                        <div style="font-family: monospace; font-size: 0.75rem; color: #fff; background: #000; padding: 4px 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05); min-width: 80px; text-align: center;">
                           <span style="opacity: 0.4;">R$</span> ${p2}
                        </div>
                    </div>
                </td>

                <!-- Ajuste Base 03 -->
                <td style="padding: 20px 15px; border-radius: 0 12px 12px 0;">
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
                        <div style="display: flex; align-items: center; gap: 5px; background: rgba(0,0,0,0.3); padding: 5px; border-radius: 10px; border: 1px solid var(--border);">
                            <input type="number" 
                                class="edit-input-micro" 
                                value="${perc3}" 
                                onchange="window.updatePrice(${index}, 'p3', this.value)"
                                style="width: 45px; background: transparent; border: none; color: #fff; text-align: center; font-weight: 800; font-size: 0.85rem; outline: none;">
                            <span style="font-size: 0.65rem; color: var(--text-dim); margin-right: 5px;">%</span>
                        </div>
                        <div style="font-family: monospace; font-size: 0.75rem; color: #fff; background: #000; padding: 4px 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05); min-width: 80px; text-align: center;">
                           <span style="opacity: 0.4;">R$</span> ${p3}
                        </div>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
    atualizarTotaisNoRodape();
}

function atualizarTotaisNoRodape() {
    if (!notaAtual) return;
    const totalP2 = notaAtual.produtos.reduce((acc, p) => acc + (p.precos.p2 * p.quantidade), 0);
    const totalP3 = notaAtual.produtos.reduce((acc, p) => acc + (p.precos.p3 * p.quantidade), 0);
    const elP2 = document.getElementById('global-total-p2');
    const elP3 = document.getElementById('global-total-p3');
    if (elP2) elP2.value = `R$ ${totalP2.toFixed(2)}`;
    if (elP3) elP3.value = `R$ ${totalP3.toFixed(2)}`;
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
    const res = await window.showPremiumAlert({
        type: 'confirm',
        title: 'Confirmação de Assinatura',
        message: 'Deseja marcar esta nota como ASSINADA e CONCLUÍDA?\nOs arquivos serão validados como entregues.',
        confirmText: 'Sim, Concluir',
        cancelText: 'Cancelar'
    });
    if (!res) return;
    try {
        const response = await axios.post(`${API_URL}/notas/sign/${id}`, {});
        
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
            document.getElementById('generated-link-input').value = '';
            document.getElementById('rec-nome').value = '';
            document.getElementById('rec-cpf').value = '';
            document.getElementById('rec-whatsapp').value = '';
            const btn = document.getElementById('btn-send-sig');
            btn.innerHTML = '<i data-lucide="send" style="width:16px;"></i> Enviar Link via WhatsApp';
            btn.style.background = '';
            btn.disabled = false;
            
            modal.classList.add('active');
        }
        return;
    }
    
    // Tenta baixar a nota — cookie HttpOnly autentica automaticamente
    try {
        const response = await axios.get(`${API_URL}/download/${id}`, { responseType: 'blob' });
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `KIT_PDDE_${id.substring(0, 10)}.zip`);
        document.body.appendChild(link);
        link.click();
        link.parentNode.removeChild(link);

        // Incrementar contador de impressões no servidor
        await axios.post(`${API_URL}/notas/track-print/${id}`, {});
        
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
        const response = await axios.get(`${API_URL}/notas/${id}/entregas`);
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
                            ${e.signature_path ? `<button onclick="viewSignature('${e.signature_path}')" style="background:none;border:none;color:var(--primary);cursor:pointer;font-size:inherit;padding:0;display:inline-flex;align-items:center;gap:4px;"><i data-lucide="image"></i> Ver</button>` : '-'}
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

window.viewSignature = async function(sigPath) {
    try {
        const response = await axios.get(`/output/assinaturas/${encodeURIComponent(sigPath)}`, {
            responseType: 'blob'
        });
        const blobUrl = URL.createObjectURL(response.data);
        const win = window.open(blobUrl, '_blank');
        if (win) win.onload = () => URL.revokeObjectURL(blobUrl);
    } catch (e) {
        alert('Não foi possível carregar a imagem da assinatura.');
    }
};

/**
 * Envia a solicitação de assinatura para o recebedor
 */
function _abrirWhatsApp(nome, whatsapp, link) {
    const digits = whatsapp.replace(/\D/g, '');
    const telefone = digits.startsWith('55') ? digits : '55' + digits;
    const mensagem =
        `Olá ${nome}! Segue o link para assinatura das planilhas PDDE:\n\n` +
        `${link}\n\n` +
        `Acesse, leia os documentos e assine com o dedo. O link expira em 48 horas.`;
    window.open(`https://wa.me/${telefone}?text=${encodeURIComponent(mensagem)}`, '_blank');
}

window.enviarSolicitacaoAssinatura = async () => {
    const modal = document.getElementById('signature-request-modal');
    const id = modal.dataset.notaId;

    const nome     = document.getElementById('rec-nome').value.trim();
    const cpf      = document.getElementById('rec-cpf').value.trim();
    const whatsapp = document.getElementById('rec-whatsapp').value.trim();

    if (!nome || !cpf || !whatsapp) {
        alert('Por favor, preencha todos os dados do recebedor.');
        return;
    }

    // Se o link já foi gerado, apenas reabre o WhatsApp
    const linkGerado = document.getElementById('generated-link-input').value;
    if (linkGerado) {
        _abrirWhatsApp(nome, whatsapp, linkGerado);
        return;
    }

    const btn = document.getElementById('btn-send-sig');
    try {
        btn.innerText = 'Gerando link...';
        btn.disabled = true;

        const isBulk = modal.dataset.isBulk === 'true';
        const endpoint = isBulk ? 'request-signature-bulk' : 'request-signature';

        const payload = { recebedor_nome: nome, recebedor_cpf: cpf, recebedor_whatsapp: whatsapp };
        if (isBulk) payload.chaves = id.split(',');

        const response = await axios.post(`${API_URL}/notas/${endpoint}${isBulk ? '' : '/' + id}`, payload);

        if (response.data.success) {
            const link = response.data.link;

            // Exibe área de link (fallback para cópia manual)
            document.getElementById('link-display-area').style.display = 'block';
            document.getElementById('generated-link-input').value = link;

            // Abre WhatsApp com mensagem pronta
            _abrirWhatsApp(nome, whatsapp, link);

            // Botão vira "Reenviar"
            btn.innerHTML = '<i data-lucide="refresh-cw" style="width:16px;"></i> Reenviar via WhatsApp';
            btn.style.background = '';
            btn.disabled = false;

            // Inicia polling de status
            iniciarPollingAssinatura(id);

            if (window.lucide) window.lucide.createIcons();
        }
    } catch (error) {
        console.error('Erro ao enviar solicitação:', error);
        alert('Erro ao gerar link de assinatura.');
        btn.innerHTML = '<i data-lucide="send" style="width:16px;"></i> Enviar Link via WhatsApp';
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
            const response = await axios.get(`${API_URL}/nota-status/${id}`);

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
            console.error('Erro ao polling:', error);
        }
    }, 3000); // Verifica a cada 3 segundos
}



// --- FASE 3: FUNÇÕES DE GESTÃO DA EQUIPE (RBAC B2B) ---
window.equipeConectada = [];

window.carregarEquipe = async function() {
    const tbody = document.getElementById('tbody-equipe');
    const contador = document.getElementById('equipe-count');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-dim);">Carregando equipe...</td></tr>';

    try {
        const response = await axios.get(`${API_URL}/empresa/equipe`);

        if (response.data.success) {
            window.equipeConectada = response.data.equipe || [];
            if (contador) contador.innerText = window.equipeConectada.length;
            renderizarTabelaEquipe();
        }
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #ff0000;">Erro ao buscar equipe: ${error.response?.data?.error || error.message}</td></tr>`;
    }
};

function renderizarTabelaEquipe() {
    const tbody = document.getElementById('tbody-equipe');
    if (!tbody) return;
    tbody.innerHTML = '';

    const currentUser = JSON.parse(localStorage.getItem('user'));

    if (window.equipeConectada.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-dim);">Nenhum operador atrelado a este CNPJ.</td></tr>';
        return;
    }

    window.equipeConectada.forEach(op => {
        const tr = document.createElement('tr');
        const perms = op.permissoesObj || { live_excel: true, historico: true };
        const isSelfGestor = op.email === currentUser.email && op.nivel === 'gestor';

        let badgeNivel = `<span class="status-badge status-pendente" style="background: rgba(59, 130, 246, 0.1); color: #60a5fa; border-color: rgba(59, 130, 246, 0.2);">Operador</span>`;
        if (op.nivel === 'gestor' || op.nivel === 'admin') {
            badgeNivel = `<span class="status-badge status-assinado" style="background: rgba(34, 197, 94, 0.1); color: #22c55e; border-color: rgba(34, 197, 94, 0.2);">Gestor Master</span>`;
        }

        tr.innerHTML = `
            <td>
                <div style="font-weight: 800; color: #fff; font-family: 'Outfit', sans-serif;">${op.nome}</div>
                <div style="font-size: 0.75rem; color: var(--text-dim);">${op.email}</div>
            </td>
            <td>${badgeNivel}</td>
            <td>
                <label class="rbac-switch">
                    <input type="checkbox" ${perms.live_excel ? 'checked' : ''} ${isSelfGestor ? 'disabled title="Segurança: Impossível desabilitar o próprio acesso mestre"' : ''} onclick="window.togglePermissao(${op.id}, 'live_excel', this.checked)">
                    <span class="rbac-slider"></span>
                </label>
            </td>
            <td>
                <label class="rbac-switch">
                    <input type="checkbox" ${perms.historico ? 'checked' : ''} ${isSelfGestor ? 'disabled title="Segurança: Impossível desabilitar o próprio acesso mestre"' : ''} onclick="window.togglePermissao(${op.id}, 'historico', this.checked)">
                    <span class="rbac-slider"></span>
                </label>
            </td>
            <td style="text-align: right;">
                <button class="btn-action" style="margin-left: auto; width: 36px; height: 36px; ${op.email === currentUser.email ? 'opacity: 0.3; cursor: not-allowed;' : ''}" ${op.email === currentUser.email ? 'disabled title="Segurança: Você não pode desconectar sua própria conta master"' : ''} onclick="window.demitirOperador(${op.id}, '${op.nome.replace(/'/g, "\\'")}')">
                    <i data-lucide="user-x" style="width: 16px;"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    if (window.lucide) window.lucide.createIcons();
}

window.togglePermissao = async function(id, key, value) {
    const op = window.equipeConectada.find(u => u.id === id);
    if (!op) return;

    if (!op.permissoesObj) op.permissoesObj = { live_excel: true, historico: true };
    op.permissoesObj[key] = value;

    try {
        await axios.patch(`${API_URL}/empresa/equipe/${id}/permissoes`, {
            permissoes: op.permissoesObj
        });
        
        if (window.showGhostNotification) {
            window.showGhostNotification(`Permissão de ${key === 'live_excel' ? 'Live Excel' : 'Histórico'} ${value ? 'ativada' : 'cortada'}!`);
        }
    } catch (error) {
        window.alert(`⚠️ Falha ao salvar permissão: ${error.response?.data?.error || error.message}`);
        window.carregarEquipe(); 
    }
};

window.demitirOperador = async function(id, nome) {
    const res = await window.showPremiumAlert({
        type: 'confirm',
        title: 'Revogar Acesso',
        message: `Atenção: Desconectar a conta de "${nome}" revogará instantaneamente seu acesso e liberará a vaga para que você cadastre outra pessoa.\n\nConfirma o encerramento do vínculo?`,
        confirmText: 'Sim, Revogar Acesso',
        cancelText: 'Manter Conta'
    });

    if (!res) return;

    try {
        const response = await axios.delete(`${API_URL}/empresa/equipe/${id}`);

        if (response.data.success) {
            window.alert(`✓ ${response.data.message}`);
            window.carregarEquipe();
        }
    } catch (error) {
        window.alert(`⚠️ Falha ao revogar acesso: ${error.response?.data?.error || error.message}`);
    }
};

window.encerrarSimulacao = function() {
    const adminUser = localStorage.getItem('admin_user');
    if (adminUser) {
        localStorage.setItem('user', adminUser);
        localStorage.removeItem('token');
        localStorage.removeItem('admin_token');
        localStorage.removeItem('admin_user');
        window.location.href = 'sys-lib-v2.html';
    } else {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = 'login.html';
    }
};

