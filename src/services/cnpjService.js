const axios = require('axios');
const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, '../../data/cnpj_cache.json');

// Garante que a pasta data existe para guardar o cache
const dataDir = path.dirname(CACHE_FILE);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Carrega o cache inicial
let cache = {};
if (fs.existsSync(CACHE_FILE)) {
    try {
        cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    } catch (e) {
        cache = {};
    }
}

/**
 * Consulta os dados oficiais do CNPJ via BrasilAPI com Cache Local
 */
async function consultarCNPJ(cnpj) {
    const cnpjLimpo = cnpj.replace(/\D/g, '').padStart(14, '0');

    // 1. Tenta pegar do Cache local (economiza internet e tempo)
    if (cache[cnpjLimpo]) {
        return cache[cnpjLimpo];
    }

    // 2. Se não estiver no cache, vai na BrasilAPI (Gratuita)
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

        // 3. Salva no Cache para a próxima vez ser instantâneo
        cache[cnpjLimpo] = dados;
        fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
        
        return dados;
    } catch (error) {
        console.log(`   ⚠️ Não foi possível obter dados da API para o CNPJ ${cnpjLimpo} (${error.message}). Usando dados da nota.`);
        return null;
    }
}

module.exports = { consultarCNPJ };
