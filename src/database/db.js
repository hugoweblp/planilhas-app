const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

/**
 * CONFIGURAÇÃO DO BANCO DE DADOS MYSQL (HOSTINGER)
 */
const db = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

console.log('✅ Conectado ao pool de conexões MySQL da Hostinger.');

/**
 * Inicializa as tabelas do sistema na nuvem
 */
async function inicializarBanco() {
    const queries = [
        // 1. Tabela de Escolas
        `CREATE TABLE IF NOT EXISTS escolas (
            cnpj VARCHAR(20) PRIMARY KEY,
            razao_social TEXT,
            nome_fantasia TEXT,
            logradouro TEXT,
            numero TEXT,
            bairro TEXT,
            municipio TEXT,
            uf TEXT,
            cep TEXT,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,

        // 2. Tabela de Notas (Com trava de duplicatas por Número + Série + Escola)
        `CREATE TABLE IF NOT EXISTS notas (
            chave VARCHAR(60) PRIMARY KEY,
            numero VARCHAR(20),
            serie VARCHAR(10),
            data_emissao TEXT,
            valor_total DOUBLE,
            cnpj_vendedor VARCHAR(20),
            cnpj_escola VARCHAR(20),
            status VARCHAR(20) DEFAULT 'PENDENTE',
            arquivo_excel TEXT,
            arquivo_word TEXT,
            signature_token TEXT,
            recebedor_nome TEXT,
            recebedor_cpf TEXT,
            recebedor_whatsapp TEXT,
            assinatura_path TEXT,
            gerado_qtd INT DEFAULT 1,
            impresso_qtd INT DEFAULT 0,
            entregue_qtd INT DEFAULT 0,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
            assinada_em DATETIME NULL,
            UNIQUE KEY uk_nota_completa (numero, serie, cnpj_vendedor, cnpj_escola)
        )`,

        // 3. Tabela de Entregas (Histórico de Assinaturas)
        `CREATE TABLE IF NOT EXISTS entregas (
            id INT AUTO_INCREMENT PRIMARY KEY,
            chave_nota VARCHAR(60),
            data_entrega TEXT,
            recebido_por TEXT,
            selfie_path TEXT,
            signature_path TEXT,
            observacao TEXT
        )`,

        // 4. Tabela de Usuários
        `CREATE TABLE IF NOT EXISTS usuarios (
            id INT AUTO_INCREMENT PRIMARY KEY,
            usuario VARCHAR(50) UNIQUE,
            senha TEXT,
            nome TEXT,
            nivel VARCHAR(20) DEFAULT 'operador',
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,

        // 5. Histórico de Ações
        `CREATE TABLE IF NOT EXISTS historico_acoes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            chave_nota VARCHAR(60),
            tipo_acao VARCHAR(50),
            detalhes TEXT,
            data_hora DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_chave (chave_nota)
        )`
    ];

    try {
        for (let sql of queries) {
            await db.execute(sql);
        }

        // --- FASE 1: Otimização de Índices (Alta Performance) ---
        const indices = [
            'CREATE INDEX idx_notas_cnpj_escola ON notas (cnpj_escola)',
            'CREATE INDEX idx_notas_data_emissao ON notas (data_emissao)',
            'CREATE INDEX idx_notas_status ON notas (status)'
        ];

        for (let idxSql of indices) {
            try {
                await db.execute(idxSql);
            } catch (e) {
                // Ignora erro se o índice já existir (ER_DUP_KEYNAME)
                if (e.code !== 'ER_DUP_KEYNAME') {
                    console.log('⚠️ Info Índice:', e.message);
                }
            }
        }
        // --------------------------------------------------------

        // Verifica se precisa criar admin padrão
        const [rows] = await db.execute('SELECT count(*) as count FROM usuarios');
        if (rows[0].count === 0) {
            const { registrarUsuario } = require('../services/authService');
            await registrarUsuario('admin', 'admin123', 'Administrador', 'admin');
            console.log('👤 Usuário Admin padrão criado no MySQL: admin / admin123');
        }

        console.log('🏛️  Estrutura do MySQL pronta para uso com Índices de Alta Performance.');
    } catch (error) {
        console.error('❌ Erro na inicialização do MySQL:', error.message);
    }
}

// Helpers unificados para usar o banco com Async/Await
async function dbRun(sql, params = []) {
    // Tradução básica de sintaxe SQLite para MySQL
    let mysqlSql = sql.replace('INSERT OR REPLACE', 'REPLACE')
                      .replace('OR IGNORE', '')
                      .replace('AUTOINCREMENT', 'AUTO_INCREMENT');
                      
    const paramsWithNulls = params.map(p => p === undefined ? null : p);
    const [result] = await db.execute(mysqlSql, paramsWithNulls);
    return { changes: result.affectedRows, lastID: result.insertId };
}

async function dbGet(sql, params = []) {
    const [rows] = await db.execute(sql, params);
    return rows[0];
}

async function dbAll(sql, params = []) {
    const [rows] = await db.execute(sql, params);
    return rows;
}

module.exports = {
    db,
    inicializarBanco,
    dbRun,
    dbGet,
    dbAll
};
