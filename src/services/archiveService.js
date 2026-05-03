const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

/**
 * Serviço responsável por organizar pastas e gerar arquivos ZIP
 */
class ArchiveService {
    
    /**
     * Cria a estrutura de pastas organizada: output/Escola/Ano-Mes
     */
    static garantirPastaDestino(escolaNome, dataEmissao) {
        // Extrai Ano e Mês (YYYY-MM)
        const anoMes = dataEmissao.substring(0, 7); 
        const nomeLimpo = escolaNome.replace(/[/\\?%*:|"<>]/g, '').trim();
        
        const caminhoBase = path.join(__dirname, '../../output', nomeLimpo, anoMes);
        
        if (!fs.existsSync(caminhoBase)) {
            fs.mkdirSync(caminhoBase, { recursive: true });
        }
        
        return caminhoBase;
    }

    /**
     * Gera um arquivo ZIP contendo o Excel e o Word
     */
    static async gerarKitZip(caminhoExcel, caminhoWord, nomeBase) {
        const zip = new AdmZip();
        const nomeZip = `${nomeBase}.zip`;
        const caminhoZip = path.join(path.dirname(caminhoExcel), nomeZip);

        // Adiciona os arquivos ao ZIP
        zip.addLocalFile(caminhoExcel);
        zip.addLocalFile(caminhoWord);

        // Escreve o arquivo no disco
        zip.writeZip(caminhoZip);

        return {
            nome: nomeZip,
            caminho: caminhoZip
        };
    }

    /**
     * Limpa arquivos temporários da pasta uploads
     */
    static limparUpload(caminhoArquivo) {
        try {
            if (fs.existsSync(caminhoArquivo)) {
                fs.unlinkSync(caminhoArquivo);
            }
        } catch (err) {
            console.error('Erro ao limpar upload:', err.message);
        }
    }
}

module.exports = ArchiveService;
