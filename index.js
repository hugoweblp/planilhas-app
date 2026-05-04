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

const app = express();
app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'pdde_premium_secret_key_2026_safe';

// Servir arquivos estáticos do frontend
app.use(express.static(path.join(__dirname, 'frontend')));

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
    if (!fs.existsSync(outputDir)) return res.json({ success: true, files: [] });
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
    const dir = 'uploads';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `upload-${Date.now()}${ext}`);
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

    const promessas = arquivos.map(file => prepararPreviewNota(file.path));
    const notasProcessadas = await Promise.all(promessas);
    
    // Pega a primeira nota para validar a escola
    const notaPrincipal = notasProcessadas[0];
    const cnpjEscola = String(notaPrincipal.comprador.cnpj).replace(/\D/g, '').padStart(14, '0');

    // Verifica se a escola existe
    const schoolInDb = await dbAll('SELECT * FROM escolas WHERE cnpj = ?', [cnpjEscola]);

    let schoolCreated = false;
    if (schoolInDb.length === 0) {
      // AUTO-CADASTRO: Salva a escola automaticamente
      await dbRun(
        'INSERT INTO escolas (cnpj, razao_social, logradouro, municipio, uf) VALUES (?, ?, ?, ?, ?)',
        [
          cnpjEscola, 
          notaPrincipal.comprador.nome, 
          notaPrincipal.comprador.endereco, 
          notaPrincipal.comprador.cidade, 
          notaPrincipal.comprador.estado
        ]
      );
      schoolCreated = true;
    }

    res.json({ 
      success: true, 
      schoolCreated,
      schoolName: notaPrincipal.comprador.nome,
      notas: notasProcessadas 
    });
  } catch (error) {
    console.error('❌ ERRO NO PROCESSAMENTO DO XML:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 2. ROTA DE GERAÇÃO FINAL
 * Recebe os dados (que podem ter sido editados no Front-end) e gera os arquivos
 */
app.post('/api/generate', async (req, res) => {
  try {
    const dadosParaGerar = req.body; // Dados vindos do Painel de Edição
    
    const resultadoExcel = await gerarExcel(dadosParaGerar);
    const resultadoWord = await gerarReciboWord(dadosParaGerar);

    // Salva ou atualiza o registro da nota no banco
    await dbRun(`REPLACE INTO notas 
        (chave, numero, serie, data_emissao, valor_total, cnpj_vendedor, cnpj_escola, status, arquivo_excel, arquivo_word) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
        [
          dadosParaGerar.nota.chave, 
          dadosParaGerar.nota.numero, 
          dadosParaGerar.nota.serie, 
          dadosParaGerar.nota.dataISO, 
          dadosParaGerar.nota.valorTotal, 
          dadosParaGerar.vendedor.cnpj, 
          dadosParaGerar.comprador.cnpj,
          'PENDENTE',
          resultadoExcel.nome,
          resultadoWord.nome
        ]);

    res.json({ 
      success: true, 
      arquivos: {
        excel: resultadoExcel.nome,
        word: resultadoWord.nome,
        urlExcel: `/output/${resultadoExcel.nome}`,
        urlWord: `/output/${resultadoWord.nome}`
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
        SELECT n.*, e.razao_social as escola_nome 
        FROM notas n 
        LEFT JOIN escolas e ON n.cnpj_escola = e.cnpj 
        ORDER BY n.criado_em DESC LIMIT 100
    `);
    res.json({ success: true, history: rows });
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
 * ROTA: Obter dados da nota via Token (Para a tela de assinar.html)
 */
app.get('/api/signature-info/:token', async (req, res) => {
    try {
        const { token } = req.params;
        console.log(`🔍 BUSCANDO TOKEN: ${token}`);
        
        const nota = await dbGet(
            `SELECT n.*, e.razao_social 
             FROM notas n 
             LEFT JOIN escolas e ON n.cnpj_escola = e.cnpj 
             WHERE n.signature_token = ?`,
            [token]
        );

        if (!nota) {
            console.error(`❌ TOKEN NÃO ENCONTRADO NO BANCO: ${token}`);
            return res.status(404).json({ success: false, error: 'Link de assinatura expirado ou inválido.' });
        }

        console.log(`✅ NOTA ENCONTRADA: ${nota.chave}`);
        res.json({ success: true, nota });
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
        
        // 1. Verifica o token
        const nota = await dbGet('SELECT chave FROM notas WHERE signature_token = ?', [token]);
        if (!nota) return res.status(404).json({ success: false, error: 'Token inválido.' });

        // 2. Salva a imagem base64 como arquivo físico
        const base64Data = signature.replace(/^data:image\/png;base64,/, "");
        const fileName = `sig-${nota.chave}-${Date.now()}.png`;
        const filePath = path.join(__dirname, 'output', 'assinaturas', fileName);
        
        const sigDir = path.join(__dirname, 'output', 'assinaturas');
        if (!fs.existsSync(sigDir)) fs.mkdirSync(sigDir, { recursive: true });

        fs.writeFileSync(filePath, base64Data, 'base64');

        // 3. Atualiza o banco
        await dbRun(
            "UPDATE notas SET status = 'ASSINADO', assinatura_path = ? WHERE signature_token = ?",
            [fileName, token]
        );

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`
🚀 SERVIDOR V2 - DIAGNÓSTICO ONLINE: http://localhost:${PORT}
✅ Banco de Dados: Conectado
📁 Pasta de Saída: /output pronta para downloads
  `);
});
