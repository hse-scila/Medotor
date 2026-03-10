@echo off
chcp 65001 > nul
echo ========================================
echo    Открытие веб-интерфейса
echo ========================================
echo.

REM Проверка наличия файла интерфейса
if not exist "frontend\index.html" (
    echo ОШИБКА: Файл frontend\index.html не найден!
    echo Убедитесь, что проект установлен корректно
    pause
    exit /b 1
)

echo Проверка доступности сервера...
curl -s http://localhost:8000/health > nul 2>&1
if %errorlevel% neq 0 (
    echo ⚠ ВНИМАНИЕ: Backend сервер не запущен!
    echo.
    echo Сначала запустите сервер: start_server.bat
    echo Или запустите все сразу: start.bat
    echo.
    pause
)

echo Открытие веб-интерфейса в браузере...
echo.

REM Открываем через сервер (правильный способ)
start http://localhost:8000

echo Веб-интерфейс должен открыться в браузере.
echo.
echo Адрес: http://localhost:8000
echo.
echo Убедитесь, что backend сервер запущен!
echo.
pause

