const mysql = require('mysql2/promise');
require('dotenv').config();

async function createDb() {
    try {
        const connection = await mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: ''
        });
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\``);
        console.log(`✅ Banco de dados ${process.env.DB_NAME} criado ou já existente.`);
        await connection.end();
    } catch (error) {
        console.error('❌ Erro ao criar banco:', error.message);
    }
}

createDb();
