@echo off
rem Builds max.armor-highlight_<version>.mtmod.
rem
rem Usage:
rem   build.bat -v 0.10.1                          build only
rem   build.bat -v 0.10.1 -i "D:\Games\Tanki"      build and copy to <game>\mods\<client version>\
rem   build.bat -v 0.10.1 -i "D:\Games\Tanki" -m 1.45.0.0
rem                                               same, with explicit mods subfolder
rem
rem Python 2.7: set PYTHON27=C:\Python27\python.exe, otherwise "py -2.7" or "python" is used.
rem 7-Zip: 7z in PATH or the default install folder.

setlocal EnableExtensions

set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"
set "MOD_ID=max.armor-highlight"
set "VERSION="
set "INSTALL="
set "GAME_DIR="
set "MODS_VER="

:parse
if "%~1"=="" goto parsed
if /i "%~1"=="-v" (
  set "VERSION=%~2"
  shift
  shift
  goto parse
)
if /i "%~1"=="-i" (
  set "INSTALL=1"
  set "GAME_DIR=%~2"
  shift
  shift
  goto parse
)
if /i "%~1"=="-m" (
  set "MODS_VER=%~2"
  shift
  shift
  goto parse
)
echo ERROR: unknown argument "%~1"
goto usage

:parsed
if not defined VERSION goto usage
if defined INSTALL if not defined GAME_DIR (
  echo ERROR: -i needs the game folder, e.g. -i "D:\Games\Tanki"
  exit /b 1
)

rem --- Python 2.7 ---
set "PY="
if defined PYTHON27 set PY="%PYTHON27%"
if defined PY goto check_py
py -2.7 -c "import sys" >nul 2>&1
if not errorlevel 1 set "PY=py -2.7"
if not defined PY set "PY=python"
:check_py
%PY% -c "import sys; sys.exit(0 if sys.version_info[:2] == (2, 7) else 1)" >nul 2>&1
if errorlevel 1 (
  echo ERROR: Python 2.7 not found. Install it or set PYTHON27=C:\Python27\python.exe
  exit /b 1
)
echo Python: %PY%

rem --- 7-Zip ---
set "SEVENZIP="
where 7z >nul 2>&1
if not errorlevel 1 set "SEVENZIP=7z"
if not defined SEVENZIP if exist "%ProgramFiles%\7-Zip\7z.exe" set "SEVENZIP=%ProgramFiles%\7-Zip\7z.exe"
if not defined SEVENZIP if exist "%ProgramFiles(x86)%\7-Zip\7z.exe" set "SEVENZIP=%ProgramFiles(x86)%\7-Zip\7z.exe"
if not defined SEVENZIP (
  echo ERROR: 7-Zip not found. Install it or add 7z to PATH.
  exit /b 1
)

rem --- 1. Fresh build folder with a copy of res ---
set "BUILD=%ROOT%\build"
if exist "%BUILD%" rmdir /s /q "%BUILD%"
mkdir "%BUILD%"
xcopy "%ROOT%\res" "%BUILD%\res\" /E /I /Q /Y >nul
if errorlevel 1 (
  echo ERROR: failed to copy res
  exit /b 1
)
copy /y "%ROOT%\meta.xml" "%BUILD%\meta.xml" >nul

rem --- 2. Version substitution ---
set "PKG_INIT=%BUILD%\res\scripts\client\gui\mods\armor_highlight\__init__.py"
%PY% -c "import sys; v = sys.argv[1]; data = [(p, open(p, 'rb').read()) for p in sys.argv[2:]]; [open(p, 'wb').write(d.replace('{{VERSION}}', v)) for p, d in data]" "%VERSION%" "%BUILD%\meta.xml" "%PKG_INIT%"
if errorlevel 1 (
  echo ERROR: version substitution failed
  exit /b 1
)

rem --- 3. Compile with Python 2.7, keep only .pyc in res\scripts ---
%PY% -m compileall -q "%BUILD%\res\scripts"
if errorlevel 1 (
  echo ERROR: compileall failed
  exit /b 1
)
%PY% -c "import os, sys; [os.remove(os.path.join(r, f)) for r, _, fs in os.walk(sys.argv[1]) for f in fs if not f.endswith('.pyc')]" "%BUILD%\res\scripts"
if errorlevel 1 (
  echo ERROR: failed to clean sources from build
  exit /b 1
)

rem --- 3b. Cell textures: colours from palette.py ---
%PY% "%ROOT%\tools\make_textures.py" "%BUILD%\res"
if errorlevel 1 (
  echo ERROR: texture generation failed
  exit /b 1
)

rem --- 4. Pack: stored zip, meta.xml + res\... ---
set "OUT=%ROOT%\%MOD_ID%_%VERSION%.mtmod"
if exist "%OUT%" del /q "%OUT%"
pushd "%BUILD%"
"%SEVENZIP%" a -tzip -mx=0 "%OUT%" meta.xml res >nul
set "ZIP_ERR=%ERRORLEVEL%"
popd
if not "%ZIP_ERR%"=="0" (
  echo ERROR: 7z failed with code %ZIP_ERR%
  exit /b 1
)
echo Built: %OUT%

rem --- 5. Optional install ---
if not defined INSTALL goto done
if not exist "%GAME_DIR%\mods\" (
  echo ERROR: folder not found: "%GAME_DIR%\mods"
  exit /b 1
)
if defined MODS_VER goto install_copy

rem Auto-detect the client version folder: the only subfolder of mods\ whose name looks like 1.45.0.0
set "COUNT=0"
for /d %%D in ("%GAME_DIR%\mods\*") do (
  echo %%~nxD| findstr /r "^[0-9][0-9.]*$" >nul && (
    set /a COUNT+=1 >nul
    set "MODS_VER=%%~nxD"
  )
)
if "%COUNT%"=="1" goto install_copy
echo ERROR: cannot pick the client version folder in %GAME_DIR%\mods automatically. Found:
dir /b /ad "%GAME_DIR%\mods"
echo Pass it explicitly with -m, e.g. -m 1.45.0.0
exit /b 1

:install_copy
set "TARGET=%GAME_DIR%\mods\%MODS_VER%"
if not exist "%TARGET%\" (
  echo ERROR: folder not found: "%TARGET%"
  exit /b 1
)
if exist "%TARGET%\%MOD_ID%_*.mtmod" (
  echo Removing previous builds of %MOD_ID% from "%TARGET%"
  del /q "%TARGET%\%MOD_ID%_*.mtmod"
)
copy /y "%OUT%" "%TARGET%\" >nul
if errorlevel 1 (
  echo ERROR: failed to copy to "%TARGET%"
  exit /b 1
)
echo Installed: %TARGET%\%MOD_ID%_%VERSION%.mtmod

:done
endlocal
exit /b 0

:usage
echo Usage: build.bat -v ^<version^> [-i ^<game folder^>] [-m ^<mods subfolder^>]
exit /b 1
