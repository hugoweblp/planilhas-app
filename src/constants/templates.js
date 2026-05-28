'use strict';

const CNPJ_TEMPLATES = Object.freeze({
    '03075858000103': 'recibo_aneto.docx',
    '61333692000184': 'recibo_bom_preco.docx',
    '13306181000120': 'recibo_ras.docx',
    '62329860000120': 'recibo_rcm.docx'
});

const VENDOR_INITIALS = Object.freeze({
    '03075858000103': 'AN',
    '61333692000184': 'BP',
    '13306181000120': 'RS',
    '62329860000120': 'RC'
});

module.exports = { CNPJ_TEMPLATES, VENDOR_INITIALS };
