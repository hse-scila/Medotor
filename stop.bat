@echo off
chcp 65001 > nul
title LM Studio Project - Остановка сервера

echo ========================================
echo   Остановка сервера
echo ========================================
echo.

echo Остановка процессов Python...
taskkill /f /im python.exe > nul 2>&1
if %errorlevel% equ 0 (
    echo          Процессы Python остановлены
) else (
    echo          Процессы Python не найдены
)

echo.
echo Проверка порта 8000...
netstat -ano | findstr :8000 > nul
if %errorlevel% equ 0 (
    echo          Порт 8000 еще занят, останавливаю процессы...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8000 ^| findstr LISTENING') do (
        taskkill /f /pid %%a > nul 2>&1
    )
    echo          Готово
) else (
    echo          Порт 8000 свободен
)

echo.
echo ========================================
echo   Сервер остановлен
echo ========================================
timeout /t 2 /nobreak > nul

