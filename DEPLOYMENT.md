# 🚀 Инструкция по развертыванию проекта LM Studio Project

[English](DEPLOYMENT_EN.md) | [Русский](DEPLOYMENT.md)

## 📋 Содержание

1. [Системные требования](#системные-требования)
2. [Подготовка системы](#подготовка-системы)
3. [Установка зависимостей](#установка-зависимостей)
4. [Копирование проекта](#копирование-проекта)
5. [Настройка проекта](#настройка-проекта)
6. [Запуск проекта](#запуск-проекта)
7. [Проверка работоспособности](#проверка-работоспособности)
8. [Решение проблем](#решение-проблем)

---

## 💻 Системные требования

### Минимальные требования

- **ОС**: Windows 10/11, Linux (Ubuntu 20.04+), macOS 10.15+
- **Процессор**: x64 архитектура
- **ОЗУ**: 8 GB (рекомендуется 16 GB)
- **Дисковое пространство**: 10 GB свободного места
- **Python**: 3.8 или выше
- **Интернет**: для первоначальной загрузки моделей и зависимостей

### Рекомендуемые требования

- **ОС**: Windows 11, Linux (Ubuntu 22.04+)
- **ОЗУ**: 16 GB или больше
- **Дисковое пространство**: 50 GB (для моделей и данных)
- **GPU**: NVIDIA с поддержкой CUDA 11.8+ (опционально, для ускорения)
- **Процессор**: Многоядерный процессор (4+ ядра)

---

## 🔧 Подготовка системы

### Шаг 1: Установка Python

#### Windows

1. Скачайте Python с [python.org](https://www.python.org/downloads/)
2. При установке отметьте "Add Python to PATH"
3. Проверьте установку:
   ```cmd
   python --version
   ```
   Должно показать версию 3.8 или выше

#### Linux (Ubuntu/Debian)

```bash
sudo apt update
sudo apt install python3 python3-pip python3-venv
python3 --version
```

#### macOS

```bash
# Используя Homebrew
brew install python3
python3 --version
```

### Шаг 2: Установка Anaconda (рекомендуется)

Anaconda упрощает управление окружениями Python и зависимостями.

#### Windows

1. Скачайте Anaconda с [anaconda.com](https://www.anaconda.com/download)
2. Запустите установщик и следуйте инструкциям
3. Проверьте установку:
   ```cmd
   conda --version
   ```

#### Linux/macOS

```bash
# Скачайте установщик с сайта Anaconda
# Или используйте:
wget https://repo.anaconda.com/archive/Anaconda3-2024.02-1-Linux-x86_64.sh
bash Anaconda3-2024.02-1-Linux-x86_64.sh
```

### Шаг 3: Установка Ollama

Ollama необходим для работы с локальными языковыми моделями.

#### Windows

1. Скачайте установщик с [ollama.com](https://ollama.com/download)
2. Запустите установщик
3. После установки Ollama должен запуститься автоматически
4. Проверьте установку:
   ```cmd
   ollama --version
   ```

#### Linux

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama --version
```

#### macOS

```bash
brew install ollama
ollama --version
```

### Шаг 4: Установка Tesseract OCR (опционально)

Tesseract необходим для OCR функциональности.

#### Windows

1. Скачайте установщик с [GitHub](https://github.com/UB-Mannheim/tesseract/wiki)
2. Установите Tesseract
3. Добавьте путь к Tesseract в переменную окружения PATH:
   ```
   C:\Program Files\Tesseract-OCR
   ```
4. Проверьте установку:
   ```cmd
   tesseract --version
   ```

#### Linux (Ubuntu/Debian)

```bash
sudo apt install tesseract-ocr tesseract-ocr-rus tesseract-ocr-eng
tesseract --version
```

#### macOS

```bash
brew install tesseract tesseract-lang
tesseract --version
```

### Шаг 5: Установка Poppler (для обработки PDF)

Poppler необходим для конвертации PDF в изображения.

#### Windows

1. Скачайте Poppler с [GitHub](https://github.com/oschwartz10612/poppler-windows/releases)
2. Распакуйте архив
3. Добавьте путь к `bin` в переменную окружения PATH

#### Linux (Ubuntu/Debian)

```bash
sudo apt install poppler-utils
```

#### macOS

```bash
brew install poppler
```

---

## 📦 Установка зависимостей

### Вариант 1: Использование Anaconda (рекомендуется)

#### Создание окружения Conda

```bash
# Создаем новое окружение
conda create -n lm_studio python=3.10 -y

# Активируем окружение
# Windows:
conda activate lm_studio
# Linux/macOS:
source activate lm_studio

# Устанавливаем PyTorch с CUDA (если есть GPU)
conda install pytorch torchvision torchaudio pytorch-cuda=11.8 -c pytorch -c nvidia -y

# Или без CUDA (только CPU)
conda install pytorch torchvision torchaudio cpuonly -c pytorch -y
```

#### Установка Python зависимостей

```bash
# Переходим в директорию проекта
cd LM_studio_project

# Устанавливаем зависимости
pip install -r requirements.txt
```

### Вариант 2: Использование venv (стандартный Python)

```bash
# Создаем виртуальное окружение
python -m venv venv

# Активируем окружение
# Windows:
venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

# Обновляем pip
pip install --upgrade pip

# Устанавливаем зависимости
pip install -r requirements.txt
```

---

## 📁 Копирование проекта

### Вариант 1: Клонирование из Git репозитория

```bash
git clone <URL_РЕПОЗИТОРИЯ> lm_studio_project
cd lm_studio_project
```

### Вариант 2: Копирование папки проекта

1. Скопируйте всю папку проекта на новый компьютер
2. Убедитесь, что сохранена структура директорий:
   ```
   LM_studio_project/
   ├── backend/
   ├── frontend/
   ├── config.yaml
   ├── requirements.txt
   └── ...
   ```

### Вариант 3: Перенос через архив

1. На исходном компьютере создайте архив проекта:
   ```bash
   # Windows
   tar -czf lm_studio_project.tar.gz LM_studio_project
   
   # Или используйте ZIP
   ```
2. Перенесите архив на новый компьютер
3. Распакуйте архив:
   ```bash
   tar -xzf lm_studio_project.tar.gz
   ```

---

## ⚙️ Настройка проекта

### Шаг 1: Настройка конфигурации

Откройте файл `config.yaml` и настройте параметры:

```yaml
# Основные настройки
api:
  host: 0.0.0.0  # Для доступа из сети используйте 0.0.0.0
  port: 8000     # Порт сервера

# Настройки Ollama
ollama:
  url: http://127.0.0.1:11434  # URL Ollama сервера
  default_model: qwen2.5:latest
  embedding_model: embeddinggemma:latest

# Путь к базе данных
database:
  sqlite_path: data/patients.db  # Относительный путь

# Путь к Tesseract (если отличается от стандартного)
file_processing:
  tesseract_cmd: null  # Укажите путь, если Tesseract не в PATH
```

### Шаг 2: Настройка путей в скриптах запуска (Windows)

Если вы используете Windows и другой путь к Python, отредактируйте `start_server.bat`:

```batch
REM Замените путь к Python на ваш
C:\Users\ВАШЕ_ИМЯ\anaconda3\envs\lm_studio\python.exe api_server.py
```

Или используйте относительный путь, если Python в PATH:

```batch
python api_server.py
```

### Шаг 3: Создание необходимых директорий

Проект автоматически создаст необходимые директории при первом запуске, но вы можете создать их вручную:

```bash
mkdir -p data
mkdir -p logs
mkdir -p temp/uploads
mkdir -p temp/vision_pages
```

### Шаг 4: Настройка Ollama моделей

После установки Ollama загрузите необходимые модели:

```bash
# Основная модель для чата
ollama pull qwen2.5:latest

# Модель для эмбеддингов
ollama pull embeddinggemma:latest

# Vision модель (опционально)
ollama pull qwen3-vl:8b
```

Проверьте список моделей:

```bash
ollama list
```

---

## 🚀 Запуск проекта

### Windows

#### Способ 1: Использование готовых скриптов

```cmd
# Запуск всех компонентов
start.bat

# Или по отдельности:
# Только backend
start_server.bat

# Только frontend (если backend уже запущен)
start_frontend.bat
```

#### Способ 2: Ручной запуск

```cmd
# Активируем окружение
conda activate lm_studio
# или
venv\Scripts\activate

# Переходим в директорию backend
cd backend

# Запускаем сервер
python api_server.py
```

### Linux/macOS

```bash
# Активируем окружение
conda activate lm_studio
# или
source venv/bin/activate

# Переходим в директорию backend
cd backend

# Запускаем сервер
python api_server.py
```

### Проверка запуска

После запуска сервера вы должны увидеть:

```
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000
```

Откройте браузер и перейдите по адресу: `http://localhost:8000`

---

## ✅ Проверка работоспособности

### 1. Проверка сервера

Откройте в браузере:
- `http://localhost:8000` - веб-интерфейс
- `http://localhost:8000/health` - проверка состояния API
- `http://localhost:8000/api` - документация API

### 2. Проверка Ollama

В веб-интерфейсе:
1. Перейдите в раздел "Settings"
2. Проверьте статус подключения к Ollama
3. Должно быть "Connected" и список доступных моделей

### 3. Проверка базы данных

В веб-интерфейсе:
1. Перейдите в раздел "Patients"
2. Проверьте, что база данных инициализирована
3. Статистика должна показывать 0 пациентов (если БД пуста)

### 4. Проверка RAG системы

1. Загрузите тестовый PDF файл в разделе "RAG"
2. Проверьте, что файл индексируется
3. Выполните поиск по загруженному документу

### 5. Проверка OCR

1. Загрузите тестовое изображение с текстом
2. Проверьте, что текст распознается корректно

---

## 🔍 Решение проблем

### Проблема: Порт 8000 занят

**Решение:**
```bash
# Windows
netstat -ano | findstr :8000
taskkill /PID <PID> /F

# Linux/macOS
lsof -ti:8000 | xargs kill -9
```

Или измените порт в `config.yaml`:
```yaml
api:
  port: 8001  # Другой порт
```

### Проблема: Ollama не подключается

**Решение:**
1. Убедитесь, что Ollama запущен:
   ```bash
   ollama serve
   ```
2. Проверьте URL в `config.yaml`:
   ```yaml
   ollama:
     url: http://127.0.0.1:11434
   ```
3. Проверьте доступность:
   ```bash
   curl http://127.0.0.1:11434/api/tags
   ```

### Проблема: Модели не загружаются

**Решение:**
1. Проверьте, что модели загружены в Ollama:
   ```bash
   ollama list
   ```
2. Если моделей нет, загрузите их:
   ```bash
   ollama pull qwen2.5:latest
   ```

### Проблема: Ошибки при установке зависимостей

**Решение:**
1. Обновите pip:
   ```bash
   pip install --upgrade pip
   ```
2. Установите зависимости по одной:
   ```bash
   pip install torch
   pip install fastapi
   # и т.д.
   ```
3. Для Windows может потребоваться установка Visual C++ Build Tools

### Проблема: Tesseract не найден

**Решение:**
1. Убедитесь, что Tesseract установлен
2. Добавьте путь в `config.yaml`:
   ```yaml
   file_processing:
     tesseract_cmd: "C:/Program Files/Tesseract-OCR/tesseract.exe"
   ```

### Проблема: База данных не создается

**Решение:**
1. Убедитесь, что есть права на запись в директорию `data/`
2. Проверьте путь в `config.yaml`:
   ```yaml
   database:
     sqlite_path: data/patients.db
   ```
3. Создайте директорию вручную:
   ```bash
   mkdir -p data
   ```

### Проблема: GPU не используется

**Решение:**
1. Убедитесь, что установлен PyTorch с CUDA:
   ```bash
   python -c "import torch; print(torch.cuda.is_available())"
   ```
2. Если False, переустановите PyTorch:
   ```bash
   conda install pytorch pytorch-cuda=11.8 -c pytorch -c nvidia
   ```

---

## 📝 Дополнительная информация

### Перенос данных

Если вы переносите проект с данными:

1. **База данных пациентов:**
   - Скопируйте файл `data/patients.db`
   - Или используйте экспорт/импорт через веб-интерфейс

2. **RAG индексы:**
   - Скопируйте директорию `backend/data/rag/`
   - Или переиндексируйте документы после переноса

3. **Конфигурация:**
   - Скопируйте `config.yaml`
   - Настройте пути под новую систему

### Обновление проекта

```bash
# Если используется Git
git pull origin main

# Обновите зависимости
pip install -r requirements.txt --upgrade
```

### Резервное копирование

Рекомендуется регулярно создавать резервные копии:
- База данных: `data/patients.db`
- Конфигурация: `config.yaml`
- RAG индексы: `backend/data/rag/`

Используйте функцию экспорта базы данных в веб-интерфейсе.

---

## 📞 Поддержка

При возникновении проблем:
1. Проверьте логи в директории `logs/`
2. Проверьте консоль браузера (F12)
3. Проверьте вывод сервера в терминале
4. Обратитесь к документации проекта: `README.md`

---

**Успешного развертывания! 🎉**
