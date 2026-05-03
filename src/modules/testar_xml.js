/**
 * TESTE DO MÓDULO 1: XML Parser
 * Execute com: npm run testar:xml
 * 
 * Lê o XML de exemplo e exibe todos os dados extraídos no terminal.
 * Critério de sucesso: dados corretos impressos sem erros.
 */

const path = require('path');
const { parseNFe } = require('./xmlParser');

// Caminho para o XML de exemplo (ajuste se necessário)
const XML_TESTE = path.join(
  __dirname,
  '../../..',
  '15260303075858000103550010000069451100017715 (1).xml'
);

console.log('');
console.log('═══════════════════════════════════════════════════════════');
console.log('  TESTE: MÓDULO 1 — XML Parser (NF-e)');
console.log('═══════════════════════════════════════════════════════════');
console.log('');

try {
  const dados = parseNFe(XML_TESTE);

  // ── NOTA ──────────────────────────────────────────────────────
  console.log('📋 DADOS DA NOTA FISCAL:');
  console.log(`   Número:      ${dados.nota.numero}`);
  console.log(`   Série:       ${dados.nota.serie}`);
  console.log(`   Data:        ${dados.nota.data}`);
  console.log(`   Valor Total: ${dados.nota.valorTotalFmt}`);
  console.log('');

  // ── VENDEDOR ──────────────────────────────────────────────────
  console.log('🏪 VENDEDOR (Nossa Empresa):');
  console.log(`   Nome:   ${dados.vendedor.nome}`);
  console.log(`   CNPJ:   ${dados.vendedor.cnpjFmt}`);
  console.log(`   IE:     ${dados.vendedor.ie}`);
  console.log(`   End.:   ${dados.vendedor.enderecoCompleto}`);
  console.log('');

  // ── COMPRADOR ─────────────────────────────────────────────────
  console.log('🏫 COMPRADOR (Escola):');
  console.log(`   Nome:   ${dados.comprador.nome}`);
  console.log(`   CNPJ:   ${dados.comprador.cnpjFmt}`);
  console.log(`   End.:   ${dados.comprador.enderecoCompleto}`);
  console.log('');

  // ── PRODUTOS ──────────────────────────────────────────────────
  console.log(`📦 PRODUTOS (${dados.totalProdutos} itens):`);
  console.log('   Item  │ Descrição                          │ UND │ Qtd   │ Vl.Unit     │ Vl.Total');
  console.log('   ──────┼────────────────────────────────────┼─────┼───────┼─────────────┼──────────────');

  dados.produtos.forEach(p => {
    const desc = p.descricao.padEnd(34).slice(0, 34);
    const und  = p.und.padEnd(3).slice(0, 3);
    const qtd  = String(p.quantidade).padStart(5);
    const vUnit = p.valorUnitFmt.padStart(11);
    const vTot  = p.valorTotalFmt.padStart(12);
    console.log(`   ${String(p.item).padStart(4)}  │ ${desc} │ ${und} │ ${qtd} │ ${vUnit} │ ${vTot}`);
  });

  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  ✅ SUCESSO! Todos os dados extraídos corretamente.');
  console.log(`     ${dados.totalProdutos} produtos encontrados.`);
  console.log(`     Valor total da nota: ${dados.nota.valorTotalFmt}`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

} catch (err) {
  console.error('❌ ERRO ao processar XML:');
  console.error(err.message);
  console.error('');
  console.error('Verifique o caminho do arquivo XML.');
  process.exit(1);
}
