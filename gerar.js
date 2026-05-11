/**
 * gerador-planilhas/gerar.js
 * Script para processar TODOS os XMLs da pasta 'uploads' de uma vez.
 */

const fs = require('fs');
const path = require('path');
const { parseNFe } = require('./src/modules/xmlParser');
const { gerarExcel } = require('./src/modules/excelGenerator');
const { gerarReciboWord } = require('./src/modules/wordGenerator');
const { consultarCNPJ } = require('./src/services/cnpjService');
const { inicializarBanco, dbRun, dbGet } = require('./src/database/db');
const ArchiveService = require('./src/services/archiveService');

const UPLOADS_DIR = path.join(__dirname, 'uploads');
const OUTPUT_DIR  = path.join(__dirname, 'output');

async function processarTudo() {
  console.log('\n🚀 INICIANDO PROCESSAMENTO EM MASSA');
  console.log('────────────────────────────────────');

  inicializarBanco();

  const arquivos = fs.readdirSync(UPLOADS_DIR).filter(f => f.toLowerCase().endsWith('.xml'));

  if (arquivos.length === 0) {
    console.log('❌ NENHUM XML ENCONTRADO na pasta uploads!');
    return;
  }

  for (const arquivo of arquivos) {
    const caminhoXML = path.join(UPLOADS_DIR, arquivo);
    
    try {
      console.log(`📄 Analisando: ${arquivo}`);
      const dados = parseNFe(caminhoXML);

      // --- LÓGICA DE DUPLICADOS ---
      const notaExiste = await dbGet('SELECT chave FROM notas WHERE chave = ?', [dados.nota.chave]);
      if (notaExiste) {
        console.log(`   ⚠️ PULO: Nota ${dados.nota.numero} já processada anteriormente.`);
        ArchiveService.limparUpload(caminhoXML);
        continue;
      }

      // Consulta CNPJ
      const dadosOficiais = await consultarCNPJ(dados.comprador.cnpj);
      if (dadosOficiais) {
        dados.comprador.nomeOriginalXML = dados.comprador.nome;
        dados.comprador.nome = dadosOficiais.razao_social;
      }
      
      // Organiza pastas: output/Escola/Ano-Mes/
      const pastaDestino = ArchiveService.garantirPastaDestino(dados.comprador.nome, dados.nota.dataISO);

      // Geração dos arquivos na pasta correta
      const resultadoExcel = await gerarExcel(dados, pastaDestino);
      const resultadoWord = await gerarReciboWord(dados, pastaDestino);
      
      // Gera o KIT ZIP
      const kitZip = await ArchiveService.gerarKitZip(resultadoExcel.caminho, resultadoWord.caminho, resultadoExcel.nome.replace('.xlsx', ''));
      console.log(`   📦 Kit ZIP gerado: ${kitZip.nome}`);

      // Salva no Banco
      if (dadosOficiais) {
        await dbRun(`INSERT OR REPLACE INTO escolas 
          (cnpj, razao_social, nome_fantasia, logradouro, numero, bairro, municipio, uf, cep) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
          [dados.comprador.cnpj, dadosOficiais.razao_social, dadosOficiais.nome_fantasia, 
           dadosOficiais.logradouro, dadosOficiais.numero, dadosOficiais.bairro, 
           dadosOficiais.municipio, dadosOficiais.uf, dadosOficiais.cep]);
      }

      await dbRun(`INSERT OR IGNORE INTO notas 
        (chave, numero, serie, data_emissao, valor_total, cnpj_vendedor, cnpj_escola) 
        VALUES (?, ?, ?, ?, ?, ?, ?)`, 
        [dados.nota.chave, dados.nota.numero, dados.nota.serie, dados.nota.dataISO, 
         dados.nota.valorTotal, dados.vendedor.cnpj, dados.comprador.cnpj]);

      // Limpa o XML original para manter a pasta limpa
      ArchiveService.limparUpload(caminhoXML);
      
      console.log(`✅ Sucesso! Kit completo em: ${pastaDestino}\n`);
    } catch (err) {
      console.error(`❌ Erro ao processar ${arquivo}:`, err.message);
    }
  }

  console.log('────────────────────────────────────');
  console.log('🏁 FIM DO PROCESSAMENTO!');
  console.log(`📁 Verifique seus arquivos na pasta: ${OUTPUT_DIR}\n`);
}

processarTudo();
