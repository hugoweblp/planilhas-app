require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Serviços e Módulos
const { prepararPreviewNota } = require('./src/services/processService');
const { gerarExcel } = require('./src/modules/excelGenerator');
const { gerarReciboWord } = require('./src/modules/wordGenerator');
const { dbAll, dbRun, dbGet, inicializarBanco } = require('./src/database/db');
const { humanizarDadosIA, humanizarCampoIA } = require('./src/services/aiService');
const { registrarUsuario, autenticarUsuario } = require('./src/services/authService');
const jwt = require('jsonwebtoken');
const compression = require('compression');

const app = express();

// --- FASE 2: Compressão de Dados (Alta Eficiência de Tráfego) ---
app.use(compression());
// -----------------------------------------------------------------

app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'pdde_premium_secret_key_2026_safe';

// Servir arquivos estáticos do frontend e pasta de saída
app.use(express.static(path.join(__dirname, 'frontend')));
app.use('/output', express.static(path.join(__dirname, 'output')));

/**
 * Utilitário: Garante a estrutura de pastas por Escola/Ano/Mês
 */
function getEscolaPath(cnpj, dataISO) {
    const cleanCnpj = String(cnpj).replace(/\D/g, '').padStart(14, '0');
    const date = new Date(dataISO);
    const ano = date.getUTCFullYear();
    const mes = String(date.getUTCMonth() + 1).padStart(2, '0');
    
    const dir = path.join(__dirname, 'output', cleanCnpj, String(ano), mes);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return {
        absolute: dir,
        relative: `/${cleanCnpj}/${ano}/${mes}`
    };
}

// Redireciona raiz para login
app.get('/', (req, res) => {
    res.redirect('/login.html');
});

// Inicializa o banco de dados ao subir o servidor
inicializarBanco();

/**
 * MIDDLEWARE: Verifica se o usuário está logado
 */
function autenticarToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Acesso negado. Faça login.' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Sessão expirada.' });
        req.user = user;
        next();
    });
}

/**
 * ROTAS DE AUTENTICAÇÃO
 */
app.post('/api/auth/register', async (req, res) => {
    try {
        const { usuario, senha, nome, nivel } = req.body;
        const result = await registrarUsuario(usuario, senha, nome, nivel);
        res.json(result);
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { usuario, senha } = req.body;
        const result = await autenticarUsuario(usuario, senha);
        res.json(result);
    } catch (error) {
        res.status(401).json({ success: false, error: error.message });
    }
});

/**
 * ROTAS DE ESCOLAS
 */
// Verifica se escola existe por CNPJ
app.get('/api/schools/check/:cnpj', autenticarToken, async (req, res) => {
    try {
        const cnpj = req.params.cnpj.replace(/\D/g, '');
        const school = await dbAll('SELECT * FROM escolas WHERE cnpj = ?', [cnpj]);
        res.json({ success: true, exists: school.length > 0, school: school[0] || null });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Cadastra nova escola
app.post('/api/schools', autenticarToken, async (req, res) => {
    try {
        const { cnpj, razao_social, logradouro, municipio, uf } = req.body;
        const cleanCnpj = String(cnpj).replace(/\D/g, '').padStart(14, '0');
        
        await dbRun(
            'REPLACE INTO escolas (cnpj, razao_social, logradouro, municipio, uf) VALUES (?, ?, ?, ?, ?)',
            [cleanCnpj, razao_social, logradouro, municipio, uf]
        );
        
        res.json({ success: true, message: 'Escola cadastrada com sucesso!' });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// Listagem de todas as escolas
app.get('/api/schools', autenticarToken, async (req, res) => {
    try {
        const schools = await dbAll('SELECT * FROM escolas ORDER BY razao_social ASC');
        res.json({ success: true, schools });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 1.2 HISTÓRICO ESPECÍFICO POR ESCOLA
 */
app.get('/api/history/escola/:cnpj', autenticarToken, async (req, res) => {
    try {
        const cnpj = req.params.cnpj.replace(/\D/g, '').padStart(14, '0');
        const rows = await dbAll(`
            SELECT n.*, e.razao_social as escola_nome 
            FROM notas n 
            LEFT JOIN escolas e ON n.cnpj_escola = e.cnpj 
            WHERE n.cnpj_escola = ?
            ORDER BY n.criado_em DESC
        `, [cnpj]);
        res.json({ success: true, history: rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 1.3 ESTATÍSTICAS POR ESCOLA
 */
app.get('/api/stats/escola/:cnpj', autenticarToken, async (req, res) => {
    try {
        const cnpj = req.params.cnpj.replace(/\D/g, '').padStart(14, '0');
        const stats = await dbGet(`
            SELECT 
                COUNT(*) as total_notas,
                SUM(valor_total) as valor_total,
                SUM(gerado_qtd) as total_geracoes,
                COUNT(CASE WHEN status = 'ASSINADO' THEN 1 END) as processadas
            FROM notas 
            WHERE cnpj_escola = ?
        `, [cnpj]);
        res.json({ success: true, stats });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});



app.use(express.static(path.join(__dirname, 'frontend')));

// Rota dedicada para arquivos da pasta /output com nomes complexos (R$, vírgulas, espaços).
// express.static pode engasgar com certos caracteres no Windows; res.sendFile é mais confiável.
app.get('/output/*', (req, res, next) => {
  try {
    const filename = decodeURIComponent(req.params[0]);
    if (filename.includes('..')) return res.status(403).send('Forbidden');
    const filepath = path.resolve(path.join(__dirname, 'output', filename));
    const outputDir = path.resolve(path.join(__dirname, 'output'));
    if (!filepath.startsWith(outputDir)) return res.status(403).send('Forbidden');
    res.sendFile(filepath, (err) => { if (err) next(); });
  } catch (e) {
    next();
  }
});

app.use('/output', express.static(path.join(__dirname, 'output')));

// Lista os arquivos .xlsx disponíveis na pasta /output
app.get('/api/output-files', (req, res) => {
  try {
    const outputDir = path.join(__dirname, 'output');
    if (!fs.existsSync(outputDir)) {
        console.log('📁 Criando pasta de saída:', outputDir);
        fs.mkdirSync(outputDir, { recursive: true });
    }
    const files = fs.readdirSync(outputDir)
      .filter(f => f.toLowerCase().endsWith('.xlsx'))
      .map(f => {
        const stat = fs.statSync(path.join(outputDir, f));
        return { name: f, size: stat.size, modified: stat.mtime };
      })
      .sort((a, b) => new Date(b.modified) - new Date(a.modified));
    res.json({ success: true, files });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * ROTA: Humanização com IA (Gemini)
 */
app.post('/api/humanize', async (req, res) => {
    try {
        const { nome, endereco, texto } = req.body;
        
        // Se enviou apenas um texto, humaniza só ele (Botão individual)
        if (texto) {
            const variacoes = await humanizarCampoIA(texto, req.body.jaGeradas || []);
            return res.json({ success: true, variacoes });
        }

        const variacoes = await humanizarDadosIA(nome, endereco);
        res.json({ success: true, ...variacoes });
    } catch (error) {
        console.error('Erro na rota de humanização:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Rota para abrir o testador direto pelo servidor
app.get('/testador', (req, res) => {
  res.sendFile(path.join(__dirname, 'testador.html'));
});

// Configuração do Multer para Uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(dir)) {
        console.log('📁 Criando pasta de uploads:', dir);
        fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `upload-${uniqueSuffix}${ext}`);
  }
});
const upload = multer({ storage });

// --- ROTAS DA API ---

/**
 * 1. ROTA DE UPLOAD E PREVIEW (JSON)
 * Recebe o XML e devolve os dados prontos para o Painel de Edição
 */
app.post('/api/upload', autenticarToken, upload.array('xmls'), async (req, res) => {
  try {
    const arquivos = req.files;
    if (!arquivos || arquivos.length === 0) {
      return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado.' });
    }

    // Processa os arquivos individualmente para que um arquivo com erro não quebre todo o lote
    const notasProcessadas = [];
    const falhas = [];

    for (const file of arquivos) {
        try {
            const nota = await prepararPreviewNota(file.path);
            notasProcessadas.push(nota);
        } catch (err) {
            console.error(`⚠️ Erro ao processar o arquivo ${file.originalname}:`, err.message);
            falhas.push({ arquivo: file.originalname, erro: err.message });
        }
    }

    if (notasProcessadas.length === 0) {
        return res.status(400).json({ 
            success: false, 
            error: 'Nenhum XML válido foi encontrado no lote.',
            falhas 
        });
    }
    
    let escolasNovas = 0;

    // Garante que cada escola de cada nota seja cadastrada e checa duplicidade
    for (const nota of notasProcessadas) {
        const cnpjEscola = String(nota.comprador.cnpj).replace(/\D/g, '').padStart(14, '0');
        
        // Verifica se a nota já existe no banco (Duplicada)
        const notaInDb = await dbGet('SELECT chave FROM notas WHERE chave = ?', [nota.nota.chave]);
        if (notaInDb) {
            nota.duplicada = true;
        } else {
            nota.duplicada = false;
        }

        // Verifica se a escola existe
        const schoolInDb = await dbAll('SELECT cnpj FROM escolas WHERE cnpj = ?', [cnpjEscola]);

        if (schoolInDb.length === 0) {
            await dbRun(
                'INSERT IGNORE INTO escolas (cnpj, razao_social, logradouro, municipio, uf) VALUES (?, ?, ?, ?, ?)',
                [
                    cnpjEscola, 
                    nota.comprador.nome, 
                    nota.comprador.logradouro, 
                    nota.comprador.municipio, 
                    nota.comprador.uf
                ]
            );
            escolasNovas++;
        }
    }

    res.json({ 
      success: true, 
      count: notasProcessadas.length,
      falhas,
      escolasNovas,
      notas: notasProcessadas 
    });
  } catch (error) {
    console.error('❌ ERRO GERAL NO UPLOAD:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro interno ao processar o lote de arquivos.'
    });
  }
});

/**
 * 2. ROTA DE GERAÇÃO FINAL
 * Recebe os dados (que podem ter sido editados no Front-end) e gera os arquivos
 */
app.post('/api/generate', async (req, res) => {
  try {
    const dadosParaGerar = req.body; // Dados vindos do Painel de Edição
    
    const cleanCnpjEscola = String(dadosParaGerar.comprador.cnpj).replace(/\D/g, '').padStart(14, '0');
    const cleanCnpjVendedor = String(dadosParaGerar.vendedor.cnpj).replace(/\D/g, '').padStart(14, '0');

    // 1. Define o caminho organizado (Gaveta da Escola)
    const folder = getEscolaPath(cleanCnpjEscola, dadosParaGerar.nota.dataISO);
    
    // 2. Gera os arquivos físicos na pasta correta
    const resultadoExcel = await gerarExcel(dadosParaGerar, folder.absolute);
    const resultadoWord = await gerarReciboWord(dadosParaGerar, folder.absolute);

    // 3. Salva ou atualiza o registro da nota no banco
    const excelRelative = `${folder.relative}/${resultadoExcel.nome}`;
    const wordRelative = `${folder.relative}/${resultadoWord.nome}`;

    await dbRun(`INSERT INTO notas 
        (chave, numero, serie, data_emissao, valor_total, cnpj_vendedor, cnpj_escola, status, arquivo_excel, arquivo_word, gerado_qtd) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        ON DUPLICATE KEY UPDATE 
            arquivo_excel = VALUES(arquivo_excel),
            arquivo_word = VALUES(arquivo_word),
            gerado_qtd = gerado_qtd + 1,
            -- Preserva o status se já estiver assinado ou para reentrega
            status = CASE 
                WHEN status IN ('ASSINADO', 'REENTREGAR') THEN status 
                ELSE 'PENDENTE' 
            END
        `, 
        [
          dadosParaGerar.nota.chave, 
          dadosParaGerar.nota.numero, 
          dadosParaGerar.nota.serie, 
          dadosParaGerar.nota.dataISO, 
          dadosParaGerar.nota.valorTotal, 
          cleanCnpjVendedor, 
          cleanCnpjEscola,
          'PENDENTE',
          excelRelative,
          wordRelative
        ]);

    // 4. Registra no Log de Eventos (Traceability)
    await dbRun(`INSERT INTO historico_acoes (chave_nota, tipo_acao, detalhes) VALUES (?, ?, ?)`,
        [dadosParaGerar.nota.chave, 'GERACAO', `Kit gerado para a escola ${cleanCnpjEscola}`]);

    res.json({ 
      success: true, 
      arquivos: {
        excel: resultadoExcel.nome,
        word: resultadoWord.nome,
        urlExcel: `/output${excelRelative}`,
        urlWord: `/output${wordRelative}`
      }
    });
  } catch (error) {
    console.error('Erro na geração:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 3. ROTA DE HISTÓRICO
 * Retorna a lista das últimas notas processadas
 */
app.get('/api/history', autenticarToken, async (req, res) => {
  try {
    const rows = await dbAll(`
        SELECT n.*, 
               e.razao_social as escola_nome,
               CASE WHEN n.status = 'ASSINADO' AND TIMESTAMPDIFF(HOUR, n.assinada_em, NOW()) >= 2 THEN 'REENTREGAR' 
               ELSE n.status END as status_calculado
        FROM notas n 
        LEFT JOIN escolas e ON n.cnpj_escola = e.cnpj 
        ORDER BY n.criado_em DESC LIMIT 100
    `);
    
    // Substituir o status original pelo calculado
    const history = rows.map(r => ({ ...r, status: r.status_calculado }));
    res.json({ success: true, history });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 3.1 ROTA DE HISTÓRICO POR ESCOLA
 */
app.get('/api/history/:cnpj', autenticarToken, async (req, res) => {
    try {
        const { cnpj } = req.params;
        const rows = await dbAll(`
            SELECT n.*, 
                   e.razao_social as escola_nome,
                   CASE WHEN n.status = 'ASSINADO' AND TIMESTAMPDIFF(HOUR, n.assinada_em, NOW()) >= 2 THEN 'REENTREGAR' 
                   ELSE n.status END as status_calculado
            FROM notas n 
            LEFT JOIN escolas e ON n.cnpj_escola = e.cnpj 
            WHERE n.cnpj_escola = ?
            ORDER BY n.criado_em DESC
        `, [cnpj]);
        
        const history = rows.map(r => ({ ...r, status: r.status_calculado }));
        res.json({ success: true, history });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 4. ROTA DE ASSINATURA (LIBERAÇÃO)
 */
app.post('/api/notas/sign/:chave', autenticarToken, async (req, res) => {
    try {
        const { chave } = req.params;
        await dbRun('UPDATE notas SET status = ? WHERE chave = ?', ['ASSINADO', chave]);
        res.json({ success: true, message: 'Nota assinada e liberada com sucesso!' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * ROTA: Baixar ZIP com os arquivos da Nota
 */
app.get('/api/download/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const nota = await dbGet('SELECT arquivo_excel, arquivo_word, status, assinada_em FROM notas WHERE chave = ?', [id]);
        
        if (!nota) {
            return res.status(404).send('Nota não encontrada.');
        }

        // Bloqueio de 2 horas
        if (nota.status === 'ASSINADO' && nota.assinada_em) {
            const diffMs = new Date() - new Date(nota.assinada_em);
            if (diffMs >= 2 * 60 * 60 * 1000) {
                return res.status(403).send('O link de download expirou. Solicite uma nova assinatura.');
            }
        } else if (nota.status !== 'ASSINADO') {
            return res.status(403).send('Nota não assinada.');
        }

        const AdmZip = require('adm-zip');
        const zip = new AdmZip();
        
        let adicionouAlgo = false;
        
        if (nota.arquivo_excel) {
            const excelPath = path.join(__dirname, 'output', nota.arquivo_excel.replace('/output/', ''));
            if (fs.existsSync(excelPath)) {
                zip.addLocalFile(excelPath);
                adicionouAlgo = true;
            }
        }
        
        if (nota.arquivo_word) {
            const wordPath = path.join(__dirname, 'output', nota.arquivo_word.replace('/output/', ''));
            if (fs.existsSync(wordPath)) {
                zip.addLocalFile(wordPath);
                adicionouAlgo = true;
            }
        }
        
        if (!adicionouAlgo) {
            return res.status(404).send('Arquivos físicos não encontrados no servidor.');
        }

        const zipBuffer = zip.toBuffer();
        res.set('Content-Type', 'application/zip');
        res.set('Content-Disposition', `attachment; filename="KIT_PDDE_${id.substring(0, 10)}.zip"`);
        res.send(zipBuffer);
        
    } catch (error) {
        console.error('Erro no download:', error);
        res.status(500).send('Erro interno ao gerar o download.');
    }
});

/**
 * ROTA: Baixar ZIP com os arquivos de Múltiplas Notas
 */
app.get('/api/download-bulk', async (req, res) => {
    try {
        const { chaves } = req.query;
        if (!chaves) return res.status(400).send('Nenhuma nota especificada.');
        
        const ids = chaves.split(',');
        const notas = await dbAll(`SELECT * FROM notas WHERE chave IN (${ids.map(() => '?').join(',')})`, ids);

        if (notas.length === 0) return res.status(404).send('Notas não encontradas.');

        const AdmZip = require('adm-zip');
        const zip = new AdmZip();
        let adicionouAlgo = false;

        for (const nota of notas) {
            // Verifica expiração individualmente (se alguma expirou, o processo todo deve ser renovado por segurança)
            if (nota.status === 'ASSINADO' && nota.assinada_em) {
                const diffMs = new Date() - new Date(nota.assinada_em);
                if (diffMs >= 2 * 60 * 60 * 1000) {
                    return res.status(403).send(`A nota ${nota.numero} expirou. Solicite uma nova assinatura do lote.`);
                }
            } else if (nota.status !== 'ASSINADO') {
                return res.status(403).send(`A nota ${nota.numero} ainda não foi assinada.`);
            }

            const folderName = `NF-${nota.numero}`;
            
            if (nota.arquivo_excel) {
                const excelPath = path.join(__dirname, 'output', nota.arquivo_excel.replace('/output/', ''));
                if (fs.existsSync(excelPath)) {
                    zip.addLocalFile(excelPath, folderName);
                    adicionouAlgo = true;
                }
            }
            if (nota.arquivo_word) {
                const wordPath = path.join(__dirname, 'output', nota.arquivo_word.replace('/output/', ''));
                if (fs.existsSync(wordPath)) {
                    zip.addLocalFile(wordPath, folderName);
                    adicionouAlgo = true;
                }
            }
        }

        if (!adicionouAlgo) return res.status(404).send('Nenhum arquivo encontrado para download.');

        // Incrementa o contador de impressão para todas as notas do lote
        await dbRun(`UPDATE notas SET impresso_qtd = impresso_qtd + 1 WHERE chave IN (${ids.map(() => '?').join(',')})`, ids);

        const zipBuffer = zip.toBuffer();
        res.set('Content-Type', 'application/zip');
        res.set('Content-Disposition', `attachment; filename=LOTE_PDDE_${Date.now()}.zip`);
        res.send(zipBuffer);

    } catch (error) {
        res.status(500).send(error.message);
    }
});

/**
 * 5. ROTA DE ESTATÍSTICAS DO DASHBOARD
 */
app.get('/api/dashboard/stats', autenticarToken, async (req, res) => {
    try {
        const stats = await dbAll(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'ASSINADO' THEN 1 ELSE 0 END) as assinados,
                SUM(CASE WHEN status = 'PENDENTE' THEN 1 ELSE 0 END) as pendentes,
                SUM(valor_total) as valor_total
            FROM notas
        `);
        res.json({ success: true, stats: stats[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 4. ROTA DE LISTAGEM DE ARQUIVOS (DEBUG/LAB)
 * Retorna os arquivos .xlsx disponíveis na pasta /output
 */
app.get('/api/output-files', async (req, res) => {
    try {
        const outputDir = path.join(__dirname, 'output');
        if (!fs.existsSync(outputDir)) return res.json({ success: true, files: [] });

        const files = fs.readdirSync(outputDir)
            .filter(f => f.endsWith('.xlsx'))
            .map(f => {
                const stats = fs.statSync(path.join(outputDir, f));
                return {
                    name: f,
                    size: stats.size,
                    modified: stats.mtime
                };
            })
            .sort((a, b) => b.modified - a.modified);

        res.json({ success: true, files });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * ROTA: Solicitar Assinatura (Gera link único)
 */
app.post('/api/notas/request-signature/:id', autenticarToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { recebedor_nome, recebedor_cpf, recebedor_whatsapp } = req.body;
        const signatureToken = crypto.randomBytes(16).toString('hex');

        const result = await dbRun(
            `UPDATE notas SET 
                signature_token = ?, 
                recebedor_nome = ?, 
                recebedor_cpf = ?, 
                recebedor_whatsapp = ? 
             WHERE chave = ?`,
            [signatureToken, recebedor_nome, recebedor_cpf, recebedor_whatsapp, id]
        );

        console.log(`📝 BANCO ATUALIZADO (ID: ${id}) - Linhas afetadas: ${result.changes}`);

        // Gera o link dinamicamente baseado no host da requisição
        const host = req.get('host');
        const protocol = req.protocol;
        const link = `${protocol}://${host}/assinar.html?token=${signatureToken}`;
        
        console.log(`📱 LINK GERADO (${recebedor_whatsapp}): ${link}`);

        res.json({ success: true, link });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * ROTA: Solicitar Assinatura para Múltiplas Notas (Bulk)
 */
app.post('/api/notas/request-signature-bulk', autenticarToken, async (req, res) => {
    try {
        const { chaves, recebedor_nome, recebedor_cpf, recebedor_whatsapp } = req.body;
        if (!chaves || !Array.isArray(chaves) || chaves.length === 0) {
            return res.status(400).json({ success: false, error: 'Nenhuma nota selecionada.' });
        }

        const crypto = require('crypto');
        const signatureToken = crypto.randomBytes(16).toString('hex');

        // Atualiza todas as notas selecionadas com o mesmo token e dados do recebedor
        await dbRun(
            `UPDATE notas SET 
                signature_token = ?, 
                recebedor_nome = ?, 
                recebedor_cpf = ?, 
                recebedor_whatsapp = ? 
             WHERE chave IN (${chaves.map(() => '?').join(',')})`,
            [signatureToken, recebedor_nome, recebedor_cpf, recebedor_whatsapp, ...chaves]
        );

        const host = req.get('host');
        const protocol = req.protocol;
        const link = `${protocol}://${host}/assinar.html?token=${signatureToken}`;
        
        res.json({ success: true, link });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * ROTA: Obter dados da nota via Token (Para a tela de assinar.html)
 */
app.get('/api/signature-info/:token', async (req, res) => {
    try {
        const { token } = req.params;
        console.log(`🔍 BUSCANDO TOKEN: ${token}`);
        
        const notas = await dbAll(
            `SELECT n.*, e.razao_social 
             FROM notas n 
             LEFT JOIN escolas e ON n.cnpj_escola = e.cnpj 
             WHERE n.signature_token = ?`,
            [token]
        );

        if (notas.length === 0) {
            console.error(`❌ TOKEN NÃO ENCONTRADO NO BANCO: ${token}`);
            return res.status(404).json({ success: false, error: 'Link de assinatura expirado ou inválido.' });
        }

        console.log(`✅ ${notas.length} NOTA(S) ENCONTRADA(S) PARA O TOKEN: ${token}`);
        // Retornamos a primeira nota para dados da escola e o array completo para a lista
        res.json({ success: true, escola: notas[0].razao_social, notas });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * ROTA: Salvar Assinatura Capturada
 */
/**
 * ROTA: Verificar status de uma nota (Para Polling)
 */
app.get('/api/nota-status/:id', autenticarToken, async (req, res) => {
    try {
        const { id } = req.params;
        const nota = await dbGet('SELECT status FROM notas WHERE chave = ?', [id]);
        res.json({ success: true, status: nota ? nota.status : 'NÃO ENCONTRADA' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/save-signature', async (req, res) => {
    try {
        const { token, signature } = req.body; // signature é base64
        
        const base64Data = signature.replace(/^data:image\/png;base64,/, "");
        const fileName = `sig-batch-${Date.now()}.png`;
        const filePath = path.join(__dirname, 'output', 'assinaturas', fileName);
        
        const sigDir = path.join(__dirname, 'output', 'assinaturas');
        if (!fs.existsSync(sigDir)) fs.mkdirSync(sigDir, { recursive: true });

        fs.writeFileSync(filePath, base64Data, 'base64');

        // 3. Busca todas as notas vinculadas a esse token para registrar individualmente
        const notas = await dbAll('SELECT chave, recebedor_nome FROM notas WHERE signature_token = ?', [token]);

        // 4. Atualiza o banco em massa
        await dbRun(
            "UPDATE notas SET status = 'ASSINADO', assinatura_path = ?, assinada_em = CURRENT_TIMESTAMP, entregue_qtd = entregue_qtd + 1 WHERE signature_token = ?",
            [fileName, token]
        );

        // 5. Insere registros individuais no histórico de entregas
        for (const nota of notas) {
            await dbRun(
                "INSERT INTO entregas (chave_nota, recebido_por, signature_path) VALUES (?, ?, ?)",
                [nota.chave, nota.recebedor_nome, fileName]
            );
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * ROTA: Obter histórico de assinaturas (entregas) de uma nota específica
 */
app.get('/api/notas/:id/entregas', autenticarToken, async (req, res) => {
    try {
        const { id } = req.params;
        const entregas = await dbAll('SELECT * FROM entregas WHERE chave_nota = ? ORDER BY data_hora DESC', [id]);
        res.json({ success: true, entregas });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * ROTA: Incrementar contador de impressões
 */
app.post('/api/notas/track-print/:id', autenticarToken, async (req, res) => {
    try {
        const { id } = req.params;
        await dbRun('UPDATE notas SET impresso_qtd = impresso_qtd + 1 WHERE chave = ?', [id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- FASE 4: Global Error Handler (Blindagem contra quedas) ---
// Qualquer erro não tratado nas rotas cai aqui em vez de derrubar o Node.js
app.use((err, req, res, next) => {
    console.error('\n🔥 [ALERTA DE BLINDAGEM] Erro Crítico Capturado e Neutralizado:', err.message);
    res.status(500).json({
        success: false,
        error: 'Ocorreu uma falha no processamento. O sistema foi protegido e continua online.',
        details: err.message
    });
});
// ---------------------------------------------------------------

app.listen(PORT, '0.0.0.0', () => {
  console.log(`
🚀 SERVIDOR V2 - DIAGNÓSTICO ONLINE: http://localhost:${PORT}
✅ Banco de Dados: Conectado
📁 Pasta de Saída: /output pronta para downloads
  `);
});
