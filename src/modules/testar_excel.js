/**
 * TESTE DO MÓDULO 2: Gerador de Excel
 * Execute com: npm run testar:excel
 * 
 * Gera um arquivo XLSX de teste na pasta output/
 * Critério de sucesso: abrir o arquivo e verificar que os dados estão corretos.
 */

const path = require('path');
const { parseNFe } = require('./xmlParser');
const { gerarExcel } = require('./excelGenerator');

const XML_TESTE = path.join(
  __dirname,
  '../../..',
  '15260303075858000103550010000069451100017715 (1).xml'
);

console.log('\n═══════════════════════════════════════════════════════════');
console.log('  TESTE: MÓDULO 2 — Gerador de Excel');
console.log('═══════════════════════════════════════════════════════════\n');

async function main() {
  try {
    // Passo 1: Lê o XML
    console.log('1️⃣  Lendo XML...');
    const dados = parseNFe(XML_TESTE);
    console.log(`   ✅ ${dados.totalProdutos} produtos extraídos — NF ${dados.nota.numero}`);

    // Passo 2: Gera o Excel com percentuais fixos para teste
    console.log('\n2️⃣  Gerando Excel...');
    const resultado = await gerarExcel(dados, {
      pl2Percent: 5,  // 5% fixo para teste
      pl3Percent: 10, // 10% fixo para teste
    });

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  ✅ SUCESSO! Arquivo gerado:');
    console.log(`     📄 ${resultado.nome}`);
    console.log(`     📁 ${resultado.caminho}`);
    console.log(`     PL2: +${resultado.pl2}% | PL3: +${resultado.pl3}%`);
    console.log('\n  👉 Abra o arquivo no Excel e verifique:');
    console.log('     [ ] Aba PADRÃO: nome da escola, itens e valores corretos');
    console.log('     [ ] Aba BASE 02: preços com +5% (coluna M/G)');
    console.log('     [ ] Aba BASE 03: preços com +10% (coluna M/G)');
    console.log('═══════════════════════════════════════════════════════════\n');

  } catch (err) {
    console.error('\n❌ ERRO:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
