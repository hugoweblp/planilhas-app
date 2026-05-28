const express = require('express');
const router  = express.Router();

const { dbGet, dbAll } = require('../database/db');
const { autenticarToken, verificarPermissao } = require('../middleware/auth');
const { rlsMiddleware } = require('../middleware/rls');
const { safeError, sanitizeNota } = require('../utils/helpers');

// GET /api/history/escola/:cnpj  — DEVE vir ANTES de /history/:cnpj
router.get('/history/escola/:cnpj', autenticarToken, rlsMiddleware, verificarPermissao('historico'), async (req, res) => {
    try {
        const cnpj = req.params.cnpj.replace(/\D/g, '').padStart(14, '0');
        const rows = await dbAll(`
            SELECT n.*, e.razao_social as escola_nome
            FROM notas n
            LEFT JOIN escolas e ON n.cnpj_escola = e.cnpj AND e.empresa_dona_cnpj = n.cnpj_vendedor
            WHERE n.cnpj_escola = ? ${req.rls.clause('n.cnpj_vendedor')}
            ORDER BY n.criado_em DESC
        `, [cnpj, ...req.rls.param()]);
        res.json({ success: true, history: rows.map(sanitizeNota) });
    } catch (error) {
        res.status(500).json({ success: false, error: safeError(error) });
    }
});

// GET /api/history
router.get('/history', autenticarToken, rlsMiddleware, verificarPermissao('historico'), async (req, res) => {
    try {
        const rows = await dbAll(`
            SELECT n.*,
                   e.razao_social as escola_nome,
                   CASE WHEN n.status = 'ASSINADO' AND TIMESTAMPDIFF(HOUR, n.assinada_em, NOW()) >= 2 THEN 'REENTREGAR'
                   ELSE n.status END as status_calculado
            FROM notas n
            LEFT JOIN escolas e ON n.cnpj_escola = e.cnpj AND e.empresa_dona_cnpj = n.cnpj_vendedor
            ${req.rls.where('n.cnpj_vendedor')}
            ORDER BY n.criado_em DESC LIMIT 100
        `, req.rls.param());
        res.json({ success: true, history: rows.map(r => sanitizeNota({ ...r, status: r.status_calculado })) });
    } catch (error) {
        res.status(500).json({ success: false, error: safeError(error) });
    }
});

// GET /api/history/:cnpj
router.get('/history/:cnpj', autenticarToken, rlsMiddleware, verificarPermissao('historico'), async (req, res) => {
    try {
        const { cnpj } = req.params;
        const rows = await dbAll(`
            SELECT n.*,
                   e.razao_social as escola_nome,
                   CASE WHEN n.status = 'ASSINADO' AND TIMESTAMPDIFF(HOUR, n.assinada_em, NOW()) >= 2 THEN 'REENTREGAR'
                   ELSE n.status END as status_calculado
            FROM notas n
            LEFT JOIN escolas e ON n.cnpj_escola = e.cnpj AND e.empresa_dona_cnpj = n.cnpj_vendedor
            WHERE n.cnpj_escola = ? ${req.rls.clause('n.cnpj_vendedor')}
            ORDER BY n.criado_em DESC
        `, [cnpj, ...req.rls.param()]);
        res.json({ success: true, history: rows.map(r => sanitizeNota({ ...r, status: r.status_calculado })) });
    } catch (error) {
        res.status(500).json({ success: false, error: safeError(error) });
    }
});

// GET /api/stats/escola/:cnpj
router.get('/stats/escola/:cnpj', autenticarToken, rlsMiddleware, async (req, res) => {
    try {
        const cnpj = req.params.cnpj.replace(/\D/g, '').padStart(14, '0');
        const stats = await dbGet(`
            SELECT
                COUNT(*) as total_notas,
                SUM(valor_total) as valor_total,
                SUM(gerado_qtd) as total_geracoes,
                COUNT(CASE WHEN status = 'ASSINADO' THEN 1 END) as processadas
            FROM notas
            WHERE cnpj_escola = ? ${req.rls.clause('cnpj_vendedor')}
        `, [cnpj, ...req.rls.param()]);
        res.json({ success: true, stats });
    } catch (error) {
        res.status(500).json({ success: false, error: safeError(error) });
    }
});

// GET /api/dashboard/stats
router.get('/dashboard/stats', autenticarToken, rlsMiddleware, async (req, res) => {
    try {
        const stats = await dbGet(`
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN status = 'ASSINADO' THEN 1 ELSE 0 END) as assinados,
                SUM(CASE WHEN status = 'PENDENTE'  THEN 1 ELSE 0 END) as pendentes,
                SUM(valor_total) as valor_total
            FROM notas
            ${req.rls.where('cnpj_vendedor')}
        `, req.rls.param());
        res.json({ success: true, stats });
    } catch (error) {
        res.status(500).json({ success: false, error: safeError(error) });
    }
});

module.exports = router;
