const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { dbRun, dbGet } = require('../database/db');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'chave-secreta-padrao-pdde-premium';

/**
 * Registra um novo usuário no sistema
 */
async function registrarUsuario(usuario, senha, nome, nivel = 'operador') {
    const hash = await bcrypt.hash(senha, 10);
    try {
        await dbRun(
            'INSERT INTO usuarios (usuario, senha, nome, nivel) VALUES (?, ?, ?, ?)',
            [usuario, hash, nome, nivel]
        );
        return { success: true, message: 'Usuário registrado com sucesso.' };
    } catch (error) {
        if (error.message.includes('UNIQUE')) {
            throw new Error('Este nome de usuário já está sendo usado.');
        }
        throw error;
    }
}

/**
 * Valida as credenciais e gera um token JWT
 */
async function autenticarUsuario(usuario, senha) {
    const user = await dbGet('SELECT * FROM usuarios WHERE usuario = ?', [usuario]);
    
    if (!user) {
        throw new Error('Usuário ou senha incorretos.');
    }

    const senhaValida = await bcrypt.compare(senha, user.senha);
    if (!senhaValida) {
        throw new Error('Usuário ou senha incorretos.');
    }

    // Gera o token de acesso (Válido por 24 horas)
    const token = jwt.sign(
        { id: user.id, usuario: user.usuario, nivel: user.nivel },
        JWT_SECRET,
        { expiresIn: '24h' }
    );

    return {
        success: true,
        token,
        user: {
            id: user.id,
            nome: user.nome,
            usuario: user.usuario,
            nivel: user.nivel
        }
    };
}

module.exports = { registrarUsuario, autenticarUsuario };
