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
    
    print("🔧 Current LM Studio Project configuration")
    print("=" * 50)
    
    # Config summary
    summary = config.get_config_summary()
    print(f"📁 Config file: {summary['config_file']}")
    print(f"🌐 Ollama URL: {summary['ollama_url']}")
    print(f"🗄️ Database: {summary['database_type']}")
    print(f"🔍 RAG store: {summary['rag_vector_store']}")
    print(f"🚀 API server: {summary['api_host']}:{summary['api_port']}")
    print(f"🐛 Debug mode: {summary['debug_mode']}")
    print(f"📴 Offline mode: {summary['offline_mode_enabled']}")
    
    # Validation
    validation = config.validate_config()
    print(f"\n✅ Validation: {'PASSED' if validation['valid'] else 'ERRORS'}")
    
    if validation['errors']:
        print("❌ Errors:")
        for error in validation['errors']:
            print(f"   - {error}")
    
    if validation['warnings']:
        print("⚠️ Warnings:")
        for warning in validation['warnings']:
            print(f"   - {warning}")

def show_full_config():
    """Show full configuration."""
    config = get_config()
    
    print("🔧 Full LM Studio Project configuration")
    print("=" * 50)
    
    # Ollama
    print("\n🤖 Ollama:")
    print(f"   URL: {config.ollama.url}")
    print(f"   Timeout: {config.ollama.timeout}s")
    print(f"   Offline timeout: {config.ollama.offline_timeout}s")
    print(f"   Embedding model: {config.ollama.embedding_model}")
    print(f"   Default model: {config.ollama.default_model}")
    print(f"   GPU layers: {config.ollama.gpu_layers}")
    print(f"   Context: {config.ollama.num_ctx}")
    print(f"   Batch size: {config.ollama.num_batch}")
    print(f"   Threads: {config.ollama.num_thread}")
    print(f"   Temperature: {config.ollama.temperature}")
    print(f"   Top-p: {config.ollama.top_p}")
    print(f"   Top-k: {config.ollama.top_k}")
    print(f"   Max tokens: {config.ollama.max_tokens}")
    print(f"   Offline mode: {config.ollama.enable_offline_mode}")
    
    # Database
    print("\n🗄️ Database:")
    print(f"   Type: {config.database.type}")
    print(f"   Host: {config.database.host}")
    print(f"   Port: {config.database.port}")
    print(f"   Database: {config.database.database}")
    print(f"   Username: {config.database.username}")
    print(f"   Password: {'***' if config.database.password else 'not set'}")
    print(f"   SQLite path: {config.database.sqlite_path}")
    print(f"   SSL: {config.database.enable_ssl}")
    
    # Anaconda
    print("\n🐍 Anaconda:")
    print(f"   Environment: {config.anaconda.environment_name}")
    print(f"   Python path: {config.anaconda.python_path or 'auto'}")
    print(f"   Conda path: {config.anaconda.conda_path or 'auto'}")
    print(f"   GPU: {config.anaconda.enable_gpu}")
    print(f"   CUDA версия: {config.anaconda.cuda_version}")
    print(f"   PyTorch версия: {config.anaconda.pytorch_version}")
    print(f"   Transformers версия: {config.anaconda.transformers_version}")
    
    # RAG
    print("\n🔍 RAG system:")
    print(f"   Vector store: {config.rag.vector_store_type}")
    print(f"   Collection: {config.rag.collection_name}")
    print(f"   Ollama embeddings: {config.rag.use_ollama_embeddings}")
    print(f"   Embedding model: {config.rag.ollama_embedding_model}")
    print(f"   Chunk size: {config.rag.chunk_size}")
    print(f"   Chunk overlap: {config.rag.chunk_overlap}")
    print(f"   Similarity threshold: {config.rag.similarity_threshold}")
    print(f"   MemoRAG: {config.rag.enable_memorag}")
    print(f"   Cache size: {config.rag.memory_cache_size}")
    
    # API
    print("\n🚀 API server:")
    print(f"   Host: {config.api.host}")
    print(f"   Port: {config.api.port}")
    print(f"   Workers: {config.api.workers}")
    print(f"   Reload: {config.api.reload}")
    print(f"   Log level: {config.api.log_level}")
    print(f"   CORS: {config.api.cors_origins}")
    print(f"   WebSocket: {config.api.enable_websocket}")
    print(f"   Max request size: {config.api.max_request_size / (1024*1024):.1f}MB")
    print(f"   Rate limiting: {config.api.enable_rate_limiting}")
    
    # Logging
    print("\n📝 Logging:")
    print(f"   Level: {config.logging.level}")
    print(f"   File: {config.logging.file_path}")
    print(f"   Max file size: {config.logging.max_file_size / (1024*1024):.1f}MB")
    print(f"   Backup count: {config.logging.backup_count}")
    print(f"   Console: {config.logging.enable_console}")
    print(f"   File: {config.logging.enable_file}")
    print(f"   RAG logs: {config.logging.enable_rag_logging}")
    
    # File processing
    print("\n📁 File processing:")
    print(f"   Temp dir: {config.file_processing.temp_dir}")
    print(f"   Max file size: {config.file_processing.max_file_size / (1024*1024):.1f}MB")
    print(f"   Allowed extensions: {', '.join(config.file_processing.allowed_extensions)}")
    print(f"   OCR: {config.file_processing.enable_ocr}")
    print(f"   OCR languages: {config.file_processing.ocr_languages}")
    print(f"   PDF processing: {config.file_processing.enable_pdf_processing}")
    print(f"   DOCX processing: {config.file_processing.enable_docx_processing}")
    print(f"   Image processing: {config.file_processing.enable_image_processing}")
    print(f"   Auto cleanup: {config.file_processing.auto_cleanup_temp_files}")
    
    # System
    print("\n⚙️ System:")
    print(f"   Project name: {config.system.project_name}")
    print(f"   Version: {config.system.version}")
    print(f"   Debug mode: {config.system.debug_mode}")
    print(f"   Data dir: {config.system.data_dir}")
    print(f"   Logs dir: {config.system.logs_dir}")
    print(f"   Temp dir: {config.system.temp_dir}")
    print(f"   Auto backup: {config.system.enable_auto_backup}")
    print(f"   Backup interval: {config.system.backup_interval}s")
    print(f"   Max backup files: {config.system.max_backup_files}")
    print(f"   Health checks: {config.system.enable_health_checks}")

def create_config_file(config_path: str):
    """Create configuration file."""
    config_manager = ConfigManager(config_path)
    print(f"✅ Config file created: {config_path}")

def reload_config():
    """Reload configuration."""
    config = get_config()
    config.reload_config()
    print("✅ Configuration reloaded")

def save_config():
    """Save configuration."""
    config = get_config()
    config.save_config()
    print("✅ Configuration saved")

def validate_config():
    """Validate configuration."""
    config = get_config()
    validation = config.validate_config()
    
    if validation['valid']:
        print("✅ Configuration valid")
    else:
        print("❌ Configuration has errors:")
        for error in validation['errors']:
            print(f"   - {error}")
    
    if validation['warnings']:
        print("⚠️ Warnings:")
        for warning in validation['warnings']:
            print(f"   - {warning}")

def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(description="LM Studio Project configuration management")
    parser.add_argument("--config", "-c", help="Path to config file")
    parser.add_argument("--show", "-s", action="store_true", help="Show current configuration")
    parser.add_argument("--show-full", "-f", action="store_true", help="Show full configuration")
    parser.add_argument("--create", action="store_true", help="Create config file")
    parser.add_argument("--reload", "-r", action="store_true", help="Reload configuration")
    parser.add_argument("--save", action="store_true", help="Save configuration")
    parser.add_argument("--validate", "-v", action="store_true", help="Validate configuration")
    
    args = parser.parse_args()
    
    # If config path provided, use it
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
