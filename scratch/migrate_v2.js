const mysql = require('mysql2/promise');
require('dotenv').config({path: 'c:/Users/nossa/Documents/Obsidian_Vault/planilhas automatizadas/gerador-planilhas/.env'});
async function main() {
    const db = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });
    
    console.log('--- Iniciando Migração do Banco ---');
    
    const sqlTable = 'CREATE TABLE IF NOT EXISTS historico_acoes (' +
        'id INT AUTO_INCREMENT PRIMARY KEY,' +
        'chave_nota VARCHAR(60) NOT NULL,' +
        'tipo_acao VARCHAR(50) NOT NULL,' +
        'data_hora DATETIME DEFAULT CURRENT_TIMESTAMP,' +
        'detalhes TEXT,' +
        'FOREIGN KEY (chave_nota) REFERENCES notas(chave) ON DELETE CASCADE' +
        ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;';

    await db.query(sqlTable);
    console.log('? Tabela historico_acoes criada/verificada.');
    
    try {
        await db.query('CREATE INDEX idx_notas_escola ON notas(cnpj_escola);');
        console.log('? Índice idx_notas_escola criado.');
    } catch(e) {
        console.log('?? Índice já existe ou erro ignorado.');
    }

    await db.end();
    process.exit(0);
}
main().catch(err => { console.error(err); process.exit(1); });
