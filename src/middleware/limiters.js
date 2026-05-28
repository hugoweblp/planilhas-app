const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Muitas requisições. Tente novamente em 15 minutos.' }
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Muitas tentativas de acesso. Aguarde 15 minutos.' }
});

module.exports = { apiLimiter, authLimiter };
