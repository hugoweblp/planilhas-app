const jwt  = require('jsonwebtoken');
const { dbGet } = require('../database/db');
const { NIVEIS_MASTER } = require('../constants/niveis');
const { checkAssinatura } = require('../utils/helpers');
const appConfig = require('../config/app');
const { MODULOS_DEFAULT } = appConfig;

function autenticarToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = (authHeader && authHeader.split(' ')[1]) || req.cookies?.access_token;
    if (!token) return res.status(401).json({ error: 'Acesso negado. Faça login.' });

    jwt.verify(token, appConfig.JWT_SECRET, async (err, user) => {
        if (err) return res.status(403).json({ error: 'Sessão expirada.' });
        try {
            const uDb = await dbGet('SELECT permissoes FROM usuarios WHERE id = ?', [user.id]);
            let perms = { live_excel: true, historico: true };
            if (uDb?.permissoes) { try { perms = JSON.parse(uDb.permissoes); } catch(e){} }
            req.user = { ...user, permissoesObj: perms };

            if (user.empresa_cnpj && !NIVEIS_MASTER.includes(user.nivel)) {
                const check = await checkAssinatura(user.empresa_cnpj);
                if (!check.ok) {
                    return res.status(403).json({ success: false, error: check.motivo, assinaturaExpirada: true });
                }
            }
            next();
        } catch (dbErr) {
            console.error('[auth] Falha ao consultar banco durante autenticação:', dbErr.message);
            return res.status(503).json({ success: false, error: 'Serviço temporariamente indisponível. Tente novamente.' });
        }
    });
}

function autenticarMaster(req, res, next) {
    if (!NIVEIS_MASTER.includes(req.user.nivel))
        return res.status(403).json({ success: false, error: 'Acesso Negado: Área de Gestão Restrita.' });
    next();
}

const verificarPermissao = (tipo) => (req, res, next) => {
    const { nivel } = req.user;
    if (NIVEIS_MASTER.includes(nivel)) return next();
    const perms = req.user.permissoesObj;
    if (perms?.[tipo] === true) return next();
    const msg = tipo === 'live_excel'
        ? 'Sua licença para Gerar Planilhas (Live Excel) foi revogada pelo gestor da unidade.'
        : 'Seu acesso ao Histórico de Processamentos foi revogado pelo gestor da unidade.';
    return res.status(403).json({ success: false, error: msg });
};

const verificarModulo = (modulo) => async (req, res, next) => {
    if (NIVEIS_MASTER.includes(req.user.nivel)) return next();
    try {
        const empresa = await dbGet(
            'SELECT modulos_ativos FROM empresas_contratantes WHERE cnpj = ?',
            [req.user.empresa_cnpj]
        );
        let modulos = { ...MODULOS_DEFAULT };
        if (empresa?.modulos_ativos) { try { modulos = JSON.parse(empresa.modulos_ativos); } catch(e){} }
        if (modulos[modulo] === false) {
            const nomes = { word: 'Geração de Recibo Word', ia_gemini: 'Humanização por IA (Gemini)' };
            return res.status(403).json({
                success: false,
                error: `O módulo "${nomes[modulo] || modulo}" não está ativo no seu plano. Contate o suporte Kitfy.`
            });
        }
        next();
    } catch {
        res.status(500).json({ success: false, error: 'Erro ao verificar módulos do plano.' });
    }
};

module.exports = { autenticarToken, autenticarMaster, verificarPermissao, verificarModulo };
