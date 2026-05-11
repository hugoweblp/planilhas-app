const mysql = require('mysql2/promise');
require('dotenv').config({path: 'c:/Users/nossa/Documents/Obsidian_Vault/planilhas automatizadas/gerador-planilhas/.env'});
async function main() {
    const db = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });
    try { await db.query('ALTER TABLE entregas ADD COLUMN data_hora DATETIME DEFAULT CURRENT_TIMESTAMP'); } catch(e){}
    await db.end();
    process.exit(0);
}
main().catch(console.error);
