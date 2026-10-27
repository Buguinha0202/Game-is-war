param (
    [string]$Message = "Checkpoint automatico"
)

# 1. Garante que .env e segredos nao sejam adicionados
git add -A :!*.env :!*.env.* :!*.pem :!credentials.json

# 2. Executa o commit se houver alteracoes
$status = git status --porcelain
if ($status) {
    git commit -m "Checkpoint: $Message"
    Write-Host "[OK] Checkpoint gravado com sucesso: $Message" -ForegroundColor Green
    [System.Console]::Beep(1000, 150)
} else {
    Write-Host "[INFO] Nenhuma alteracao pendente para checkpoint." -ForegroundColor Yellow
}
