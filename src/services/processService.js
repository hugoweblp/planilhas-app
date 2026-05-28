const { parseNFe } = require('../modules/xmlParser');
const { consultarCNPJ } = require('./cnpjService');
const { gerarParDePercentuais } = require('../modules/excelGenerator');
const { dbRun, dbGet } = require('../database/db');

/**
 * Maestro que processa o XML e prepara os dados para o Front-end.
 * @param {string} caminhoXML - caminho do arquivo XML
 * @param {string} empresaCnpj - CNPJ do inquilino dono da operação (obrigatório para multi-tenant)
 */
async function prepararPreviewNota(caminhoXML, empresaCnpj) {
    if (!empresaCnpj) throw new Error('empresaCnpj é obrigatório. Administrador sem empresa vinculada não pode processar notas.');
    const dados = await parseNFe(caminhoXML);

    // Verifica duplicata filtrando pelo inquilino (RLS)
    const notaExistente = await dbGet(
        'SELECT chave FROM notas WHERE chave = ? AND cnpj_vendedor = ?',
        [dados.nota.chave, empresaCnpj]
    );
    dados.isDuplicada = !!notaExistente;

    const dadosOficiais = await consultarCNPJ(dados.comprador.cnpj);
    if (dadosOficiais) {
        dados.comprador.nomeOriginalXML = dados.comprador.nome;
        dados.comprador.nome = dadosOficiais.razao_social || dados.comprador.nome;
        const log = dadosOficiais.logradouro || '';
        const num = dadosOficiais.numero     || '';
        const bai = dadosOficiais.bairro     || '';
        const base = [log, num].filter(Boolean).join(', ');
        dados.comprador.enderecoAPI = base + (bai ? ` - ${bai}` : '') || 'Endereço não disponível';
    }

    dados.produtos = dados.produtos.map(prod => {
        const { p2, p3 } = gerarParDePercentuais(prod.valorUnit);
        const precoBase = prod.valorUnit;
        return {
            ...prod,
            precos: {
                p1: precoBase,
                p2: Number((precoBase * (1 + p2/100)).toFixed(2)),
                p3: Number((precoBase * (1 + p3/100)).toFixed(2))
            },
            percentuais: { p2, p3 }
        };
    });

    // Salva escola vinculada ao inquilino (RLS — sem empresa_dona_cnpj a escola fica órfã)
    if (dadosOficiais && empresaCnpj) {
        await dbRun(
            `INSERT IGNORE INTO escolas
             (cnpj, razao_social, nome_fantasia, logradouro, numero, bairro, municipio, uf, cep, empresa_dona_cnpj)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [dados.comprador.cnpj, dadosOficiais.razao_social, dadosOficiais.nome_fantasia,
             dadosOficiais.logradouro, dadosOficiais.numero, dadosOficiais.bairro,
             dadosOficiais.municipio, dadosOficiais.uf, dadosOficiais.cep, empresaCnpj]
        );
    }

    return dados;
}

module.exports = { prepararPreviewNota };
