const express = require('express');
const router  = express.Router();

const { dbGet, dbAll, dbRun } = require('../database/db');
const { autenticarToken } = require('../middleware/auth');
const { rlsMiddleware } = require('../middleware/rls');
const { safeError } = require('../utils/helpers');

// GET /api/schools/check/:cnpj
router.get('/check/:cnpj', autenticarToken, rlsMiddleware, async (req, res) => {
    try {
        const cnpj = req.params.cnpj.replace(/\D/g, '').padStart(14, '0');
        const school = await dbAll(
            `SELECT * FROM escolas WHERE cnpj = ? ${req.rls.clause('empresa_dona_cnpj')}`,
            [cnpj, ...req.rls.param()]
        );
        res.json({ success: true, exists: school.length > 0, school: school[0] || null });
    } catch (error) {
        res.status(500).json({ success: false, error: safeError(error) });
    }
});

// POST /api/schools
router.post('/', autenticarToken, async (req, res) => {
    try {
        const { cnpj, razao_social, logradouro, municipio, uf } = req.body;
        const empresaDona = req.user.empresa_cnpj || req.body.empresa_cnpj;
        if (!empresaDona) {
            return res.status(400).json({ success: false, error: 'empresa_cnpj é obrigatório para criar escola.' });
        }
        const cleanCnpj = String(cnpj).replace(/\D/g, '').padStart(14, '0');
        await dbRun(
            'REPLACE INTO escolas (cnpj, razao_social, logradouro, municipio, uf, empresa_dona_cnpj) VALUES (?, ?, ?, ?, ?, ?)',
            [cleanCnpj, razao_social, logradouro, municipio, uf, empresaDona]
        );
        res.json({ success: true, message: 'Escola cadastrada com sucesso!' });
    } catch (error) {
        res.status(400).json({ success: false, error: safeError(error) });
    }
});

// GET /api/schools
router.get('/', autenticarToken, rlsMiddleware, async (req, res) => {
    try {
        const schools = await dbAll(
            `SELECT * FROM escolas ${req.rls.where('empresa_dona_cnpj')} ORDER BY razao_social ASC`,
            req.rls.param()
        );
        res.json({ success: true, schools });
    } catch (error) {
        res.status(500).json({ success: false, error: safeError(error) });
    }
});

module.exports = router;
