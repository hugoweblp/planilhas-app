module.exports = {
    get JWT_SECRET()  { return process.env.JWT_SECRET; },
    get ADMIN_EMAIL() { return process.env.ADMIN_EMAIL?.toLowerCase(); },

    cookieOptions: {
        httpOnly: true,
        secure:   process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge:   12 * 60 * 60 * 1000
    },

    MODULOS_DEFAULT: Object.freeze({ word: true, ia_gemini: true })
};
