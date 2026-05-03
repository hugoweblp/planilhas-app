const PizZip = require('pizzip');
const fs = require('fs');
const path = require('path');

const tags = ['escola_nome', 'escola_cnpj', 'valor_num', 'valor_extenso', 'nf_numero', 'dia', 'mes', 'ano'];
const templatesDir = path.join(__dirname, 'templates');
const files = fs.readdirSync(templatesDir).filter(f => f.endsWith('.docx'));

files.forEach(file => {
    let filePath = path.join(templatesDir, file);
    let content = fs.readFileSync(filePath);
    let zip = new PizZip(content);
    let xml = zip.file('word/document.xml').asText();
    let oldXml = xml;
    
    for (let tag of tags) {
        // Encontra a tag mesma que o Claude tenha esquecido de colocar 1 ou 2 chaves
        let chars = tag.split('').join('(?:<[^>]+>|\\s)*');
        let regexStr = `\\{+(?:<[^>]+>|\\s)*\\{*(?:<[^>]+>|\\s)*${chars}(?:<[^>]+>|\\s)*\\}+(?:<[^>]+>|\\s)*\\}*`;
        let regex = new RegExp(regexStr, 'gi');
        
        xml = xml.replace(regex, `{{${tag}}}`);
    }
    
    if (oldXml !== xml) {
        zip.file('word/document.xml', xml);
        fs.writeFileSync(filePath, zip.generate({ type: 'nodebuffer' }));
        console.log(`✅ Adicionado faltantes em: ${file}`);
    } else {
        console.log(`ℹ️ Perfeito em: ${file}`);
    }
});
