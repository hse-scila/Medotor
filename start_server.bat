@echo off
chcp 65001 > nul
title LM Studio - Backend Server
color 0B

echo ========================================
echo   LM Studio - Backend Server
echo   AI Assistant API Server
echo ========================================
echo.

REM Проверка и остановка старых процессов
echo [1/3] Проверка порта 8000...
netstat -ano | findstr :8000 | findstr LISTENING > nul
if %errorlevel% equ 0 (
    echo          [WARNING] Порт 8000 занят! Остановка старых процессов...
    call ..\stop.bat > nul 2>&1
    timeout /t 3 /nobreak > nul
)
echo          [OK] Порт 8000 готов
echo.

REM Переход в папку backend
echo [2/3] Инициализация окружения...
cd backend
if %errorlevel% neq 0 (
    echo          [ERROR] Не удалось перейти в папку backend!
    pause
    exit /b 1
)
echo          [OK] Рабочая директория: %cd%
echo.

REM Запуск сервера
echo [3/3] Запуск сервера...
echo          Используется Python: C:\Users\sergei_k\anaconda3\envs\Torchlama\python.exe
echo          Файл: api_server.py
echo.
echo ========================================
echo   СЕРВЕР ЗАПУЩЕН
echo ========================================
echo.
echo   Адрес: http://localhost:8000
echo   Для остановки закройте это окно или используйте: stop.bat
echo.
echo ========================================
echo.

C:\Users\sergei_k\anaconda3\envs\Torchlama\python.exe api_server.py

echo.
echo ========================================
echo   СЕРВЕР ОСТАНОВЛЕН
echo ========================================
pause

