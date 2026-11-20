@echo off
REM ============================================================
REM  Bruno OSS + Git + zh-CN - one-click packaging script
REM  (repo-root copy; works when the repo is checked out alone)
REM
REM  Usage:
REM    pack.bat        full build: npm install + shared packages
REM                    + sandbox bundle + i18n + web + electron + sign
REM    pack.bat fast   skip install & shared package builds
REM
REM  Output:
REM    packages\bruno-electron\out\win-unpacked\   portable dir
REM    packages\bruno-electron\out\*.exe          NSIS installer
REM ============================================================
setlocal

set ROOT=%~dp0
set REPO=%ROOT%
set CSC_LINK=%ROOT%..\codesign\bruno-codesign.pfx
if not exist "%CSC_LINK%" set CSC_LINK=%ROOT%codesign\bruno-codesign.pfx
set CSC_KEY_PASSWORD=bruno-internal-2026
set ELECTRON_RUN_AS_NODE=

if not exist "%REPO%\package.json" (
  echo [ERROR] repo not found: %REPO%
  goto end
)
if not exist "%CSC_LINK%" (
  echo [WARN] signing cert not found: %CSC_LINK%
  echo [WARN] package will be built UNSIGNED
  set CSC_LINK=
  set CSC_KEY_PASSWORD=
)

cd /d %REPO%

if /i "%~1"=="fast" goto web

echo [1/5] npm install ...
call npm install --no-audit --no-fund || goto fail

echo [2/5] build shared packages ...
for %%p in (graphql-docs bruno-query bruno-common bruno-converters bruno-requests schema-types bruno-filestore bruno-io bruno-sqlite) do (
  call npm run build:%%p || goto fail
)

echo [3/5] bundle sandbox libraries ...
call npm run sandbox:bundle-libraries --workspace=packages/bruno-js || goto fail

:web
echo [4/5] build zh-CN i18n runtime ...
call node packages\bruno-app\i18n\build.js || goto fail

echo [5/5] build web + electron ...
call npm run build:web || goto fail
call npm run build:electron || goto fail

echo.
echo ============================================
echo  BUILD OK
echo  Portable : %REPO%\packages\bruno-electron\out\win-unpackedecho  Installer: %REPO%\packages\bruno-electron\outecho ============================================
goto end

:fail
echo.
echo ============================================
echo  BUILD FAILED - see errors above
echo ============================================

:end
endlocal
