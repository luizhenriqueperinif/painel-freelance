# Gera e publica uma versão do app de Android numa Release do GitHub.
# A Release leva dois arquivos:
#   painel-freelance.apk  - para instalar (ou quando a parte Android mudou)
#   telas.zip             - as telas; o app já instalado baixa e passa a usar sozinho
# Antes: aumente "version" no package.json (e "versaoDaParteAndroid" se mexeu no Java ou no manifesto),
# faça o commit e o push na main.
#
# Uso: powershell -ExecutionPolicy Bypass -File scripts\publicar-android.ps1

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz

function Parar($recado) {
    Write-Host $recado -ForegroundColor Red
    exit 1
}

$versao = (Get-Content package.json -Raw -Encoding UTF8 | ConvertFrom-Json).version
$tag = "v$versao"

# A Release aponta para a main: o código dela precisa ser exatamente o que foi publicado.
if ((git rev-parse --abbrev-ref HEAD) -ne 'main') { Parar 'Rode na branch main.' }
if (git status --porcelain) { Parar 'Há mudanças sem commit. Faça o commit antes.' }
git fetch origin main --quiet
if ((git rev-parse HEAD) -ne (git rev-parse origin/main)) { Parar 'A main daqui e a do GitHub estão diferentes. Faça o push (ou o pull) antes.' }
gh release view $tag *> $null
if ($LASTEXITCODE -eq 0) { Parar "A Release $tag já existe. Aumente a versão no package.json." }

if (-not $env:JAVA_HOME) { $env:JAVA_HOME = 'C:\Program Files\Java\jdk-21.0.12' }
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = 'C:\Android\Sdk' }

Write-Host "Gerando a versão $versao..."
npm run build
if ($LASTEXITCODE -ne 0) { Parar 'O build das telas falhou.' }
npx cap sync android
if ($LASTEXITCODE -ne 0) { Parar 'O cap sync falhou.' }
Push-Location android
.\gradlew.bat testDebugUnitTest assembleDebug --no-daemon -q
$gradle = $LASTEXITCODE
Pop-Location
if ($gradle -ne 0) { Parar 'O build do APK falhou.' }

$saida = Join-Path $raiz 'android\app\build\release-github'
New-Item -ItemType Directory -Force $saida | Out-Null
Copy-Item android\app\build\outputs\apk\debug\app-debug.apk (Join-Path $saida 'painel-freelance.apk') -Force
$zip = Join-Path $saida 'telas.zip'
if (Test-Path $zip) { Remove-Item $zip }
# O tar do Windows grava o zip com barras normais nos caminhos, como o app espera.
& "$env:SystemRoot\System32\tar.exe" -a -c -f $zip -C dist .
if ($LASTEXITCODE -ne 0) { Parar 'Não deu para montar o telas.zip.' }

# As mudanças de linha que o cap sync deixa nos arquivos do Gradle não são mudança de verdade.
git checkout -- android/app/capacitor.build.gradle android/capacitor.settings.gradle 2>$null

gh release create $tag (Join-Path $saida 'painel-freelance.apk') $zip --target main --title "Painel do Freelance $versao (Android)" --notes "Versão $versao do app de Android. As telas se atualizam sozinhas no app já instalado; o APK é para instalar ou quando a parte Android mudou."
if ($LASTEXITCODE -ne 0) { Parar 'Não deu para criar a Release.' }
Write-Host "Pronto: Release $tag publicada." -ForegroundColor Green
