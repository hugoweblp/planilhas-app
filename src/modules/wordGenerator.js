/**
 * MÓDULO 3: Gerador de Recibos Word (Motor Cirúrgico Inquebrável)
 */

const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const extenso = require('extenso');

const TEMPLATES_DIR = path.join(__dirname, '../../templates');
const OUTPUT_DIR    = path.join(__dirname, '../../output');

const CNPJ_TEMPLATES = {
  '03075858000103': 'recibo_aneto.docx',
  '61333692000184': 'recibo_bom_preco.docx',
  '13306181000120': 'recibo_ras.docx',
  '62329860000120': 'recibo_rcm.docx'
};

function formatarValorStr(valor) {
  return Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function obterDataExtenso(dataIso) {
    // A NF-e sempre manda dhEmi começando com YYYY-MM-DD...
    const partes = dataIso.split('T')[0].split('-');
    const ano = partes[0];
    const mesIdx = parseInt(partes[1], 10) - 1;
    const dia = partes[2];

    const meses = [
        'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
        'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
    ];

    return {
        dia: dia,
        mes: meses[mesIdx],
        ano: ano
    };
}

function escaparXml(texto) {
    if (!texto) return '';
    return String(texto).replace(/[<>&'"]/g, c => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
            default: return c;
        }
    });
}

async function gerarReciboWord(dados, outputPath = OUTPUT_DIR) {
  const cnpjVendedor = String(dados.vendedor.cnpj).replace(/\D/g, '').padStart(14, '0');
  const templateName = CNPJ_TEMPLATES[cnpjVendedor];

  if (!templateName) {
    console.log(`   ⚠️ AVISO: CNPJ ${dados.vendedor.cnpjFmt} não tem modelo de recibo mapeado.`);
    return null;
  }

  const templatePath = path.join(TEMPLATES_DIR, templateName);
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template do Word não encontrado: ${templateName}`);
  }

  const valorNumStr = formatarValorStr(dados.nota.valorTotal);
  const valorPorExtenso = extenso(dados.nota.valorTotal, { mode: 'currency', currency: { type: 'BRL' } }); 
  const dataObj = obterDataExtenso(dados.nota.dataISO);

  const tags = {
    escola_nome: (dados.comprador.nome1 || dados.comprador.nome).toUpperCase(),
    escola_cnpj: dados.comprador.cnpjFmt,
    valor_num: valorNumStr,
    valor_extenso: valorPorExtenso.toLowerCase(),
    nf_numero: dados.nota.numero,
    dia: dataObj.dia,
    mes: dataObj.mes,
    ano: dataObj.ano
  };

  const content = fs.readFileSync(templatePath, 'binary');
  const zip = new PizZip(content);
  let xml = zip.file('word/document.xml').asText();

  for (const [key, value] of Object.entries(tags)) {
      const valorEscapado = escaparXml(value);
      
      // ALLOWED_TAGS: Pula qualquer formatação (cor, negrito), mas PROÍBE pular <w:p> (parágrafo) e <w:br> (linha)
      // E não come os espaços em branco!
      const ALLOWED_TAGS = '(?:<(?!/?w:p(?:>|\\s|Pr)|/?w:br)[^>]+>)*';
      
      let chars = key.split('').join(ALLOWED_TAGS);
      let regexStr = `\\{${ALLOWED_TAGS}\\{${ALLOWED_TAGS}${chars}${ALLOWED_TAGS}\\}${ALLOWED_TAGS}\\}`;
      
      let regex = new RegExp(regexStr, 'gi');
      xml = xml.replace(regex, valorEscapado);
  }

  zip.file('word/document.xml', xml);
  const buf = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });

  // Nome do arquivo no padrão do usuário (ESCOLA R$VALOR - DD.MM.YY - RECIBO NF 000 IN)
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
  const iniciais = vendorInitials[cnpjVendedor] || 'FORN';

  const nomeArquivo = `${nomeEscola} ${valorSemEspaco} - ${dataFmt} - RECIBO NF ${dados.nota.numero} ${iniciais}.docx`;
  const saidaPath = path.join(outputPath, nomeArquivo);

  fs.writeFileSync(saidaPath, buf);

  console.log(`   📄 Word Salvo: ${nomeArquivo}`);
  return { caminho: saidaPath, nome: nomeArquivo };
}

module.exports = { gerarReciboWord };
