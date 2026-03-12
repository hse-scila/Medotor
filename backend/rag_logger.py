"""
Module for logging RAG system
Tracking all operations and errors
"""

import logging
import json
import os
from datetime import datetime
from typing import Dict, List, Any, Optional
from pathlib import Path
import threading

class RAGLogger:
    """Class for logging RAG system operations"""
    
    def __init__(self, log_file: str = "logs/rag_system.log"):
        self.log_file = Path(log_file)
        self.log_file.parent.mkdir(parents=True, exist_ok=True)
        
        # Create logger
        self.logger = logging.getLogger('rag_system')
        self.logger.setLevel(logging.DEBUG)
        
        # Clear existing handlers
        self.logger.handlers.clear()
        
        # Create formatter
        formatter = logging.Formatter(
            '%(asctime)s - %(levelname)s - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        
        # File handler
        file_handler = logging.FileHandler(self.log_file, encoding='utf-8')
        file_handler.setLevel(logging.DEBUG)
        file_handler.setFormatter(formatter)
        self.logger.addHandler(file_handler)
        
        # Console handler
        console_handler = logging.StreamHandler()
        console_handler.setLevel(logging.INFO)
        console_handler.setFormatter(formatter)
        self.logger.addHandler(console_handler)
        
        # Thread safety
        self._lock = threading.Lock()
        
        # Cache of recent logs for API
        self.recent_logs = []
        self.max_recent_logs = 1000
        
        self.log_info("RAG Logger initialized")
    
    def _add_to_recent_logs(self, level: str, message: str, extra_data: Optional[Dict] = None):
        """Add log to recent entries cache"""
        with self._lock:
            log_entry = {
                "timestamp": datetime.now().isoformat(),
                "level": level,
                "message": message,
                "extra_data": extra_data or {}
            }
            
            self.recent_logs.append(log_entry)
            
            # Limit cache size
            if len(self.recent_logs) > self.max_recent_logs:
                self.recent_logs = self.recent_logs[-self.max_recent_logs:]
    
    def log_debug(self, message: str, extra_data: Optional[Dict] = None):
        """Log debug information"""
        self.logger.debug(message)
        self._add_to_recent_logs("DEBUG", message, extra_data)
    
    def log_info(self, message: str, extra_data: Optional[Dict] = None):
        """Log informational messages"""
        self.logger.info(message)
        self._add_to_recent_logs("INFO", message, extra_data)
    
    def log_warning(self, message: str, extra_data: Optional[Dict] = None):
        """Log warnings"""
        self.logger.warning(message)
        self._add_to_recent_logs("WARNING", message, extra_data)
    
    def log_error(self, message: str, extra_data: Optional[Dict] = None):
        """Log errors"""
        self.logger.error(message)
        self._add_to_recent_logs("ERROR", message, extra_data)
    
    def log_critical(self, message: str, extra_data: Optional[Dict] = None):
        """Log critical errors"""
        self.logger.critical(message)
        self._add_to_recent_logs("CRITICAL", message, extra_data)
    
    # Specialized methods for RAG operations
    
    def log_rag_config(self, vector_store_type: str, use_ollama: bool, ollama_model: Optional[str] = None):
        """Log RAG configuration"""
        extra_data = {
            "operation": "rag_config",
            "vector_store_type": vector_store_type,
            "use_ollama": use_ollama,
            "ollama_model": ollama_model
        }
        self.log_info(f"RAG config: {vector_store_type}, Ollama: {use_ollama}, Model: {ollama_model}", extra_data)
    
    def log_document_upload(self, filename: str, chunks_count: int, file_size: int, format: str):
        """Log document upload"""
        extra_data = {
            "operation": "document_upload",
            "filename": filename,
            "chunks_count": chunks_count,
            "file_size": file_size,
            "format": format
        }
        self.log_info(f"Document loaded: {filename} ({chunks_count} chunks, {file_size} bytes)", extra_data)
    
    def log_document_add(self, documents_count: int, total_chunks: int):
        """Log document addition"""
        extra_data = {
            "operation": "document_add",
            "documents_count": documents_count,
            "total_chunks": total_chunks
        }
        self.log_info(f"Documents added: {documents_count} ({total_chunks} chunks)", extra_data)
    
    def log_search(self, query: str, results_count: int, search_time: float):
        """Log search"""
        extra_data = {
            "operation": "search",
            "query": query,
            "results_count": results_count,
            "search_time": search_time
        }
        self.log_info(f"Search: '{query}' -> {results_count} results in {search_time:.3f}s", extra_data)
    
    def log_embedding_creation(self, texts_count: int, embedding_dimension: int, model: str):
        """Log embedding creation"""
        extra_data = {
            "operation": "embedding_creation",
            "texts_count": texts_count,
            "embedding_dimension": embedding_dimension,
            "model": model
        }
        self.log_info(f"Embedding creation: {texts_count} texts, dimension: {embedding_dimension}, model: {model}", extra_data)
    
    def log_ollama_connection(self, url: str, success: bool, models_count: int = 0):
        """Log Ollama connection"""
        extra_data = {
            "operation": "ollama_connection",
            "url": url,
            "success": success,
            "models_count": models_count
        }
        if success:
            self.log_info(f"Ollama connection successful: {url} ({models_count} models)", extra_data)
        else:
            self.log_error(f"Ollama connection error: {url}", extra_data)
    
    def log_file_processing(self, filename: str, format: str, success: bool, error: Optional[str] = None):
        """Log file processing"""
        extra_data = {
            "operation": "file_processing",
            "filename": filename,
            "format": format,
            "success": success,
            "error": error
        }
        if success:
            self.log_info(f"File processed: {filename} ({format})", extra_data)
        else:
            self.log_error(f"File processing error {filename}: {error}", extra_data)
    
    def log_vector_store_operation(self, operation: str, vector_store_type: str, success: bool, details: Optional[Dict] = None):
        """Log vector store operations"""
        extra_data = {
            "operation": f"vector_store_{operation}",
            "vector_store_type": vector_store_type,
            "success": success,
            "details": details or {}
        }
        if success:
            self.log_info(f"Vector store operation {vector_store_type}: {operation}", extra_data)
        else:
            self.log_error(f"Vector store operation error {vector_store_type}: {operation}", extra_data)
    
    def log_rag_chat(self, query: str, used_rag: bool, relevant_docs_count: int, response_time: float):
        """Log RAG chat"""
        extra_data = {
            "operation": "rag_chat",
            "query": query,
            "used_rag": used_rag,
            "relevant_docs_count": relevant_docs_count,
            "response_time": response_time
        }
        self.log_info(f"RAG chat: '{query}', RAG: {used_rag}, docs: {relevant_docs_count}, time: {response_time:.3f}s", extra_data)
    
    def get_recent_logs(self, limit: int = 100, level: Optional[str] = None) -> List[Dict]:
        """Get recent logs"""
        with self._lock:
            logs = self.recent_logs.copy()
        
        if level:
            logs = [log for log in logs if log["level"] == level]
        
        return logs[-limit:] if limit > 0 else logs
    
    def get_log_stats(self) -> Dict[str, Any]:
        """Get log statistics"""
        with self._lock:
            logs = self.recent_logs.copy()
        
        if not logs:
            return {"total": 0, "by_level": {}, "by_operation": {}}
        
        # Statistics by level
        by_level = {}
        for log in logs:
            level = log["level"]
            by_level[level] = by_level.get(level, 0) + 1
        
        # Statistics by operation
        by_operation = {}
        for log in logs:
            operation = log.get("extra_data", {}).get("operation", "unknown")
            by_operation[operation] = by_operation.get(operation, 0) + 1
        
        return {
            "total": len(logs),
            "by_level": by_level,
            "by_operation": by_operation,
            "oldest_log": logs[0]["timestamp"] if logs else None,
            "newest_log": logs[-1]["timestamp"] if logs else None
        }
    
    def clear_logs(self):
        """Clear logs"""
        with self._lock:
            self.recent_logs.clear()
        
        # Clear log file
        if self.log_file.exists():
            self.log_file.unlink()
        
        self.log_info("Logs cleared")


# Global RAG logger instance
rag_logger = RAGLogger()

def get_rag_logger() -> RAGLogger:
    """Get global RAG logger instance"""
    return rag_logger
