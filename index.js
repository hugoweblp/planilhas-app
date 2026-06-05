require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express      = require('express');
const cors         = require('cors');
const path         = require('path');
const helmet       = require('helmet');
const compression  = require('compression');
const cookieParser = require('cookie-parser');

const { apiLimiter, authLimiter } = require('./src/middleware/limiters');
const { inicializarBanco, agendarLimpezaAutomatica } = require('./src/database/db');
const { migrarCpfParaCriptografado } = require('./src/utils/helpers');

// =============================================================================
// VALIDAÇÃO DE BOOT — servidor aborta se segredos críticos estiverem ausentes
// =============================================================================
const _missingEnv = ['JWT_SECRET', 'ADMIN_EMAIL', 'ENCRYPTION_KEY', 'DB_HOST', 'DB_USER', 'DB_NAME']
    .filter(k => !process.env[k])
    .concat(process.env.DB_PASSWORD === undefined && process.env.DB_PASS === undefined ? ['DB_PASSWORD'] : []);
if (_missingEnv.length) {
    console.error(`❌ FATAL: Variáveis de ambiente ausentes: [${_missingEnv.join(', ')}]. Configure o .env antes de iniciar.`);
    process.exit(1);
}
const _warnEnv = ['GOOGLE_CLIENT_ID', 'SMTP_USER', 'SMTP_PASS', 'MASTER_KEY'].filter(k => !process.env[k]);
if (_warnEnv.length) console.warn(`⚠️  AVISO: Variáveis opcionais não configuradas: [${_warnEnv.join(', ')}].`);

// =============================================================================
// APP SETUP
// =============================================================================
const app  = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc:    ["'self'"],
            scriptSrc:     ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net", "unpkg.com", "code.jquery.com", "accounts.google.com"],
            styleSrc:      ["'self'", "'unsafe-inline'", "fonts.googleapis.com", "cdn.jsdelivr.net", "accounts.google.com"],
            fontSrc:       ["'self'", "fonts.gstatic.com", "cdn.jsdelivr.net", "data:"],
            imgSrc:        ["'self'", "data:", "blob:", "lh3.googleusercontent.com"],
            connectSrc:    ["'self'", "accounts.google.com", "cdn.jsdelivr.net", "unpkg.com"],
            frameSrc:      ["accounts.google.com"],
            objectSrc:     ["'none'"]
        }
    },
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" }
}));

app.use(compression());

const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['http://localhost:3000', 'http://localhost'];
app.use(cors({ origin: allowedOrigins, credentials: true }));

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// Rate limiting global — /api/auth/config é pública e não precisa de authLimiter
app.use('/api/', apiLimiter);

// Frontend estático
app.use(express.static(path.join(__dirname, 'frontend')));
app.get('/', (_req, res) => res.redirect('/login.html'));

// =============================================================================
// ROUTERS
// =============================================================================
app.use('/api/auth',     require('./src/routes/auth'));
app.use('/api/internal', require('./src/routes/internal'));
app.use('/api/empresa',  require('./src/routes/empresa'));
app.use('/api/schools',  require('./src/routes/schools'));
app.use('/api',          require('./src/routes/data'));
app.use('/api',          require('./src/routes/process'));
app.use('/api',          require('./src/routes/notas'));
app.use('/api',          require('./src/routes/downloads'));
app.use('/api/admin',    require('./src/routes/admin'));
app.use('/output',       require('./src/routes/files'));

// =============================================================================
// GLOBAL ERROR HANDLER
// =============================================================================
app.use((err, _req, res, _next) => {
    console.error('\n🔥 [ERRO] Capturado pelo handler global:', err.message);
    const isDev = process.env.NODE_ENV !== 'production';
    res.status(err.status || 500).json({
        success: false,
        error: isDev ? err.message : 'Ocorreu uma falha no processamento.'
    });
});

// =============================================================================
// PROCESS HANDLERS
// =============================================================================
process.on('uncaughtException',  (err)    => { console.error('💀 [FATAL] uncaughtException:', err.message, err.stack); process.exit(1); });
process.on('unhandledRejection', (reason) => { console.error('💀 [FATAL] unhandledRejection:', reason); process.exit(1); });

// =============================================================================
// START — banco inicializado ANTES do servidor aceitar conexões
// =============================================================================
(async () => {
    await inicializarBanco();
    agendarLimpezaAutomatica();
    await migrarCpfParaCriptografado();
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`
🚀 SERVIDOR V2 - DIAGNÓSTICO ONLINE: http://localhost:${PORT}
✅ Banco de Dados: Sincronizado com a Nuvem (Hostinger)
📁 Pasta de Saída: /output pronta para downloads
        `);
    });
})();
