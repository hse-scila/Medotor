"""
Centralized configuration system for LM Studio Project.
Manages connection settings, environments, and services.
"""

import os
import json
import yaml
from pathlib import Path
from typing import Dict, Any, Optional, Union
from dataclasses import dataclass, asdict
import logging

logger = logging.getLogger(__name__)

@dataclass
class OllamaConfig:
    """Ollama configuration"""
    url: str = "http://127.0.0.1:11434"
    timeout: int = 30
    offline_timeout: int = 10
    max_retries: int = 3
    embedding_model: str = "nomic-embed-text"
    default_model: str = "qwen2.5:latest"
    gpu_layers: int = -1
    num_ctx: int = 2048
    num_batch: int = 512
    num_thread: int = 4
    temperature: float = 0.7
    top_p: float = 0.9
    top_k: int = 40
    max_tokens: int = 2000
    enable_offline_mode: bool = True
    connection_check_interval: int = 30

@dataclass
class DatabaseConfig:
    """Database configuration"""
    type: str = "sqlite"  # sqlite, postgresql, mysql
    host: str = "localhost"
    port: int = 5432
    database: str = "lm_studio_project"
    username: str = ""
    password: str = ""
    sqlite_path: str = "data/patients.db"
    connection_pool_size: int = 10
    connection_timeout: int = 30
    enable_ssl: bool = False
    ssl_cert_path: Optional[str] = None

@dataclass
class AnacondaConfig:
    """Anaconda environment configuration"""
    environment_name: str = "lm_studio"
    python_path: Optional[str] = None
    conda_path: Optional[str] = None
    pip_path: Optional[str] = None
    enable_gpu: bool = True
    cuda_version: str = "11.8"
    pytorch_version: str = "2.0.0"
    transformers_version: str = "4.30.0"
    auto_activate_env: bool = True
    install_dependencies: bool = True

@dataclass
class RAGConfig:
    """RAG system configuration"""
    vector_store_type: str = "faiss"  # faiss, chroma
    collection_name: str = "documents"
    use_ollama_embeddings: bool = False
    ollama_embedding_model: str = "nomic-embed-text"
    chunk_size: int = 1000
    chunk_overlap: int = 200
    max_chunks_per_document: int = 100
    similarity_threshold: float = 0.7
    enable_memorag: bool = True
    memory_cache_size: int = 1000
    enable_file_chunking: bool = True

@dataclass
class APIConfig:
    """API server configuration"""
    host: str = "0.0.0.0"
    port: int = 8000
    workers: int = 1
    reload: bool = False
    log_level: str = "info"
    cors_origins: list = None
    enable_websocket: bool = True
    websocket_timeout: int = 300
    max_request_size: int = 100 * 1024 * 1024  # 100MB
    enable_rate_limiting: bool = False
    rate_limit_requests: int = 100
    rate_limit_window: int = 60

@dataclass
class LoggingConfig:
    """Logging configuration"""
    level: str = "INFO"
    format: str = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    file_path: str = "logs/app.log"
    max_file_size: int = 10 * 1024 * 1024  # 10MB
    backup_count: int = 5
    enable_console: bool = True
    enable_file: bool = True
    enable_rag_logging: bool = True
    rag_log_path: str = "logs/rag_system.log"

@dataclass
class FileProcessingConfig:
    """File processing configuration"""
    temp_dir: str = "temp/uploads"
    max_file_size: int = 50 * 1024 * 1024  # 50MB
    allowed_extensions: list = None
    enable_ocr: bool = True
    tesseract_cmd: Optional[str] = None
    ocr_languages: str = "rus+eng"
    enable_pdf_processing: bool = True
    enable_docx_processing: bool = True
    enable_image_processing: bool = True
    image_formats: list = None
    auto_cleanup_temp_files: bool = True
    cleanup_interval: int = 3600  # 1 hour

@dataclass
class VisionLLMConfig:
    """Vision-LLM configuration"""
    model: str = "qwen3-vl:8b"
    poppler_path: Optional[str] = None
    pages_dir: str = "temp/vision_pages"

@dataclass
class SystemConfig:
    """General system configuration"""
    project_name: str = "LM Studio Project"
    version: str = "1.0.0"
    debug_mode: bool = False
    data_dir: str = "data"
    logs_dir: str = "logs"
    temp_dir: str = "temp"
    enable_auto_backup: bool = True
    backup_interval: int = 86400  # 24 hours
    max_backup_files: int = 7
    enable_health_checks: bool = True
    health_check_interval: int = 30

class ConfigManager:
    """Configuration manager"""
    
    def __init__(self, config_path: Optional[str] = None):
        self.config_path = config_path or self._get_default_config_path()
        self.config_data: Dict[str, Any] = {}
        self._load_config()
        
        # Initialize configurations with default values
        self.ollama = OllamaConfig()
        self.database = DatabaseConfig()
        self.anaconda = AnacondaConfig()
        self.rag = RAGConfig()
        self.api = APIConfig()
        self.logging = LoggingConfig()
        self.file_processing = FileProcessingConfig()
        self.vision_llm = VisionLLMConfig()
        self.system = SystemConfig()
        
        # Load values from configuration file
        self._load_from_dict()
        
        # Create necessary directories
        self._create_directories()
    
    def _get_default_config_path(self) -> str:
        """Get default configuration file path"""
        # First search in project root
        project_root = Path(__file__).parent.parent
        config_files = [
            project_root / "config.yaml",
            project_root / "config.yml", 
            project_root / "config.json",
            project_root / "backend" / "config.yaml",
            project_root / "backend" / "config.yml",
            project_root / "backend" / "config.json"
        ]
        
        for config_file in config_files:
            if config_file.exists():
                return str(config_file)
        
        # If file not found, create default
        return str(project_root / "config.yaml")
    
    def _load_config(self):
        """Load configuration from file"""
        config_path = Path(self.config_path)
        
        if not config_path.exists():
            logger.warning(f"Configuration file not found: {config_path}")
            logger.info("Creating configuration file with default settings...")
            self._create_default_config()
            return
        
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                if config_path.suffix.lower() in ['.yaml', '.yml']:
                    self.config_data = yaml.safe_load(f) or {}
                elif config_path.suffix.lower() == '.json':
                    self.config_data = json.load(f) or {}
                else:
                    logger.error(f"Unsupported configuration file format: {config_path.suffix}")
                    self.config_data = {}
        except Exception as e:
            logger.error(f"Error loading configuration: {e}")
            self.config_data = {}
    
    def _create_default_config(self):
        """Create configuration file with default settings"""
        config_path = Path(self.config_path)
        config_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Create default configuration
        default_config = {
            "ollama": asdict(OllamaConfig()),
            "database": asdict(DatabaseConfig()),
            "anaconda": asdict(AnacondaConfig()),
            "rag": asdict(RAGConfig()),
            "api": asdict(APIConfig()),
            "logging": asdict(LoggingConfig()),
            "file_processing": asdict(FileProcessingConfig()),
            "vision_llm": asdict(VisionLLMConfig()),
            "system": asdict(SystemConfig())
        }
        
        try:
            with open(config_path, 'w', encoding='utf-8') as f:
                if config_path.suffix.lower() in ['.yaml', '.yml']:
                    yaml.dump(default_config, f, default_flow_style=False, allow_unicode=True, indent=2)
                else:
                    json.dump(default_config, f, ensure_ascii=False, indent=2)
            
            logger.info(f"Configuration file created: {config_path}")
        except Exception as e:
            logger.error(f"Error creating configuration file: {e}")
    
    def _load_from_dict(self):
        """Load configurations from dictionary"""
        # Load each configuration section
        if 'ollama' in self.config_data:
            self.ollama = OllamaConfig(**self.config_data['ollama'])
        
        if 'database' in self.config_data:
            self.database = DatabaseConfig(**self.config_data['database'])
        
        if 'anaconda' in self.config_data:
            self.anaconda = AnacondaConfig(**self.config_data['anaconda'])
        
        if 'rag' in self.config_data:
            self.rag = RAGConfig(**self.config_data['rag'])
        
        if 'api' in self.config_data:
            self.api = APIConfig(**self.config_data['api'])
        
        if 'logging' in self.config_data:
            self.logging = LoggingConfig(**self.config_data['logging'])
        
        if 'file_processing' in self.config_data:
            self.file_processing = FileProcessingConfig(**self.config_data['file_processing'])

        if 'vision_llm' in self.config_data:
            self.vision_llm = VisionLLMConfig(**self.config_data['vision_llm'])
        
        if 'system' in self.config_data:
            self.system = SystemConfig(**self.config_data['system'])
    
    def _create_directories(self):
        """Create necessary directories"""
        directories = [
            self.system.data_dir,
            self.system.logs_dir,
            self.system.temp_dir,
            self.file_processing.temp_dir,
            self.vision_llm.pages_dir,
            Path(self.database.sqlite_path).parent,
            Path(self.logging.file_path).parent,
            Path(self.logging.rag_log_path).parent
        ]
        
        for directory in directories:
            Path(directory).mkdir(parents=True, exist_ok=True)
    
    def save_config(self, config_path: Optional[str] = None):
        """Save configuration to file"""
        save_path = config_path or self.config_path
        config_path_obj = Path(save_path)
        
        # Prepare data for saving
        config_to_save = {
            "ollama": asdict(self.ollama),
            "database": asdict(self.database),
            "anaconda": asdict(self.anaconda),
            "rag": asdict(self.rag),
            "api": asdict(self.api),
            "logging": asdict(self.logging),
            "file_processing": asdict(self.file_processing),
            "vision_llm": asdict(self.vision_llm),
            "system": asdict(self.system)
        }
        
        try:
            config_path_obj.parent.mkdir(parents=True, exist_ok=True)
            
            with open(config_path_obj, 'w', encoding='utf-8') as f:
                if config_path_obj.suffix.lower() in ['.yaml', '.yml']:
                    yaml.dump(config_to_save, f, default_flow_style=False, allow_unicode=True, indent=2)
                else:
                    json.dump(config_to_save, f, ensure_ascii=False, indent=2)
            
            logger.info(f"Configuration saved: {save_path}")
        except Exception as e:
            logger.error(f"Error saving configuration: {e}")
    
    def reload_config(self):
        """Reload configuration from file"""
        self._load_config()
        self._load_from_dict()
        self._create_directories()
        logger.info("Configuration reloaded")
    
    def get_config_summary(self) -> Dict[str, Any]:
        """Get configuration summary"""
        return {
            "config_file": self.config_path,
            "ollama_url": self.ollama.url,
            "database_type": self.database.type,
            "rag_vector_store": self.rag.vector_store_type,
            "api_host": self.api.host,
            "api_port": self.api.port,
            "debug_mode": self.system.debug_mode,
            "offline_mode_enabled": self.ollama.enable_offline_mode
        }
    
    def validate_config(self) -> Dict[str, Any]:
        """Validate configuration"""
        errors = []
        warnings = []
        
        # Check Ollama configuration
        if not self.ollama.url.startswith(('http://', 'https://')):
            errors.append("Ollama URL must start with http:// or https://")
        
        if self.ollama.timeout <= 0:
            errors.append("Ollama timeout must be a positive number")
        
        # Check database configuration
        if self.database.type not in ['sqlite', 'postgresql', 'mysql']:
            errors.append("Database type must be sqlite, postgresql or mysql")
        
        if self.database.type != 'sqlite' and not self.database.host:
            errors.append("For non-SQLite databases, host must be specified")
        
        # Check API configuration
        if not (1 <= self.api.port <= 65535):
            errors.append("API port must be in range 1-65535")
        
        # Check RAG configuration
        if self.rag.vector_store_type not in ['faiss', 'chroma']:
            errors.append("Vector store type must be faiss or chroma")
        
        if self.rag.chunk_size <= 0:
            errors.append("Chunk size must be a positive number")
        
        # Check file paths
        if not Path(self.system.data_dir).parent.exists():
            warnings.append(f"Parent directory for {self.system.data_dir} does not exist")
        
        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "warnings": warnings
        }

# Global configuration manager instance
config_manager = ConfigManager()

def get_config() -> ConfigManager:
    """Get global configuration manager instance"""
    return config_manager

def reload_config():
    """Reload global configuration"""
    global config_manager
    config_manager.reload_config()

def save_config():
    """Save global configuration"""
    config_manager.save_config()
