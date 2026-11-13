# Instala o Painel do Freelance neste PC, do zero ou por cima de uma instalação antiga.
# Pode rodar quantas vezes quiser: o que já está feito fica como está.
#
# PC novo, num PowerShell (baixa este arquivo e roda):
#   irm https://raw.githubusercontent.com/luizhenriqueperinif/painel-freelance/main/scripts/instalar.ps1 -OutFile $env:TEMP\instalar.ps1; powershell -ExecutionPolicy Bypass -File $env:TEMP\instalar.ps1
# PC que já tem o código: dois cliques no instalar.cmd.
#
# Senha e login do GitHub quem digita é a pessoa, na janela do próprio git. Este script não vê nada disso.

$ErrorActionPreference = 'Continue'
$CODIGO = 'https://github.com/luizhenriqueperinif/painel-freelance.git'

function Passo($texto) { Write-Host ''; Write-Host "== $texto" -ForegroundColor Cyan }
function Pare($texto) { Write-Host ''; Write-Host $texto -ForegroundColor Red; Read-Host 'Aperte Enter para fechar'; exit 1 }
function Tem($comando) { [bool](Get-Command $comando -ErrorAction SilentlyContinue) }
function RecarregarPath { $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') }

function Instalar($nome, $idDoWinget) {
  if (-not (Tem winget)) { Pare "Falta o $nome. Instale pelo site oficial e rode este instalador de novo." }
  $resposta = Read-Host "Falta o $nome. Posso instalar agora pelo winget, da Microsoft? (s/n)"
  if ($resposta -notmatch '^[sS]') { Pare "Sem o $nome o painel não roda. Instale e rode este instalador de novo." }
  winget install --id $idDoWinget -e --source winget
  RecarregarPath
}

# ---------- programas ----------
Passo 'Conferindo o git e o Node'
if (-not (Tem git)) { Instalar 'git' 'Git.Git' }
if (-not (Tem git)) { Pare 'O git foi instalado, mas este PowerShell ainda não enxerga. Feche, abra de novo e rode o instalador outra vez.' }
$versao = if (Tem node) { [int]((node -v) -replace '^v(\d+).*', '$1') } else { 0 }
if ($versao -lt 24) { Instalar 'Node 24' 'OpenJS.NodeJS' }
$versao = if (Tem node) { [int]((node -v) -replace '^v(\d+).*', '$1') } else { 0 }
if ($versao -lt 24) { Pare 'O Node 24 foi instalado, mas este PowerShell ainda não enxerga. Feche, abra de novo e rode o instalador outra vez.' }
Write-Host "git e Node $(node -v) prontos."

# ---------- código ----------
Passo 'Baixando o código do painel'
$aqui = if ($PSScriptRoot) { Split-Path -Parent $PSScriptRoot } else { $null }
if ($aqui -and (Test-Path (Join-Path $aqui 'package.json'))) {
  $projeto = $aqui
  Write-Host "Usando o código que já está em $projeto"
} else {
  $projeto = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Projetos\painel-freelance'
  if (Test-Path (Join-Path $projeto 'package.json')) {
    Write-Host "O código já está em $projeto"
  } else {
    New-Item -ItemType Directory -Force (Split-Path -Parent $projeto) | Out-Null
    git clone $CODIGO $projeto
    if (-not (Test-Path (Join-Path $projeto 'package.json'))) { Pare 'Não consegui baixar o código. Confira a internet e tente de novo.' }
  }
}
Set-Location $projeto
New-Item -ItemType Directory -Force 'dados' | Out-Null

Passo 'Instalando as dependências e montando as telas (leva um ou dois minutos)'
npm install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { Pare 'O npm install falhou. A mensagem está acima.' }
npm run build
if ($LASTEXITCODE -ne 0) { Pare 'A montagem das telas falhou. A mensagem está acima.' }

# ---------- onde ficam os dados ----------
Passo 'Ligando o painel ao repositório de dados'
$escolha = 'dados\armazem.json'
if (Test-Path $escolha) {
  $repositorio = (Get-Content $escolha -Raw -Encoding UTF8 | ConvertFrom-Json).repositorio
  Write-Host "Já configurado: $escolha"
} else {
  do {
    $repositorio = (Read-Host 'Qual é o repositório PRIVADO dos seus dados no GitHub? (formato dono/nome)').Trim()
  } until ($repositorio -match '^[\w.-]+/[\w.-]+$')
  $json = "{`n  `"dados`": `"github`",`n  `"repositorio`": `"$repositorio`"`n}`n"
  [IO.File]::WriteAllText((Join-Path $projeto $escolha), $json, (New-Object Text.UTF8Encoding $false))
  Write-Host "Gravado em $escolha"
}
if ($repositorio) {
  Write-Host "Conferindo se o git deste PC enxerga $repositorio. Se abrir a janela do GitHub, entre com a sua conta."
  git ls-remote "https://github.com/$repositorio.git" HEAD | Out-Null
  if ($LASTEXITCODE -ne 0) { Write-Host "Aviso: o git não conseguiu abrir $repositorio. O painel vai mostrar o motivo na tela." -ForegroundColor Yellow }
  else { Write-Host 'Acesso conferido.' }
}

# ---------- pastas de código deste PC ----------
Passo 'Procurando as pastas de código deste PC'
$lista = 'dados\repositorios.json'
if (Test-Path $lista) {
  Write-Host "Já existe: $lista"
} else {
  $raiz = Split-Path -Parent $projeto
  $pastas = Get-ChildItem $raiz -Directory | Where-Object { Test-Path (Join-Path $_.FullName '.git') } | ForEach-Object { @{ pasta = $_.Name } }
  $config = [ordered]@{ raiz = $raiz; repositorios = @($pastas) }
  [IO.File]::WriteAllText((Join-Path $projeto $lista), ($config | ConvertTo-Json -Depth 4), (New-Object Text.UTF8Encoding $false))
  Write-Host "$(@($pastas).Count) pastas com git em $raiz. Dá para ajustar depois em $lista."
}

# ---------- atalhos ----------
Passo 'Criando o atalho e ligando o painel junto com o Windows'
$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$ligar = Join-Path $projeto 'scripts\ligar.ps1'
$shell = New-Object -ComObject WScript.Shell
function Atalho($arquivo, $argumentos) {
  $atalho = $shell.CreateShortcut($arquivo)
  $atalho.TargetPath = $powershell
  $atalho.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ligar`" $argumentos"
  $atalho.WorkingDirectory = $projeto
  $atalho.WindowStyle = 7
  $atalho.IconLocation = "$env:SystemRoot\System32\imageres.dll,1"
  $atalho.Description = 'Painel do Freelance'
  $atalho.Save()
}
Atalho (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Painel do Freelance.lnk') '-Abrir'
Atalho (Join-Path ([Environment]::GetFolderPath('Startup')) 'Painel do Freelance.lnk') ''
Write-Host 'Atalho na área de trabalho e início automático com o Windows prontos.'

# ---------- Claude Code ----------
if (Tem claude) {
  Passo 'Ligando o painel ao Claude Code'
  claude mcp get painel-freelance *> $null
  if ($LASTEXITCODE -eq 0) { Write-Host 'Já estava ligado.' }
  else {
    claude mcp add painel-freelance --scope user -- node (Join-Path $projeto 'src\mcp\index.ts')
    Write-Host 'Pronto. Abra o Claude Code de novo para ele enxergar o painel.'
  }
}

Passo 'Abrindo o painel'
& $powershell -NoProfile -ExecutionPolicy Bypass -File $ligar -Abrir
Write-Host ''
Write-Host 'Tudo pronto. O painel liga sozinho quando o Windows abre; o atalho da área de trabalho só abre a tela.' -ForegroundColor Green
Read-Host 'Aperte Enter para fechar'
