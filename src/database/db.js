const mysql  = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config({ path: require('path').join(__dirname, '../../.env') });

/**
 * CONFIGURAÇÃO DO BANCO DE DADOS MYSQL (HOSTINGER)
 */
const db = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: '-03:00'
});

if (process.env.NODE_ENV !== 'production') {
    console.log(`📡 Tentando conexão: ${process.env.DB_HOST || '127.0.0.1'} | Banco: ${process.env.DB_NAME}`);
}

/**
 * Inicializa as tabelas do sistema na nuvem
 */
async function inicializarBanco() {
    const queries = [
        // 1. Tabela de Inquilinos (As Empresas Contratantes que pagam o SaaS)
        `CREATE TABLE IF NOT EXISTS empresas_contratantes (
            cnpj VARCHAR(20) PRIMARY KEY,
            razao_social TEXT,
            plano_vagas INT DEFAULT 2,
            email_gestor VARCHAR(100),
            status_assinatura VARCHAR(20) DEFAULT 'ativo',
            validade_assinatura DATE NULL,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,

        // 2. Tabela de Escolas (Os Clientes dos seus Inquilinos)
        `CREATE TABLE IF NOT EXISTS escolas (
            cnpj VARCHAR(20),
            razao_social TEXT,
            nome_fantasia TEXT,
            logradouro TEXT,
            numero TEXT,
            bairro TEXT,
            municipio TEXT,
            uf TEXT,
            cep TEXT,
            empresa_dona_cnpj VARCHAR(20),
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (cnpj, empresa_dona_cnpj)
        )`,

        // 3. Tabela de Notas (Com trava de duplicatas por Número + Série + Escola + Vendedor)
        `CREATE TABLE IF NOT EXISTS notas (
            chave VARCHAR(60),
            numero VARCHAR(20),
            serie VARCHAR(10),
            data_emissao TEXT,
            valor_total DOUBLE,
            cnpj_vendedor VARCHAR(20),
            cnpj_escola VARCHAR(20),
            status VARCHAR(20) DEFAULT 'PENDENTE',
            arquivo_excel TEXT,
            arquivo_word TEXT,
            signature_token TEXT,
            recebedor_nome TEXT,
            recebedor_cpf TEXT,
            recebedor_whatsapp TEXT,
            assinatura_path TEXT,
            gerado_qtd INT DEFAULT 1,
            impresso_qtd INT DEFAULT 0,
            entregue_qtd INT DEFAULT 0,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
            assinada_em DATETIME NULL,
            UNIQUE KEY uk_nota_completa (numero, serie, cnpj_vendedor, cnpj_escola),
            PRIMARY KEY (chave, cnpj_vendedor)
        )`,

        // 4. Tabela de Entregas (Histórico de Assinaturas)
        `CREATE TABLE IF NOT EXISTS entregas (
            id INT AUTO_INCREMENT PRIMARY KEY,
            chave_nota VARCHAR(60),
            data_entrega TEXT,
            recebido_por TEXT,
            selfie_path TEXT,
            signature_path TEXT,
            observacao TEXT
        )`,

        // 5. Tabela de Usuários (Com vínculo de Tenant, e-mail do Google e RBAC JSON)
        `CREATE TABLE IF NOT EXISTS usuarios (
            id INT AUTO_INCREMENT PRIMARY KEY,
            usuario VARCHAR(50) UNIQUE,
            email VARCHAR(100) UNIQUE,
            senha TEXT,
            nome TEXT,
            empresa_cnpj VARCHAR(20),
            nivel VARCHAR(20) DEFAULT 'operador',
            permissoes TEXT,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,

        // 6. Histórico de Ações
        `CREATE TABLE IF NOT EXISTS historico_acoes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            chave_nota VARCHAR(60),
            tipo_acao VARCHAR(50),
            detalhes TEXT,
            data_hora DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_chave (chave_nota)
        )`,

        // 7. Códigos Temporários de Acesso (Fase 2 - Universal)
        `CREATE TABLE IF NOT EXISTS auth_codes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            email VARCHAR(100),
            cnpj VARCHAR(20),
            code VARCHAR(64),
            expires_at DATETIME,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_email_code (email, code)
        )`
    ];

    try {
        for (let sql of queries) {
            await db.execute(sql);
        }

        // --- MIGRATION PREVENTIVA (Alters para nuvens que já tinham a tabela antiga) ---
        const alters = [
            "ALTER TABLE empresas_contratantes ADD COLUMN email_gestor VARCHAR(100)",
            "ALTER TABLE empresas_contratantes ADD COLUMN vagas_ocupadas INT DEFAULT 0",
            // 🔒 Fase 2: Coluna de faturamento e validade
            "ALTER TABLE empresas_contratantes ADD COLUMN validade_assinatura DATE NULL",
            "ALTER TABLE empresas_contratantes ADD COLUMN valor_mensalidade DECIMAL(10,2) DEFAULT 497.00",
            "ALTER TABLE usuarios ADD COLUMN email VARCHAR(100) UNIQUE",
            "ALTER TABLE usuarios ADD COLUMN empresa_cnpj VARCHAR(20)",
            "ALTER TABLE usuarios ADD COLUMN permissoes TEXT",
            "ALTER TABLE escolas ADD COLUMN empresa_dona_cnpj VARCHAR(20)",
            // 🔒 Fase 1: Coluna de empresa_cnpj no histórico de ações
            "ALTER TABLE historico_acoes ADD COLUMN empresa_cnpj VARCHAR(20) NULL",
            "ALTER TABLE empresas_contratantes ADD COLUMN observacoes TEXT NULL",
            "ALTER TABLE empresas_contratantes ADD COLUMN contato_nome VARCHAR(100) NULL",
            "ALTER TABLE empresas_contratantes ADD COLUMN contato_telefone VARCHAR(30) NULL",
            // Fase 5: expiração de token de assinatura (48h)
            "ALTER TABLE notas ADD COLUMN signature_token_expira_em DATETIME NULL DEFAULT NULL",
            // Controle Granular: módulos ativos por empresa (JSON: { word: true, ia_gemini: true })
            "ALTER TABLE empresas_contratantes ADD COLUMN modulos_ativos JSON NULL",
            // Fase 5: ENUM no status da nota (garante integridade de dados)
            "ALTER TABLE notas MODIFY COLUMN status ENUM('PENDENTE','ASSINADO','REENTREGAR') DEFAULT 'PENDENTE'",
            // Fase 5: Foreign Keys (integridade referencial)
            "ALTER TABLE usuarios ADD CONSTRAINT fk_usuarios_empresa FOREIGN KEY (empresa_cnpj) REFERENCES empresas_contratantes(cnpj) ON DELETE SET NULL",
            // FK removida — causava INSERT silencioso quando empresa ainda nao existia no momento do upload
            // "ALTER TABLE escolas ADD CONSTRAINT fk_escolas_empresa FOREIGN KEY (empresa_dona_cnpj) REFERENCES empresas_contratantes(cnpj) ON DELETE CASCADE",
            "ALTER TABLE notas ADD CONSTRAINT fk_notas_vendedor FOREIGN KEY (cnpj_vendedor) REFERENCES empresas_contratantes(cnpj) ON DELETE RESTRICT",
            // Auditoria IV: rastrear tentativas falhas de OTP para bloquear após 3 erros
            "ALTER TABLE auth_codes ADD COLUMN tentativas INT DEFAULT 0",
            // Auditoria IV: migrar data_emissao de TEXT para DATE (permite ORDER BY e range queries corretas)
            "ALTER TABLE notas MODIFY COLUMN data_emissao DATE",
            // Compatibilidade banco antigo: criado_em pode não existir nas tabelas legadas
            "ALTER TABLE empresas_contratantes ADD COLUMN criado_em DATETIME DEFAULT CURRENT_TIMESTAMP",
            "ALTER TABLE usuarios ADD COLUMN criado_em DATETIME DEFAULT CURRENT_TIMESTAMP",
            "ALTER TABLE notas ADD COLUMN criado_em DATETIME DEFAULT CURRENT_TIMESTAMP",
            // Compatibilidade: status_assinatura pode não existir
            "ALTER TABLE empresas_contratantes ADD COLUMN status_assinatura VARCHAR(20) DEFAULT 'ativo'",
            // Compatibilidade: plano_vagas pode não existir
            "ALTER TABLE empresas_contratantes ADD COLUMN plano_vagas INT DEFAULT 2",
            // Compatibilidade banco antigo: colunas de assinatura e contagem
            "ALTER TABLE notas ADD COLUMN assinada_em DATETIME NULL",
            "ALTER TABLE notas ADD COLUMN assinatura_path TEXT NULL",
            "ALTER TABLE notas ADD COLUMN signature_token TEXT NULL",
            "ALTER TABLE notas ADD COLUMN recebedor_nome TEXT NULL",
            "ALTER TABLE notas ADD COLUMN recebedor_cpf TEXT NULL",
            "ALTER TABLE notas ADD COLUMN recebedor_whatsapp TEXT NULL",
            "ALTER TABLE notas ADD COLUMN gerado_qtd INT DEFAULT 1",
            "ALTER TABLE notas ADD COLUMN impresso_qtd INT DEFAULT 0",
            "ALTER TABLE notas ADD COLUMN entregue_qtd INT DEFAULT 0",
            "ALTER TABLE notas ADD COLUMN arquivo_word TEXT NULL",
            "ALTER TABLE escolas ADD COLUMN municipio VARCHAR(100) NULL",
            // 2FA + Auditoria Completa
            "ALTER TABLE historico_acoes ADD COLUMN usuario_id INT NULL",
            "ALTER TABLE historico_acoes ADD COLUMN usuario_nome VARCHAR(100) NULL",
            "ALTER TABLE historico_acoes ADD COLUMN usuario_nivel VARCHAR(20) NULL",
            "ALTER TABLE historico_acoes ADD COLUMN ip_address VARCHAR(45) NULL",
            "ALTER TABLE escolas ADD COLUMN uf VARCHAR(5) NULL",
            // Fix crítico: coluna code estava VARCHAR(10), truncava hash SHA-256 de 64 chars
            "ALTER TABLE auth_codes MODIFY COLUMN code VARCHAR(64)"
        ];
        for (let alterSql of alters) {
            try {
                await db.execute(alterSql);
            } catch (e) {
                // Se a coluna já existir na Hostinger, ignora silenciosamente
            }
        }
        // -------------------------------------------------------------------------------

        // Empresa de homologação removida — o dono do SaaS acessa pela Sala Central

        // --- FASE 1 & 2: Otimização de Índices (Alta Performance e Relacionamentos) ---
        const indices = [
            'CREATE INDEX idx_notas_cnpj_escola ON notas (cnpj_escola)',
            'CREATE INDEX idx_notas_data_emissao ON notas (data_emissao)',
            'CREATE INDEX idx_notas_status ON notas (status)',
            'CREATE INDEX idx_usuarios_empresa ON usuarios (empresa_cnpj)',
            'CREATE INDEX idx_escolas_dona ON escolas (empresa_dona_cnpj)',
            'CREATE INDEX idx_notas_signature_token ON notas (signature_token(32))',
            'CREATE INDEX idx_empresas_email_gestor ON empresas_contratantes (email_gestor)',
            'CREATE INDEX idx_historico_empresa ON historico_acoes (empresa_cnpj)',
            'CREATE INDEX idx_historico_data ON historico_acoes (data_hora)'
        ];

        for (let idxSql of indices) {
            try {
                await db.execute(idxSql);
            } catch (e) {
                if (e.code !== 'ER_DUP_KEYNAME') {
                    console.log('⚠️ Info Índice:', e.message);
                }
            }
        }
        // --------------------------------------------------------

        // --- FASE 5: MySQL Event Scheduler — Limpeza Automática ---
        try {
            await db.execute("SET GLOBAL event_scheduler = ON");

            await db.execute(`
                CREATE EVENT IF NOT EXISTS evt_limpar_auth_codes
                ON SCHEDULE EVERY 1 HOUR
                DO DELETE FROM auth_codes WHERE expires_at < NOW()
            `);

            await db.execute(`
                CREATE EVENT IF NOT EXISTS evt_limpar_historico_antigo
                ON SCHEDULE EVERY 1 DAY
                STARTS (DATE(NOW()) + INTERVAL 1 DAY + INTERVAL 3 HOUR)
                DO DELETE FROM historico_acoes WHERE data_hora < DATE_SUB(NOW(), INTERVAL 90 DAY)
            `);

            console.log('🕐 MySQL Event Scheduler ativado (limpeza automática de auth_codes e historico_acoes).');
        } catch (e) {
            console.warn('⚠️ Event Scheduler não habilitado (requer privilégio SUPER na Hostinger):', e.message);
        }
        // ----------------------------------------------------------

        // Cria admin APENAS se ADMIN_PASSWORD estiver definido no .env — nunca senha hardcoded.
        // Usa INSERT IGNORE para ser idempotente em PM2 cluster (race condition segura).
        const adminPass = process.env.ADMIN_PASSWORD;
        if (adminPass) {
            const adminHash = await bcrypt.hash(adminPass, 12);
            const [result] = await db.execute(
                'INSERT IGNORE INTO usuarios (usuario, senha, nome, nivel) VALUES (?, ?, ?, ?)',
                ['admin', adminHash, 'Administrador', 'admin']
            );
            if (result.affectedRows > 0) {
                console.log('👤 Usuário Admin criado a partir de ADMIN_PASSWORD do .env.');
            }
        }

        console.log('✅ Conectado ao MySQL. Estrutura pronta para Triangulação B2B2G.');
    } catch (error) {
        console.error('❌ FATAL: Erro na inicialização do MySQL:', error.message);
        process.exit(1);
    }
}

// Limpeza automática via Node.js (fallback ao MySQL Event Scheduler que exige SUPER na Hostinger)
async function _limparAuthCodes() {
    try {
        const [r] = await db.execute('DELETE FROM auth_codes WHERE expires_at < NOW()');
        if (r.affectedRows > 0) console.log(`🧹 ${r.affectedRows} auth_code(s) expirado(s) removido(s).`);
    } catch (_) {}
}

async function _limparHistoricoAntigo() {
    try {
        const [r] = await db.execute("DELETE FROM historico_acoes WHERE data_hora < DATE_SUB(NOW(), INTERVAL 90 DAY)");
        if (r.affectedRows > 0) console.log(`🧹 ${r.affectedRows} log(s) de auditoria com +90 dias removido(s).`);
    } catch (_) {}
}

function agendarLimpezaAutomatica() {
    _limparAuthCodes();       // imediato no startup
    _limparHistoricoAntigo(); // imediato no startup
    setInterval(_limparAuthCodes,       60 * 60 * 1000);       // a cada 1 hora
    setInterval(_limparHistoricoAntigo, 24 * 60 * 60 * 1000);  // a cada 24 horas
    console.log('⏰ Limpeza automática Node.js agendada (1h auth_codes / 24h logs antigos).');
}

// Helpers unificados para usar o banco com Async/Await
async function dbRun(sql, params = []) {
    const paramsWithNulls = params.map(p => p === undefined ? null : p);
    const [result] = await db.execute(sql, paramsWithNulls);
    return { changes: result.affectedRows, lastID: result.insertId };
}

async function dbGet(sql, params = []) {
    const [rows] = await db.execute(sql, params);
    return rows[0];
}

async function dbAll(sql, params = []) {
    const [rows] = await db.execute(sql, params);
    return rows;
}

module.exports = {
    db,
    inicializarBanco,
    agendarLimpezaAutomatica,
    dbRun,
    dbGet,
    dbAll
};
