@echo off
chcp 65001 > nul
title LM Studio Project - Запуск всех компонентов
color 0A

echo ========================================
echo   LM Studio Project
echo   Запуск всех компонентов системы
echo ========================================
echo.

REM ==========================================
REM ШАГ 1: Проверка Ollama
REM ==========================================
echo [1/6] Проверка Ollama сервера...
timeout /t 1 /nobreak > nul
curl -s http://127.0.0.1:11434/api/tags > nul 2>&1
if %errorlevel% equ 0 (
    echo          [OK] Ollama запущен и доступен
    curl -s http://127.0.0.1:11434/api/tags | findstr /C:"models" > nul
    if %errorlevel% equ 0 (
        echo          [OK] Модели Ollama доступны
    )
) else (
    echo          [WARNING] Ollama не обнаружен на http://127.0.0.1:11434
    echo          Убедитесь, что Ollama запущен!
    echo          Для запуска Ollama используйте: ollama serve
    echo.
    echo          Продолжаем запуск backend сервера...
)
echo.

REM ==========================================
REM ШАГ 2: Проверка порта 8000
REM ==========================================
echo [2/6] Проверка порта 8000...
netstat -ano | findstr :8000 | findstr LISTENING > nul
if %errorlevel% equ 0 (
    echo          [INFO] Порт 8000 занят! Останавливаю старый процесс...
    call stop.bat > nul 2>&1
    timeout /t 3 /nobreak > nul
    echo          [OK] Старый процесс остановлен
) else (
    echo          [OK] Порт 8000 свободен
)
echo.

REM ==========================================
REM ШАГ 3: Проверка наличия файлов
REM ==========================================
echo [3/6] Проверка файлов проекта...
if not exist "backend\api_server.py" (
    echo          [ERROR] Файл backend\api_server.py не найден!
    pause
    exit /b 1
)
if not exist "frontend\index.html" (
    echo          [ERROR] Файл frontend\index.html не найден!
    pause
    exit /b 1
)
echo          [OK] Все необходимые файлы найдены
echo.

REM ==========================================
REM ШАГ 4: Проверка Python окружения
REM ==========================================
echo [4/6] Проверка Python окружения...
if exist "C:\Users\sergei_k\anaconda3\envs\Torchlama\python.exe" (
    echo          [OK] Python окружение найдено
) else (
    echo          [ERROR] Python окружение Torchlama не найдено!
    echo          Путь: C:\Users\sergei_k\anaconda3\envs\Torchlama\python.exe
    pause
    exit /b 1
)
echo.

REM ==========================================
REM ШАГ 5: Запуск backend сервера
REM ==========================================
echo [5/6] Запуск backend сервера...
echo          Открывается новое окно с сервером...
start "LM Studio - Backend Server" cmd /k "start_server.bat"
timeout /t 5 /nobreak > nul

REM Проверяем, что сервер запустился
echo          Проверка запуска сервера...
timeout /t 3 /nobreak > nul
curl -s http://localhost:8000/health > nul 2>&1
if %errorlevel% equ 0 (
    echo          [OK] Backend сервер успешно запущен
) else (
    echo          [WARNING] Сервер еще запускается, подождите немного...
    echo          Проверьте окно сервера на наличие ошибок
)
echo.

REM ==========================================
REM ШАГ 6: Открытие фронтенда
REM ==========================================
echo [6/6] Открытие веб-интерфейса...
timeout /t 2 /nobreak > nul
start http://localhost:8000
echo          [OK] Браузер должен открыться автоматически
echo.

REM ==========================================
REM ИТОГОВАЯ ИНФОРМАЦИЯ
REM ==========================================
echo ========================================
echo   ЗАПУСК ЗАВЕРШЕН!
echo ========================================
echo.
echo   Компоненты:
echo   - Backend сервер: запущен в отдельном окне
echo   - Веб-интерфейс: http://localhost:8000
echo   - Ollama: проверен (убедитесь что запущен)
echo.
echo   ВАЖНО:
echo   - НЕ закрывайте окно "LM Studio - Backend Server"!
echo   - Для остановки используйте: stop.bat
echo   - При проблемах проверьте окно сервера
echo.
echo   Проверка подключения:
echo   - Откройте http://localhost:8000 в браузере
echo   - Статус должен показать "Подключен"
echo   - Ollama должен показать "Подключен (22 моделей)"
echo.
echo ========================================
pause
