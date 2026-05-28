const express = require('express');
const path    = require('path');
const fs      = require('fs');
const AdmZip  = require('adm-zip');

const router = express.Router();

const { dbGet, dbAll, dbRun } = require('../database/db');
const { autenticarToken } = require('../middleware/auth');
const { rlsMiddleware } = require('../middleware/rls');
const { safeError, ROOT_DIR } = require('../utils/helpers');

// GET /api/download/:id
router.get('/download/:id', autenticarToken, rlsMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const nota = await dbGet(
            `SELECT arquivo_excel, arquivo_word, status, assinada_em, cnpj_vendedor
             FROM notas WHERE chave = ? ${req.rls.clause('cnpj_vendedor')}`,
            [id, ...req.rls.param()]
        );
        if (!nota) return res.status(404).send('Nota não encontrada.');

        if (nota.status === 'ASSINADO' && nota.assinada_em) {
            const diffMs = new Date() - new Date(nota.assinada_em);
            if (diffMs >= 2 * 60 * 60 * 1000)
                return res.status(403).send('O link de download expirou. Solicite uma nova assinatura.');
        } else if (nota.status !== 'ASSINADO') {
            return res.status(403).send('Nota não assinada.');
        }

        const zip = new AdmZip();
        let adicionouAlgo = false;

        if (nota.arquivo_excel) {
            const excelPath = path.join(ROOT_DIR, 'output', nota.arquivo_excel.replace('/output/', ''));
            if (fs.existsSync(excelPath)) { zip.addLocalFile(excelPath); adicionouAlgo = true; }
        }
        if (nota.arquivo_word) {
            const wordPath = path.join(ROOT_DIR, 'output', nota.arquivo_word.replace('/output/', ''));
            if (fs.existsSync(wordPath)) { zip.addLocalFile(wordPath); adicionouAlgo = true; }
        }

        if (!adicionouAlgo) return res.status(404).send('Arquivos físicos não encontrados no servidor.');

        res.set('Content-Type', 'application/zip');
        res.set('Content-Disposition', `attachment; filename="KIT_PDDE_${id.substring(0, 10)}.zip"`);
        res.send(zip.toBuffer());
    } catch (error) {
        console.error('Erro no download:', error);
        res.status(500).send('Erro interno ao gerar o download.');
    }
});

// POST /api/download-bulk (evita chaves de NF-e em query string e logs de acesso)
router.post('/download-bulk', autenticarToken, rlsMiddleware, async (req, res) => {
    try {
        const chaves = req.body?.chaves;
        if (!chaves || !Array.isArray(chaves) || chaves.length === 0)
            return res.status(400).send('Nenhuma nota especificada.');
        if (chaves.length > 100) return res.status(400).send('Máximo de 100 notas por lote.');

        const ids = chaves;
        const placeholders = ids.map(() => '?').join(',');
        const notas = await dbAll(
            `SELECT * FROM notas WHERE chave IN (${placeholders}) ${req.rls.clause('cnpj_vendedor')}`,
            [...ids, ...req.rls.param()]
        );
        if (notas.length === 0) return res.status(404).send('Notas não encontradas.');

        const zip = new AdmZip();
        let adicionouAlgo = false;

        for (const nota of notas) {
            if (nota.status === 'ASSINADO' && nota.assinada_em) {
                if (new Date() - new Date(nota.assinada_em) >= 2 * 60 * 60 * 1000)
                    return res.status(403).send(`A nota ${nota.numero} expirou. Solicite uma nova assinatura do lote.`);
            } else if (nota.status !== 'ASSINADO') {
                return res.status(403).send(`A nota ${nota.numero} ainda não foi assinada.`);
            }

            const folderName = `NF-${nota.numero}`;
            if (nota.arquivo_excel) {
                const p = path.join(ROOT_DIR, 'output', nota.arquivo_excel.replace('/output/', ''));
                if (fs.existsSync(p)) { zip.addLocalFile(p, folderName); adicionouAlgo = true; }
            }
            if (nota.arquivo_word) {
                const p = path.join(ROOT_DIR, 'output', nota.arquivo_word.replace('/output/', ''));
                if (fs.existsSync(p)) { zip.addLocalFile(p, folderName); adicionouAlgo = true; }
            }
        }

        if (!adicionouAlgo) return res.status(404).send('Nenhum arquivo encontrado para download.');

        const updatePlaceholders = ids.map(() => '?').join(',');
        await dbRun(
            `UPDATE notas SET impresso_qtd = impresso_qtd + 1 WHERE chave IN (${updatePlaceholders}) ${req.rls.clause('cnpj_vendedor')}`,
            [...ids, ...req.rls.param()]
        );

        res.set('Content-Type', 'application/zip');
        res.set('Content-Disposition', `attachment; filename=LOTE_PDDE_${Date.now()}.zip`);
        res.send(zip.toBuffer());
    } catch (error) {
        res.status(500).send(safeError(error));
    }
});

module.exports = router;
