const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

async function enviarCodigoAcesso(email, codigo) {
    // Se não tiver credenciais, não envia para evitar crash do servidor (apenas loga no console)
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.error('[CRÍTICO] SMTP não configurado — código NÃO foi enviado! Configure SMTP_USER e SMTP_PASS no .env.');
        return true;
    }

    const mailOptions = {
        from: `"Acesso Seguro - PDDE Control" <${process.env.SMTP_USER}>`,
        to: email,
        subject: 'Seu Código de Acesso',
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; text-align: center; color: #333; max-width: 600px; margin: 0 auto; background: #fff; border: 1px solid #eaeaea; border-radius: 8px;">
                <h2 style="color: #1a56db;">Seu código de acesso</h2>
                <p>Use o código abaixo para entrar no painel do sistema. Ele é válido por <strong>5 minutos</strong>.</p>
                <div style="margin: 30px auto; padding: 15px; font-size: 28px; font-weight: bold; background-color: #f3f4f6; color: #111827; border-radius: 8px; width: fit-content; letter-spacing: 5px;">
                    ${codigo}
                </div>
                <p style="font-size: 0.9rem; color: #6b7280; margin-top: 40px;">
                    Se você não solicitou este acesso, ignore ou descarte este e-mail.
                </p>
            </div>
        `
    };

    return transporter.sendMail(mailOptions);
}

module.exports = { enviarCodigoAcesso };
