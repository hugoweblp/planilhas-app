const path = require('path');
const fs   = require('fs');
const { dbGet, dbRun, dbAll } = require('../database/db');
const { encrypt: encryptField } = require('../services/cryptoService');

const ROOT_DIR = path.join(__dirname, '../..');
const isDev    = process.env.NODE_ENV !== 'production';

async function checkAssinatura(cnpj) {
    if (!cnpj) return { ok: false, motivo: 'Empresa não identificada.' };

    const empresa = await dbGet(
        'SELECT status_assinatura, validade_assinatura FROM empresas_contratantes WHERE cnpj = ?',
        [cnpj]
    );

    if (!empresa) return { ok: false, motivo: 'Empresa não encontrada no sistema.' };

    if (empresa.validade_assinatura) {
        const hoje    = new Date(); hoje.setHours(0, 0, 0, 0);
        const validade = new Date(empresa.validade_assinatura); validade.setHours(0, 0, 0, 0);
        if (hoje > validade) {
            await dbRun("UPDATE empresas_contratantes SET status_assinatura = 'expirado' WHERE cnpj = ?", [cnpj]);
            return { ok: false, motivo: 'Assinatura expirada. Entre em contato com o suporte Kitfy para renovar.' };
        }
    }

    if (empresa.status_assinatura !== 'ativo') {
        const msgs = {
            bloqueado: 'Acesso suspenso: Assinatura da instituição foi bloqueada. Entre em contato com o suporte.',
            expirado:  'Assinatura expirada. Entre em contato com o suporte Kitfy para renovar.',
            inativo:   'Conta inativa. Entre em contato com o suporte.'
        };
        return { ok: false, motivo: msgs[empresa.status_assinatura] || 'Assinatura inativa. Entre em contato com o suporte.' };
    }

    return { ok: true };
}

function safeError(err) {
    if (isDev) return err.message;
    return 'Erro interno. Tente novamente ou contate o suporte.';
}

function sanitizeNota(nota) {
    if (!nota) return nota;
    const { recebedor_cpf, recebedor_whatsapp, status_calculado, ...rest } = nota;
    return rest;
}

function getEscolaPath(cnpj, dataISO, cnpjInquilino) {
    const cleanCnpj      = String(cnpj).replace(/\D/g, '').padStart(14, '0');
    const cleanInquilino = String(cnpjInquilino || 'geral').replace(/\D/g, '').padStart(14, '0');
    const date = new Date(dataISO);
    const ano  = date.getUTCFullYear();
    const mes  = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dir  = path.join(ROOT_DIR, 'output', cleanInquilino, cleanCnpj, String(ano), mes);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return { absolute: dir, relative: `/${cleanInquilino}/${cleanCnpj}/${ano}/${mes}` };
}

async function migrarCpfParaCriptografado() {
    try {
        const rows = await dbAll(
            'SELECT chave, cnpj_vendedor, recebedor_cpf, recebedor_whatsapp FROM notas WHERE recebedor_cpf IS NOT NULL OR recebedor_whatsapp IS NOT NULL',
            []
        );
        let migrados = 0;
        for (const row of rows) {
            const cpfNeedsMigration = row.recebedor_cpf       && !row.recebedor_cpf.startsWith('aes256:');
            const waNeedsMigration  = row.recebedor_whatsapp  && !row.recebedor_whatsapp.startsWith('aes256:');
            if (cpfNeedsMigration || waNeedsMigration) {
                await dbRun(
                    'UPDATE notas SET recebedor_cpf = ?, recebedor_whatsapp = ? WHERE chave = ? AND cnpj_vendedor = ?',
                    [
                        cpfNeedsMigration ? encryptField(row.recebedor_cpf)        : row.recebedor_cpf,
                        waNeedsMigration  ? encryptField(row.recebedor_whatsapp)   : row.recebedor_whatsapp,
                        row.chave,
                        row.cnpj_vendedor
                    ]
                );
                migrados++;
            }
        }
        if (migrados > 0) console.log(`🔐 [LGPD] ${migrados} registro(s) migrado(s) para criptografia AES-256.`);
    } catch (e) {
        console.error('❌ [LGPD] Falha na migração de CPF:', e.message);
    }
}

module.exports = { checkAssinatura, safeError, sanitizeNota, getEscolaPath, migrarCpfParaCriptografado, ROOT_DIR };
