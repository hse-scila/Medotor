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
        
        # Use URL from config or passed parameter
        self.ollama_url = ollama_url or self.config.ollama.url
        self.current_embedding_model = None
        self.embedding_dimension = 384  # Default for nomic-embed-text
        self.available_models = []
        self.offline_mode = True  # Always in offline mode
        self.last_connection_check = 0
        self.connection_check_interval = self.config.ollama.connection_check_interval
        
        # Log instance creation for debugging
        logger.info(f"OllamaEmbeddings initialized with URL: {self.ollama_url}")
    
    def is_ollama_local_available(self) -> bool:
        """Check local Ollama server availability"""
        try:
            # Use synchronous httpx for quick check
            import httpx
            
            # Make quick HTTP request to check availability
            with httpx.Client(timeout=2.0) as client:
                try:
                    response = client.get(f"{self.ollama_url}/api/tags", timeout=2.0)
                    return response.status_code == 200
                except (httpx.ConnectError, httpx.TimeoutException, httpx.RequestError):
                    return False
        except Exception:
            # Fallback to socket check
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
                
                # Check connection to port via socket
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(2)  # Short timeout for quick check
                result = sock.connect_ex((host, port))
                sock.close()
                return result == 0
            except Exception:
                return False
    
    async def check_connection_status(self, force_check: bool = False) -> Dict[str, Any]:
        """Check connection status (local Ollama only)"""
        current_time = time.time()
        
        # Check only if enough time has passed or forced
        if force_check or current_time - self.last_connection_check > self.connection_check_interval:
            self.last_connection_check = current_time
            
            # Check only local Ollama
            logger.info(f"Checking connection to Ollama at {self.ollama_url}")
            ollama_available = self.is_ollama_local_available()
            
            # Always in offline mode
            self.offline_mode = True
            
            if ollama_available:
                logger.info(f"✓ Ollama is available at {self.ollama_url}")
            else:
                logger.warning(f"✗ Ollama is not available at {self.ollama_url}")
            
            logger.info(f"Connection status: Ollama locally={ollama_available}, offline mode=True")
        
        # Get total Ollama models count - EXACTLY AS IN TEST
        total_models_count = 0
        try:
            # Direct request without preliminary check (as in test)
            import httpx
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{self.ollama_url}/api/tags")
                if response.status_code == 200:
                    data = response.json()
                    total_models_count = len(data.get('models', []))
                    logger.info(f"Retrieved {total_models_count} models from Ollama")
        except Exception as e:
            logger.warning(f"Failed to get Ollama models count: {e}")
        
        return {
            "ollama_local_available": self.is_ollama_local_available(),
            "ollama_available": self.is_ollama_local_available(),  # For compatibility
            "offline_mode": True,  # Always True
            "internet_available": False,  # Don't check internet
            "current_model": self.current_embedding_model,
            "embedding_dimension": self.embedding_dimension,
            "available_models_count": total_models_count,  # Total models count
            "embedding_models_count": len(self.available_models)  # Embedding models count
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
                    logger.info(f"Found {len(embedding_models)} embedding models")
                    return embedding_models
                else:
                    logger.error(f"Error getting models: {response.status_code}")
                    return []
                    
        except httpx.ConnectError:
            logger.warning("Cannot connect to Ollama server")
            return []
        except Exception as e:
            logger.error(f"Error getting models: {e}")
            return []
    
    async def get_embeddings(self, texts, model: Optional[str] = None, batch_size: int = 10, progress_callback=None) -> Optional[List[List[float]]]:
        """
        Get embeddings for text or list of texts with batch processing.
        
        Args:
            texts: Single string or list of strings
            model: Embedding model name (optional)
            batch_size: Batch size for list processing (default 10)
            progress_callback: Callback for progress (optional)
        
        Returns:
            Single text: List[float] - one embedding
            List of texts: List[List[float]] - list of embeddings
        """
        try:
            # Check connection status
            await self.check_connection_status()
            
            # Use model from parameter, then current selected, then configuration
            embedding_model = model or self.current_embedding_model or self.config.ollama.embedding_model
            
            # Determine if single text or list
            is_single_text = isinstance(texts, str)
            if is_single_text:
                texts = [texts]
            
            # Use extended timeout for offline mode
            timeout = self.config.ollama.offline_timeout * 2
            
            async with httpx.AsyncClient(timeout=timeout) as client:
                all_embeddings = []
                total_texts = len(texts)
                
                # Process texts in batches
                # Limit parallelism to avoid overloading Ollama
                max_concurrency = min(8, batch_size)
                semaphore = asyncio.Semaphore(max_concurrency)

                async def embed_one(text: str) -> Optional[List[float]]:
                    async with semaphore:
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
                                # Update dimension on first embedding
                                if not self.embedding_dimension or self.embedding_dimension != len(embedding):
                                    self.embedding_dimension = len(embedding)
                                return embedding
                            logger.warning("Empty embedding in response for one of texts")
                            return None
                        logger.error(f"Error generating embeddings: {response.status_code}")
                        return None

                for i in range(0, total_texts, batch_size):
                    batch_texts = texts[i:i + batch_size]
                    batch_num = (i // batch_size) + 1
                    total_batches = (total_texts + batch_size - 1) // batch_size
                    
                    # Send progress callback
                    if progress_callback:
                        progress_data = {
                            "type": "embedding_progress",
                            "current_batch": batch_num,
                            "total_batches": total_batches,
                            "current_documents": len(batch_texts),
                            "total_documents": total_texts,
                            "progress_percent": int((i + len(batch_texts)) / total_texts * 100)
                        }
                        if asyncio.iscoroutinefunction(progress_callback):
                            await progress_callback(progress_data)
                        else:
                            progress_callback(progress_data)
                    
                    # Get batch embeddings in parallel (with limit)
                    batch_embeddings = await asyncio.gather(
                        *[embed_one(text) for text in batch_texts],
                        return_exceptions=False
                    )
                    
                    all_embeddings.extend(batch_embeddings)
                    
                    # Small delay between batches to avoid overload
                    if i + batch_size < total_texts:
                        await asyncio.sleep(0.1)
                
                # Send completion callback
                if progress_callback:
                    progress_data = {
                        "type": "embedding_complete",
                        "total_embeddings": len(all_embeddings),
                        "progress_percent": 100
                    }
                    if asyncio.iscoroutinefunction(progress_callback):
                        await progress_callback(progress_data)
                    else:
                        progress_callback(progress_data)
                
                # Check that all embeddings are received
                if None in all_embeddings:
                    logger.warning(f"Some embeddings were not received: {all_embeddings.count(None)} of {total_texts}")
                    # Filter None values
                    all_embeddings = [emb for emb in all_embeddings if emb is not None]
                    if not all_embeddings:
                        logger.error("All embeddings are empty")
                        return None
                
                if all_embeddings:
                    self.current_embedding_model = embedding_model
                    logger.info(f"Embeddings generated: {len(all_embeddings)} of {total_texts}, dimension={self.embedding_dimension}")
                    
                    # If single text was passed, return single embedding
                    if is_single_text:
                        return all_embeddings[0] if all_embeddings else None
                    else:
                        return all_embeddings
                else:
                    logger.error("Failed to get embeddings")
                    return None
                    
        except httpx.ConnectError:
            logger.warning("Cannot connect to Ollama server")
            return None
        except Exception as e:
            logger.error(f"Error generating embeddings: {e}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
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
                            "message": "Connection to Ollama is working",
                            "models_count": len(models),
                            "embedding_dimension": len(embedding),
                            "offline_mode": True,
                            "connection_info": connection_info
                        }
                    else:
                        return {
                            "status": "error",
                            "message": f"Embedding generation error: {embed_response.status_code}",
                            "offline_mode": True,
                            "connection_info": connection_info
                        }
                else:
                    return {
                        "status": "error",
                        "message": f"Connection error: {response.status_code}",
                        "offline_mode": True,
                        "connection_info": connection_info
                    }
                    
        except httpx.ConnectError:
            return {
                "status": "error",
                "message": "Cannot connect to Ollama server",
                "offline_mode": True,
                "connection_info": connection_info
            }
        except Exception as e:
            return {
                "status": "error",
                "message": f"Test error: {str(e)}",
                "offline_mode": True,
                "connection_info": connection_info
            }
    
    def is_offline_mode(self) -> bool:
        """Check if system is in offline mode"""
        return True  # Always in offline mode
    
    def get_current_model(self) -> Optional[str]:
        """Get current embedding model"""
        return self.current_embedding_model
    
    async def get_embedding_dimension(self) -> int:
        """Get embedding dimension"""
        return self.embedding_dimension
    
    async def set_embedding_model(self, model_name: str) -> bool:
        """Set embedding model"""
        try:
            # Check that model is available
            models = await self.get_available_embedding_models()
            model_names = [m['name'] for m in models]
            
            if model_name not in model_names:
                logger.warning(f"Model {model_name} not found among available")
                return False
            
            # Set model
            self.current_embedding_model = model_name
            
            # Test model to get dimension
            test_embedding = await self.get_embeddings("test", model_name)
            if test_embedding:
                self.embedding_dimension = len(test_embedding)
                logger.info(f"Embedding model set: {model_name}, dimension: {self.embedding_dimension}")
                return True
            else:
                logger.error(f"Failed to test model {model_name}")
                return False
                
        except Exception as e:
            logger.error(f"Error setting embedding model: {e}")
            return False
    
    async def get_connection_info(self) -> Dict[str, Any]:
        """Get connection information"""
        return await self.check_connection_status()

# Global instance for use in other modules
_ollama_embeddings_instance = None
_last_config_url = None

def get_ollama_embeddings() -> OllamaEmbeddings:
    """Get global instance of OllamaEmbeddings"""
    global _ollama_embeddings_instance, _last_config_url
    
    # Get current URL from configuration
    config = get_config()
    current_url = config.ollama.url
    
    # If instance not created or URL changed - create new one
    if _ollama_embeddings_instance is None or _last_config_url != current_url:
        logger.info(f"Creating/updating OllamaEmbeddings instance with URL: {current_url}")
        _ollama_embeddings_instance = OllamaEmbeddings()
        _last_config_url = current_url
    
    return _ollama_embeddings_instance

def reset_ollama_embeddings():
    """Reset global instance (for configuration reload)"""
    global _ollama_embeddings_instance, _last_config_url
    _ollama_embeddings_instance = None
    _last_config_url = None
    logger.info("OllamaEmbeddings instance reset")
