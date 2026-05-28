const NIVEIS = Object.freeze({
    ADMIN:       'admin',
    GESTOR:      'gestor',
    OPERADOR:    'operador',
    MASTER:      'master',
    SUPER_ADMIN: 'super_admin',
});

const NIVEIS_MASTER = Object.freeze([NIVEIS.ADMIN, NIVEIS.SUPER_ADMIN, NIVEIS.MASTER]);

module.exports = { NIVEIS, NIVEIS_MASTER };
