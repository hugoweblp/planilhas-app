@echo off
TITLE PDDE Control - Inicializador Automático
CHCP 65001 > nul

echo ======================================================
echo           🚀 INICIALIZANDO PDDE CONTROL
echo ======================================================
echo.

:: 1. Verifica se o Node.js está instalado
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] Node.js não encontrado! Por favor, instale o Node.js para continuar.
    pause
    exit
)

:: 2. Verifica se a pasta node_modules existe, se não, instala
if not exist "node_modules\" (
    echo [INFO] Instalando dependências (primeira execução)...
    npm install
)

:: 3. Abre o navegador automaticamente após 3 segundos
echo [INFO] Abrindo o painel no navegador...
start http://localhost:3000

:: 4. Inicia o servidor
echo [SUCESSO] Servidor rodando em http://localhost:3000
echo [DICA] Mantenha esta janela aberta enquanto estiver usando o sistema.
echo.
node index.js

pause
