@echo off
chcp 65001 > nul
echo ========================================
echo   Проверка состояния сервера
echo ========================================
echo.

echo Проверка порта 8000...
netstat -ano | findstr :8000
if %errorlevel% equ 0 (
    echo.
    echo [OK] Порт 8000 занят - сервер запущен
) else (
    echo.
    echo [ERROR] Порт 8000 свободен - сервер НЕ запущен!
    echo.
    echo Для запуска сервера выполните: start.bat
)

echo.
echo Проверка процессов Python...
tasklist | findstr python.exe
if %errorlevel% equ 0 (
    echo.
    echo [OK] Найдены процессы Python
) else (
    echo.
    echo [INFO] Процессы Python не найдены
)

echo.
pause

