#!/usr/bin/env python3
"""
Script for managing LM Studio Project configuration.
"""

import argparse
import sys
import os
from pathlib import Path

# Добавляем путь к backend модулям
sys.path.append(str(Path(__file__).parent / "backend"))

from config import ConfigManager, get_config

def show_config():
    """Show current configuration."""
    config = get_config()
    
    print("🔧 Текущая конфигурация LM Studio Project")
    print("=" * 50)
    
    # Сводка конфигурации
    summary = config.get_config_summary()
    print(f"📁 Файл конфигурации: {summary['config_file']}")
    print(f"🌐 Ollama URL: {summary['ollama_url']}")
    print(f"🗄️ База данных: {summary['database_type']}")
    print(f"🔍 RAG хранилище: {summary['rag_vector_store']}")
    print(f"🚀 API сервер: {summary['api_host']}:{summary['api_port']}")
    print(f"🐛 Режим отладки: {summary['debug_mode']}")
    print(f"📴 Офлайн режим: {summary['offline_mode_enabled']}")
    
    # Валидация
    validation = config.validate_config()
    print(f"\n✅ Валидация: {'ПРОЙДЕНА' if validation['valid'] else 'ОШИБКИ'}")
    
    if validation['errors']:
        print("❌ Ошибки:")
        for error in validation['errors']:
            print(f"   - {error}")
    
    if validation['warnings']:
        print("⚠️ Предупреждения:")
        for warning in validation['warnings']:
            print(f"   - {warning}")

def show_full_config():
    """Show full configuration."""
    config = get_config()
    
    print("🔧 Полная конфигурация LM Studio Project")
    print("=" * 50)
    
    # Ollama
    print("\n🤖 Ollama:")
    print(f"   URL: {config.ollama.url}")
    print(f"   Таймаут: {config.ollama.timeout}s")
    print(f"   Офлайн таймаут: {config.ollama.offline_timeout}s")
    print(f"   Модель эмбеддингов: {config.ollama.embedding_model}")
    print(f"   Модель по умолчанию: {config.ollama.default_model}")
    print(f"   GPU слои: {config.ollama.gpu_layers}")
    print(f"   Контекст: {config.ollama.num_ctx}")
    print(f"   Batch размер: {config.ollama.num_batch}")
    print(f"   Потоки: {config.ollama.num_thread}")
    print(f"   Температура: {config.ollama.temperature}")
    print(f"   Top-p: {config.ollama.top_p}")
    print(f"   Top-k: {config.ollama.top_k}")
    print(f"   Макс токены: {config.ollama.max_tokens}")
    print(f"   Офлайн режим: {config.ollama.enable_offline_mode}")
    
    # База данных
    print("\n🗄️ База данных:")
    print(f"   Тип: {config.database.type}")
    print(f"   Хост: {config.database.host}")
    print(f"   Порт: {config.database.port}")
    print(f"   База: {config.database.database}")
    print(f"   Пользователь: {config.database.username}")
    print(f"   Пароль: {'***' if config.database.password else 'не установлен'}")
    print(f"   SQLite путь: {config.database.sqlite_path}")
    print(f"   SSL: {config.database.enable_ssl}")
    
    # Anaconda
    print("\n🐍 Anaconda:")
    print(f"   Окружение: {config.anaconda.environment_name}")
    print(f"   Python путь: {config.anaconda.python_path or 'авто'}")
    print(f"   Conda путь: {config.anaconda.conda_path or 'авто'}")
    print(f"   GPU: {config.anaconda.enable_gpu}")
    print(f"   CUDA версия: {config.anaconda.cuda_version}")
    print(f"   PyTorch версия: {config.anaconda.pytorch_version}")
    print(f"   Transformers версия: {config.anaconda.transformers_version}")
    
    # RAG
    print("\n🔍 RAG система:")
    print(f"   Векторное хранилище: {config.rag.vector_store_type}")
    print(f"   Коллекция: {config.rag.collection_name}")
    print(f"   Ollama эмбеддинги: {config.rag.use_ollama_embeddings}")
    print(f"   Модель эмбеддингов: {config.rag.ollama_embedding_model}")
    print(f"   Размер чанка: {config.rag.chunk_size}")
    print(f"   Перекрытие чанков: {config.rag.chunk_overlap}")
    print(f"   Порог схожести: {config.rag.similarity_threshold}")
    print(f"   MemoRAG: {config.rag.enable_memorag}")
    print(f"   Размер кэша: {config.rag.memory_cache_size}")
    
    # API
    print("\n🚀 API сервер:")
    print(f"   Хост: {config.api.host}")
    print(f"   Порт: {config.api.port}")
    print(f"   Воркеры: {config.api.workers}")
    print(f"   Перезагрузка: {config.api.reload}")
    print(f"   Уровень логов: {config.api.log_level}")
    print(f"   CORS: {config.api.cors_origins}")
    print(f"   WebSocket: {config.api.enable_websocket}")
    print(f"   Макс размер запроса: {config.api.max_request_size / (1024*1024):.1f}MB")
    print(f"   Rate limiting: {config.api.enable_rate_limiting}")
    
    # Логирование
    print("\n📝 Логирование:")
    print(f"   Уровень: {config.logging.level}")
    print(f"   Файл: {config.logging.file_path}")
    print(f"   Макс размер файла: {config.logging.max_file_size / (1024*1024):.1f}MB")
    print(f"   Количество бэкапов: {config.logging.backup_count}")
    print(f"   Консоль: {config.logging.enable_console}")
    print(f"   Файл: {config.logging.enable_file}")
    print(f"   RAG логи: {config.logging.enable_rag_logging}")
    
    # Обработка файлов
    print("\n📁 Обработка файлов:")
    print(f"   Временная папка: {config.file_processing.temp_dir}")
    print(f"   Макс размер файла: {config.file_processing.max_file_size / (1024*1024):.1f}MB")
    print(f"   Разрешенные расширения: {', '.join(config.file_processing.allowed_extensions)}")
    print(f"   OCR: {config.file_processing.enable_ocr}")
    print(f"   Языки OCR: {config.file_processing.ocr_languages}")
    print(f"   PDF обработка: {config.file_processing.enable_pdf_processing}")
    print(f"   DOCX обработка: {config.file_processing.enable_docx_processing}")
    print(f"   Обработка изображений: {config.file_processing.enable_image_processing}")
    print(f"   Автоочистка: {config.file_processing.auto_cleanup_temp_files}")
    
    # Система
    print("\n⚙️ Система:")
    print(f"   Название проекта: {config.system.project_name}")
    print(f"   Версия: {config.system.version}")
    print(f"   Режим отладки: {config.system.debug_mode}")
    print(f"   Папка данных: {config.system.data_dir}")
    print(f"   Папка логов: {config.system.logs_dir}")
    print(f"   Временная папка: {config.system.temp_dir}")
    print(f"   Автобэкап: {config.system.enable_auto_backup}")
    print(f"   Интервал бэкапа: {config.system.backup_interval}s")
    print(f"   Макс файлов бэкапа: {config.system.max_backup_files}")
    print(f"   Проверки здоровья: {config.system.enable_health_checks}")

def create_config_file(config_path: str):
    """Create configuration file."""
    config_manager = ConfigManager(config_path)
    print(f"✅ Создан файл конфигурации: {config_path}")

def reload_config():
    """Reload configuration."""
    config = get_config()
    config.reload_config()
    print("✅ Конфигурация перезагружена")

def save_config():
    """Save configuration."""
    config = get_config()
    config.save_config()
    print("✅ Конфигурация сохранена")

def validate_config():
    """Validate configuration."""
    config = get_config()
    validation = config.validate_config()
    
    if validation['valid']:
        print("✅ Конфигурация валидна")
    else:
        print("❌ Конфигурация содержит ошибки:")
        for error in validation['errors']:
            print(f"   - {error}")
    
    if validation['warnings']:
        print("⚠️ Предупреждения:")
        for warning in validation['warnings']:
            print(f"   - {warning}")

def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(description="Управление конфигурацией LM Studio Project")
    parser.add_argument("--config", "-c", help="Путь к файлу конфигурации")
    parser.add_argument("--show", "-s", action="store_true", help="Показать текущую конфигурацию")
    parser.add_argument("--show-full", "-f", action="store_true", help="Показать полную конфигурацию")
    parser.add_argument("--create", action="store_true", help="Создать файл конфигурации")
    parser.add_argument("--reload", "-r", action="store_true", help="Перезагрузить конфигурацию")
    parser.add_argument("--save", action="store_true", help="Сохранить конфигурацию")
    parser.add_argument("--validate", "-v", action="store_true", help="Валидировать конфигурацию")
    
    args = parser.parse_args()
    
    # Если указан путь к конфигурации, используем его
    if args.config:
        os.environ['CONFIG_PATH'] = args.config
    
    try:
        if args.create:
            config_path = args.config or "config.yaml"
            create_config_file(config_path)
        elif args.show:
            show_config()
        elif args.show_full:
            show_full_config()
        elif args.reload:
            reload_config()
        elif args.save:
            save_config()
        elif args.validate:
            validate_config()
        else:
            # По умолчанию показываем краткую конфигурацию
            show_config()
            
    except Exception as e:
        print(f"❌ Ошибка: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
