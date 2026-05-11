/**
 * INSPETOR DA PLANILHA BASE
 * Lê o base.xlsx e imprime o conteúdo de cada célula relevante
 * Execute: node src/modules/inspecionar_excel.js
 */

const ExcelJS = require('exceljs');
const path = require('path');

const TEMPLATE = path.join(__dirname, '../../templates/base.xlsx');

async function inspecionar() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE);

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  INSPETOR DE PLANILHA — base.xlsx');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Abas encontradas: ${wb.worksheets.map(s => s.name).join(', ')}`);

  wb.worksheets.forEach(sheet => {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`  ABA: "${sheet.name}" — Total de linhas com dados: ${sheet.actualRowCount}`);
    console.log(`${'─'.repeat(60)}`);
    console.log('  Coluna │ Linha │ Conteúdo da Célula');
    console.log('  ───────┼───────┼────────────────────────────────────────');

    // Mostra apenas linhas que TEM conteúdo (ignora vazias)
    sheet.eachRow({ includeEmpty: false }, (row, rowNum) => {
      row.eachCell({ includeEmpty: false }, (cell, colNum) => {
        const addr   = cell.address;           // ex: A9
        const tipo   = typeof cell.value;
        let conteudo = '';

        if (cell.value === null || cell.value === undefined) return;

        if (tipo === 'object' && cell.value?.formula) {
          conteudo = `[FÓRMULA] ${cell.value.formula}`;
        } else if (tipo === 'object' && cell.value?.richText) {
          conteudo = cell.value.richText.map(r => r.text).join('');
        } else {
          conteudo = String(cell.value);
        }

        // Ignora células muito longas (provavelmente de estilo)
        if (conteudo.length > 120) conteudo = conteudo.slice(0, 117) + '...';

        console.log(`  ${addr.padEnd(6)} │ ${String(rowNum).padEnd(5)} │ ${conteudo}`);
      });
    });

    // Mostra também as colunas mescladas
    const merges = sheet.model?.merges;
    if (merges && merges.length) {
      console.log(`\n  CÉLULAS MESCLADAS (${merges.length}):`);
      merges.slice(0, 20).forEach(m => console.log(`    ${m}`));
    }
  });

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  Inspeção concluída!');
  console.log('═══════════════════════════════════════════════════════════\n');
}

inspecionar().catch(err => {
  console.error('❌ Erro:', err.message);
});
