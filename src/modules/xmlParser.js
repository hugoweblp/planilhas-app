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
async function parseNFe(caminhoXML) {
  try {
      // 1. Lê o arquivo de forma assíncrona (Non-blocking I/O - FASE 3)
      const rawContent = await fs.promises.readFile(caminhoXML, 'utf-8');
      let xmlContent = rawContent.trim();
      
      // Remove BOM (Byte Order Mark) se existir
      if (xmlContent.charCodeAt(0) === 0xFEFF) {
          xmlContent = xmlContent.slice(1);
      }
      
      // Remove possíveis lixos antes do início do XML (<?xml ou <nfeProc)
      const startIdx = xmlContent.indexOf('<');
      if (startIdx > 0) xmlContent = xmlContent.slice(startIdx);
      
      // Tesoura de Ouro: Remove lixo APÓS o fim oficial do XML
      // Sistemas ruins às vezes "colam" pedaços de outros XMLs no final
      let endIdx = xmlContent.indexOf('</nfeProc>');
      if (endIdx !== -1) {
          xmlContent = xmlContent.slice(0, endIdx + 10); // 10 é o tamanho exato de '</nfeProc>'
      } else {
          endIdx = xmlContent.indexOf('</NFe>');
          if (endIdx !== -1) {
              xmlContent = xmlContent.slice(0, endIdx + 6); // 6 é o tamanho exato de '</NFe>'
          }
      }

      if (!xmlContent) throw new Error('O arquivo XML está vazio ou inválido.');

      // 2. Faz o parse com tratamento de erro
      let parsed;
      try {
          parsed = parser.parse(xmlContent);
      } catch (e) {
          console.error('Erro interno no fast-xml-parser:', e);
          throw new Error('O conteúdo do arquivo não é um XML válido.');
      }

      if (!parsed) throw new Error('Falha ao interpretar o conteúdo do XML.');

      // 3. Navega até o coração da NF-e (Suporta nfeProc ou NFe direto)
      let infNFe;
      
      // Tenta encontrar o infNFe em diferentes profundidades comuns
      if (parsed.nfeProc && parsed.nfeProc.NFe) {
          infNFe = parsed.nfeProc.NFe.infNFe;
      } else if (parsed.NFe) {
          infNFe = parsed.NFe.infNFe;
      } else if (parsed.infNFe) {
          infNFe = parsed.infNFe;
      } else {
          // Busca exaustiva: procura qualquer chave que contenha infNFe
          const findInfNFe = (obj) => {
              if (!obj || typeof obj !== 'object') return null;
              if (obj.infNFe) return obj.infNFe;
              for (const key in obj) {
                  const found = findInfNFe(obj[key]);
                  if (found) return found;
              }
              return null;
          };
          infNFe = findInfNFe(parsed);
      }

      if (!infNFe) {
          throw new Error('Estrutura de NF-e não reconhecida. Certifique-se que é um XML de Nota Fiscal válido.');
      }

      // ── DADOS DA NOTA ──────────────────────────────────────────────
      const ide = infNFe.ide;
      if (!ide) throw new Error('Dados de identificação (ide) ausentes no XML.');

      const nota = {
        numero:      String(ide.nNF || '0'),
        serie:       String(ide.serie || '0'),
        dataISO:     ide.dhEmi || new Date().toISOString(),
        data:        ide.dhEmi ? formatarData(ide.dhEmi) : '--/--/----',
        valorTotal:  Number(infNFe.total?.ICMSTot?.vNF || 0),
        valorTotalFmt: formatarMoeda(infNFe.total?.ICMSTot?.vNF || 0),
        chave:       infNFe['@_Id'] ? infNFe['@_Id'].replace('NFe', '') : (ide.pkNFe || ''),
      };

      // ── DADOS DO VENDEDOR ──────────────────────────
      const emit = infNFe.emit || {};
      const endEmit = emit.enderEmit || {};
      const vendedor = {
        cnpj:         String(emit.CNPJ || emit.CPF || '').replace(/\D/g, '').padStart(14, '0'),
        cnpjFmt:      formatarCNPJ(emit.CNPJ || emit.CPF || ''),
        nome:         emit.xNome || 'Vendedor não identificado',
        ie:           String(emit.IE || ''),
        logradouro:   endEmit.xLgr || '',
        numero:       endEmit.nro || '',
        complemento:  endEmit.xCpl || '',
        bairro:       endEmit.xBairro || '',
        municipio:    endEmit.xMun || '',
        uf:           endEmit.UF || '',
        cep:          String(endEmit.CEP || '').padStart(8, '0'),
        enderecoCompleto: `${endEmit.xLgr || ''}, ${endEmit.nro || ''}${endEmit.xCpl ? ' - ' + endEmit.xCpl : ''}, ${endEmit.xBairro || ''} - ${endEmit.xMun || ''}/${endEmit.UF || ''}`,
      };

      // ── DADOS DO COMPRADOR ────────────────────────────────
      const dest = infNFe.dest || {};
      const endDest = dest.enderDest || {};
      const comprador = {
        cnpj:         String(dest.CNPJ || dest.CPF || '').replace(/\D/g, '').padStart(14, '0'),
        cnpjFmt:      formatarCNPJ(dest.CNPJ || dest.CPF || ''),
        nome:         dest.xNome || 'Comprador não identificado',
        logradouro:   endDest.xLgr || '',
        numero:       endDest.nro || '',
        complemento:  endDest.xCpl || '',
        bairro:       endDest.xBairro || '',
        municipio:    endDest.xMun || '',
        uf:           endDest.UF || '',
        cep:          String(endDest.CEP || '').padStart(8, '0'),
        enderecoCompleto: `${endDest.xLgr || ''}${endDest.xCpl ? ', ' + endDest.xCpl : ''} - ${endDest.xBairro || ''} - ${endDest.xMun || ''}/${endDest.UF || ''}`,
      };

      // ── PRODUTOS ────────────────────────────────────────────────────
      const detRaw = infNFe.det;
      if (!detRaw) throw new Error('Esta nota não possui itens de produtos (det).');
      
      const detalhes = Array.isArray(detRaw) ? detRaw : [detRaw];
      const produtos = detalhes.map((det, idx) => {
        const prod = det.prod || {};
        return {
          item:        idx + 1,
          descricao:   prod.xProd || 'Produto sem descrição',
          ncm:         String(prod.NCM || ''),
          und:         prod.uCom || 'UN',
          quantidade:  Number(prod.qCom || 0),
          valorUnit:   Number(prod.vUnCom || 0),
          valorTotal:  Number(prod.vProd || 0),
          valorUnitFmt:  formatarMoeda(prod.vUnCom || 0),
          valorTotalFmt: formatarMoeda(prod.vProd || 0),
        };
      });

      return {
        nota,
        vendedor,
        comprador,
        produtos,
        totalProdutos: produtos.length,
      };

  } catch (error) {
      console.error('❌ ERRO NO PARSER XML:', error.message);
      throw new Error(`Falha ao ler XML: ${error.message}`);
  }
}

module.exports = { parseNFe, formatarMoeda, formatarCNPJ, formatarData };
