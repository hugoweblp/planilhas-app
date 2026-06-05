const express = require('express');
const crypto  = require('crypto');
const jwt     = require('jsonwebtoken');
const path    = require('path');

const router = express.Router();

const { dbGet, dbRun } = require('../database/db');
const { autenticarToken, autenticarMaster } = require('../middleware/auth');
const { authLimiter } = require('../middleware/limiters');
const appConfig = require('../config/app');
const { ADMIN_EMAIL, cookieOptions } = appConfig;
const { ROOT_DIR, registrarAuditoria } = require('../utils/helpers');

// POST /api/internal/verify-master-key
router.post('/verify-master-key', authLimiter, async (req, res) => {
    try {
        const { key } = req.body;
        const masterKey = process.env.MASTER_KEY;
        if (!masterKey)
            return res.status(503).json({ success: false, error: 'MASTER_KEY não configurada no servidor.' });

        const keyBuf    = Buffer.from(key || '');
        const masterBuf = Buffer.from(masterKey);
        if (keyBuf.length !== masterBuf.length)
            return res.status(401).json({ success: false, error: 'AUTH_FAILED: INVALID_KEY_SEQUENCE' });
        const valid = crypto.timingSafeEqual(keyBuf, masterBuf);
        if (!valid)
            return res.status(401).json({ success: false, error: 'AUTH_FAILED: INVALID_KEY_SEQUENCE' });

        let adminUser = await dbGet('SELECT * FROM usuarios WHERE email = ?', [ADMIN_EMAIL]);
        if (!adminUser) {
            await dbRun(
                'INSERT INTO usuarios (nome, email, empresa_cnpj, nivel, permissoes) VALUES (?, ?, ?, ?, ?)',
                ['Hugo Master', ADMIN_EMAIL, null, 'admin', JSON.stringify({ live_excel: true, historico: true })]
            );
            adminUser = await dbGet('SELECT * FROM usuarios WHERE email = ?', [ADMIN_EMAIL]);
        }

        const token = jwt.sign(
            { id: adminUser.id, email: adminUser.email, empresa_cnpj: adminUser.empresa_cnpj, nivel: adminUser.nivel },
            appConfig.JWT_SECRET,
            { expiresIn: '12h' }
        );
        res.cookie('access_token', token, cookieOptions);
        req.user = { id: adminUser.id, email: adminUser.email, nivel: adminUser.nivel, nome: adminUser.nome, empresa_cnpj: null };
        await registrarAuditoria(req, 'LOGIN_MASTER_KEY', `Acesso root via Master Key: ${adminUser.email}`);
        res.json({ success: true, nome: adminUser.nome });
    } catch (error) {
        console.error('❌ Erro na verificação da master key:', error.message);
        res.status(500).json({ success: false, error: 'Erro interno na autenticação.' });
    }
});

// POST /api/internal/debug-account
router.post('/debug-account', autenticarToken, async (req, res) => {
    try {
        if (req.user.email.toLowerCase() !== ADMIN_EMAIL)
            return res.status(403).json({ success: false, error: 'Acesso negado.' });

        const { id_target } = req.body;
        let targetUser = await dbGet('SELECT * FROM usuarios WHERE empresa_cnpj = ? AND nivel = ? LIMIT 1', [id_target, 'master']);
        if (!targetUser) targetUser = await dbGet('SELECT * FROM usuarios WHERE empresa_cnpj = ? AND nivel = ? LIMIT 1', [id_target, 'gestor']);
        if (!targetUser) return res.status(404).json({ success: false, error: 'Target not found.' });

        const token = jwt.sign(
            { id: targetUser.id, email: targetUser.email, empresa_cnpj: id_target, nivel: targetUser.nivel, is_support: true },
            appConfig.JWT_SECRET,
            { expiresIn: '2h' }
        );

        await registrarAuditoria(req, 'IMPERSONATION', `Admin simulou empresa ${id_target} (user: ${targetUser.email})`);

        const { senha: _, ...safeMeta } = targetUser;
        res.json({ success: true, s_token: token, u_meta: { ...safeMeta, nome: `[SYS] ${targetUser.nome}` } });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Internal Error' });
    }
});

// GET /testador — restrito ao admin
router.get('/testador', autenticarToken, autenticarMaster, (req, res) => {
    res.sendFile(path.join(ROOT_DIR, 'testador.html'));
});

module.exports = router;
