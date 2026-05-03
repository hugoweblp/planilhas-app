const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');

const templatesDir = path.join(__dirname, 'templates');

// Mapeamento de o que procurar em cada arquivo (com base no que você me mandou)
const mapeamento = {
    'recibo_aneto.docx': {
        'C E E M E F SÃO LUIZ DE GONZAGA': '{{escola_nome}}',
        '22.721.582/0001-38': '{{escola_cnpj}}',
        '1.527,50': '{{valor_num}}',
        'mil e quinhentos e vinte e sete reais e cinquenta centavos': '{{valor_extenso}}',
        '6688': '{{nf_numero}}',
        '29': '{{dia}}',
        'setembro': '{{mes}}',
        '2025': '{{ano}}'
    },
    'recibo_bom_preco.docx': {
        'MUNICIO DE OBIDOS - SEURBI': '{{escola_nome}}',
        '05.131.180/0001-64': '{{escola_cnpj}}',
        '5.246,00': '{{valor_num}}',
        'cinco mil e duzentos e quarenta e seis reais': '{{valor_extenso}}',
        '83': '{{nf_numero}}',
        '24': '{{dia}}',
        'fevereiro': '{{mes}}',
        '2026': '{{ano}}'
    },
    'recibo_ras.docx': {
        'CONSELHO ESCOLAR DA ESCOLA MUNICIPAL SÃO SEBASTIÃO': '{{escola_nome}}',
        '01.917.216/0001-89': '{{escola_cnpj}}',
        '24.000,00': '{{valor_num}}',
        'vinte e quatro mil reais': '{{valor_extenso}}',
        '2919': '{{nf_numero}}',
        '07': '{{dia}}',
        'abril': '{{mes}}',
        '2025': '{{ano}}'
    },
    'recibo_rcm.docx': {
        'CEEMEIEF FRANCISCO ALENCAR': '{{escola_nome}}',
        '04.482.513/0001-37': '{{escola_cnpj}}',
        '650,00': '{{valor_num}}',
        'seiscentos e cinquenta reais': '{{valor_extenso}}',
        '14': '{{nf_numero}}',
        '06': '{{dia}}',
        'novembro': '{{mes}}',
        '2025': '{{ano}}'
    }
};

function preparar() {
    console.log('🛠️ Iniciando preparação automática dos templates Word...');

    Object.keys(mapeamento).forEach(filename => {
        const filePath = path.join(templatesDir, filename);
        if (!fs.existsSync(filePath)) {
            console.log(`⚠️ Arquivo não encontrado: ${filename}`);
            return;
        }

        const content = fs.readFileSync(filePath);
        const zip = new PizZip(content);
        
        // O texto principal fica nesse XML dentro do docx
        let xmlContent = zip.file('word/document.xml').asText();

        // Faz as substituições
        const trocas = mapeamento[filename];
        let totalTrocas = 0;
        Object.keys(trocas).forEach(original => {
            if (xmlContent.includes(original)) {
                // Regex simples para trocar todas as ocorrências
                const regex = new RegExp(original, 'g');
                xmlContent = xmlContent.replace(regex, trocas[original]);
                totalTrocas++;
            }
        });

        // Salva de volta no ZIP e grava o arquivo
        zip.file('word/document.xml', xmlContent);
        const buffer = zip.generate({ type: 'nodebuffer' });
        fs.writeFileSync(filePath, buffer);

        console.log(`✅ ${filename}: ${totalTrocas} etiquetas inseridas.`);
    });

    console.log('\n✨ Todos os templates estão prontos para automação!');
}

preparar();
