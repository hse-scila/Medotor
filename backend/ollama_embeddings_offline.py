"""
Module for working with embeddings via Ollama
Fully offline version without internet checks
"""

import httpx
import logging
from typing import List, Dict, Any, Optional
import json
import asyncio
import socket
import time
from config import get_config

logger = logging.getLogger(__name__)

class OllamaEmbeddings:
    """Class for working with embeddings via Ollama (offline mode)"""
    
    def __init__(self, ollama_url: Optional[str] = None):
        # Get configuration
        self.config = get_config()
        
        # Use URL from configuration or passed parameter
        self.ollama_url = ollama_url or self.config.ollama.url
        self.current_embedding_model = None
        self.embedding_dimension = 384  # Default for nomic-embed-text
        self.available_models = []
        self.offline_mode = True  # Always in offline mode
        self.last_connection_check = 0
        self.connection_check_interval = self.config.ollama.connection_check_interval
    
    def is_ollama_local_available(self) -> bool:
        """Check availability of local Ollama server"""
        try:
            # Extract host and port from URL
            if self.ollama_url.startswith("http://"):
                host_port = self.ollama_url[7:]  # Remove "http://"
            elif self.ollama_url.startswith("https://"):
                host_port = self.ollama_url[8:]  # Remove "https://"
            else:
                host_port = self.ollama_url
            
            if ":" in host_port:
                host, port = host_port.split(":", 1)
                port = int(port)
            else:
                host = host_port
                port = 11434  # Default port for Ollama
            
            # Check connection to port
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(2)  # Short timeout for quick check
            result = sock.connect_ex((host, port))
            sock.close()
            return result == 0
        except Exception:
            return False
    
    async def check_connection_status(self) -> Dict[str, Any]:
        """Check connection status (local Ollama only)"""
        current_time = time.time()
        
        # Check only if enough time has passed
        if current_time - self.last_connection_check > self.connection_check_interval:
            self.last_connection_check = current_time
            
            # Check only local Ollama
            ollama_available = self.is_ollama_local_available()
            
            # Always in offline mode
            self.offline_mode = True
            
            logger.info(f"Статус подключения: Ollama локально={ollama_available}, офлайн режим=True")
        
        return {
            "ollama_local_available": self.is_ollama_local_available(),
            "offline_mode": True,  # Always True
            "internet_available": False,  # Don't check internet
            "current_model": self.current_embedding_model,
            "embedding_dimension": self.embedding_dimension,
            "available_models_count": len(self.available_models)
        }
    
    async def get_available_embedding_models(self) -> List[Dict[str, Any]]:
        """Get list of available embedding models"""
        try:
            # Check connection status
            await self.check_connection_status()
            
            # Use short timeout for offline mode
            timeout = self.config.ollama.offline_timeout
            
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.get(f"{self.ollama_url}/api/tags")
                
                if response.status_code == 200:
                    data = response.json()
                    all_models = data.get("models", [])
                    
                    # Filter only embedding models
                    embedding_models = []
                    for model in all_models:
                        model_name = model.get("name", "").lower()
                        if any(keyword in model_name for keyword in ["embed", "nomic", "sentence"]):
                            embedding_models.append({
                                "name": model["name"],
                                "size": model.get("size", 0),
                                "modified_at": model.get("modified_at", ""),
                                "family": model.get("details", {}).get("family", ""),
                                "format": model.get("details", {}).get("format", "")
                            })
                    
                    self.available_models = embedding_models
                    logger.info(f"Найдено {len(embedding_models)} моделей для эмбеддингов")
                    return embedding_models
                else:
                    logger.error(f"Ошибка получения моделей: {response.status_code}")
                    return []
                    
        except httpx.ConnectError:
            logger.warning("Не удается подключиться к Ollama серверу")
            return []
        except Exception as e:
            logger.error(f"Ошибка получения моделей: {e}")
            return []
    
    async def get_embeddings(self, text: str, model: Optional[str] = None) -> Optional[List[float]]:
        """Get embeddings for text"""
        try:
            # Check connection status
            await self.check_connection_status()
            
            # Use model from parameter or configuration
            embedding_model = model or self.config.ollama.embedding_model
            
            # Use extended timeout for offline mode
            timeout = self.config.ollama.offline_timeout * 2
            
            async with httpx.AsyncClient(timeout=timeout) as client:
                data = {
                    "model": embedding_model,
                    "prompt": text
                }
                
                response = await client.post(
                    f"{self.ollama_url}/api/embeddings",
                    json=data
                )
                
                if response.status_code == 200:
                    result = response.json()
                    embedding = result.get("embedding", [])
                    
                    if embedding:
                        self.current_embedding_model = embedding_model
                        self.embedding_dimension = len(embedding)
                        logger.info(f"Эмбеддинг сгенерирован: размерность={len(embedding)}")
                        return embedding
                    else:
                        logger.error("Пустой эмбеддинг в ответе")
                        return None
                else:
                    logger.error(f"Ошибка генерации эмбеддингов: {response.status_code}")
                    return None
                    
        except httpx.ConnectError:
            logger.warning("Не удается подключиться к Ollama серверу")
            return None
        except Exception as e:
            logger.error(f"Ошибка генерации эмбеддингов: {e}")
            return None
    
    async def test_connection(self) -> Dict[str, Any]:
        """Test connection to Ollama"""
        try:
            # Check connection status
            connection_info = await self.check_connection_status()
            
            # Use short timeout for offline mode
            timeout = self.config.ollama.offline_timeout
            
            async with httpx.AsyncClient(timeout=timeout) as client:
                # Test basic connection
                response = await client.get(f"{self.ollama_url}/api/tags")
                
                if response.status_code == 200:
                    models = response.json().get("models", [])
                    
                    # Test embedding generation
                    test_text = "Test text for connection check"
                    embedding_model = self.config.ollama.embedding_model
                    
                    test_data = {
                        "model": embedding_model,
                        "prompt": test_text
                    }
                    
                    embed_response = await client.post(
                        f"{self.ollama_url}/api/embeddings",
                        json=test_data,
                        timeout=timeout * 2
                    )
                    
                    if embed_response.status_code == 200:
                        result = embed_response.json()
                        embedding = result.get("embedding", [])
                        
                        return {
                            "status": "success",
                            "message": "Подключение к Ollama работает",
                            "models_count": len(models),
                            "embedding_dimension": len(embedding),
                            "offline_mode": True,
                            "connection_info": connection_info
                        }
                    else:
                        return {
                            "status": "error",
                            "message": f"Ошибка генерации эмбеддингов: {embed_response.status_code}",
                            "offline_mode": True,
                            "connection_info": connection_info
                        }
                else:
                    return {
                        "status": "error",
                        "message": f"Ошибка подключения: {response.status_code}",
                        "offline_mode": True,
                        "connection_info": connection_info
                    }
                    
        except httpx.ConnectError:
            return {
                "status": "error",
                "message": "Не удается подключиться к Ollama серверу",
                "offline_mode": True,
                "connection_info": connection_info
            }
        except Exception as e:
            return {
                "status": "error",
                "message": f"Ошибка тестирования: {str(e)}",
                "offline_mode": True,
                "connection_info": connection_info
            }
    
    def is_offline_mode(self) -> bool:
        """Check if system is in offline mode"""
        return True  # Always in offline mode
    
    async def get_connection_info(self) -> Dict[str, Any]:
        """Get connection information"""
        return await self.check_connection_status()

# Global instance for use in other modules
_ollama_embeddings_instance = None

def get_ollama_embeddings() -> OllamaEmbeddings:
    """Get global instance of OllamaEmbeddings"""
    global _ollama_embeddings_instance
    if _ollama_embeddings_instance is None:
        _ollama_embeddings_instance = OllamaEmbeddings()
    return _ollama_embeddings_instance
