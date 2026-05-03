/**
 * MÓDULO 1: XML Parser
 * Objetivo: Ler um XML de NF-e e retornar um objeto JSON estruturado
 * Uso: const { parseNFe } = require('./xmlParser');
 */

const { XMLParser } = require('fast-xml-parser');
const fs = require('fs');
const path = require('path');

// Configuração do parser — preserva atributos e arrays
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => ['det'].includes(name), // det sempre é array (itens)
});

/**
 * Formata uma data ISO para dd/mm/aaaa
 */
function formatarData(dataISO) {
  const d = new Date(dataISO);
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const ano = d.getFullYear();
  return `${dia}/${mes}/${ano}`;
}

/**
 * Formata CNPJ: 00.000.000/0001-00
 */
function formatarCNPJ(cnpj) {
  const c = String(cnpj).replace(/\D/g, '').padStart(14, '0');
  return `${c.slice(0,2)}.${c.slice(2,5)}.${c.slice(5,8)}/${c.slice(8,12)}-${c.slice(12,14)}`;
}

/**
 * Formata valor monetário: 1234.56 → "R$ 1.234,56"
 */
function formatarMoeda(valor) {
  return 'R$ ' + Number(valor).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Extrai e estrutura todos os dados relevantes do XML de NF-e
 * @param {string} caminhoXML - Caminho absoluto para o arquivo .xml
 * @returns {object} Dados estruturados da nota
 */
function parseNFe(caminhoXML) {
  // 1. Lê o arquivo
  const xmlContent = fs.readFileSync(caminhoXML, 'utf-8');

  // 2. Faz o parse
  const parsed = parser.parse(xmlContent);

  // 3. Navega até o coração da NF-e
  const nfeProc = parsed.nfeProc;
  const infNFe = nfeProc.NFe.infNFe;

  // ── DADOS DA NOTA ──────────────────────────────────────────────
  const ide = infNFe.ide;
  const nota = {
    numero:      String(ide.nNF),
    serie:       String(ide.serie),
    dataISO:     ide.dhEmi,
    data:        formatarData(ide.dhEmi),
    valorTotal:  Number(infNFe.total.ICMSTot.vNF),
    valorTotalFmt: formatarMoeda(infNFe.total.ICMSTot.vNF),
    chave:       infNFe['@_Id'] ? infNFe['@_Id'].replace('NFe', '') : '',
  };

  // ── DADOS DO VENDEDOR (nossa empresa) ──────────────────────────
  const emit = infNFe.emit;
  const endEmit = emit.enderEmit;
  const vendedor = {
    cnpj:         String(emit.CNPJ).replace(/\D/g, '').padStart(14, '0'),
    cnpjFmt:      formatarCNPJ(emit.CNPJ),
    nome:         emit.xNome,
    ie:           String(emit.IE),
    logradouro:   endEmit.xLgr,
    numero:       String(endEmit.nro),
    complemento:  endEmit.xCpl || '',
    bairro:       endEmit.xBairro,
    municipio:    endEmit.xMun,
    uf:           endEmit.UF,
    cep:          String(endEmit.CEP).padStart(8, '0'),
    telefone:     String(emit.fone || ''),
    enderecoCompleto: `${endEmit.xLgr}, ${endEmit.nro}${endEmit.xCpl ? ' - ' + endEmit.xCpl : ''}, ${endEmit.xBairro} - ${endEmit.xMun}/${endEmit.UF}`,
  };

  // ── DADOS DO COMPRADOR (escola) ────────────────────────────────
  const dest = infNFe.dest;
  const endDest = dest.enderDest;
  const comprador = {
    cnpj:         String(dest.CNPJ),
    cnpjFmt:      formatarCNPJ(dest.CNPJ),
    nome:         dest.xNome,
    logradouro:   endDest.xLgr,
    numero:       String(endDest.nro),
    complemento:  endDest.xCpl || '',
    bairro:       endDest.xBairro,
    municipio:    endDest.xMun,
    uf:           endDest.UF,
    cep:          String(endDest.CEP).padStart(8, '0'),
    enderecoCompleto: `${endDest.xLgr}${endDest.xCpl ? ', ' + endDest.xCpl : ''} - ${endDest.xBairro} - ${endDest.xMun}/${endDest.UF} - CEP: ${String(endDest.CEP).padStart(8, '0')}`,
  };

  // ── PRODUTOS ────────────────────────────────────────────────────
  const detalhes = Array.isArray(infNFe.det) ? infNFe.det : [infNFe.det];
  const produtos = detalhes.map((det, idx) => {
    const prod = det.prod;
    return {
      item:        idx + 1,
      descricao:   prod.xProd,
      ncm:         String(prod.NCM),
      und:         prod.uCom,
      quantidade:  Number(prod.qCom),
      valorUnit:   Number(prod.vUnCom),
      valorTotal:  Number(prod.vProd),
      valorUnitFmt:  formatarMoeda(prod.vUnCom),
      valorTotalFmt: formatarMoeda(prod.vProd),
    };
  });

  // ── OBJETO FINAL ────────────────────────────────────────────────
  return {
    nota,
    vendedor,
    comprador,
    produtos,
    totalProdutos: produtos.length,
  };
}

module.exports = { parseNFe, formatarMoeda, formatarCNPJ, formatarData };
