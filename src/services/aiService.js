const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Modelos em ordem de fallback
const MODELOS = [
    "gemini-2.5-flash-lite",
    "gemma-3-4b-it",
    "gemma-3-12b-it",
];

async function chamarIA(prompt) {
    let ultimoErro;
    for (const nomeModelo of MODELOS) {
        try {
            const model = genAI.getGenerativeModel({ model: nomeModelo });
            const result = await model.generateContent(prompt);
            const text = result.response.text();
            console.log(`✅ IA respondeu usando: ${nomeModelo}`);
            return text;
        } catch (error) {
            const status = error.status || error.code;
            console.warn(`⚠️ Modelo ${nomeModelo} falhou (${status}): ${error.message}`);
            ultimoErro = error.message;
        }
    }
    throw new Error(`Todos os modelos falharam. Último erro: ${ultimoErro}`);
}

async function humanizarDadosIA(nomeOriginal, enderecoOriginal) {
    const prompt = `
        Você é um assistente especialista em documentos escolares do PDDE no Brasil.
        Crie 3 variações naturais para o nome e o endereço da escola.
        NOME: ${nomeOriginal} | ENDEREÇO: ${enderecoOriginal}
        Retorne estritamente um JSON: {"nomes": ["V1","V2","V3"], "enderecos": ["V1","V2","V3"]}
        Retorne APENAS o JSON, sem markdown ou texto extra.
    `;
    const resultado = await chamarIA(prompt);
    return JSON.parse(resultado.replace(/```json|```/g, "").trim());
}

async function humanizarCampoIA(textoOriginal, jaGeradas = []) {
    const avisoRepetir = jaGeradas.length > 0
        ? `\nJÁ FORAM SUGERIDAS ESTAS VARIAÇÕES — NÃO REPITA NENHUMA DELAS:\n${jaGeradas.map((v, i) => `${i + 1}. ${v}`).join('\n')}\n`
        : '';

    const prompt = `Você é especialista em documentos PDDE brasileiros.
Gere 3 variações INÉDITAS do texto abaixo mantendo EXATAMENTE as mesmas informações, apenas variando o formato.
REGRAS ESTRITAS:
- Para NOMES DE ESCOLA: varie entre estas formas:
  * Sigla com iniciais de cada palavra (ex: "Escola Municipal Ensino Fundamental" → "E.M.E.F." ou "EMEF")
  * Abreviações parciais (Prof. vs Professor, Esc. Mun. vs Escola Municipal)
  * Capitalização (TUDO MAIÚSCULO vs Capitalizado vs misturado)
  * Mistura de sigla + nome próprio (ex: "EMEF Prof. João da Silva")
- Para ENDEREÇOS: varie "Av." vs "Avenida", "nº" vs "n." vs sem prefixo, com/sem vírgulas e traços entre partes
- NUNCA invente, remova ou troque dados reais (nome, número, cidade, bairro)
- Cada variação deve parecer escrita por uma pessoa diferente
${avisoRepetir}TEXTO ORIGINAL: "${textoOriginal}"
Retorne APENAS JSON válido, sem markdown: {"variacoes": ["Variação 1", "Variação 2", "Variação 3"]}`;

    const resultado = await chamarIA(prompt);
    const parsed = JSON.parse(resultado.replace(/```json|```/g, "").trim());
    return parsed.variacoes;
}

module.exports = { humanizarDadosIA, humanizarCampoIA };
