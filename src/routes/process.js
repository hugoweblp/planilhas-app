const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

const router = express.Router();

const { dbGet, dbAll, dbRun } = require('../database/db');
const { prepararPreviewNota } = require('../services/processService');
const { gerarExcel } = require('../modules/excelGenerator');
const { gerarReciboWord } = require('../modules/wordGenerator');
const { humanizarDadosIA, humanizarCampoIA } = require('../services/aiService');
const { autenticarToken, verificarPermissao, verificarModulo } = require('../middleware/auth');
const { rlsMiddleware } = require('../middleware/rls');
const { checkAssinatura, safeError, getEscolaPath, registrarAuditoria, ROOT_DIR } = require('../utils/helpers');
const { MODULOS_DEFAULT } = require('../config/app');

// Configuração do Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(ROOT_DIR, 'uploads');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `upload-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024, files: 50 },
    fileFilter: (req, file, cb) => {
        if (!file.originalname.match(/\.xml$/i)) return cb(new Error('Apenas arquivos XML são aceitos.'));
        cb(null, true);
    }
});

// POST /api/upload
router.post('/upload', autenticarToken, verificarPermissao('live_excel'), upload.array('xmls'), async (req, res) => {
    const arquivos = req.files || [];
    try {
        if (arquivos.length === 0)
            return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado.' });

        if (!req.user.empresa_cnpj)
            return res.status(400).json({ success: false, error: 'Nenhuma empresa selecionada. Se você é administrador, use "Simular Acesso" na Sala Central (sys-lib) para operar como uma empresa antes de processar XMLs.' });

        const notasProcessadas = [];
        const falhas = [];
        for (const file of arquivos) {
            try {
                notasProcessadas.push(await prepararPreviewNota(file.path, req.user.empresa_cnpj));
            } catch (err) {
                console.error(`⚠️ Erro ao processar ${file.originalname}:`, err.message);
                falhas.push({ arquivo: file.originalname, erro: err.message });
            }
        }

        if (notasProcessadas.length === 0)
            return res.status(400).json({ success: false, error: 'Nenhum XML válido foi encontrado no lote.', falhas });

        for (const nota of notasProcessadas) {
            const notaInDb = await dbGet('SELECT chave FROM notas WHERE chave = ? AND cnpj_vendedor = ?', [nota.nota.chave, req.user.empresa_cnpj]);
            nota.duplicada = !!notaInDb;
        }

        await registrarAuditoria(req, 'XML_UPLOAD', `${notasProcessadas.length} XML(s) processado(s), ${falhas.length} falha(s)`);
        res.json({ success: true, count: notasProcessadas.length, falhas, escolasNovas, notas: notasProcessadas });
    } catch (error) {
        console.error('❌ ERRO GERAL NO UPLOAD:', error);
        res.status(500).json({ success: false, error: 'Erro interno ao processar o lote de arquivos.' });
    } finally {
        // Remove XMLs temporários do disco após processamento (dados fiscais sensíveis)
        for (const file of arquivos) {
            fs.promises.unlink(file.path).catch(() => {});
        }
    }
});

// POST /api/generate
router.post('/generate', autenticarToken, verificarPermissao('live_excel'), async (req, res) => {
    try {
        const assinaturaCheck = await checkAssinatura(req.user.empresa_cnpj);
        if (!assinaturaCheck.ok)
            return res.status(403).json({ success: false, error: `Geração bloqueada: ${assinaturaCheck.motivo}` });

        const dadosParaGerar = req.body;
        if (!dadosParaGerar?.comprador?.cnpj || !dadosParaGerar?.vendedor?.cnpj || !dadosParaGerar?.nota?.chave) {
            return res.status(400).json({ success: false, error: 'Body inválido: comprador.cnpj, vendedor.cnpj e nota.chave são obrigatórios.' });
        }
        const cleanCnpjEscola   = String(dadosParaGerar.comprador.cnpj).replace(/\D/g, '').padStart(14, '0');
        const cleanCnpjVendedor = String(dadosParaGerar.vendedor.cnpj).replace(/\D/g, '').padStart(14, '0');
        // Isolamento por empresa_cnpj (RLS) — um contratante pode ter múltiplos CNPJs emitentes

        const folder        = getEscolaPath(cleanCnpjEscola, dadosParaGerar.nota.dataISO, req.user.empresa_cnpj);
        const resultadoExcel = await gerarExcel(dadosParaGerar, folder.absolute);

        const empresaModulos = await dbGet('SELECT modulos_ativos FROM empresas_contratantes WHERE cnpj = ?', [req.user.empresa_cnpj]);
        let modulosAtivos = { ...MODULOS_DEFAULT };
        if (empresaModulos?.modulos_ativos) { try { modulosAtivos = JSON.parse(empresaModulos.modulos_ativos); } catch(e){} }

        let resultadoWord = null;
        let wordRelative  = null;
        if (modulosAtivos.word !== false) {
            resultadoWord = await gerarReciboWord(dadosParaGerar, folder.absolute);
            if (resultadoWord) wordRelative = `${folder.relative}/${resultadoWord.nome}`;
        }

        const excelRelative = `${folder.relative}/${resultadoExcel.nome}`;
        await dbRun(`
            INSERT INTO notas (chave, numero, serie, data_emissao, valor_total, cnpj_vendedor, cnpj_escola, status, arquivo_excel, arquivo_word, gerado_qtd)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            ON DUPLICATE KEY UPDATE
                arquivo_excel = VALUES(arquivo_excel),
                arquivo_word  = VALUES(arquivo_word),
                gerado_qtd    = gerado_qtd + 1,
                status        = CASE WHEN status IN ('ASSINADO', 'REENTREGAR') THEN status ELSE 'PENDENTE' END
        `, [
            dadosParaGerar.nota.chave, dadosParaGerar.nota.numero, dadosParaGerar.nota.serie,
            dadosParaGerar.nota.dataISO, dadosParaGerar.nota.valorTotal,
            req.user.empresa_cnpj, cleanCnpjEscola, 'PENDENTE', excelRelative, wordRelative
        ]);

        await registrarAuditoria(req, 'PLANILHA_GERADA', `Kit PDDE gerado — Escola: ${cleanCnpjEscola} | NF: ${dadosParaGerar.nota.numero}`, dadosParaGerar.nota.chave);

        res.json({
            success: true,
            arquivos: {
                excel:    resultadoExcel.nome,
                word:     resultadoWord?.nome || null,
                urlExcel: `/output${excelRelative}`,
                urlWord:  wordRelative ? `/output${wordRelative}` : null
            }
        });
    } catch (error) {
        console.error('Erro na geração:', error);
        res.status(500).json({ success: false, error: safeError(error) });
    }
});

// POST /api/humanize
router.post('/humanize', autenticarToken, verificarModulo('ia_gemini'), async (req, res) => {
    try {
        const { nome, endereco, texto } = req.body;
        if (texto) {
            const variacoes = await humanizarCampoIA(texto, req.body.jaGeradas || []);
            return res.json({ success: true, variacoes });
        }
        const variacoes = await humanizarDadosIA(nome, endereco);
        res.json({ success: true, ...variacoes });
    } catch (error) {
        console.error('Erro na rota de humanização:', error.message);
        res.status(500).json({ success: false, error: safeError(error) });
    }
});

// GET /api/output-files
router.get('/output-files', autenticarToken, rlsMiddleware, async (req, res) => {
    try {
        const outputDir = req.rls.isAdmin
            ? path.join(ROOT_DIR, 'output')
            : path.join(ROOT_DIR, 'output', req.rls.empresaCnpj);

        try { await fs.promises.access(outputDir); } catch { return res.json({ success: true, files: [] }); }

        const walkDir = async (dir) => {
            let results = [];
            const entries = await fs.promises.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    results = results.concat(await walkDir(fullPath));
                } else if (entry.name.endsWith('.xlsx')) {
                    const stat = await fs.promises.stat(fullPath);
                    results.push({ name: entry.name, size: stat.size, modified: stat.mtime });
                }
            }
            return results;
        };

        const files = await walkDir(outputDir);
        res.json({ success: true, files: files.sort((a, b) => b.modified - a.modified) });
    } catch (error) {
        res.status(500).json({ success: false, error: safeError(error) });
    }
});

module.exports = router;
