/**
 * MÓDULO 3: Gerador de Recibos Word
 * Usa docxtemplater para substituição segura de tags {{tag}} nos templates .docx.
 * Elimina ReDoS, null crash, escaping manual e I/O síncrono da versão anterior.
 */

const fs   = require('fs');
const path = require('path');
const PizZip        = require('pizzip');
const Docxtemplater = require('docxtemplater');
const extenso       = require('extenso');
const { CNPJ_TEMPLATES, VENDOR_INITIALS } = require('../constants/templates');

const TEMPLATES_DIR = path.join(__dirname, '../../templates');
const OUTPUT_DIR    = path.join(__dirname, '../../output');

function formatarValorStr(valor) {
    return Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function obterDataExtenso(dataIso) {
    const partes = dataIso.split('T')[0].split('-');
    const mesIdx = parseInt(partes[1], 10) - 1;
    const meses  = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
    return {
        dia: String(Number(partes[2])), // sem zero à esquerda: "5" e não "05"
        mes: meses[mesIdx],
        ano: partes[0]
    };
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

    const valorNumStr    = formatarValorStr(dados.nota.valorTotal);
    const valorPorExtenso = extenso(dados.nota.valorTotal, { mode: 'currency', currency: { type: 'BRL' } });
    const dataObj        = obterDataExtenso(dados.nota.dataISO);

    const tags = {
        escola_nome:   (dados.comprador.nome1 || dados.comprador.nome).toUpperCase(),
        escola_cnpj:   dados.comprador.cnpjFmt,
        valor_num:     valorNumStr,
        valor_extenso: valorPorExtenso.toLowerCase(),
        nf_numero:     dados.nota.numero,
        dia:           dataObj.dia,
        mes:           dataObj.mes,
        ano:           dataObj.ano
    };

    // Lê o template e substitui tags {{tag}} via docxtemplater
    // (resolve fragmentação XML do Word sem regex — elimina risco de ReDoS)
    const content = await fs.promises.readFile(templatePath);
    const zip = new PizZip(content);

    if (!zip.file('word/document.xml')) {
        throw new Error(`Template corrompido — word/document.xml não encontrado em: ${templateName}`);
    }

    const doc = new Docxtemplater(zip, {
        delimiters:    { start: '{{', end: '}}' },
        paragraphLoop: true,
        linebreaks:    true
    });

    try {
        doc.render(tags);
    } catch (e) {
        const erros = e.properties?.errors?.map(err => err.message).join(', ') || e.message;
        throw new Error(`Erro ao renderizar template Word (${templateName}): ${erros}`);
    }

    const buf = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });

    // Nome do arquivo no padrão: ESCOLA R$VALOR - DD.MM.YY - RECIBO NF 000 IN.docx
    const nomeEscola = dados.comprador.nome
        .replace(/CONSELHO ESCOLAR\s*(DA|DO|DE)?\s*/i, '')
        .replace(/[^A-Z0-9\s]/gi, '')
        .trim().replace(/\s+/g, ' ').toUpperCase().slice(0, 40);

    const valorSemEspaco = (dados.nota.valorTotalFmt || `R$${valorNumStr}`).replace('R$ ', 'R$');

    const d = new Date(dados.nota.dataISO);
    const dataFmt = `${String(d.getUTCDate()).padStart(2,'0')}.${String(d.getUTCMonth()+1).padStart(2,'0')}.${String(d.getUTCFullYear()).slice(2)}`;

    const iniciais    = VENDOR_INITIALS[cnpjVendedor] || 'FORN';
    const nomeArquivo = `${nomeEscola} ${valorSemEspaco} - ${dataFmt} - RECIBO NF ${dados.nota.numero} ${iniciais}.docx`;

    await fs.promises.mkdir(outputPath, { recursive: true });
    const saidaPath = path.join(outputPath, nomeArquivo);
    await fs.promises.writeFile(saidaPath, buf);

    console.log(`   📄 Word Salvo: ${nomeArquivo}`);
    return { caminho: saidaPath, nome: nomeArquivo };
}

module.exports = { gerarReciboWord };
