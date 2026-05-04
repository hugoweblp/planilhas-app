const API_URL = '/api'; // Usa o caminho relativo do servidor

let notaAtual = null; // Memória da nota em edição
let historicoCompleto = []; // Cache do histórico para filtros rápidos
let chartVolume = null;
let chartStatus = null;
let pollingInterval = null; // Para monitorar assinatura em tempo real

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
    carregarHistorico();
    configurarUpload();
    configurarModal();
    inicializarGraficos();
});

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
    const tableBody = document.getElementById('schools-table-body');
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
                <tr>
                    <td>
                        <div style="font-weight: 600; color: #f8fafc;">${razaoSocial}</div>
                    </td>
                    <td style="font-family: monospace; color: var(--accent-primary);">${cnpjFormatado}</td>
                    <td style="color: #94a3b8;">${municipio} - ${uf}</td>
                    <td>
                        <button class="btn-icon" onclick="window.abrirEdicaoEscolaManual('${school.cnpj || ''}')" title="Editar">
                            <i data-lucide="edit-3"></i>
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
        const status = item.status || 'CONCLUÍDO';
        const isPendente = status === 'PENDENTE';
        
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
                <td><span class="badge ${isPendente ? 'badge-warning' : 'badge-success'}">${isPendente ? 'Pendente' : 'Processada'}</span></td>
                <td>
                    <button class="btn-action" onclick="window.baixarKit('${item.chave}', '${status}')" title="Baixar Kit">
                        <i data-lucide="download"></i>
                    </button>
                </td>
            </tr>
        `;
    };

    if (dashBody) dashBody.innerHTML = history.slice(0, 5).map(item => renderRow(item)).join('');
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
    
    document.getElementById('count-notes').innerText = notas.length;
    document.getElementById('total-value').innerText = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    document.getElementById('count-schools').innerText = escolasUnicas;
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
            dropShadow: { enabled: true, top: 10, left: 0, blur: 15, opacity: 0.2, color: '#ff0000' }
        },
        stroke: { curve: 'smooth', width: 4, colors: ['#ff0000'] },
        fill: { 
            type: 'gradient', 
            gradient: { 
                shadeIntensity: 1, 
                opacityFrom: 0.6, 
                opacityTo: 0.05, 
                stops: [0, 90, 100],
                colorStops: [
                    { offset: 0, color: '#ff0000', opacity: 0.6 },
                    { offset: 100, color: '#ff0000', opacity: 0 }
                ]
            } 
        },
        dataLabels: { enabled: false },
        colors: ['#ff0000'],
        xaxis: { 
            categories: [], 
            labels: { style: { colors: '#94a3b8', fontFamily: 'Manrope' } }, 
            axisBorder: { show: false }, 
            axisTicks: { show: false } 
        },
        yaxis: { labels: { style: { colors: '#94a3b8', fontFamily: 'Manrope' }, formatter: (v) => `R$ ${v.toFixed(0)}` } },
        grid: { borderColor: 'rgba(255,255,255,0.05)', strokeDashArray: 4 },
        theme: { mode: 'dark' },
        series: [{ name: 'Volume Total', data: [] }]
    };

    const statusOptions = {
        chart: { type: 'donut', height: 280, background: 'transparent' },
        colors: ['#ff0000', '#220000'], /* Vermelho vs Quase Preto */
        labels: ['Concluídos', 'Pendentes'],
        stroke: { show: false },
        plotOptions: { 
            pie: { 
                donut: { 
                    size: '78%', 
                    background: 'transparent', 
                    labels: { 
                        show: true, 
                        name: { show: true, color: '#94a3b8', fontFamily: 'Outfit' }, 
                        value: { show: true, color: '#fff', fontSize: '24px', fontWeight: 800, fontFamily: 'Outfit' }, 
                        total: { show: true, label: 'Total', color: '#94a3b8', fontFamily: 'Manrope' } 
                    } 
                } 
            } 
        },
        legend: { 
            position: 'bottom', 
            horizontalAlign: 'center',
            fontSize: '12px',
            fontFamily: 'Manrope',
            markers: { radius: 12, offsetX: -5 },
            itemMargin: { horizontal: 15, vertical: 10 },
            labels: { colors: '#94a3b8' } 
        },
        dataLabels: { enabled: false },
        series: [0, 0]
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
        const date = item.data_processamento ? item.data_processamento.split(' ')[0] : 'Indefinido';
        volumesByDate[date] = (volumesByDate[date] || 0) + (item.valor_total || 0);
    });

    const dates = Object.keys(volumesByDate).sort();
    const values = dates.map(d => volumesByDate[d]);

    chartVolume.updateOptions({
        xaxis: { categories: dates }
    });
    chartVolume.updateSeries([{ name: 'Volume Total', data: values }]);

    // 2. Processa Status
    const concluidos = history.filter(i => i.status !== 'PENDENTE').length;
    const pendentes = history.filter(i => i.status === 'PENDENTE').length;
    
    chartStatus.updateSeries([concluidos, pendentes]);
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
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) formData.append('xmls', files[i]);

    try {
        const token = localStorage.getItem('token');
        const response = await axios.post(`${API_URL}/upload`, formData, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.data.success) {
            // Se foi uma escola nova, avisa rapidamente
            if (response.data.schoolCreated) {
                alert(`✓ Escola Nova Identificada e Cadastrada:\n${response.data.schoolName}`);
            }

            // Prosegue direto para edição (Fluxo Contínuo)
            if (response.data.notas.length > 0) {
                const nota = response.data.notas[0];
                
                if (nota.isDuplicada) {
                    const msg = `⚠️ NOTA DUPLICADA\n\nA NF nº ${nota.nota.numero} já existe no histórico.\n\nDeseja abrir para edição e gerar novos arquivos mesmo assim?`;
                    if (!confirm(msg)) return;
                }

                abrirModalEdicao(nota);
            }
        }
    } catch (error) { 
        console.error('Erro no upload:', error);
        const serverMessage = error.response?.data?.error || 'Erro desconhecido no servidor.';
        alert(`Erro ao processar XML:\n${serverMessage}`);
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
        btnFinalize.onclick = async () => {
            try {
                btnFinalize.innerText = 'Gerando...';
                console.log('Enviando dados para gerar:', notaAtual);
                const response = await axios.post(`${API_URL}/generate`, notaAtual);
                if (response.data.success) {
                    alert('Kit gerado com sucesso!');
                    editModal.classList.remove('active');
                    carregarHistorico();
                }
            } catch (error) { alert('Erro ao gerar kit.'); }
            finally { 
                btnFinalize.innerHTML = '<i data-lucide="check-circle"></i> Finalizar e Gerar Kit';
                if (window.lucide) window.lucide.createIcons();
            }
        };
    }
}

function abrirModalEdicao(nota) {
    notaAtual = nota;
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

window.baixarKit = (id, status) => {
    if (status === 'PENDENTE') {
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
    const token = localStorage.getItem('token');
    window.open(`${API_URL}/download/${id}?token=${token}`, '_blank');
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
        const response = await axios.post(`${API_URL}/notas/request-signature/${id}`, data, {
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
                carregarHistorico();
            }
        } catch (error) {
            console.error('Erro no polling:', error);
        }
    }, 3000); // Verifica a cada 3 segundos
}
