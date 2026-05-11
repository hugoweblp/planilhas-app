const mysql = require('mysql2/promise');
require('dotenv').config();

async function resetDb() {
    try {
        const connection = await mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: ''
        });

        console.log('🧹 Limpando banco de dados antigo...');
        await connection.query(`DROP DATABASE IF EXISTS \`${process.env.DB_NAME}\``);
        
        console.log(`🏗️ Criando novo banco de dados: ${process.env.DB_NAME}...`);
        await connection.query(`CREATE DATABASE \`${process.env.DB_NAME}\``);
        
        await connection.end();
        console.log('✅ Banco de dados resetado com sucesso! Agora vou rodar o sistema para criar as tabelas.');
    } catch (error) {
        console.error('❌ Erro ao resetar banco:', error.message);
    }
}

resetDb();
