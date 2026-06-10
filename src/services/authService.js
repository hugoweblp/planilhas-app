const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { dbRun, dbGet } = require('../database/db');
const { NIVEIS }       = require('../constants/niveis');
const appConfig = require('../config/app'); // via getter: lê process.env.JWT_SECRET na hora de cada sign()

/**
 * Registra um novo usuário no sistema
 */
async function registrarUsuario(usuario, senha, nome, nivel = 'operador') {
    if (!Object.values(NIVEIS).includes(nivel)) {
        throw new Error(`Nível inválido: "${nivel}". Valores permitidos: ${Object.values(NIVEIS).join(', ')}`);
    }
    const hash = await bcrypt.hash(senha, 12);
    try {
        await dbRun(
            'INSERT INTO usuarios (usuario, senha, nome, nivel) VALUES (?, ?, ?, ?)',
            [usuario, hash, nome, nivel]
        );
        return { success: true, message: 'Usuário registrado com sucesso.' };
    } catch (error) {
        if (error.message.includes('UNIQUE') || error.message.includes('ER_DUP_ENTRY')) {
            throw new Error('Este nome de usuário já está sendo usado.');
        }
        throw error;
    }
}

/**
 * Valida as credenciais e gera um token JWT
 */
async function autenticarUsuario(usuario, senha) {
    const user = await dbGet(
        'SELECT id, usuario, email, nome, nivel, empresa_cnpj, senha FROM usuarios WHERE usuario = ?',
        [usuario]
    );

    if (!user) {
        throw new Error('Usuário ou senha incorretos.');
    }

    const senhaValida = await bcrypt.compare(senha, user.senha);
    if (!senhaValida) {
        throw new Error('Usuário ou senha incorretos.');
    }

    // Gera o token de acesso (Válido por 12 horas)
    const token = jwt.sign(
        { id: user.id, usuario: user.usuario, email: user.email || '', nivel: user.nivel, empresa_cnpj: user.empresa_cnpj || null },
        appConfig.JWT_SECRET,
        { expiresIn: '12h' }
    );

    return {
        success: true,
        token,
        user: {
            id: user.id,
            nome: user.nome,
            usuario: user.usuario,
            email: user.email || '',
            nivel: user.nivel
        }
    };
}

async function autenticarPorEmail(email, senha) {
    const user = await dbGet(
        'SELECT id, usuario, email, nome, nivel, empresa_cnpj, senha FROM usuarios WHERE email = ?',
        [email.toLowerCase().trim()]
    );
    if (!user) throw new Error('E-mail ou senha incorretos.');
    if (!user.senha) {
        const err = new Error('SEM_SENHA');
        err.semSenha = true;
        throw err;
    }
    const senhaValida = await bcrypt.compare(senha, user.senha);
    if (!senhaValida) throw new Error('E-mail ou senha incorretos.');

    const token = jwt.sign(
        { id: user.id, email: user.email, nivel: user.nivel, empresa_cnpj: user.empresa_cnpj, nome: user.nome },
        appConfig.JWT_SECRET,
        { expiresIn: '12h' }
    );
    return {
        success: true,
        token,
        user: { id: user.id, nome: user.nome, email: user.email, nivel: user.nivel, empresa_cnpj: user.empresa_cnpj }
    };
}

async function definirSenha(userId, senha) {
    if (!senha || senha.length < 8) throw new Error('A senha deve ter pelo menos 8 caracteres.');
    const hash = await bcrypt.hash(senha, 12);
    await dbRun('UPDATE usuarios SET senha = ? WHERE id = ?', [hash, userId]);
}

module.exports = { registrarUsuario, autenticarUsuario, autenticarPorEmail, definirSenha };
