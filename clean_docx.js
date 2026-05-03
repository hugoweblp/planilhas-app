const PizZip = require('pizzip');
const fs = require('fs');
const path = require('path');

const tags = ['escola_nome', 'escola_cnpj', 'valor_num', 'valor_extenso', 'nf_numero', 'dia', 'mes', 'ano'];

function cleanXml(xml) {
    let cleaned = xml;
    for (let tag of tags) {
        // Regex mágica para achar a tag mesmo que ela tenha pedaços de código XML ou espaços no meio dela
        let chars = tag.split('').join('(?:<[^>]+>|\\s)*');
        let regexStr = `\\{(?:<[^>]+>|\\s)*\\{(?:<[^>]+>|\\s)*${chars}(?:<[^>]+>|\\s)*\\}(?:<[^>]+>|\\s)*\\}`;
        let regex = new RegExp(regexStr, 'gi');
        
        cleaned = cleaned.replace(regex, `{{${tag}}}`);
    }
    return cleaned;
}

const templatesDir = path.join(__dirname, 'templates');
const files = fs.readdirSync(templatesDir).filter(f => f.endsWith('.docx'));

files.forEach(file => {
    let filePath = path.join(templatesDir, file);
    let content = fs.readFileSync(filePath);
    let zip = new PizZip(content);
    
    let xml = zip.file('word/document.xml').asText();
    let oldLength = xml.length;
    let newXml = cleanXml(xml);
    
    if (oldLength !== newXml.length) {
        zip.file('word/document.xml', newXml);
        fs.writeFileSync(filePath, zip.generate({ type: 'nodebuffer' }));
        console.log(`✅ Arquivo curado e costurado: ${file}`);
    } else {
        console.log(`ℹ️ Nenhuma tag corrompida achada em: ${file}`);
    }
});
