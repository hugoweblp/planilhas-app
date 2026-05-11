const { parseNFe } = require('../modules/xmlParser');
const { consultarCNPJ } = require('./cnpjService');
const { gerarParDePercentuais } = require('../modules/excelGenerator');
const { dbRun, dbGet } = require('../database/db');

/**
 * Maestro que processa o XML e prepara os dados para o Front-end
 */
async function prepararPreviewNota(caminhoXML) {
    // 1. Extrai dados básicos do XML (Agora de forma assíncrona)
    const dados = await parseNFe(caminhoXML);

    // 1.1 Verifica se a nota já existe no Banco de Dados
    const notaExistente = await dbGet('SELECT chave FROM notas WHERE chave = ?', [dados.nota.chave]);
    dados.isDuplicada = !!notaExistente;

    // 2. Tenta obter nome oficial e dados extras via API
    const dadosOficiais = await consultarCNPJ(dados.comprador.cnpj);
    if (dadosOficiais) {
        dados.comprador.nomeOriginalXML = dados.comprador.nome;
        dados.comprador.nome = dadosOficiais.razao_social;
        dados.comprador.enderecoAPI = `${dadosOficiais.logradouro}, ${dadosOficiais.numero} - ${dadosOficiais.bairro}`;
    }

    // 3. Calcula os preços para as 3 abas (PADRÃO, BASE 02, BASE 03)
    // Vamos adicionar os preços sorteados no próprio objeto de produtos
    dados.produtos = dados.produtos.map(prod => {
        const { p2, p3 } = gerarParDePercentuais(prod.valorUnit);
        const precoBase = prod.valorUnit;
        
        return {
            ...prod,
            precos: {
                p1: precoBase, // PADRÃO (Original da Nota)
                p2: Number((precoBase * (1 + p2/100)).toFixed(2)), // BASE 02 (+%)
                p3: Number((precoBase * (1 + p3/100)).toFixed(2))  // BASE 03 (+%)
            },
            percentuais: { p2, p3 }
        };
    });

    // 4. Salva a escola no banco (para já ir populando o histórico)
    if (dadosOficiais) {
        await dbRun(`REPLACE INTO escolas 
            (cnpj, razao_social, nome_fantasia, logradouro, numero, bairro, municipio, uf, cep) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
            [dados.comprador.cnpj, dadosOficiais.razao_social, dadosOficiais.nome_fantasia, 
             dadosOficiais.logradouro, dadosOficiais.numero, dadosOficiais.bairro, 
             dadosOficiais.municipio, dadosOficiais.uf, dadosOficiais.cep]);
    }

    return dados;
}

module.exports = { prepararPreviewNota };
