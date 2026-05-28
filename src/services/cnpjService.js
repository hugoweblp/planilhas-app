const axios = require('axios');

// Cache em memória por worker — sem risco de JSON corrompido em PM2 cluster
const cache = new Map();
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

/**
 * Consulta os dados oficiais do CNPJ via BrasilAPI com Cache em Memória
 */
async function consultarCNPJ(cnpj) {
    const cnpjLimpo = cnpj.replace(/\D/g, '').padStart(14, '0');

    const cached = cache.get(cnpjLimpo);
    if (cached && Date.now() - new Date(cached.atualizado_em).getTime() < TTL_MS) {
        return cached;
    }

    try {
        console.log(`   🌐 Consultando Receita Federal (BrasilAPI) para o CNPJ: ${cnpjLimpo}...`);
        const response = await axios.get(`https://brasilapi.com.br/api/cnpj/v1/${cnpjLimpo}`, { timeout: 8000 });

        const dados = {
            razao_social: response.data.razao_social,
            nome_fantasia: response.data.nome_fantasia || response.data.razao_social,
            logradouro: response.data.logradouro,
            numero: response.data.numero,
            bairro: response.data.bairro,
            cep: response.data.cep,
            municipio: response.data.municipio,
            uf: response.data.uf,
            atualizado_em: new Date().toISOString()
        };

        cache.set(cnpjLimpo, dados);
        return dados;
    } catch (error) {
        console.log(`   ⚠️ Não foi possível obter dados da API para o CNPJ ${cnpjLimpo} (${error.message}). Usando dados da nota.`);
        return null;
    }
}

module.exports = { consultarCNPJ };
