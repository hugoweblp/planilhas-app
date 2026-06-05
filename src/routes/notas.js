const express = require('express');
const crypto  = require('crypto');
const path    = require('path');
const fs      = require('fs');

const router = express.Router();

const { dbGet, dbAll, dbRun } = require('../database/db');
const { encrypt: encryptField } = require('../services/cryptoService');
const { autenticarToken } = require('../middleware/auth');
const { rlsMiddleware } = require('../middleware/rls');
const { authLimiter } = require('../middleware/limiters');
const { safeError, ROOT_DIR } = require('../utils/helpers');

// GET /api/nota-status/:id
router.get('/nota-status/:id', autenticarToken, rlsMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const nota = await dbGet(
            `SELECT status FROM notas WHERE chave = ? ${req.rls.clause('cnpj_vendedor')}`,
            [id, ...req.rls.param()]
        );
        res.json({ success: true, status: nota ? nota.status : 'NÃO ENCONTRADA' });
    } catch (error) {
        res.status(500).json({ success: false, error: safeError(error) });
    }
});

// GET /api/signature-info/:token — ROTA PÚBLICA (sem autenticação)
router.get('/signature-info/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const notas = await dbAll(
            `SELECT n.chave, n.numero, n.serie, n.valor_total, n.status, n.cnpj_escola,
                    n.recebedor_nome, n.signature_token_expira_em, e.razao_social
             FROM notas n
             LEFT JOIN escolas e ON n.cnpj_escola = e.cnpj AND e.empresa_dona_cnpj = n.cnpj_vendedor
             WHERE n.signature_token = ?`,
            [token]
        );

        if (notas.length === 0)
            return res.status(404).json({ success: false, error: 'Link de assinatura expirado ou inválido.' });
        if (notas[0].signature_token_expira_em && new Date() > new Date(notas[0].signature_token_expira_em))
            return res.status(410).json({ success: false, error: 'Este link de assinatura expirou. Solicite um novo link.' });
        if (notas[0].status === 'ASSINADO')
            return res.status(410).json({ success: false, error: 'Este documento já foi assinado anteriormente.' });

        // LGPD: nunca retornar CPF nem WhatsApp
        res.json({ success: true, escola: notas[0].razao_social, notas });
    } catch (error) {
        res.status(500).json({ success: false, error: safeError(error) });
    }
});

// POST /api/save-signature — ROTA PÚBLICA (authLimiter, sem JWT)
router.post('/save-signature', authLimiter, async (req, res) => {
    try {
        const { token, signature } = req.body;
        if (!token || !signature)
            return res.status(400).json({ success: false, error: 'Token e assinatura são obrigatórios.' });
        if (signature.length > 700000)
            return res.status(413).json({ success: false, error: 'Imagem de assinatura muito grande.' });

        const notasDoToken = await dbAll(
            'SELECT chave, recebedor_nome, status, signature_token_expira_em FROM notas WHERE signature_token = ?',
            [token]
        );
        if (notasDoToken.length === 0)
            return res.status(404).json({ success: false, error: 'Link de assinatura inválido ou expirado.' });
        if (notasDoToken[0].signature_token_expira_em && new Date() > new Date(notasDoToken[0].signature_token_expira_em))
            return res.status(410).json({ success: false, error: 'Este link de assinatura expirou. Solicite um novo link.' });
        if (notasDoToken[0].status === 'ASSINADO')
            return res.status(409).json({ success: false, error: 'Este lote já foi assinado anteriormente.' });

        const base64Data = signature.replace(/^data:image\/png;base64,/, '');
        if (!Buffer.from(base64Data.slice(0, 8), 'base64').toString('hex').startsWith('89504e47'))
            return res.status(400).json({ success: false, error: 'Arquivo inválido: apenas imagens PNG são aceitas.' });
        const fileName = `sig-batch-${Date.now()}.png`;
        const sigDir   = path.join(ROOT_DIR, 'output', 'assinaturas');
        await fs.promises.mkdir(sigDir, { recursive: true });
        await fs.promises.writeFile(path.join(sigDir, fileName), base64Data, 'base64');

        await dbRun(
            "UPDATE notas SET status = 'ASSINADO', assinatura_path = ?, assinada_em = CURRENT_TIMESTAMP, entregue_qtd = entregue_qtd + 1, signature_token = NULL, signature_token_expira_em = NULL WHERE signature_token = ?",
            [fileName, token]
        );
        for (const nota of notasDoToken) {
            await dbRun('INSERT INTO entregas (chave_nota, recebido_por, signature_path) VALUES (?, ?, ?)', [nota.chave, nota.recebedor_nome, fileName]);
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: safeError(error) });
    }
});

// POST /api/notas/sign/:chave
router.post('/notas/sign/:chave', autenticarToken, rlsMiddleware, async (req, res) => {
    try {
        const { chave } = req.params;
        const result = await dbRun(
            `UPDATE notas SET status = ?, assinada_em = CURRENT_TIMESTAMP WHERE chave = ? ${req.rls.clause('cnpj_vendedor')}`,
            ['ASSINADO', chave, ...req.rls.param()]
        );
        if (!req.rls.isAdmin && result.changes === 0)
            return res.status(403).json({ success: false, error: 'Acesso negado: esta nota não pertence à sua empresa.' });
        res.json({ success: true, message: 'Nota assinada e liberada com sucesso!' });
    } catch (error) {
        res.status(500).json({ success: false, error: safeError(error) });
    }
});

// POST /api/notas/request-signature-bulk — ANTES de /request-signature/:id
router.post('/notas/request-signature-bulk', autenticarToken, rlsMiddleware, async (req, res) => {
    try {
        const { chaves, recebedor_nome, recebedor_cpf, recebedor_whatsapp } = req.body;
        if (!chaves || !Array.isArray(chaves) || chaves.length === 0)
            return res.status(400).json({ success: false, error: 'Nenhuma nota selecionada.' });
        if (chaves.length > 100)
            return res.status(400).json({ success: false, error: 'Máximo de 100 notas por lote de assinatura.' });

        const signatureToken = crypto.randomBytes(16).toString('hex');
        const cpfEnc  = encryptField(recebedor_cpf);
        const waEnc   = encryptField(recebedor_whatsapp);
        const expiraEm = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');

        const placeholders = chaves.map(() => '?').join(',');
        await dbRun(
            `UPDATE notas SET signature_token = ?, signature_token_expira_em = ?, recebedor_nome = ?, recebedor_cpf = ?, recebedor_whatsapp = ?
             WHERE chave IN (${placeholders}) ${req.rls.clause('cnpj_vendedor')}`,
            [signatureToken, expiraEm, recebedor_nome, cpfEnc, waEnc, ...chaves, ...req.rls.param()]
        );

        const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
        res.json({ success: true, link: `${baseUrl}/assinar.html?token=${signatureToken}` });
    } catch (error) {
        res.status(500).json({ success: false, error: safeError(error) });
    }
});

// POST /api/notas/request-signature/:id
router.post('/notas/request-signature/:id', autenticarToken, rlsMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { recebedor_nome, recebedor_cpf, recebedor_whatsapp } = req.body;
        const signatureToken = crypto.randomBytes(16).toString('hex');
        const cpfEnc  = encryptField(recebedor_cpf);
        const waEnc   = encryptField(recebedor_whatsapp);
        const expiraEm = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');

        const result = await dbRun(
            `UPDATE notas SET signature_token = ?, signature_token_expira_em = ?, recebedor_nome = ?, recebedor_cpf = ?, recebedor_whatsapp = ?
             WHERE chave = ? ${req.rls.clause('cnpj_vendedor')}`,
            [signatureToken, expiraEm, recebedor_nome, cpfEnc, waEnc, id, ...req.rls.param()]
        );
        const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
        const link = `${baseUrl}/assinar.html?token=${signatureToken}`;
        res.json({ success: true, link });
    } catch (error) {
        res.status(500).json({ success: false, error: safeError(error) });
    }
});

// GET /api/notas/:id/entregas
router.get('/notas/:id/entregas', autenticarToken, rlsMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const notaDono = await dbGet(
            `SELECT chave FROM notas WHERE chave = ? ${req.rls.clause('cnpj_vendedor')}`,
            [id, ...req.rls.param()]
        );
        if (!notaDono) return res.status(403).json({ success: false, error: 'Acesso negado.' });
        const entregas = await dbAll('SELECT * FROM entregas WHERE chave_nota = ? ORDER BY id DESC', [id]);
        res.json({ success: true, entregas });
    } catch (error) {
        res.status(500).json({ success: false, error: safeError(error) });
    }
});

// POST /api/notas/track-print/:id
router.post('/notas/track-print/:id', autenticarToken, rlsMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        await dbRun(
            `UPDATE notas SET impresso_qtd = impresso_qtd + 1 WHERE chave = ? ${req.rls.clause('cnpj_vendedor')}`,
            [id, ...req.rls.param()]
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: safeError(error) });
    }
});

module.exports = router;
