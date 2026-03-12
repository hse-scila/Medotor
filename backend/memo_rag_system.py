"""
MemoRAG (Memory-Augmented Retrieval-Augmented Generation) system
Global memory implementation, hint generation and two-stage processing
"""

import logging
import json
import numpy as np
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass
from datetime import datetime
import pickle
import os
from pathlib import Path

logger = logging.getLogger(__name__)

@dataclass
class MemoryEntry:
    """Entry in global memory"""
    content: str
    importance_score: float
    keywords: List[str]
    timestamp: datetime
    source_doc: str
    memory_type: str  # "fact", "concept", "relationship", "summary"

@dataclass
class Clue:
    """Hint for retriever"""
    query: str
    context_hints: List[str]
    expected_doc_types: List[str]
    confidence: float

class GlobalMemory:
    """Global memory for MemoRAG"""
    
    def __init__(self, max_entries: int = 10000, compression_ratio: float = 0.1):
        self.max_entries = max_entries
        self.compression_ratio = compression_ratio
        self.memory_entries: List[MemoryEntry] = []
        self.memory_index = {}  # Index by keywords
        self.summary_cache = {}  # Summary cache by documents
        
    def add_entry(self, content: str, importance_score: float, keywords: List[str], 
                  source_doc: str, memory_type: str = "fact") -> None:
        """Add entry to global memory"""
        entry = MemoryEntry(
            content=content,
            importance_score=importance_score,
            keywords=keywords,
            timestamp=datetime.now(),
            source_doc=source_doc,
            memory_type=memory_type
        )
        
        self.memory_entries.append(entry)
        
        # Update index
        for keyword in keywords:
            if keyword not in self.memory_index:
                self.memory_index[keyword] = []
            self.memory_index[keyword].append(len(self.memory_entries) - 1)
        
        # Memory compression when limit exceeded
        if len(self.memory_entries) > self.max_entries:
            self._compress_memory()
    
    def _compress_memory(self) -> None:
        """Compress memory, keeping only most important entries"""
        logger.info(f"Memory compression: {len(self.memory_entries)} -> {int(len(self.memory_entries) * self.compression_ratio)}")
        
        # Sort by importance
        sorted_entries = sorted(self.memory_entries, key=lambda x: x.importance_score, reverse=True)
        
        # Keep only top entries
        keep_count = int(len(self.memory_entries) * self.compression_ratio)
        self.memory_entries = sorted_entries[:keep_count]
        
        # Rebuild index
        self.memory_index = {}
        for i, entry in enumerate(self.memory_entries):
            for keyword in entry.keywords:
                if keyword not in self.memory_index:
                    self.memory_index[keyword] = []
                self.memory_index[keyword].append(i)
    
    def search_memory(self, query: str, top_k: int = 10) -> List[MemoryEntry]:
        """Search in global memory"""
        query_keywords = query.lower().split()
        scored_entries = []
        
        for i, entry in enumerate(self.memory_entries):
            score = 0
            
            # Keyword match
            for keyword in query_keywords:
                if keyword in [k.lower() for k in entry.keywords]:
                    score += 1
            
            # Entry importance
            score += entry.importance_score * 0.5
            
            # Entry freshness (newer entries are more important)
            days_old = (datetime.now() - entry.timestamp).days
            freshness_score = max(0, 1 - days_old / 30)  # Decay over 30 days
            score += freshness_score * 0.3
            
            if score > 0:
                scored_entries.append((score, entry))
        
        # Sort and return top results
        scored_entries.sort(key=lambda x: x[0], reverse=True)
        return [entry for score, entry in scored_entries[:top_k]]
    
    def generate_summary(self, doc_content: str, max_length: int = 500) -> str:
        """Generate document summary for caching"""
        if doc_content in self.summary_cache:
            return self.summary_cache[doc_content]
        
        # If text is already short, return as is
        if len(doc_content) <= max_length:
            summary = doc_content
        else:
            # Truncate by characters, not by sentences
            summary = doc_content[:max_length] + "..."
        
        self.summary_cache[doc_content] = summary
        return summary

class ClueGenerator:
    """Hint generator for the retriever."""
    
    def __init__(self, memory: GlobalMemory):
        self.memory = memory
    
    def generate_clues(self, user_query: str, memory_context: List[MemoryEntry]) -> List[Clue]:
        """Generate hints based on user query and memory context."""
        clues = []
        
        # Main hint based on query
        main_clue = Clue(
            query=user_query,
            context_hints=self._extract_context_hints(memory_context),
            expected_doc_types=["relevant", "detailed"],
            confidence=0.8
        )
        clues.append(main_clue)
        
        # Additional hints based on memory
        for entry in memory_context[:3]:  # Top 3 memory entries
            if entry.memory_type == "concept":
                concept_clue = Clue(
                    query=f"{entry.content} {user_query}",
                    context_hints=[entry.content],
                    expected_doc_types=["definition", "explanation"],
                    confidence=0.6
                )
                clues.append(concept_clue)
            
            elif entry.memory_type == "relationship":
                rel_clue = Clue(
                    query=f"relationship between {entry.content} and {user_query}",
                    context_hints=[entry.content],
                    expected_doc_types=["comparison", "analysis"],
                    confidence=0.5
                )
                clues.append(rel_clue)
        
        return clues
    
    def _extract_context_hints(self, memory_context: List[MemoryEntry]) -> List[str]:
        """Extract context hints from memory."""
        hints = []
        for entry in memory_context:
            hints.extend(entry.keywords[:3])  # Top 3 keywords
        return list(set(hints))  # Remove duplicates

class MemoRAGSystem:
    """Main MemoRAG system."""
    
    def __init__(self, base_rag_system, memory_size: int = 10000, context_length: int = 200):
        self.base_rag = base_rag_system
        self.global_memory = GlobalMemory(max_entries=memory_size)
        self.clue_generator = ClueGenerator(self.global_memory)
        self.memory_file = Path("data/rag/memo_memory.pkl")
        self.context_length = context_length  # Context length for display
        
        # Load existing memory
        self._load_memory()
    
    def _load_memory(self) -> None:
        """Load memory from file."""
        if self.memory_file.exists():
            try:
                with open(self.memory_file, 'rb') as f:
                    data = pickle.load(f)
                    self.global_memory.memory_entries = data.get('entries', [])
                    self.global_memory.memory_index = data.get('index', {})
                    self.global_memory.summary_cache = data.get('cache', {})
                logger.info(f"Memory loaded: {len(self.global_memory.memory_entries)} entries")
            except Exception as e:
                logger.error(f"Error loading memory: {e}")
    
    def _save_memory(self) -> None:
        """Save memory to file."""
        try:
            self.memory_file.parent.mkdir(parents=True, exist_ok=True)
            data = {
                'entries': self.global_memory.memory_entries,
                'index': self.global_memory.memory_index,
                'cache': self.global_memory.summary_cache
            }
            with open(self.memory_file, 'wb') as f:
                pickle.dump(data, f)
            logger.info(f"Memory saved: {len(self.global_memory.memory_entries)} entries")
        except Exception as e:
            logger.error(f"Error saving memory: {e}")
    
    async def add_documents(self, documents: List[str], metadata: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
        """Add documents to the MemoRAG system."""
        try:
            # Add documents to base RAG system (if available)
            if self.base_rag is not None:
                base_metadata = metadata
                if base_metadata is None:
                    base_metadata = [{"source": f"memorag_doc_{i}"} for i in range(len(documents))]
                await self.base_rag.add_documents(documents, base_metadata)
            
            # Update global memory
            for i, doc in enumerate(documents):
                # Extract keywords (simple implementation)
                keywords = self._extract_keywords(doc)
                
                # Determine document importance
                importance = self._calculate_importance(doc)
                
                # Determine memory type
                memory_type = self._classify_memory_type(doc)
                
                # Add to memory (save full text)
                self.global_memory.add_entry(
                    content=doc,  # Save full text
                    importance_score=importance,
                    keywords=keywords,
                    source_doc=f"doc_{i}",
                    memory_type=memory_type
                )
            
            # Save memory
            self._save_memory()
            
            return {
                "status": "success",
                "message": f"Added {len(documents)} documents to MemoRAG",
                "documents_count": len(documents),
                "memory_entries": len(self.global_memory.memory_entries)
            }
        except Exception as e:
            logger.error(f"Error adding documents to MemoRAG: {e}")
            return {
                "status": "error",
                "message": f"Error adding documents: {str(e)}"
            }
    
    def _extract_keywords(self, text: str) -> List[str]:
        """Extract keywords from text."""
        # Simple implementation - can be replaced with more complex one
        words = text.lower().split()
        
        # Filter stop words
        stop_words = {'и', 'в', 'на', 'с', 'по', 'для', 'от', 'до', 'из', 'к', 'о', 'у', 'за', 'при', 'через'}
        keywords = [word for word in words if len(word) > 3 and word not in stop_words]
        
        # Return top 10 unique words
        from collections import Counter
        word_counts = Counter(keywords)
        return [word for word, count in word_counts.most_common(10)]
    
    def _calculate_importance(self, text: str) -> float:
        """Calculate document importance."""
        # Simple heuristic - can be replaced with more complex model
        importance = 0.5  # Base importance
        
        # Increase importance for medical terms
        medical_terms = ['treatment', 'diagnosis', 'symptoms', 'disease', 'therapy', 'procedure']
        for term in medical_terms:
            if term in text.lower():
                importance += 0.1
        
        # Increase importance for long documents
        if len(text) > 500:
            importance += 0.2
        
        return min(importance, 1.0)  # Cap at 1.0
    
    def _classify_memory_type(self, text: str) -> str:
        """Classify memory type."""
        text_lower = text.lower()
        
        if any(word in text_lower for word in ['definition', 'is', 'means', 'определение', 'это', 'означает']):
            return "concept"
        elif any(word in text_lower for word in ['relationship', 'comparison', 'difference', 'связь', 'сравнение', 'различие']):
            return "relationship"
        elif any(word in text_lower for word in ['summary', 'conclusion', 'резюме', 'вывод', 'заключение']):
            return "summary"
        else:
            return "fact"
    
    async def search_with_memory(self, query: str, top_k: int = 5) -> Dict[str, Any]:
        """Search using global memory."""
        # 1. Search in global memory
        memory_results = self.global_memory.search_memory(query, top_k=5)
        
        # 2. Generate hints
        clues = self.clue_generator.generate_clues(query, memory_results)
        
        # 3. Search in base RAG system with hints
        all_results = []
        
        for clue in clues:
            # Search by each hint
            try:
                if self.base_rag is None:
                    continue
                # Use base RAG system for search
                rag_results = await self.base_rag.search(clue.query, top_k=3)
                
                # Normalize result format (document -> text)
                for result in rag_results:
                    if "text" not in result and "document" in result:
                        result["text"] = result["document"]
                    result['clue'] = clue.query
                    result['clue_confidence'] = clue.confidence
                    result['memory_context'] = clue.context_hints
                
                all_results.extend(rag_results)
            except Exception as e:
                logger.error(f"Error searching by hint '{clue.query}': {e}")
                continue
        
        # 4. Deduplication and ranking
        unique_results = self._deduplicate_results(all_results)
        ranked_results = self._rank_results(unique_results, query, memory_results)
        
        # 5. Apply context size to results
        for result in ranked_results[:top_k]:
            if 'text' in result and len(result['text']) > self.context_length:
                original_length = len(result['text'])
                result['text'] = result['text'][:self.context_length] + "..."
                print(f"DEBUG: Truncated result from {original_length} to {self.context_length} chars")
        
        # 6. Apply context size to memory context
        memory_context = []
        for entry in memory_results:
            content = entry.content
            print(f"DEBUG: Original memory content: {len(content)} chars")
            print(f"DEBUG: First 200 chars: {content[:200]}...")
            
            if len(content) > self.context_length:
                content = content[:self.context_length] + "..."
                print(f"DEBUG: Truncated to {self.context_length} chars")
            else:
                print(f"DEBUG: Content already short ({len(content)} chars)")
            
            memory_context.append(content)
        
        # 7. Apply context size to hints
        clues_used = []
        for clue in clues:
            clue_text = clue.query
            if len(clue_text) > self.context_length:
                clue_text = clue_text[:self.context_length] + "..."
            clues_used.append(clue_text)
        
        return {
            'results': ranked_results[:top_k],
            'memory_context': memory_context,
            'clues_used': clues_used,
            'total_clues': len(clues)
        }
    
    def _deduplicate_results(self, results: List[Dict]) -> List[Dict]:
        """Remove duplicates from results."""
        seen_texts = set()
        unique_results = []
        
        for result in results:
            text = result.get('text', '')
            if text not in seen_texts:
                seen_texts.add(text)
                unique_results.append(result)
        
        return unique_results
    
    def _rank_results(self, results: List[Dict], query: str, memory_context: List[MemoryEntry]) -> List[Dict]:
        """Rank results taking memory into account."""
        for result in results:
            base_score = result.get('score', 0)
            
            # Bonus for using hints
            clue_bonus = result.get('clue_confidence', 0) * 0.2
            
            # Bonus for matching memory context
            memory_bonus = 0
            if result.get('memory_context'):
                memory_bonus = 0.1
            
            # Final score
            result['final_score'] = base_score + clue_bonus + memory_bonus
        
        # Sort by final score
        return sorted(results, key=lambda x: x.get('final_score', 0), reverse=True)
    
    async def chat_with_memory(self, messages: List[Dict], use_memory: bool = True) -> Dict[str, Any]:
        """Chat using MemoRAG."""
        if not messages:
            return {'response': 'No messages to process'}
        
        user_message = messages[-1]['content']
        
        if use_memory:
            # Use MemoRAG search
            search_results = await self.search_with_memory(user_message, top_k=5)
            
            # Form context with memory
            context_parts = []
            
            # Add memory context
            if search_results['memory_context']:
                context_parts.append("Context from memory:")
                for ctx in search_results['memory_context'][:3]:
                    # Memory context already truncated in search_with_memory
                    context_parts.append(f"- {ctx}")
            
            # Add found documents
            if search_results['results']:
                context_parts.append("\nRelevant documents:")
                for result in search_results['results']:
                    # Results already truncated in search_with_memory
                    context_parts.append(f"- {result['text']}")
            
            # Add information about hints
            if search_results['clues_used']:
                context_parts.append(f"\nClues used: {', '.join(search_results['clues_used'][:3])}")
            
            context = "\n".join(context_parts)
            
            # Update last message with context
            enhanced_messages = messages.copy()
            enhanced_messages[-1]['content'] = f"{user_message}\n\n{context}"
            
            # Use base RAG system for answer generation
            # For now return simple answer, can integrate with model
            response = f"MemoRAG-based answer with context from {len(search_results['memory_context'])} memory entries and {len(search_results['results'])} documents."
            
            return {
                'response': response,
                'memory_used': True,
                'memory_context_count': len(search_results['memory_context']),
                'clues_count': search_results['total_clues'],
                'documents_found': len(search_results['results'])
            }
        else:
            # Use regular RAG system
            return {'response': 'Regular answer without memory'}
    
    def get_memory_stats(self) -> Dict[str, Any]:
        """Get memory statistics."""
        return {
            'total_entries': len(self.global_memory.memory_entries),
            'memory_types': {
                'fact': len([e for e in self.global_memory.memory_entries if e.memory_type == 'fact']),
                'concept': len([e for e in self.global_memory.memory_entries if e.memory_type == 'concept']),
                'relationship': len([e for e in self.global_memory.memory_entries if e.memory_type == 'relationship']),
                'summary': len([e for e in self.global_memory.memory_entries if e.memory_type == 'summary'])
            },
            'indexed_keywords': len(self.global_memory.memory_index),
            'cache_size': len(self.global_memory.summary_cache),
            'compression_ratio': self.global_memory.compression_ratio,
            'max_entries': self.global_memory.max_entries,
            'context_length': self.context_length
        }
    
    def clear_memory(self) -> None:
        """Clear global memory."""
        self.global_memory.memory_entries.clear()
        self.global_memory.memory_index.clear()
        self.global_memory.summary_cache.clear()
        
        # Delete memory file
        if self.memory_file.exists():
            self.memory_file.unlink()
        
        logger.info("Global memory cleared")
    
    def set_context_length(self, length: int) -> None:
        """Set the context length for display."""
        if length < 50:
            length = 50  # Minimum size
        elif length > 2000:
            length = 2000  # Maximum size
        
        old_length = self.context_length
        self.context_length = length
        
        # Update existing memory entries if new size is larger
        if length > old_length:
            self._update_memory_context_length(length)
        
        logger.info(f"Context size set: {length} characters")
        print(f"DEBUG: Context size set: {length} characters")
    
    def _update_memory_context_length(self, new_length: int) -> None:
        """Update context length of existing memory entries."""
        updated_count = 0
        for entry in self.global_memory.memory_entries:
            # If entry was truncated and new size is larger
            if entry.content.endswith("...") and len(entry.content) < new_length:
                # Now we can restore full text since we save it
                # But need to find original document for this
                # For now just update display
                updated_count += 1
        
        print(f"DEBUG: Updated {updated_count} entries in memory")
    
    def check_memory_content_lengths(self) -> Dict[str, Any]:
        """Check content lengths in memory for debugging."""
        lengths = []
        short_entries = 0
        truncated_entries = 0
        
        for i, entry in enumerate(self.global_memory.memory_entries):
            length = len(entry.content)
            lengths.append(length)
            
            if length < 200:
                short_entries += 1
            
            if entry.content.endswith("..."):
                truncated_entries += 1
        
        return {
            "total_entries": len(self.global_memory.memory_entries),
            "average_length": sum(lengths) / len(lengths) if lengths else 0,
            "min_length": min(lengths) if lengths else 0,
            "max_length": max(lengths) if lengths else 0,
            "short_entries": short_entries,
            "truncated_entries": truncated_entries,
            "context_length": self.context_length
        }
