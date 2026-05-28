const express = require('express');
const path    = require('path');

const router = express.Router();

const { dbGet } = require('../database/db');
const { autenticarToken } = require('../middleware/auth');
const { safeError, ROOT_DIR } = require('../utils/helpers');

// GET /output/* — serve arquivos com autenticação + RLS por tenant
router.get('/*', autenticarToken, async (req, res) => {
    try {
        const filename = decodeURIComponent(req.params[0]);

        if (filename.includes('..')) return res.status(403).json({ error: 'Forbidden' });
        const filepath   = path.resolve(path.join(ROOT_DIR, 'output', filename));
        const outputDir  = path.resolve(path.join(ROOT_DIR, 'output'));
        if (!filepath.startsWith(outputDir)) return res.status(403).json({ error: 'Forbidden' });

        const isAdmin  = req.user.nivel === 'admin';
        const userCnpj = String(req.user.empresa_cnpj || '').replace(/\D/g, '').padStart(14, '0');

        if (filename.startsWith('assinaturas/')) {
            if (!isAdmin) {
                const sigFile = path.basename(filename);
                const nota = await dbGet('SELECT cnpj_vendedor FROM notas WHERE assinatura_path = ?', [sigFile]);
                if (!nota || String(nota.cnpj_vendedor).replace(/\D/g, '').padStart(14, '0') !== userCnpj)
                    return res.status(403).json({ error: 'Acesso negado.' });
            }
        } else {
            if (!isAdmin && filename.split('/')[0] !== userCnpj)
                return res.status(403).json({ error: 'Acesso negado.' });
        }

        res.sendFile(filepath, (err) => {
            if (err) res.status(404).json({ error: 'Arquivo não encontrado.' });
        });
    } catch (error) {
        res.status(500).json({ success: false, error: safeError(error) });
    }
});

module.exports = router;
