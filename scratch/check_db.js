const sqlite3 = require('sqlite3').verbose();
const path = require('path');
// Ajuste para subir um nível se estiver em scratch/
const dbPath = path.join(__dirname, '../data/banco_de_dados.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error(err.message);
        process.exit(1);
    }
    console.log('Conectado ao banco.');
    
    db.all("PRAGMA table_info(notas);", [], (err, rows) => {
        if (err) {
            console.error(err);
        } else {
            console.log('COLUNAS DA TABELA NOTAS:');
            rows.forEach(row => console.log(`- ${row.name} (${row.type})`));
        }
        db.close();
    });
});
