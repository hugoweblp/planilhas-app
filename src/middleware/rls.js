/**
 * RLS — Row Level Security Centralizado
 *
 * Injeta req.rls após autenticarToken para eliminar o padrão repetido em 12+ rotas:
 *   const isAdmin = NIVEIS_MASTER.includes(req.user.nivel);
 *   const empresaCnpj = req.user.empresa_cnpj;
 *   isAdmin ? 'WHERE x = ?' : 'WHERE x = ? AND campo = ?'
 *   isAdmin ? [id] : [id, empresaCnpj]
 *
 * Uso:
 *   router.get('/rota', autenticarToken, rlsMiddleware, async (req, res) => {
 *       const nota = await dbGet(
 *           `SELECT * FROM notas WHERE chave = ? ${req.rls.clause('cnpj_vendedor')}`,
 *           [id, ...req.rls.param()]
 *       );
 *   });
 */
const { NIVEIS_MASTER } = require('../constants/niveis');

function rlsMiddleware(req, res, next) {
    const isAdmin    = NIVEIS_MASTER.includes(req.user.nivel);
    const empresaCnpj = req.user.empresa_cnpj;

    req.rls = {
        isAdmin,
        empresaCnpj,

        // Retorna "AND campo = ?" ou "" (para admin)
        clause(campo = 'cnpj_vendedor') {
            return isAdmin ? '' : `AND ${campo} = ?`;
        },

        // Retorna [empresaCnpj] ou [] (para admin)
        param() {
            return isAdmin ? [] : [empresaCnpj];
        },

        // Retorna "WHERE campo = ?" ou "" (para admin) — quando não há outras condições
        where(campo = 'cnpj_vendedor') {
            return isAdmin ? '' : `WHERE ${campo} = ?`;
        }
    };

    next();
}

module.exports = { rlsMiddleware };
