const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../../data/banco_de_dados.sqlite');

// Garante que a pasta data existe
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('❌ Erro ao conectar ao SQLite:', err.message);
    } else {
        console.log('✅ Conectado ao banco de dados SQLite Local.');
    }
});

/**
 * Inicializa as tabelas do sistema (A Memória do Robô)
 */
function inicializarBanco() {
    db.serialize(() => {
        // 1. Tabela de Escolas (Cadastro Único)
        db.run(`CREATE TABLE IF NOT EXISTS escolas (
            cnpj TEXT PRIMARY KEY,
            razao_social TEXT,
            nome_fantasia TEXT,
            logradouro TEXT,
            numero TEXT,
            bairro TEXT,
            municipio TEXT,
            uf TEXT,
            cep TEXT,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // 2. Tabela de Notas (Registro de Processamento)
        db.run(`CREATE TABLE IF NOT EXISTS notas (
            chave TEXT PRIMARY KEY,
            numero TEXT,
            serie TEXT,
            data_emissao TEXT,
            valor_total REAL,
            cnpj_vendedor TEXT,
            cnpj_escola TEXT,
            status TEXT DEFAULT 'PENDENTE', -- PENDENTE, ASSINADO
            arquivo_excel TEXT,
            arquivo_word TEXT,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(cnpj_escola) REFERENCES escolas(cnpj)
        )`);

        // Migração: Garante que as colunas novas existam em bancos antigos
        const colunasNovas = [
            { nome: 'arquivo_excel', tipo: 'TEXT' },
            { nome: 'arquivo_word', tipo: 'TEXT' },
            { nome: 'signature_token', tipo: 'TEXT' },
            { nome: 'recebedor_nome', tipo: 'TEXT' },
            { nome: 'recebedor_cpf', tipo: 'TEXT' },
            { nome: 'recebedor_whatsapp', tipo: 'TEXT' },
            { nome: 'assinatura_path', tipo: 'TEXT' }
        ];

        colunasNovas.forEach(col => {
            db.run(`ALTER TABLE notas ADD COLUMN ${col.nome} ${col.tipo}`, (err) => {
                // Se der erro é porque a coluna já existe, tudo certo!
            });
        });

        // 3. Tabela de Entregas (O Protocolo Digital com Selfie e Assinatura)
        db.run(`CREATE TABLE IF NOT EXISTS entregas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chave_nota TEXT,
            data_entrega TEXT,
            recebido_por TEXT,
            selfie_path TEXT,
            signature_path TEXT,
            observacao TEXT,
            FOREIGN KEY(chave_nota) REFERENCES notas(chave)
        )`);
        // 4. Tabela de Usuários (Segurança & SaaS)
        db.run(`CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario TEXT UNIQUE,
            senha TEXT,
            nome TEXT,
            nivel TEXT DEFAULT 'operador', -- admin, operador
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, () => {
            // Cria usuário admin padrão se não existir nenhum
            db.get('SELECT count(*) as count FROM usuarios', (err, row) => {
                if (!err && row && row.count === 0) {
                    const { registrarUsuario } = require('../services/authService');
                    registrarUsuario('admin', 'admin123', 'Administrador', 'admin')
                        .then(() => console.log('👤 Usuário Admin padrão criado: admin / admin123'))
                        .catch(e => console.error('❌ Erro ao criar admin padrão:', e.message));
                }
            });
        });
        
        console.log('🏛️  Estrutura do Banco de Dados pronta para uso.');
    });
}

// Helpers para usar o banco com Async/Await (mais moderno)
const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve(this);
    });
});

const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
    });
});

const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
    });
});

module.exports = {
    db,
    inicializarBanco,
    dbRun,
    dbGet,
    dbAll
};
