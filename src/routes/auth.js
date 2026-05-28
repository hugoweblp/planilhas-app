const express  = require('express');
const crypto   = require('crypto');
const jwt      = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');

const router = express.Router();
const googleOAuth2Client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const { db, dbGet, dbRun } = require('../database/db');
const { NIVEIS, NIVEIS_MASTER } = require('../constants/niveis');
const { registrarUsuario, autenticarUsuario } = require('../services/authService');
const { enviarCodigoAcesso } = require('../services/mailService');
const { checkAssinatura, safeError } = require('../utils/helpers');
const { autenticarToken, autenticarMaster } = require('../middleware/auth');
const { JWT_SECRET, ADMIN_EMAIL, cookieOptions } = require('../config/app');

// GET /api/auth/config — config pública para o frontend (nunca expõe segredos)
router.get('/config', (_req, res) => {
    res.json({ google_client_id: process.env.GOOGLE_CLIENT_ID || null });
});

// POST /api/auth/register
router.post('/register', autenticarToken, autenticarMaster, async (req, res) => {
    try {
        const { usuario, senha, nome, nivel } = req.body;
        const result = await registrarUsuario(usuario, senha, nome, nivel);
        res.json(result);
    } catch (error) {
        res.status(400).json({ success: false, error: safeError(error) });
    }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { usuario, senha } = req.body;
        const result = await autenticarUsuario(usuario, senha);
        const { token, ...safeResult } = result;
        if (token) res.cookie('access_token', token, cookieOptions);
        res.json(safeResult);
    } catch (error) {
        console.error('❌ Erro no Login:', error.message);
        res.status(401).json({ success: false, error: 'Usuário ou senha incorretos.' });
    }
});

// POST /api/auth/validar-cnpj
router.post('/validar-cnpj', async (req, res) => {
    try {
        const { cnpj } = req.body;
        if (!cnpj) return res.status(400).json({ success: false, error: 'CNPJ ausente na requisição.' });
        const cleanCnpj = String(cnpj).replace(/\D/g, '').padStart(14, '0');

        const ERRO_GENERICO = 'Empresa não disponível ou limite de vagas atingido.';

        const assinaturaCheck = await checkAssinatura(cleanCnpj);
        if (!assinaturaCheck.ok)
            return res.status(403).json({ success: false, error: ERRO_GENERICO });

        const empresa = await dbGet('SELECT * FROM empresas_contratantes WHERE cnpj = ?', [cleanCnpj]);
        if (!empresa)
            return res.status(404).json({ success: false, error: ERRO_GENERICO });

        const vagas = await dbGet('SELECT COUNT(*) as count FROM usuarios WHERE empresa_cnpj = ?', [cleanCnpj]);
        if (vagas.count >= empresa.plano_vagas)
            return res.status(403).json({ success: false, error: ERRO_GENERICO });

        res.json({ success: true });
    } catch (error) {
        console.error('🛡️ [Segurança] Erro no Gatekeeper:', error.message);
        res.status(500).json({ success: false, error: 'Erro interno na validação de segurança.' });
    }
});

// POST /api/auth/google
router.post('/google', async (req, res) => {
    try {
        const { credential, isCadastro, cnpj, nome } = req.body;
        if (!credential) return res.status(400).json({ success: false, error: 'Credencial corporativa ausente.' });
        if (!process.env.GOOGLE_CLIENT_ID)
            return res.status(503).json({ success: false, error: 'Login Google não configurado neste servidor.' });

        const ticket = await googleOAuth2Client.verifyIdToken({
            idToken: credential,
            audience: process.env.GOOGLE_CLIENT_ID
        });
        const googleUser = ticket.getPayload();
        if (!googleUser?.email)
            return res.status(400).json({ success: false, error: 'Falha ao extrair e-mail de atestado do Google.' });

        const userEmail = googleUser.email;
        let usuarioDb = await dbGet('SELECT * FROM usuarios WHERE email = ?', [userEmail]);

        if (!usuarioDb) {
            const vinculoMaster = await dbGet(
                'SELECT * FROM empresas_contratantes WHERE email_gestor = ? AND status_assinatura = ?',
                [userEmail.toLowerCase(), 'ativo']
            );
            let cnpjTrabalho = vinculoMaster ? vinculoMaster.cnpj : cnpj;
            let nivel = NIVEIS.OPERADOR;
            if (userEmail.toLowerCase() === ADMIN_EMAIL) nivel = NIVEIS.ADMIN;
            else if (vinculoMaster)                       nivel = NIVEIS.GESTOR;

            if (!cnpjTrabalho && nivel !== 'admin') {
                return res.status(403).json({ success: false, requiresCadastro: true, error: 'Vínculo não identificado. Informe o CNPJ da sua instituição.' });
            }

            const userName = nome || googleUser.name || 'Operador Kitfy';

            if (nivel === 'admin' && !cnpjTrabalho) {
                const defaultPerms = JSON.stringify({ live_excel: true, historico: true });
                await dbRun(
                    'INSERT INTO usuarios (nome, email, empresa_cnpj, nivel, permissoes) VALUES (?, ?, ?, ?, ?)',
                    [userName, userEmail, null, nivel, defaultPerms]
                );
            } else {
                const cleanCnpj = String(cnpjTrabalho).replace(/\D/g, '').padStart(14, '0');
                const conn = await db.getConnection();
                try {
                    await conn.beginTransaction();
                    const [[empresa]] = await conn.execute(
                        'SELECT * FROM empresas_contratantes WHERE cnpj = ? AND status_assinatura = ? FOR UPDATE',
                        [cleanCnpj, 'ativo']
                    );
                    if (!empresa) { await conn.rollback(); return res.status(404).json({ success: false, error: 'Instituição inativa ou não cadastrada.' }); }
                    const [[{ count }]] = await conn.execute('SELECT COUNT(*) as count FROM usuarios WHERE empresa_cnpj = ?', [cleanCnpj]);
                    if (count >= empresa.plano_vagas) { await conn.rollback(); return res.status(403).json({ success: false, error: 'Limite de vagas esgotado.' }); }
                    if (count === 0 && empresa.email_gestor && userEmail.toLowerCase() !== empresa.email_gestor.toLowerCase()) {
                        await conn.rollback();
                        return res.status(403).json({ success: false, error: 'Acesso bloqueado. O primeiro login deve ser realizado pelo E-mail Master.' });
                    }
                    if (count === 0) nivel = NIVEIS.GESTOR;
                    const defaultPerms = JSON.stringify({ live_excel: true, historico: true });
                    await conn.execute('INSERT INTO usuarios (nome, email, empresa_cnpj, nivel, permissoes) VALUES (?, ?, ?, ?, ?)', [userName, userEmail, cleanCnpj, nivel, defaultPerms]);
                    await conn.execute('UPDATE empresas_contratantes SET vagas_ocupadas = vagas_ocupadas + 1 WHERE cnpj = ?', [cleanCnpj]);
                    await conn.commit();
                } catch (txErr) { try { await conn.rollback(); } catch (_) {} throw txErr; }
                finally { conn.release(); }
            }
            usuarioDb = await dbGet('SELECT * FROM usuarios WHERE email = ?', [userEmail]);
        } else {
            if (usuarioDb.empresa_cnpj && !NIVEIS_MASTER.includes(usuarioDb.nivel)) {
                const check = await checkAssinatura(usuarioDb.empresa_cnpj);
                if (!check.ok) return res.status(403).json({ success: false, error: check.motivo });
            }
        }

        const token = jwt.sign(
            { id: usuarioDb.id, usuario: usuarioDb.usuario, email: usuarioDb.email || '', empresa_cnpj: usuarioDb.empresa_cnpj, nivel: usuarioDb.nivel },
            JWT_SECRET,
            { expiresIn: '12h' }
        );
        res.cookie('access_token', token, cookieOptions);
        res.json({ success: true, user: { nome: usuarioDb.nome, email: usuarioDb.email, empresa_cnpj: usuarioDb.empresa_cnpj, nivel: usuarioDb.nivel } });

    } catch (error) {
        console.error('🛡️ [Segurança] Erro no GSI:', error.message);
        res.status(500).json({ success: false, error: process.env.NODE_ENV !== 'production' ? `[DEV] ${error.message}` : 'Falha na validação corporativa.' });
    }
});

// POST /api/auth/request-code
router.post('/request-code', async (req, res) => {
    try {
        const { email, cnpj } = req.body;
        if (!email || !cnpj) return res.status(400).json({ success: false, error: 'E-mail e CNPJ são obrigatórios.' });
        const cleanCnpj = String(cnpj).replace(/\D/g, '').padStart(14, '0');

        const assinaturaCheck = await checkAssinatura(cleanCnpj);
        if (!assinaturaCheck.ok) return res.status(403).json({ success: false, error: assinaturaCheck.motivo });

        const recentCodes = await dbGet(
            'SELECT COUNT(*) as count FROM auth_codes WHERE email = ? AND criado_em > DATE_SUB(NOW(), INTERVAL 15 MINUTE)',
            [email]
        );
        if (recentCodes?.count >= 3)
            return res.status(429).json({ success: false, error: 'Muitas tentativas. Aguarde 15 minutos para solicitar um novo código.' });

        const codigo      = crypto.randomInt(100000, 1000000).toString();
        const codigoHash  = crypto.createHash('sha256').update(codigo + email.toLowerCase()).digest('hex');
        const expiresAt   = new Date(Date.now() + 5 * 60000).toISOString().slice(0, 19).replace('T', ' ');
        await dbRun('INSERT INTO auth_codes (email, cnpj, code, expires_at) VALUES (?, ?, ?, ?)', [email, cleanCnpj, codigoHash, expiresAt]);
        await enviarCodigoAcesso(email, codigo);
        res.json({ success: true, message: 'Código de acesso enviado com sucesso.' });
    } catch (error) {
        console.error('Erro ao gerar código OTP:', error.message);
        res.status(500).json({ success: false, error: 'Falha ao solicitar código de acesso.' });
    }
});

// POST /api/auth/verify-code
router.post('/verify-code', async (req, res) => {
    try {
        const { email, cnpj, code, nome } = req.body;
        if (!email || !cnpj || !code) return res.status(400).json({ success: false, error: 'Dados incompletos para validação.' });
        const cleanCnpj = String(cnpj).replace(/\D/g, '').padStart(14, '0');

        // Limpeza inline de OTPs expirados — sem dependência de cron externo
        await dbRun('DELETE FROM auth_codes WHERE expires_at < NOW()').catch(() => {});

        const authRecord = await dbGet(
            'SELECT * FROM auth_codes WHERE email = ? AND cnpj = ? AND expires_at > NOW() ORDER BY id DESC LIMIT 1',
            [email, cleanCnpj]
        );
        if (!authRecord)
            return res.status(401).json({ success: false, error: 'Código inválido ou expirado. Solicite um novo acesso.' });

        // Verifica código — hash SHA-256 antes de comparar (OTP nunca em plaintext no banco)
        const inputHash  = crypto.createHash('sha256').update(String(code) + email.toLowerCase()).digest('hex');
        const inputBuf   = Buffer.from(inputHash);
        const storedBuf  = Buffer.from(authRecord.code);
        const codeValido = inputBuf.length === storedBuf.length && crypto.timingSafeEqual(inputBuf, storedBuf);

        if (!codeValido) {
            const novasTentativas = (authRecord.tentativas || 0) + 1;
            if (novasTentativas >= 3) {
                await dbRun('DELETE FROM auth_codes WHERE id = ?', [authRecord.id]);
                return res.status(401).json({ success: false, error: 'Código bloqueado após 3 tentativas. Solicite um novo acesso.' });
            }
            await dbRun('UPDATE auth_codes SET tentativas = ? WHERE id = ?', [novasTentativas, authRecord.id]);
            return res.status(401).json({ success: false, error: 'Código inválido.' });
        }

        let usuarioDb = await dbGet('SELECT * FROM usuarios WHERE email = ?', [email]);
        if (!usuarioDb) {
            const userName = nome || 'Operador Universal';
            let nivel = email.toLowerCase() === ADMIN_EMAIL ? NIVEIS.ADMIN : NIVEIS.OPERADOR;
            const conn = await db.getConnection();
            try {
                await conn.beginTransaction();
                const [[empresa]] = await conn.execute(
                    'SELECT * FROM empresas_contratantes WHERE cnpj = ? AND status_assinatura = ? FOR UPDATE',
                    [cleanCnpj, 'ativo']
                );
                if (!empresa) { await conn.rollback(); return res.status(404).json({ success: false, error: 'Empresa inativa.' }); }
                const [[{ count }]] = await conn.execute('SELECT COUNT(*) as count FROM usuarios WHERE empresa_cnpj = ?', [cleanCnpj]);
                if (count >= empresa.plano_vagas) { await conn.rollback(); return res.status(403).json({ success: false, error: 'Limite de vagas esgotado.' }); }
                if (count === 0 && empresa.email_gestor && email.toLowerCase() !== empresa.email_gestor.toLowerCase()) {
                    await conn.rollback();
                    return res.status(403).json({ success: false, error: 'Acesso bloqueado. O primeiro login deve ser realizado pelo E-mail Master.' });
                }
                if (count === 0) nivel = NIVEIS.GESTOR;
                const defaultPerms = JSON.stringify({ live_excel: true, historico: true });
                await conn.execute('INSERT INTO usuarios (nome, email, empresa_cnpj, nivel, permissoes) VALUES (?, ?, ?, ?, ?)', [userName, email, cleanCnpj, nivel, defaultPerms]);
                await conn.execute('UPDATE empresas_contratantes SET vagas_ocupadas = vagas_ocupadas + 1 WHERE cnpj = ?', [cleanCnpj]);
                await conn.commit();
            } catch (txErr) { try { await conn.rollback(); } catch (_) {} throw txErr; }
            finally { conn.release(); }
            usuarioDb = await dbGet('SELECT * FROM usuarios WHERE email = ?', [email]);
        } else {
            if (usuarioDb.empresa_cnpj && !NIVEIS_MASTER.includes(usuarioDb.nivel)) {
                const check = await checkAssinatura(usuarioDb.empresa_cnpj);
                if (!check.ok) return res.status(403).json({ success: false, error: check.motivo });
            }
        }

        await dbRun('DELETE FROM auth_codes WHERE id = ?', [authRecord.id]);
        const token = jwt.sign(
            { id: usuarioDb.id, email: usuarioDb.email, empresa_cnpj: usuarioDb.empresa_cnpj, nivel: usuarioDb.nivel },
            JWT_SECRET,
            { expiresIn: '12h' }
        );
        res.cookie('access_token', token, cookieOptions);
        res.json({ success: true, user: { nome: usuarioDb.nome, email: usuarioDb.email, empresa_cnpj: usuarioDb.empresa_cnpj, nivel: usuarioDb.nivel } });
    } catch (error) {
        console.error('Erro na Validação OTP:', error.message);
        res.status(500).json({ success: false, error: 'Falha na validação do código.' });
    }
});

// POST /api/auth/logout
router.post('/logout', (_req, res) => {
    const { maxAge: _, ...clearOpts } = cookieOptions;
    res.clearCookie('access_token', clearOpts);
    res.json({ success: true });
});

module.exports = router;
