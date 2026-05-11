const mysql = require('mysql2/promise');
require('dotenv').config({path: 'c:/Users/nossa/Documents/Obsidian_Vault/planilhas automatizadas/gerador-planilhas/.env'});
async function main() {
    const db = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });
    try { await db.query('ALTER TABLE notas ADD COLUMN assinada_em DATETIME NULL'); } catch(e){}
    try { await db.query('CREATE TABLE IF NOT EXISTS historico_acoes (id INT AUTO_INCREMENT PRIMARY KEY, chave_nota VARCHAR(60), tipo_acao VARCHAR(50), detalhes TEXT, data_hora DATETIME DEFAULT CURRENT_TIMESTAMP, INDEX idx_chave (chave_nota))'); } catch(e){}
    await db.end();
    process.exit(0);
}
main().catch(console.error);
