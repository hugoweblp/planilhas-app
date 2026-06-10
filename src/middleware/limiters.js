const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Muitas requisições. Tente novamente em 15 minutos.' }
});

// Tentativas de login (senha, OTP, Google) — janela curta e restrita
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Muitas tentativas de acesso. Aguarde 15 minutos.' }
});

// Verificação 2FA — janela mais generosa: login(1) + request(1) + verify(1) = 3 hits por ciclo
// max 15 = ~5 ciclos completos de 2FA antes de bloquear
const twoFALimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Muitas tentativas de verificação 2FA. Aguarde 15 minutos.' }
});

// Acesso root via master key — janela de 1 hora, máx 5 falhas por IP (sucessos não contam)
const masterKeyLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Acesso bloqueado. Tente novamente em 1 hora.' }
});

module.exports = { apiLimiter, authLimiter, twoFALimiter, masterKeyLimiter };
