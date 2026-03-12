"""
RAG (Retrieval-Augmented Generation) system
FAISS and Chroma support for vector search
"""

import os
import json
import logging
from typing import List, Dict, Any, Optional, Tuple
from pathlib import Path
import numpy as np
import time
from datetime import datetime
from ollama_embeddings import get_ollama_embeddings
from rag_logger import get_rag_logger
from config import get_config

# Imports for FAISS
try:
    import faiss
    FAISS_AVAILABLE = True
except ImportError:
    FAISS_AVAILABLE = False
    print("[WARNING] FAISS not installed: pip install faiss-cpu")

# Imports for Chroma
try:
    import chromadb
    from chromadb.config import Settings
    CHROMA_AVAILABLE = True
except ImportError:
    CHROMA_AVAILABLE = False
    print("[WARNING] ChromaDB not installed: pip install chromadb")

# Imports for embeddings
try:
    from sentence_transformers import SentenceTransformer
    SENTENCE_TRANSFORMERS_AVAILABLE = True
except ImportError:
    SENTENCE_TRANSFORMERS_AVAILABLE = False
    print("[WARNING] SentenceTransformers not installed: pip install sentence-transformers")

logger = logging.getLogger(__name__)

class RAGSystem:
    """Universal RAG system with FAISS and Chroma support"""
    
    def __init__(self, vector_store_type: str = "faiss", collection_name: str = "documents", use_ollama: bool = False, force_reset: bool = False, chunk_size: Optional[int] = None, chunk_overlap: Optional[int] = None):
        self.vector_store_type = vector_store_type.lower()
        self.collection_name = collection_name
        self.use_ollama = use_ollama
        self.embedding_model = None
        self.ollama_embeddings = None
        self.vector_store = None
        self.index = None
        self.documents = []
        self.metadata = []
        self.last_update = None
        
        # Chunking parameters
        if chunk_size is None or chunk_overlap is None:
            try:
                config = get_config()
                self.chunk_size = config.rag.chunk_size if chunk_size is None else chunk_size
                self.chunk_overlap = config.rag.chunk_overlap if chunk_overlap is None else chunk_overlap
            except Exception:
                self.chunk_size = chunk_size or 100
                self.chunk_overlap = chunk_overlap or 40
        else:
            self.chunk_size = chunk_size
            self.chunk_overlap = chunk_overlap
        
        # Initialize embedding dimension
        self.dimension = 384  # Default value
        
        # Embedding model information
        self.embedding_model_name = "all-MiniLM-L6-v2"  # Default model name
        self.embedding_model_type = "sentence-transformers"  # Model type
        self.embedding_created_at = None  # Embedding creation time
        
        # Separate tracking of documents and chunks
        self.documents_count = 0  # Number of source documents
        self.chunks_count = 0     # Number of chunks in vector store
        
        # Initialize logger
        self.logger = get_rag_logger()
        
        # Paths for saving
        self.data_dir = Path("data/rag")
        self.data_dir.mkdir(parents=True, exist_ok=True)
        
        self.logger.log_info(f"Инициализация RAG системы: {vector_store_type}, Ollama: {use_ollama}, Принудительный сброс: {force_reset}")
        
        # Initialization will be done asynchronously
        self._initialized = False
    
    async def initialize(self, force_reset: bool = False):
        """Asynchronous RAG system initialization"""
        await self._initialize_embedding_model()
        self._initialize_vector_store(force_reset)
        self._initialized = True
    
    async def _initialize_embedding_model(self):
        """Initialize model for creating embeddings"""
        # If SentenceTransformers unavailable, switch to Ollama
        if not self.use_ollama and not SENTENCE_TRANSFORMERS_AVAILABLE:
            logger.warning("SentenceTransformers not available, switching to Ollama embeddings")
            self.use_ollama = True

        if self.use_ollama:
            # Use Ollama for embeddings
            self.ollama_embeddings = get_ollama_embeddings()
            
            # Get available models and set first available
            available_models = await self.ollama_embeddings.get_available_embedding_models()
            if available_models:
                # Try to find embeddinggemma:latest model or use first available
                target_model = None
                try:
                    config = get_config()
                    if config.rag.ollama_embedding_model:
                        target_model = config.rag.ollama_embedding_model
                except Exception:
                    target_model = None
                for model in available_models:
                    if "embeddinggemma" in model["name"].lower():
                        if not target_model:
                            target_model = model["name"]
                        break
                
                if not target_model:
                    target_model = available_models[0]["name"]
                
                # Set model and get dimension
                success = await self.ollama_embeddings.set_embedding_model(target_model)
                if success:
                    self.dimension = self.ollama_embeddings.embedding_dimension
                    self.embedding_model_name = target_model
                    self.embedding_model_type = "ollama"
                    self.embedding_created_at = datetime.now().isoformat()
                    logger.info(f"[OK] Ollama эмбеддинги инициализированы: {target_model} (размерность: {self.dimension})")
                else:
                    logger.warning("Не удалось установить модель эмбеддингов, используем размерность по умолчанию")
                    self.dimension = 384
            else:
                logger.warning("Доступные модели эмбеддингов не найдены, используем размерность по умолчанию")
                self.dimension = 384
        else:
            # Используем SentenceTransformers
            try:
                # Используем легкую модель для быстрой работы
                self.embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
                self.embedding_model_name = "all-MiniLM-L6-v2"
                self.embedding_model_type = "sentence-transformers"
                self.embedding_created_at = datetime.now().isoformat()
                logger.info("[OK] Модель эмбеддингов загружена: all-MiniLM-L6-v2")
            except Exception as e:
                logger.error(f"Ошибка загрузки модели эмбеддингов: {e}")
                self.embedding_model = None
    
    def _initialize_vector_store(self, force_reset: bool = False):
        """Initialize vector store."""
        if self.vector_store_type == "faiss":
            self._initialize_faiss(force_reset)
        elif self.vector_store_type == "chroma":
            self._initialize_chroma(force_reset)
        else:
            raise ValueError(f"Неподдерживаемый тип векторного хранилища: {self.vector_store_type}")
    
    def _initialize_faiss(self, force_reset: bool = False):
        """Initialize FAISS."""
        if not FAISS_AVAILABLE:
            raise ImportError("FAISS не установлен")
        
        # Определяем размерность в зависимости от типа эмбеддингов
        if self.use_ollama:
            # Для Ollama размерность будет определена при первом использовании
            self.dimension = 384  # Временная размерность
        else:
            # Для SentenceTransformers (384 размерности для all-MiniLM-L6-v2)
            self.dimension = 384
        
        self.index = faiss.IndexFlatIP(self.dimension)  # Inner Product (косинусное сходство)
        
        # Пути к файлам
        index_path = self.data_dir / f"{self.collection_name}_faiss.index"
        metadata_path = self.data_dir / f"{self.collection_name}_metadata.json"
        
        # Если принудительный сброс, удаляем существующие файлы
        if force_reset:
            if index_path.exists():
                index_path.unlink()
                logger.info("[OK] Существующий FAISS индекс удален (принудительный сброс)")
            if metadata_path.exists():
                metadata_path.unlink()
                logger.info("[OK] Существующие метаданные удалены (принудительный сброс)")
        
        # Загружаем существующий индекс, если он есть и не требуется принудительный сброс
        if not force_reset and index_path.exists() and metadata_path.exists():
            try:
                self.index = faiss.read_index(str(index_path))
                with open(metadata_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    self.documents = data.get('documents', [])
                    self.metadata = data.get('metadata', [])
                
                # Загружаем сохраненные счетчики или вычисляем их
                self.documents_count = data.get('documents_count', 0)
                self.chunks_count = data.get('chunks_count', len(self.documents))
                
                # Восстанавливаем информацию о модели эмбеддингов
                self.embedding_model_name = data.get('embedding_model_name', 'all-MiniLM-L6-v2')
                self.embedding_model_type = data.get('embedding_model_type', 'sentence-transformers')
                self.embedding_created_at = data.get('embedding_created_at')
                
                # Восстанавливаем размерность из метаданных
                saved_dimension = data.get('dimension')
                if saved_dimension:
                    self.dimension = saved_dimension
                    logger.info(f"[OK] Размерность эмбеддингов восстановлена из метаданных: {self.dimension}")
                
                # Восстанавливаем настройки системы
                self.vector_store_type = data.get('vector_store_type', self.vector_store_type)
                self.use_ollama = data.get('use_ollama', self.use_ollama)
                
                # Если счетчики не сохранены, вычисляем их
                if self.documents_count == 0 and self.metadata:
                    unique_sources = set()
                    for meta in self.metadata:
                        if 'source' in meta:
                            unique_sources.add(meta['source'])
                    self.documents_count = len(unique_sources)
                    self.chunks_count = len(self.documents)
                
                logger.info(f"[OK] FAISS индекс загружен: {self.documents_count} документов, {self.chunks_count} чанков")
            except Exception as e:
                logger.warning(f"Ошибка загрузки FAISS индекса: {e}")
        
        self.vector_store = "faiss"
        logger.info("[OK] FAISS векторное хранилище инициализировано")
    
    def _initialize_chroma(self, force_reset: bool = False):
        """Initialize ChromaDB."""
        if not CHROMA_AVAILABLE:
            raise ImportError("ChromaDB не установлен")
        
        # Определяем размерность в зависимости от типа эмбеддингов
        if self.use_ollama:
            # Для Ollama размерность будет определена при первом использовании
            self.dimension = 384  # Временная размерность
        else:
            # Для SentenceTransformers (384 размерности для all-MiniLM-L6-v2)
            self.dimension = 384
        
        try:
            # Создаем клиент ChromaDB с персистентностью
            self.chroma_client = chromadb.PersistentClient(
                path=str(self.data_dir / "chroma_db"),
                settings=Settings(anonymized_telemetry=False)
            )
            
            # Если принудительный сброс, удаляем существующую коллекцию
            if force_reset:
                try:
                    self.chroma_client.delete_collection(self.collection_name)
                    logger.info("[OK] Существующая ChromaDB коллекция удалена (принудительный сброс)")
                except:
                    pass  # Коллекция может не существовать
            
            # Получаем или создаем коллекцию
            try:
                self.collection = self.chroma_client.get_collection(self.collection_name)
                logger.info(f"[OK] ChromaDB коллекция загружена: {self.collection_name}")
            except:
                self.collection = self.chroma_client.create_collection(
                    name=self.collection_name,
                    metadata={"description": "RAG документы"}
                )
                logger.info(f"[OK] ChromaDB коллекция создана: {self.collection_name}")
            
            # Подсчитываем документы и чанки
            try:
                count_result = self.collection.count()
                self.chunks_count = count_result
                self.documents_count = self.chunks_count  # Для ChromaDB считаем каждый чанк документом
                logger.info(f"[OK] ChromaDB коллекция содержит: {self.documents_count} документов, {self.chunks_count} чанков")
            except Exception as e:
                logger.warning(f"Ошибка подсчета документов в ChromaDB: {e}")
                self.documents_count = 0
                self.chunks_count = 0
            
            self.vector_store = "chroma"
            logger.info("[OK] ChromaDB векторное хранилище инициализировано")
            
        except Exception as e:
            logger.error(f"Ошибка инициализации ChromaDB: {e}")
            raise
    
    async def add_documents(self, documents: List[str], metadata: Optional[List[Dict]] = None, progress_callback=None):
        """Add documents to the vector store."""
        start_time = time.time()
        
        if not self.use_ollama and not self.embedding_model:
            error_msg = "Модель эмбеддингов не инициализирована"
            self.logger.log_error(error_msg)
            raise ValueError(error_msg)
        
        if metadata is None:
            metadata = [{"source": f"doc_{i}"} for i in range(len(documents))]
        
        self.logger.log_info(f"Начало добавления {len(documents)} документов в {self.vector_store_type}")
        
        try:
            # Сначала считаем новые документы (источники) ДО добавления
            unique_sources = set()
            for meta in metadata:
                if 'source' in meta:
                    unique_sources.add(meta['source'])
            
            # Подсчитываем только новые документы (источники)
            new_documents = 0
            for source in unique_sources:
                # Проверяем, есть ли уже такой источник в метаданных
                source_exists = False
                for existing_meta in self.metadata:
                    if existing_meta.get('source') == source:
                        source_exists = True
                        break
                
                if not source_exists:
                    new_documents += 1
            
            # Добавляем документы в векторное хранилище
            if self.vector_store_type == "faiss":
                await self._add_documents_faiss(documents, metadata, progress_callback)
                
                # Обновляем счетчики для FAISS
                # Если это первое добавление после сброса, сбрасываем счетчики
                if self.documents_count == 0 and self.chunks_count == 0:
                    self.documents_count = new_documents
                    self.chunks_count = len(documents)
                else:
                    self.documents_count += new_documents
                    self.chunks_count += len(documents)  # Каждый элемент = чанк
                    
            elif self.vector_store_type == "chroma":
                await self._add_documents_chroma(documents, metadata)
                # Для ChromaDB счетчики обновляются внутри _add_documents_chroma

            # Принудительно пересчитываем счетчики по фактическим данным,
            # чтобы статистика не "зависала" при несоответствии счетчиков.
            try:
                if self.metadata:
                    unique_sources = {m.get("source") for m in self.metadata if m.get("source")}
                    self.documents_count = len(unique_sources)
                if self.documents:
                    self.chunks_count = len(self.documents)
            except Exception as counter_error:
                self.logger.log_error(f"Ошибка пересчета счетчиков: {counter_error}")
            
            processing_time = time.time() - start_time
            self.logger.log_document_add(new_documents, len(documents))
            self.logger.log_info(f"[OK] Успешно добавлено {new_documents} новых документов, {len(documents)} чанков за {processing_time:.3f}с")
            self.logger.log_info(f"📊 Общая статистика: {self.documents_count} документов, {self.chunks_count} чанков")
            
            # Обновляем время последнего обновления
            from datetime import datetime
            self.last_update = datetime.now().isoformat()
            
        except Exception as e:
            processing_time = time.time() - start_time
            self.logger.log_error(f"Ошибка добавления документов: {str(e)}", {"processing_time": processing_time})
            raise
    
    async def _add_documents_faiss(self, documents: List[str], metadata: List[Dict], progress_callback=None):
        """Add documents to FAISS."""
        # Создаем эмбеддинги
        if self.use_ollama:
            # Проверяем и обновляем размерность ПЕРЕД созданием эмбеддингов
            if self.ollama_embeddings and hasattr(self.ollama_embeddings, 'embedding_dimension'):
                ollama_dimension = self.ollama_embeddings.embedding_dimension
                if ollama_dimension != self.dimension:
                    logger.info(f"Обновление размерности: {self.dimension} -> {ollama_dimension}")
                    self.dimension = ollama_dimension
                    # Пересоздаем индекс с правильной размерностью
                    self.index = faiss.IndexFlatIP(self.dimension)
                    logger.info(f"[OK] FAISS индекс пересоздан с размерностью: {self.dimension}")
            
            # Для Ollama создаем эмбеддинги вручную
            embeddings_list = await self.ollama_embeddings.get_embeddings(documents, progress_callback=progress_callback)
            if not embeddings_list:
                raise ValueError("Не удалось получить эмбеддинги от Ollama")
            embeddings = np.array(embeddings_list, dtype=np.float32)
            
            # Дополнительная проверка размерности после создания эмбеддингов
            if embeddings.shape[1] != self.dimension:
                logger.info(f"Размерность эмбеддингов ({embeddings.shape[1]}) не совпадает с индексом ({self.dimension})")
                self.dimension = embeddings.shape[1]
                # Пересоздаем индекс с правильной размерностью
                self.index = faiss.IndexFlatIP(self.dimension)
                logger.info(f"[OK] Размерность эмбеддингов обновлена: {self.dimension}")
        else:
            embeddings = self.embedding_model.encode(documents, convert_to_numpy=True)
        
        # ПРИНУДИТЕЛЬНАЯ проверка размерности ПЕРЕД добавлением в индекс
        if embeddings.shape[1] != self.index.d:
            logger.info(f"🚨 ПРИНУДИТЕЛЬНОЕ обновление: эмбеддинги {embeddings.shape[1]} != индекс {self.index.d}")
            self.dimension = embeddings.shape[1]
            self.index = faiss.IndexFlatIP(self.dimension)
            logger.info(f"[OK] FAISS индекс ПРИНУДИТЕЛЬНО пересоздан с размерностью: {self.dimension}")
        
        # Проверяем форму и тип эмбеддингов
        logger.info(f"Форма эмбеддингов: {embeddings.shape}, тип: {embeddings.dtype}")
        logger.info(f"Размерность FAISS индекса: {self.index.d}")
        
        # Нормализуем для косинусного сходства
        faiss.normalize_L2(embeddings)
        logger.info(f"[OK] Эмбеддинги нормализованы")
        
        # Добавляем в индекс
        logger.info(f"Добавление {len(embeddings)} эмбеддингов в FAISS индекс...")
        try:
            self.index.add(embeddings)
            logger.info(f"[OK] Эмбеддинги добавлены в FAISS индекс")
        except Exception as e:
            logger.error(f"Ошибка при добавлении в FAISS индекс: {e}")
            logger.error(f"Форма эмбеддингов: {embeddings.shape}")
            logger.error(f"Размерность индекса: {self.index.d}")
            raise
        
        # Сохраняем документы и метаданные
        logger.info(f"Сохранение {len(documents)} документов и метаданных...")
        self.documents.extend(documents)
        self.metadata.extend(metadata)
        logger.info(f"[OK] Документы и метаданные сохранены")
        
        # Сохраняем на диск
        logger.info("Сохранение FAISS индекса на диск...")
        self._save_faiss_index()
        logger.info(f"[OK] FAISS индекс сохранен на диск")
    
    async def _add_documents_chroma(self, documents: List[str], metadata: List[Dict]):
        """Add documents to ChromaDB."""
        # Создаем ID для документов
        ids = [f"doc_{len(self.documents) + i}" for i in range(len(documents))]
        
        if self.use_ollama:
            # Для Ollama создаем эмбеддинги вручную
            embeddings_list = await self.ollama_embeddings.get_embeddings(documents)
            if not embeddings_list:
                raise ValueError("Не удалось получить эмбеддинги от Ollama")
            
            # Обновляем размерность если нужно
            if embeddings_list and len(embeddings_list) > 0:
                embedding_dimension = len(embeddings_list[0])
                if embedding_dimension != self.dimension:
                    self.dimension = embedding_dimension
                    logger.info(f"[OK] Размерность эмбеддингов обновлена: {self.dimension}")
                else:
                    # Принудительно обновляем размерность из Ollama эмбеддингов
                    if self.ollama_embeddings and hasattr(self.ollama_embeddings, 'embedding_dimension'):
                        ollama_dimension = self.ollama_embeddings.embedding_dimension
                        if ollama_dimension != self.dimension:
                            self.dimension = ollama_dimension
                            logger.info(f"[OK] Размерность эмбеддингов принудительно обновлена из Ollama: {self.dimension}")
            
            self.collection.add(
                documents=documents,
                metadatas=metadata,
                ids=ids,
                embeddings=embeddings_list
            )
        else:
            # ChromaDB сам создает эмбеддинги
            self.collection.add(
                documents=documents,
                metadatas=metadata,
                ids=ids
            )
        
        # Обновляем локальные списки для ChromaDB
        self.documents.extend(documents)
        self.metadata.extend(metadata)
        
        # Обновляем счетчики на основе реального состояния ChromaDB
        try:
            actual_count = self.collection.count()
            self.chunks_count = actual_count
            # Для ChromaDB считаем уникальные источники как документы
            unique_sources = set()
            for meta in self.metadata:
                if 'source' in meta:
                    unique_sources.add(meta['source'])
            self.documents_count = len(unique_sources)
            logger.info(f"[OK] ChromaDB счетчики обновлены: {self.documents_count} документов, {self.chunks_count} чанков")
        except Exception as e:
            logger.warning(f"Ошибка обновления счетчиков ChromaDB: {e}")
            # Fallback: просто увеличиваем счетчики
            self.chunks_count += len(documents)
            unique_sources = set()
            for meta in metadata:
                if 'source' in meta:
                    unique_sources.add(meta['source'])
            self.documents_count += len(unique_sources)
    
    async def search(self, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
        """Search for similar documents."""
        start_time = time.time()
        
        if not self.use_ollama and not self.embedding_model:
            error_msg = "Модель эмбеддингов не инициализирована"
            self.logger.log_error(error_msg)
            raise ValueError(error_msg)
        
        self.logger.log_info(f"Начало поиска: '{query}', top_k: {top_k}")
        
        try:
            if self.vector_store_type == "faiss":
                results = await self._search_faiss(query, top_k)
            elif self.vector_store_type == "chroma":
                results = await self._search_chroma(query, top_k)
            else:
                raise ValueError(f"Неподдерживаемый тип векторного хранилища: {self.vector_store_type}")
            
            search_time = time.time() - start_time
            self.logger.log_search(query, len(results), search_time)
            
            return results
            
        except Exception as e:
            search_time = time.time() - start_time
            self.logger.log_error(f"Ошибка поиска: {str(e)}", {"query": query, "search_time": search_time})
            raise
    
    async def _search_faiss(self, query: str, top_k: int) -> List[Dict[str, Any]]:
        """Search in FAISS."""
        if self.index.ntotal == 0:
            return []
        
        # Создаем эмбеддинг для запроса
        if self.use_ollama:
            query_embeddings = await self.ollama_embeddings.get_embeddings([query])
            if not query_embeddings:
                return []
            query_embedding = np.array(query_embeddings, dtype=np.float32)
        else:
            query_embedding = self.embedding_model.encode([query], convert_to_numpy=True)
        
        faiss.normalize_L2(query_embedding)
        
        # Поиск
        scores, indices = self.index.search(query_embedding, min(top_k, self.index.ntotal))
        
        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx != -1:  # Валидный индекс
                results.append({
                    "document": self.documents[idx],
                    "metadata": self.metadata[idx],
                    "score": float(score),
                    "index": int(idx)
                })
        
        return results
    
    async def _search_chroma(self, query: str, top_k: int) -> List[Dict[str, Any]]:
        """Search in ChromaDB."""
        try:
            if self.use_ollama:
                # Для Ollama создаем эмбеддинг запроса вручную
                query_embeddings = await self.ollama_embeddings.get_embeddings([query])
                if not query_embeddings:
                    return []
                
                results = self.collection.query(
                    query_embeddings=query_embeddings,
                    n_results=top_k
                )
            else:
                results = self.collection.query(
                    query_texts=[query],
                    n_results=top_k
                )
            
            formatted_results = []
            if results['documents'] and results['documents'][0]:
                for i, doc in enumerate(results['documents'][0]):
                    formatted_results.append({
                        "document": doc,
                        "metadata": results['metadatas'][0][i] if results['metadatas'] and results['metadatas'][0] else {},
                        "score": results['distances'][0][i] if results['distances'] and results['distances'][0] else 0.0,
                        "index": i
                    })
            
            return formatted_results
        except Exception as e:
            logger.error(f"Ошибка поиска в ChromaDB: {e}")
            return []
    
    def _save_faiss_index(self):
        """Save FAISS index to disk."""
        try:
            index_path = self.data_dir / f"{self.collection_name}_faiss.index"
            metadata_path = self.data_dir / f"{self.collection_name}_metadata.json"
            
            # Сохраняем индекс
            logger.info(f"Запись FAISS индекса в {index_path}...")
            faiss.write_index(self.index, str(index_path))
            logger.info(f"[OK] FAISS индекс записан")
            
            # Сохраняем метаданные
            logger.info(f"Запись метаданных в {metadata_path}...")
            data = {
                "documents": self.documents,
                "metadata": self.metadata,
                "documents_count": self.documents_count,
                "chunks_count": self.chunks_count,
                "embedding_model_name": self.embedding_model_name,
                "embedding_model_type": self.embedding_model_type,
                "embedding_created_at": self.embedding_created_at,
                "dimension": self.dimension,
                "vector_store_type": self.vector_store_type,
                "use_ollama": self.use_ollama
            }
            with open(metadata_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            logger.info(f"[OK] Метаданные записаны")
            
            logger.info(f"[OK] FAISS индекс сохранен: {index_path}")
        except Exception as e:
            logger.error(f"Ошибка сохранения FAISS индекса: {e}")
    
    def get_stats(self) -> Dict[str, Any]:
        """Get vector store statistics."""
        stats = {
            "vector_store_type": self.vector_store_type,
            "collection_name": self.collection_name,
            "use_ollama": self.use_ollama,
            "embedding_model": self.embedding_model_name,
            "embedding_model_type": self.embedding_model_type,
            "embedding_created_at": self.embedding_created_at,
            "documents_count": 0,
            "total_chunks": 0,
            "dimension": 0,
            "index_size": "0 MB",
            "last_update": self.last_update,
            "status": "ready"
        }
        
        # Определяем модель эмбеддингов
        if self.use_ollama:
            if self.ollama_embeddings:
                current_model = self.ollama_embeddings.get_current_model()
                if current_model:
                    # Обновляем сохраненную информацию о модели
                    self.embedding_model_name = current_model
                    self.embedding_model_type = "ollama"
                    stats["embedding_model"] = current_model
                else:
                    stats["embedding_model"] = "Ollama модель не установлена"
                
                # Принудительно обновляем размерность из Ollama эмбеддингов
                if hasattr(self.ollama_embeddings, 'embedding_dimension'):
                    ollama_dimension = self.ollama_embeddings.embedding_dimension
                    if ollama_dimension != self.dimension:
                        self.dimension = ollama_dimension
                        logger.info(f"[OK] Размерность эмбеддингов обновлена в get_stats: {self.dimension}")
            else:
                stats["embedding_model"] = "Ollama эмбеддинги не инициализированы"
        else:
            if self.embedding_model:
                stats["embedding_model"] = self.embedding_model_name
            else:
                stats["embedding_model"] = "SentenceTransformers не загружена"
        
        # Получаем статистику по векторному хранилищу
        if self.vector_store_type == "faiss":
            if self.index:
                # В FAISS индекс содержит чанки, а не документы
                stats["documents_count"] = self.documents_count
                stats["total_chunks"] = self.chunks_count
                stats["dimension"] = self.dimension
                
                # Примерный размер индекса в памяти
                index_size_bytes = self.chunks_count * self.dimension * 4  # 4 байта на float32
                stats["index_size"] = f"{index_size_bytes / (1024*1024):.2f} MB"
            else:
                stats["status"] = "FAISS индекс не инициализирован"
                
        elif self.vector_store_type == "chroma":
            if self.collection:
                try:
                    # Получаем актуальные счетчики из ChromaDB
                    actual_chunks = self.collection.count()
                    self.chunks_count = actual_chunks
                    
                    # Считаем уникальные источники как документы
                    unique_sources = set()
                    for meta in self.metadata:
                        if 'source' in meta:
                            unique_sources.add(meta['source'])
                    self.documents_count = len(unique_sources)
                    
                    stats["documents_count"] = self.documents_count
                    stats["total_chunks"] = self.chunks_count
                    stats["dimension"] = self.dimension
                    stats["index_size"] = "ChromaDB размер неизвестен"
                except Exception as e:
                    stats["status"] = f"Ошибка получения статистики ChromaDB: {str(e)}"
            else:
                stats["status"] = "ChromaDB коллекция не инициализирована"
        
        return stats
    
    def _split_text_into_chunks(self, text: str, chunk_size: int = None, overlap: int = None) -> List[str]:
        """Split text into chunks for better RAG processing."""
        if not text:
            return []
        
        # Используем параметры экземпляра если не указаны
        if chunk_size is None:
            chunk_size = self.chunk_size
        if overlap is None:
            overlap = self.chunk_overlap
        
        # Разбиваем по словам для точного контроля размера
        words = text.split()
        chunks = []
        current_chunk = []
        current_length = 0
        
        for word in words:
            word_length = len(word) + 1  # +1 для пробела
            
            # Если добавление слова превысит размер чанка
            if current_length + word_length > chunk_size and current_chunk:
                chunk_text = " ".join(current_chunk).strip()
                chunks.append(chunk_text)
                
                # Создаем перекрытие для следующего чанка
                overlap_words = []
                overlap_length = 0
                
                # Берем слова с конца текущего чанка для перекрытия
                for i in range(len(current_chunk) - 1, -1, -1):
                    word_len = len(current_chunk[i]) + 1
                    if overlap_length + word_len <= overlap:
                        overlap_words.insert(0, current_chunk[i])
                        overlap_length += word_len
                    else:
                        break
                
                current_chunk = overlap_words + [word]
                current_length = overlap_length + len(word)
            else:
                current_chunk.append(word)
                current_length += word_length
        
        # Добавляем последний чанк
        if current_chunk:
            chunk_text = " ".join(current_chunk).strip()
            chunks.append(chunk_text)
        
        # Фильтруем слишком короткие чанки (минимум 20 символов)
        chunks = [chunk for chunk in chunks if len(chunk.strip()) > 20]
        
        return chunks
    
    def clear_all(self):
        """Clear all documents."""
        if self.vector_store_type == "faiss":
            # Сбрасываем индекс в памяти
            self.index.reset()
            self.documents.clear()
            self.metadata.clear()
            
            # Удаляем файлы индекса с диска
            index_path = self.data_dir / f"{self.collection_name}_faiss.index"
            metadata_path = self.data_dir / f"{self.collection_name}_metadata.json"
            
            if index_path.exists():
                index_path.unlink()
                logger.info("[OK] Файл FAISS индекса удален с диска")
            
            if metadata_path.exists():
                metadata_path.unlink()
                logger.info("[OK] Файл метаданных удален с диска")
            
            # Сохраняем пустой индекс
            self._save_faiss_index()
            
        elif self.vector_store_type == "chroma":
            try:
                # Удаляем коллекцию
                self.chroma_client.delete_collection(self.collection_name)
                logger.info("[OK] ChromaDB коллекция удалена")
                
                # Переинициализируем с принудительным сбросом
                self._initialize_chroma(force_reset=True)
            except Exception as e:
                logger.warning(f"Ошибка очистки ChromaDB: {e}")
                # Если не удалось удалить коллекцию, переинициализируем
                self._initialize_chroma(force_reset=True)
        
        # Сбрасываем счетчики
        self.documents_count = 0
        self.chunks_count = 0
        
        # Сбрасываем время последнего обновления
        self.last_update = None
        
        logger.info("[OK] Все документы удалены")
    
    async def switch_vector_store(self, new_type: str):
        """Switch vector store type."""
        if new_type.lower() not in ["faiss", "chroma"]:
            raise ValueError("Поддерживаются только faiss и chroma")
        
        if new_type.lower() == self.vector_store_type:
            return
        
        logger.info(f"Переключение с {self.vector_store_type} на {new_type}")
        
        # Сохраняем текущие документы
        current_docs = self.documents.copy()
        current_meta = self.metadata.copy()
        
        # Переключаем тип
        self.vector_store_type = new_type.lower()
        
        # Переинициализируем
        self._initialize_vector_store()
        
        # Добавляем документы в новое хранилище
        if current_docs:
            await self.add_documents(current_docs, current_meta)
        
        logger.info(f"[OK] Переключено на {new_type}")


# Глобальный экземпляр RAG системы
rag_system = None

async def get_rag_system(vector_store_type: Optional[str] = None, use_ollama: Optional[bool] = None, force_reset: bool = False, chunk_size: Optional[int] = None, chunk_overlap: Optional[int] = None) -> RAGSystem:
    """Return the global RAG system instance."""
    global rag_system
    
    if vector_store_type is None or use_ollama is None:
        try:
            config = get_config()
            if vector_store_type is None:
                vector_store_type = config.rag.vector_store_type
            if use_ollama is None:
                use_ollama = config.rag.use_ollama_embeddings
        except Exception:
            vector_store_type = vector_store_type or "faiss"
            use_ollama = bool(use_ollama)

    if chunk_size is None or chunk_overlap is None:
        try:
            config = get_config()
            if chunk_size is None:
                chunk_size = config.rag.chunk_size
            if chunk_overlap is None:
                chunk_overlap = config.rag.chunk_overlap
        except Exception:
            chunk_size = chunk_size or 100
            chunk_overlap = chunk_overlap or 40
    
    if rag_system is None or rag_system.vector_store_type != vector_store_type or rag_system.use_ollama != use_ollama or force_reset:
        rag_system = RAGSystem(vector_store_type=vector_store_type, use_ollama=use_ollama, force_reset=force_reset, chunk_size=chunk_size, chunk_overlap=chunk_overlap)
        await rag_system.initialize(force_reset)
    
    return rag_system

