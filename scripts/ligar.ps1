# Liga o Painel do Freelance sem janela nenhuma e, com -Abrir, abre no navegador.
# É o que roda quando o Windows inicia e quando se clica no atalho da área de trabalho.
# Se o painel já está ligado, só abre o navegador. Antes de ligar, traz a versão nova
# do código, se o PC estiver no ramo main e sem mudanças por fazer.

param([switch]$Abrir)

$projeto = Split-Path -Parent $PSScriptRoot
$porta = 5180
$endereco = "http://localhost:$porta"
$registro = Join-Path $projeto 'dados\servidor.log'

function Ligado {
  $cliente = New-Object System.Net.Sockets.TcpClient
  try { return $cliente.ConnectAsync('127.0.0.1', $porta).Wait(500) } catch { return $false } finally { $cliente.Dispose() }
}

function Anotar($texto) {
  try { Add-Content -Path $registro -Value "$(Get-Date -Format 'dd/MM/yyyy HH:mm:ss') $texto" -Encoding UTF8 } catch { }
}

if (-not (Ligado)) {
  Set-Location $projeto
  New-Item -ItemType Directory -Force (Join-Path $projeto 'dados') | Out-Null

  # Código novo no GitHub: atualiza, mas só num PC que não está no meio de uma mudança.
  $ramo = git rev-parse --abbrev-ref HEAD 2>$null
  $pendente = git status --porcelain 2>$null
  if ($ramo -eq 'main' -and -not $pendente) {
    $antes = git rev-parse HEAD 2>$null
    git pull --ff-only -q 2>$null | Out-Null
    $depois = git rev-parse HEAD 2>$null
    if ($antes -ne $depois) {
      Anotar "código atualizado de $antes para $depois"
      cmd /c "npm install --no-audit --no-fund >> `"$registro`" 2>&1"
      cmd /c "npm run build >> `"$registro`" 2>&1"
    }
  }
  if (-not (Test-Path (Join-Path $projeto 'node_modules'))) { cmd /c "npm install --no-audit --no-fund >> `"$registro`" 2>&1" }
  if (-not (Test-Path (Join-Path $projeto 'dist\index.html'))) { cmd /c "npm run build >> `"$registro`" 2>&1" }

  $node = (Get-Command node -ErrorAction SilentlyContinue).Source
  if (-not $node) {
    Anotar 'não achei o Node. Rode o instalar.cmd de novo.'
    exit 1
  }
  Anotar 'ligando o painel'
  Start-Process -FilePath $node -ArgumentList 'src\servidor\index.ts' -WorkingDirectory $projeto -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $projeto 'dados\servidor-saida.log') -RedirectStandardError (Join-Path $projeto 'dados\servidor-erros.log')

  for ($i = 0; $i -lt 40 -and -not (Ligado); $i++) { Start-Sleep -Milliseconds 500 }
  if (-not (Ligado)) { Anotar 'o painel não ligou; veja dados\servidor-erros.log' }
}

if ($Abrir) { Start-Process $endereco }
