@echo off
setlocal
cd /d "%~dp0"
echo =============================================
echo   NEUROLAB ENTERPRISE - API + FRONTEND
echo =============================================
where node >nul 2>nul
if errorlevel 1 (echo ERROR: Instala Node.js 18 o superior.& pause & exit /b 1)
where python >nul 2>nul
if errorlevel 1 (echo ERROR: Instala Python 3.11 o superior.& pause & exit /b 1)

echo Verificando dependencias del backend...
pushd services\api
python -c "import fastapi, uvicorn, sqlalchemy, numpy" >nul 2>nul
if errorlevel 1 (
  echo Instalando requirements.txt...
  python -m pip install -r requirements.txt
  if errorlevel 1 (echo ERROR instalando dependencias.& popd & pause & exit /b 1)
)
popd

start "NeuroLab API" /D "%~dp0services\api" cmd /k python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
start "NeuroLab Web" /D "%~dp0apps\web" cmd /k "if not exist node_modules (npm install) && npm run dev"

echo.
echo API:  http://127.0.0.1:8000/docs
echo Web:  http://localhost:5173
echo Demo: admin@neurolab.local / NeuroLab2026!
echo.
pause
