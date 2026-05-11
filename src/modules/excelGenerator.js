/**
 * MÓDULO 2: Gerador de Excel — v2 (Dinâmico)
 * 
 * Estratégia:
 *  1. Encontra a linha do cabeçalho "14-Item" dinamicamente
 *  2. Encontra a linha do TOTAL (linha amarela / linha antes do BLOCO IV)
 *  3. Calcula quantas linhas de produto existem no template
 *  4. Se a nota tem MAIS produtos → insere linhas copiando o estilo da primeira
 *  5. Se a nota tem MENOS produtos → remove as linhas excedentes
 *  6. Preenche os dados nas linhas corretas
 */

const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

const TEMPLATE_PATH = path.join(__dirname, '../../templates/base.xlsx');
const OUTPUT_DIR    = path.join(__dirname, '../../output');

const ABAS = {
  padrao: 'PADRÃO',
  base2:  'BASE 02',
  base3:  'BASE 03',
};

/**
 * Gera um par de percentuais (p2, p3) garantindo que p3 > p2
 * @param {number} valorUnit 
 */
function gerarParDePercentuais(valorUnit = 0) {
  const max = valorUnit >= 100 ? 10 : 15;
  const min = 2;

  let p2 = Math.floor(Math.random() * (max - min + 1)) + min;
  let p3 = Math.floor(Math.random() * (max - min + 1)) + min;

  // Garante que p3 seja SEMPRE estritamente maior que p2
  if (p2 === p3) {
    if (p3 < max) p3++;
    else p2--; // Se os dois baterem no teto, a Base 02 recua 1%
  } else if (p2 > p3) {
    // Se inverteram, a gente só destroca
    const temp = p2;
    p2 = p3;
    p3 = temp;
  }

  return { p2, p3 };
}

/**
 * Encontra o número de uma linha que contém um texto específico em qualquer célula
 * @returns {number|null}
 */
function encontrarLinha(sheet, texto) {
  let linhaEncontrada = null;
  sheet.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (linhaEncontrada) return;
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (linhaEncontrada) return;
      const val = cell.value;
      let str = '';
      if (typeof val === 'string') str = val;
      else if (val?.richText) str = val.richText.map(r => r.text).join('');
      else if (val?.formula) str = '';
      else str = String(val || '');

      if (str.toLowerCase().includes(texto.toLowerCase())) {
        linhaEncontrada = rowNum;
      }
    });
  });
  return linhaEncontrada;
}

/**
 * Copia o estilo de uma célula para outra, limpando strikethrough/italic
 * @param {boolean} bold - se true, força negrito; se false, remove negrito
 */
function copiarEstilo(origem, destino, bold = false) {
  try {
    if (origem.fill)      destino.fill      = JSON.parse(JSON.stringify(origem.fill));
    if (origem.border)    destino.border    = JSON.parse(JSON.stringify(origem.border));
    if (origem.alignment) destino.alignment = { ...origem.alignment };
    if (origem.numFmt)    destino.numFmt    = origem.numFmt;

    // Copia fonte mas REMOVE strikethrough e italic (herança indesejada do template)
    const fontBase = origem.font ? { ...origem.font } : {};
    destino.font = {
      ...fontBase,
      strike: false,   // sem riscado
      italic: false,   // sem itálico
      bold:   bold,    // controlado pelo caller
    };
  } catch (e) { /* ignora erros de estilo */ }
}

/**
 * Ajusta o número de linhas de produto no template
 * @param {ExcelJS.Worksheet} sheet
 * @param {number} linhaInicio     - primeira linha de produto
 * @param {number} linhaTotalValor - linha do TOTAL (antes do BLOCO IV)
 * @param {number} qtdProdutos     - quantos produtos a nota tem
 * @param {boolean} bold           - se as linhas de produto devem ter negrito
 * @returns {number} nova posição da linha de TOTAL após ajuste
 */
function ajustarLinhasProduto(sheet, linhaInicio, linhaTotalValor, qtdProdutos, bold = false) {
  const linhasDisponiveis = linhaTotalValor - linhaInicio;
  const diferenca         = qtdProdutos - linhasDisponiveis;

  if (diferenca > 0) {
    // Precisa de MAIS linhas — insere antes da linha de TOTAL
    const linhaRef = linhaTotalValor - 1; 
    const rowRef   = sheet.getRow(linhaRef);

    for (let i = 0; i < diferenca; i++) {
      const posInsercao = linhaTotalValor + i;
      sheet.spliceRows(posInsercao, 0, []);

      const novaRow = sheet.getRow(posInsercao);
      rowRef.eachCell({ includeEmpty: true }, (cell, colNum) => {
        const novaCell = novaRow.getCell(colNum);
        copiarEstilo(cell, novaCell, bold);
        novaCell.value = null;
      });
      if (rowRef.height) novaRow.height = rowRef.height;
      novaRow.commit();
    }

    return linhaTotalValor + diferenca;

  } else {
    // Se tiver MENOS ou IGUAL a 10 produtos, NÃO removemos linhas.
    // Apenas mantemos o layout padrão do template (mínimo de 10 linhas).
    // O retorno é a própria linhaTotalValor original.
    return linhaTotalValor;
  }
}

/**
 * Atualiza a fórmula de TOTAL para cobrir todas as linhas de produto
 * e aplica o estilo correto nas linhas existentes do template
 */
function atualizarTotalEEstilos(sheet, linhaInicio, linhaTotalValor, qtdProdutos, bold) {
  const linhaUltimoProduto = linhaInicio + qtdProdutos - 1;

  // Atualiza fórmula SUM na linha de TOTAL (coluna H = 8)
  const rowTotal = sheet.getRow(linhaTotalValor);
  // Preserva estilo da linha de total, só atualiza a fórmula da coluna H
  rowTotal.getCell(8).value = { formula: `SUM(H${linhaInicio}:H${linhaUltimoProduto})` };
  rowTotal.commit();

  // Aplica estilo correto (bold/sem-strike) nas linhas de produto JÁ existentes no template
  // (as inseridas pelo spliceRows já receberam o estilo via copiarEstilo)
  const linhasOriginais = Math.min(qtdProdutos, linhaTotalValor - linhaInicio);
  for (let i = 0; i < linhasOriginais; i++) {
    const row = sheet.getRow(linhaInicio + i);
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (cell.font) {
        cell.font = { ...cell.font, strike: false, italic: false, bold };
      }
    });
    row.commit();
  }
}


/**
 * Remove riscado (strike) e itálico de TODAS as células da planilha
 */
function limparEstilosGlobais(wb) {
  wb.worksheets.forEach(sheet => {
    // 1. Limpeza de Fontes (Funciona 100% e não quebra o arquivo)
    sheet.eachRow({ includeEmpty: true }, (row) => {
      row.eachCell({ includeEmpty: true }, (cell) => {
        if (cell.font) {
          cell.font = {
            ...cell.font,
            strike: false,
            italic: false
          };
        }
      });
    });
  });
}

/**
 * Preenche o cabeçalho da planilha
 */
function preencherCabecalho(sheet, dados, numeroPesquisa) {
  const { nota, vendedor, comprador } = dados;

  // Prioridade Máxima: Nome e Endereço editados no modal (1, 2 ou 3)
  const nomeEscola = comprador[`nome${numeroPesquisa}`] || comprador.nome || comprador.razaoSocial;
  const enderecoEscola = comprador[`endereco${numeroPesquisa}`] || comprador.enderecoAPI || comprador.enderecoCompleto;

  console.log(`   [DEBUG] Aba ${numeroPesquisa}: "${nomeEscola}" | "${enderecoEscola}"`);

  try { sheet.getCell('A9').value  = nomeEscola; }          catch(e) {}
  try { sheet.getCell('G9').value  = comprador.cnpjFmt; }       catch(e) {}
  try { sheet.getCell('A11').value = enderecoEscola; }      catch(e) {}
  try { sheet.getCell('B7').value  = comprador.uf; }            catch(e) {}
  try { sheet.getCell('D7').value  = comprador.municipio; }     catch(e) {}
  try { sheet.getCell('H7').value  = numeroPesquisa; }          catch(e) {}
}

/**
 * Preenche os produtos na aba PADRÃO
 */
function preencherItensPadrao(sheet, produtos) {
  const linhaCabecalho  = encontrarLinha(sheet, '14-Item');
  const linhaBloco      = encontrarLinha(sheet, 'BLOCO IV');

  if (!linhaCabecalho) throw new Error('Linha "14-Item" não encontrada na aba PADRÃO');
  if (!linhaBloco)     throw new Error('Linha "BLOCO IV" não encontrada na aba PADRÃO');

  const linhaInicio     = linhaCabecalho + 1;
  const linhaTotalValor = linhaBloco - 1;  // linha de TOTAL, antes do BLOCO IV
  const disponiveis     = linhaTotalValor - linhaInicio;

  console.log(`   [PADRÃO] Produtos: L${linhaInicio}–L${linhaTotalValor-1} | Total: L${linhaTotalValor} | BLOCO IV: L${linhaBloco}`);
  console.log(`   [PADRÃO] Disponíveis: ${disponiveis} | Necessários: ${produtos.length}`);

  // PADRÃO = sem negrito
  const novaLinhaTotalValor = ajustarLinhasProduto(sheet, linhaInicio, linhaTotalValor, produtos.length, false);

  // Preenche dados e limpa linhas não usadas (dentro do mínimo de 10)
  for (let i = 0; i < Math.max(produtos.length, disponiveis); i++) {
    const linha = linhaInicio + i;
    const row   = sheet.getRow(linha);
    const prod  = produtos[i];

    // Coluna 1 (Item) sempre tem número, de acordo com o pedido
    row.getCell(1).value = String(i + 1).padStart(2, '0');

    if (prod) {
      row.getCell(2).value = prod.descricao;
      row.getCell(5).value = prod.und;
      row.getCell(6).value = prod.quantidade;
      row.getCell(7).value = prod.valorUnit;
      row.getCell(8).value = { formula: `G${linha}*F${linha}` };
    } else {
      row.getCell(2).value = null;
      row.getCell(5).value = null;
      row.getCell(6).value = null;
      row.getCell(7).value = null;
      row.getCell(8).value = null;
    }

    // Garante estilo limpo (sem risco/itálico) em todas as células
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (cell.font) cell.font = { ...cell.font, strike: false, italic: false, bold: false };
    });
    row.commit();
  }

  // Atualiza fórmula do TOTAL
  atualizarTotalEEstilos(sheet, linhaInicio, novaLinhaTotalValor, produtos.length, false);
}

/**
 * Preenche os percentuais nas abas BASE 02 e BASE 03
 * @param {string} chavePercentual - 'p2' ou 'p3' para pegar do objeto mapeado
 */
function preencherItensBase(sheet, abaName, produtosMapeados, disponiveisTemplate, chavePercentual) {
  const linhaCabecalho  = encontrarLinha(sheet, '14-Item');
  const linhaBloco      = encontrarLinha(sheet, 'BLOCO IV');

  if (!linhaCabecalho) throw new Error(`Linha "14-Item" não encontrada na aba ${abaName}`);
  if (!linhaBloco)     throw new Error(`Linha "BLOCO IV" não encontrada na aba ${abaName}`);

  const linhaInicio     = linhaCabecalho + 1;
  const linhaTotalValor = linhaBloco - 1;

  const isBold = (abaName === ABAS.base2);

  console.log(`   [${abaName}] Aplicando hierarquia de preços... | negrito: ${isBold}`);

  const novaLinhaTotalValor = ajustarLinhasProduto(sheet, linhaInicio, linhaTotalValor, produtosMapeados.length, isBold);

  for (let i = 0; i < Math.max(produtosMapeados.length, disponiveisTemplate); i++) {
    const linha = linhaInicio + i;
    const row   = sheet.getRow(linha);
    const item  = produtosMapeados[i];

    // Coluna 1 (Item) sempre tem número
    row.getCell(1).value = String(i + 1).padStart(2, '0');

    if (item) {
      const percentualItem = item[chavePercentual]; // pega o p2 ou p3 sorteado
      
      row.getCell(2).value  = item.descricao;
      row.getCell(5).value  = item.und;
      row.getCell(6).value  = item.quantidade;
      row.getCell(11).value = { formula: `PADRÃO!G${linha}` };
      row.getCell(12).value = percentualItem;
      row.getCell(13).value = { formula: `K${linha}*L${linha}/100+K${linha}` };
      row.getCell(7).value  = { formula: `M${linha}` };
      row.getCell(8).value  = { formula: `G${linha}*F${linha}` };
    } else {
      row.getCell(2).value  = null;
      row.getCell(5).value  = null;
      row.getCell(6).value  = null;
      row.getCell(11).value = null;
      row.getCell(12).value = null;
      row.getCell(13).value = null;
      row.getCell(7).value  = null;
      row.getCell(8).value  = null;
    }

    row.eachCell({ includeEmpty: false }, (cell) => {
      if (cell.font) cell.font = { ...cell.font, strike: false, italic: false, bold: isBold };
    });
    row.commit();
  }

  // Atualiza fórmula do TOTAL
  atualizarTotalEEstilos(sheet, linhaInicio, novaLinhaTotalValor, produtosMapeados.length, isBold);
}

/**
 * Função principal: gera o Excel com as 3 abas
 */
async function gerarExcel(dados, outputPath = OUTPUT_DIR) {
  console.log(`\n📊 Gerando Excel...`);
  console.log(`   NF: ${dados.nota.numero} | ${dados.totalProdutos} produtos`);
  console.log(`   Modo: Hierarquia Inteligente (BASE 03 > BASE 02 > PADRÃO)`);

  // Prepara os produtos com seus pares de percentuais já definidos
  const produtosMapeados = dados.produtos.map((p, idx) => {
    let p2, p3;
    
    console.log(`   [DEBUG] Produto ${idx + 1}: ${p.descricao}`);
    console.log(`   [DEBUG] Valor Unit: ${p.valorUnit}`);
    console.log(`   [DEBUG] Percentuais Recebidos:`, p.percentuais);

    if (p.percentuais && p.percentuais.p2 !== undefined) {
      p2 = Number(p.percentuais.p2);
      p3 = Number(p.percentuais.p3);
      console.log(`   [DEBUG] -> Usando valores da TELA: p2=${p2}, p3=${p3}`);
    } else {
      const sorteio = gerarParDePercentuais(p.valorUnit);
      p2 = sorteio.p2;
      p3 = sorteio.p3;
      console.log(`   [DEBUG] -> Sorteando novos valores: p2=${p2}, p3=${p3}`);
    }
    
    return { ...p, p2, p3 };
  });

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE_PATH);

  const sheetPadrao = wb.getWorksheet(ABAS.padrao);
  const sheetBase2  = wb.getWorksheet(ABAS.base2);
  const sheetBase3  = wb.getWorksheet(ABAS.base3);

  if (!sheetPadrao) throw new Error(`Aba "${ABAS.padrao}" não encontrada!`);
  if (!sheetBase2)  throw new Error(`Aba "${ABAS.base2}" não encontrada!`);
  if (!sheetBase3)  throw new Error(`Aba "${ABAS.base3}" não encontrada!`);

  preencherCabecalho(sheetPadrao, dados, 1);
  preencherItensPadrao(sheetPadrao, dados.produtos);

  // Precisamos saber quantas linhas o template tem para as abas concorrentes
  const linhaCab = encontrarLinha(sheetPadrao, '14-Item');
  const linhaBlo = encontrarLinha(sheetPadrao, 'BLOCO IV');
  const disponiveisTemplate = (linhaBlo - 1) - (linhaCab + 1);

  preencherCabecalho(sheetBase2, dados, 2);
  preencherItensBase(sheetBase2, 'BASE 02', produtosMapeados, disponiveisTemplate, 'p2');

  preencherCabecalho(sheetBase3, dados, 3);
  preencherItensBase(sheetBase3, 'BASE 03', produtosMapeados, disponiveisTemplate, 'p3');

  // LIMPEZA FINAL: Remove riscos e itálicos de todas as células do arquivo
  limparEstilosGlobais(wb);

  // Nome do arquivo no padrão do usuário (ESCOLA R$VALOR - DD.MM.YY - NF 000 IN)
  const nomeEscola = dados.comprador.nome
    .replace(/CONSELHO ESCOLAR\s*(DA|DO|DE)?\s*/i, '')
    .replace(/[^A-Z0-9\s]/gi, '')
    .trim().replace(/\s+/g, ' ').toUpperCase().slice(0, 40);

  const valorSemEspaco = dados.nota.valorTotalFmt.replace('R$ ', 'R$');
  
  const d = new Date(dados.nota.dataISO);
  const dataFmt = `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth()+1).padStart(2, '0')}.${String(d.getUTCFullYear()).slice(2)}`;

  const vendorInitials = {
    '03075858000103': 'AN',
    '61333692000184': 'BP',
    '13306181000120': 'RS',
    '62329860000120': 'RC'
  };
  const iniciais = vendorInitials[dados.vendedor.cnpj.replace(/\D/g, '').padStart(14, '0')] || 'FORN';

  const nomeArquivo  = `${nomeEscola} ${valorSemEspaco} - ${dataFmt} - NF ${dados.nota.numero} ${iniciais}.xlsx`;
  const caminhoSaida = path.join(outputPath, nomeArquivo);

  await wb.xlsx.writeFile(caminhoSaida);

  console.log(`   ✅ Salvo: ${nomeArquivo}`);
  return { caminho: caminhoSaida, nome: nomeArquivo };
}

module.exports = { gerarExcel, gerarParDePercentuais, ABAS };
