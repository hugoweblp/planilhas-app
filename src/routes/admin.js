const express = require('express');
const router  = express.Router();

const { db, dbGet, dbAll, dbRun } = require('../database/db');
const { NIVEIS_MASTER } = require('../constants/niveis');
const { autenticarToken, autenticarMaster } = require('../middleware/auth');
const { safeError } = require('../utils/helpers');
const { MODULOS_DEFAULT } = require('../config/app');

// GET /api/admin/stats
router.get('/stats', autenticarToken, autenticarMaster, async (req, res) => {
    try {
        const totalClientes   = await dbGet('SELECT COUNT(*) as total FROM empresas_contratantes');
        const clientesAtivos  = await dbGet("SELECT COUNT(*) as total FROM empresas_contratantes WHERE status_assinatura = 'ativo'");
        const totalNotas      = await dbGet('SELECT COUNT(*) as total, COALESCE(SUM(valor_total), 0) as volume FROM notas');
        const totalOperadores = await dbGet(
            `SELECT COUNT(*) as total FROM usuarios WHERE nivel NOT IN (${NIVEIS_MASTER.map(() => '?').join(',')})`,
            [...NIVEIS_MASTER]
        );
        const receitaMensal   = await dbGet("SELECT COALESCE(SUM(valor_mensalidade), 0) as total FROM empresas_contratantes WHERE status_assinatura = 'ativo'");
        const vencendoEm7Dias = await dbGet("SELECT COUNT(*) as total FROM empresas_contratantes WHERE validade_assinatura BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY) AND status_assinatura = 'ativo'");

        res.json({
            success: true,
            stats: {
                total_clientes:    totalClientes.total,
                clientes_ativos:   clientesAtivos.total,
                total_notas:       totalNotas.total,
                volume_financeiro: totalNotas.volume,
                total_operadores:  totalOperadores.total,
                receita_mensal:    receitaMensal.total,
                vencendo_em_7d:    vencendoEm7Dias.total
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: safeError(error) });
    }
});

// GET /api/admin/empresas
router.get('/empresas', autenticarToken, autenticarMaster, async (req, res) => {
    try {
        const empresas = await dbAll('SELECT * FROM empresas_contratantes ORDER BY criado_em DESC');
        for (let emp of empresas) {
            const vagas = await dbGet('SELECT COUNT(*) as ocupadas FROM usuarios WHERE empresa_cnpj = ?', [emp.cnpj]);
            emp.vagas_ocupadas = vagas ? vagas.ocupadas : 0;
        }
        res.json({ success: true, empresas });
    } catch (error) {
        res.status(500).json({ success: false, error: safeError(error) });
    }
});

// GET /api/admin/empresas/:cnpj
router.get('/empresas/:cnpj', autenticarToken, autenticarMaster, async (req, res) => {
    try {
        const cnpj = req.params.cnpj.replace(/\D/g, '').padStart(14, '0');
        const empresa = await dbGet('SELECT * FROM empresas_contratantes WHERE cnpj = ?', [cnpj]);
        if (!empresa) return res.status(404).json({ success: false, error: 'Empresa não encontrada.' });

        const vagas      = await dbGet('SELECT COUNT(*) as ocupadas FROM usuarios WHERE empresa_cnpj = ?', [cnpj]);
        const notasStats = await dbGet('SELECT COUNT(*) as total, COALESCE(SUM(valor_total), 0) as volume FROM notas WHERE cnpj_vendedor = ?', [cnpj]);
        const operadores = await dbAll('SELECT id, nome, email, nivel, criado_em FROM usuarios WHERE empresa_cnpj = ? ORDER BY criado_em ASC', [cnpj]);

        res.json({
            success: true,
            empresa: { ...empresa, vagas_ocupadas: vagas.ocupadas, total_notas: notasStats.total, volume_total: notasStats.volume, operadores }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: safeError(error) });
    }
});

// POST /api/admin/empresas
router.post('/empresas', autenticarToken, autenticarMaster, async (req, res) => {
    try {
        const { cnpj, razao_social, plano_vagas, email_gestor } = req.body;
        const cleanCnpj = String(cnpj).replace(/\D/g, '').padStart(14, '0');
        await dbRun(
            'INSERT INTO empresas_contratantes (cnpj, razao_social, plano_vagas, email_gestor, status_assinatura) VALUES (?, ?, ?, ?, ?)',
            [cleanCnpj, razao_social, parseInt(plano_vagas) || 2, email_gestor || null, 'ativo']
        );
        res.json({ success: true, message: 'Inquilino registrado com sucesso!' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY' || error.message?.includes('UNIQUE'))
            return res.status(400).json({ success: false, error: 'CNPJ já cadastrado no sistema.' });
        res.status(500).json({ success: false, error: safeError(error) });
    }
});

const STATUS_VALIDOS = ['ativo', 'expirado', 'bloqueado', 'inativo'];

// PUT /api/admin/empresas/:cnpj
router.put('/empresas/:cnpj', autenticarToken, autenticarMaster, async (req, res) => {
    try {
        const cnpj = req.params.cnpj.replace(/\D/g, '').padStart(14, '0');
        const { status_assinatura, plano_vagas, validade_assinatura, valor_mensalidade, contato_nome, contato_telefone, observacoes } = req.body;
        if (status_assinatura && !STATUS_VALIDOS.includes(status_assinatura)) {
            return res.status(400).json({ success: false, error: `status_assinatura inválido. Valores permitidos: ${STATUS_VALIDOS.join(', ')}.` });
        }
        await dbRun(
            `UPDATE empresas_contratantes SET
                status_assinatura   = COALESCE(?, status_assinatura),
                plano_vagas         = COALESCE(?, plano_vagas),
                validade_assinatura = ?,
                valor_mensalidade   = COALESCE(?, valor_mensalidade),
                contato_nome        = COALESCE(?, contato_nome),
                contato_telefone    = COALESCE(?, contato_telefone),
                observacoes         = COALESCE(?, observacoes)
             WHERE cnpj = ?`,
            [
                status_assinatura || null,
                plano_vagas ? parseInt(plano_vagas) : null,
                validade_assinatura || null,
                valor_mensalidade ? parseFloat(valor_mensalidade) : null,
                contato_nome || null,
                contato_telefone || null,
                observacoes || null,
                cnpj
            ]
        );
        res.json({ success: true, message: 'Inquilino atualizado com sucesso!' });
    } catch (error) {
        res.status(500).json({ success: false, error: safeError(error) });
    }
});

// DELETE /api/admin/empresas/:cnpj
router.delete('/empresas/:cnpj', autenticarToken, autenticarMaster, async (req, res) => {
    try {
        const cnpj = req.params.cnpj.replace(/\D/g, '').padStart(14, '0');
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            await conn.execute('DELETE FROM notas WHERE cnpj_vendedor = ?', [cnpj]);
            await conn.execute('DELETE FROM usuarios WHERE empresa_cnpj = ?', [cnpj]);
            await conn.execute('DELETE FROM escolas WHERE empresa_dona_cnpj = ?', [cnpj]);
            await conn.execute('DELETE FROM empresas_contratantes WHERE cnpj = ?', [cnpj]);
            await conn.commit();
        } catch (txErr) { try { await conn.rollback(); } catch (_) {} throw txErr; }
        finally { conn.release(); }
        res.json({ success: true, message: `Inquilino ${cnpj} e todos os seus registros foram removidos com sucesso.` });
    } catch (error) {
        res.status(500).json({ success: false, error: safeError(error) });
    }
});

// PATCH /api/admin/empresas/:cnpj/modulos
router.patch('/empresas/:cnpj/modulos', autenticarToken, autenticarMaster, async (req, res) => {
    try {
        const cnpj = req.params.cnpj.replace(/\D/g, '').padStart(14, '0');
        const { word, ia_gemini } = req.body;

        const empresa = await dbGet('SELECT cnpj, modulos_ativos FROM empresas_contratantes WHERE cnpj = ?', [cnpj]);
        if (!empresa) return res.status(404).json({ success: false, error: 'Empresa não encontrada.' });

        let modulosAtuais = { ...MODULOS_DEFAULT };
        if (empresa.modulos_ativos) { try { modulosAtuais = JSON.parse(empresa.modulos_ativos); } catch(e){} }

        const novosMudulos = {
            ...modulosAtuais,
            ...(word      !== undefined && { word }),
            ...(ia_gemini !== undefined && { ia_gemini }),
        };

        await dbRun('UPDATE empresas_contratantes SET modulos_ativos = ? WHERE cnpj = ?', [JSON.stringify(novosMudulos), cnpj]);
        res.json({ success: true, modulos: novosMudulos });
    } catch (error) {
        res.status(500).json({ success: false, error: safeError(error) });
    }
});

module.exports = router;
