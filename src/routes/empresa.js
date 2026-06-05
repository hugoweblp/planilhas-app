const express = require('express');
const router  = express.Router();

const { db, dbGet, dbAll, dbRun } = require('../database/db');
const { autenticarToken } = require('../middleware/auth');
const { safeError, registrarAuditoria } = require('../utils/helpers');

// GET /api/empresa/me
router.get('/me', autenticarToken, async (req, res) => {
    try {
        const { empresa_cnpj } = req.user;
        if (!empresa_cnpj)
            return res.status(400).json({ success: false, error: 'Usuário não vinculado a nenhuma empresa.' });

        const empresa = await dbGet(
            'SELECT cnpj, razao_social, plano_vagas, vagas_ocupadas, status_assinatura, validade_assinatura, email_gestor FROM empresas_contratantes WHERE cnpj = ?',
            [empresa_cnpj]
        );
        if (!empresa) return res.status(404).json({ success: false, error: 'Empresa não encontrada.' });

        const { count: vagasReais } = await dbGet(
            "SELECT COUNT(*) as count FROM usuarios WHERE empresa_cnpj = ? AND (nivel != 'master' OR nivel IS NULL)",
            [empresa_cnpj]
        );

        let diasRestantes = null;
        let statusValidade = 'sem_vencimento';
        if (empresa.validade_assinatura) {
            const hoje    = new Date(); hoje.setHours(0, 0, 0, 0);
            const validade = new Date(empresa.validade_assinatura); validade.setHours(0, 0, 0, 0);
            diasRestantes = Math.ceil((validade - hoje) / (1000 * 60 * 60 * 24));
            if (diasRestantes < 0)       statusValidade = 'expirado';
            else if (diasRestantes <= 7)  statusValidade = 'critico';
            else if (diasRestantes <= 30) statusValidade = 'atencao';
            else                          statusValidade = 'ok';
        }

        res.json({
            success: true,
            empresa: {
                ...empresa,
                vagas_ocupadas:    vagasReais,
                vagas_disponiveis: empresa.plano_vagas - vagasReais,
                dias_restantes:    diasRestantes,
                status_validade:   statusValidade
            }
        });
    } catch (error) {
        console.error('❌ [Empresa/Me] Erro:', error.message);
        res.status(500).json({ success: false, error: 'Erro ao buscar dados da empresa.' });
    }
});

// GET /api/empresa/equipe
router.get('/equipe', autenticarToken, async (req, res) => {
    try {
        const { empresa_cnpj, nivel } = req.user;
        if (nivel !== 'gestor' && nivel !== 'admin' && nivel !== 'super_admin')
            return res.status(403).json({ success: false, error: 'Apenas o Gestor Master pode gerenciar a equipe.' });

        const operadores = await dbAll(
            `SELECT id, nome, email, nivel, permissoes, criado_em
             FROM usuarios WHERE empresa_cnpj = ?
             ORDER BY CASE nivel WHEN 'admin' THEN 1 WHEN 'gestor' THEN 2 ELSE 3 END, nome ASC`,
            [nivel === 'admin' ? req.user.empresa_cnpj : empresa_cnpj]
        );

        const equipeFormatada = operadores.map(op => {
            let perms = { live_excel: true, historico: true };
            if (op.permissoes) { try { perms = JSON.parse(op.permissoes); } catch(e){} }
            return { ...op, permissoes: perms };
        });

        res.json({ success: true, equipe: equipeFormatada, total: equipeFormatada.length });
    } catch (error) {
        console.error('❌ [Empresa/Equipe] Erro:', error.message);
        res.status(500).json({ success: false, error: 'Erro ao listar equipe.' });
    }
});

// PATCH /api/empresa/equipe/:id/permissoes
router.patch('/equipe/:id/permissoes', autenticarToken, async (req, res) => {
    try {
        const { empresa_cnpj, nivel, id: meuId } = req.user;
        const operadorId = parseInt(req.params.id);

        if (nivel !== 'gestor' && nivel !== 'admin' && nivel !== 'super_admin')
            return res.status(403).json({ success: false, error: 'Apenas o Gestor Master pode alterar permissões.' });
        if (operadorId === meuId)
            return res.status(400).json({ success: false, error: 'Você não pode alterar suas próprias permissões.' });

        const alvo = await dbGet('SELECT id, nome, nivel, empresa_cnpj FROM usuarios WHERE id = ?', [operadorId]);
        if (!alvo) return res.status(404).json({ success: false, error: 'Operador não encontrado.' });
        if (nivel !== 'admin' && alvo.empresa_cnpj !== empresa_cnpj)
            return res.status(403).json({ success: false, error: 'Acesso negado: operador não pertence à sua empresa.' });
        if (alvo.nivel === 'gestor' || alvo.nivel === 'admin')
            return res.status(400).json({ success: false, error: 'Não é possível alterar permissões de um Gestor ou Administrador.' });

        let permsAtuais = { live_excel: true, historico: true };
        const usuarioAtual = await dbGet('SELECT permissoes FROM usuarios WHERE id = ?', [operadorId]);
        try { permsAtuais = JSON.parse(usuarioAtual.permissoes); } catch(e){}

        const { live_excel, historico } = req.body;
        const novasPerms = { ...permsAtuais };
        if (live_excel !== undefined) novasPerms.live_excel = !!live_excel;
        if (historico  !== undefined) novasPerms.historico  = !!historico;
        await dbRun('UPDATE usuarios SET permissoes = ? WHERE id = ?', [JSON.stringify(novasPerms), operadorId]);
        await registrarAuditoria(req, 'PERMISSAO_ALTERADA', `Permissões de "${alvo.nome}" (ID ${operadorId}) atualizadas: ${JSON.stringify(novasPerms)}`);
        res.json({ success: true, message: `Permissões de ${alvo.nome} atualizadas.`, permissoes: novasPerms });
    } catch (error) {
        console.error('❌ [Empresa/Permissões] Erro:', error.message);
        res.status(500).json({ success: false, error: 'Erro ao atualizar permissões.' });
    }
});

// DELETE /api/empresa/equipe/:id
router.delete('/equipe/:id', autenticarToken, async (req, res) => {
    try {
        const { empresa_cnpj, nivel, id: meuId } = req.user;
        const operadorId = parseInt(req.params.id);

        if (nivel !== 'gestor' && nivel !== 'admin')
            return res.status(403).json({ success: false, error: 'Apenas o Gestor Master pode remover operadores.' });
        if (operadorId === meuId)
            return res.status(400).json({ success: false, error: 'Você não pode remover a si mesmo da equipe.' });

        const alvo = await dbGet('SELECT id, nome, nivel, empresa_cnpj FROM usuarios WHERE id = ?', [operadorId]);
        if (!alvo) return res.status(404).json({ success: false, error: 'Operador não encontrado.' });
        if (nivel !== 'admin' && alvo.empresa_cnpj !== empresa_cnpj)
            return res.status(403).json({ success: false, error: 'Acesso negado: operador não pertence à sua empresa.' });
        if (alvo.nivel === 'gestor' || alvo.nivel === 'admin')
            return res.status(400).json({ success: false, error: 'Não é possível remover um Gestor Master ou Administrador.' });

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            await conn.execute('DELETE FROM usuarios WHERE id = ?', [operadorId]);
            if (alvo.empresa_cnpj)
                await conn.execute('UPDATE empresas_contratantes SET vagas_ocupadas = GREATEST(vagas_ocupadas - 1, 0) WHERE cnpj = ?', [alvo.empresa_cnpj]);
            await conn.commit();
        } catch (txErr) { try { await conn.rollback(); } catch (_) {} throw txErr; }
        finally { conn.release(); }

        await registrarAuditoria(req, 'USUARIO_REMOVIDO', `Operador "${alvo.nome}" (ID ${operadorId}, ${alvo.nivel}) removido da equipe`);
        res.json({ success: true, message: `Operador ${alvo.nome} removido com sucesso. Vaga liberada.` });
    } catch (error) {
        console.error('❌ [Empresa/Remove] Erro:', error.message);
        res.status(500).json({ success: false, error: safeError(error) });
    }
});

module.exports = router;
