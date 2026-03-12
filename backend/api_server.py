"""
OpenAI-compatible API server
Mimics LM Studio API functionality
"""

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from pathlib import Path
import uvicorn
import json
import httpx
import asyncio
import re
from model_server import model_manager, get_available_models, load_preset_model, get_real_ollama_models
from rag_system import get_rag_system, RAGSystem
from memo_rag_system import MemoRAGSystem
from file_processor import get_file_processor
from ollama_embeddings import get_ollama_embeddings
from rag_logger import get_rag_logger
from patients_database import PatientsDatabase
from ocr_module import get_ocr_processor, extract_text_from_image_data
from config import get_config
import logging
from pathlib import Path
import sqlite3

# Logging configuration
logger = logging.getLogger(__name__)

# Configure file logger for main logs
log_dir = Path("logs")
log_dir.mkdir(exist_ok=True)
log_file = log_dir / "api_server.log"

# Create file handler
file_handler = logging.FileHandler(log_file, encoding='utf-8')
file_handler.setLevel(logging.DEBUG)
file_formatter = logging.Formatter(
    '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
file_handler.setFormatter(file_formatter)

# Add handler to root logger
root_logger = logging.getLogger()
root_logger.setLevel(logging.DEBUG)
root_logger.addHandler(file_handler)

# Get configuration
config = get_config()

app = FastAPI(title=config.system.project_name, version=config.system.version)

@app.on_event("startup")
async def startup_event():
    """Initialize components on server startup"""
    print("\n" + "="*70)
    print("SYSTEM INITIALIZATION")
    print("="*70)
    
    # Initialize patients database
    print("\n[1/2] Initializing patients database...")
    try:
        print(f"   Database path from config: {config.database.sqlite_path}")
        
        # Check if there's an old database with data in backend/data/
        from pathlib import Path
        import os
        script_dir = Path(__file__).parent.parent  # Project root
        old_db_path = script_dir / "backend" / "data" / "patients.db"
        new_db_path = script_dir / "data" / "patients.db"
        
        # Check old database
        if old_db_path.exists():
            print(f"   [INFO] Potentially old database detected: {old_db_path}")
            try:
                import sqlite3
                old_conn = sqlite3.connect(str(old_db_path))
                old_cursor = old_conn.cursor()
                old_cursor.execute("SELECT COUNT(*) FROM patients")
                old_patients = old_cursor.fetchone()[0]
                old_cursor.execute("SELECT COUNT(*) FROM documents")
                old_docs = old_cursor.fetchone()[0]
                old_conn.close()
                
                if (old_patients > 0 or old_docs > 0):
                    # Check if new database is empty
                    new_has_data = False
                    if new_db_path.exists():
                        try:
                            test_conn = sqlite3.connect(str(new_db_path))
                            test_cursor = test_conn.cursor()
                            test_cursor.execute("SELECT COUNT(*) FROM patients")
                            new_patients_count = test_cursor.fetchone()[0]
                            test_conn.close()
                            new_has_data = new_patients_count > 0
                        except:
                            pass
                    
                    if not new_has_data:
                        print(f"   [WARNING] Data found in old database: {old_patients} patients, {old_docs} documents")
                        print(f"   [INFO] Automatic data migration from old database to new...")
                        
                        # Initialize new database
                        db = get_patients_database()
                        new_conn = sqlite3.connect(str(new_db_path))
                        new_cursor = new_conn.cursor()
                        
                        # Copy patients
                        old_conn = sqlite3.connect(str(old_db_path))
                        old_cursor = old_conn.cursor()
                        # Get table structure
                        old_cursor.execute("PRAGMA table_info(patients)")
                        old_columns = [row[1] for row in old_cursor.fetchall()]
                        old_cursor.execute("SELECT * FROM patients")
                        patients = old_cursor.fetchall()
                        
                        for patient in patients:
                            # Create dictionary from data
                            patient_dict = dict(zip(old_columns, patient))
                            # Insert without ID (auto-increment)
                            new_cursor.execute("""
                                INSERT INTO patients (name, age, gender, notes, created_at, updated_at)
                                VALUES (?, ?, ?, ?, ?, ?)
                            """, (
                                patient_dict.get('name'),
                                patient_dict.get('age'),
                                patient_dict.get('gender'),
                                patient_dict.get('notes'),
                                patient_dict.get('created_at'),
                                patient_dict.get('updated_at')
                            ))
                        
                        # Get mapping of old and new patient IDs before copying documents
                        old_cursor.execute("SELECT id, name FROM patients ORDER BY id")
                        old_patients_info = old_cursor.fetchall()
                        new_cursor.execute("SELECT id, name FROM patients ORDER BY id")
                        new_patients_info = new_cursor.fetchall()
                        
                        # Create mapping by names (more reliable)
                        id_mapping = {}
                        for old_id, old_name in old_patients_info:
                            for new_id, new_name in new_patients_info:
                                if old_name == new_name:
                                    id_mapping[old_id] = new_id
                                    break
                        
                        # Copy documents
                        old_cursor.execute("PRAGMA table_info(documents)")
                        doc_columns = [row[1] for row in old_cursor.fetchall()]
                        old_cursor.execute("SELECT * FROM documents")
                        documents = old_cursor.fetchall()
                        
                        for doc in documents:
                            doc_dict = dict(zip(doc_columns, doc))
                            old_patient_id = doc_dict.get('patient_id')
                            new_patient_id = id_mapping.get(old_patient_id)
                            
                            if new_patient_id:
                                new_cursor.execute("""
                                    INSERT INTO documents (patient_id, document_type, content, filename, created_at)
                                    VALUES (?, ?, ?, ?, ?)
                                """, (
                                    new_patient_id,
                                    doc_dict.get('document_type'),
                                    doc_dict.get('content'),
                                    doc_dict.get('filename'),
                                    doc_dict.get('created_at')
                                ))
                        
                        new_conn.commit()
                        old_conn.close()
                        new_conn.close()
                        
                        print(f"   [OK] Data migrated: {len(patients)} patients, {len(documents)} documents")
                    else:
                        print(f"   [INFO] New DB already contains data, automatic migration skipped")
                        print(f"   [INFO] For forced migration use: python migrate_patient_db.py")
                else:
                    print(f"   [INFO] Old DB is empty, migration not required")
            except Exception as migrate_error:
                print(f"   [WARNING] Error checking old DB: {migrate_error}")
                import traceback
                traceback.print_exc()
        
        db = get_patients_database()
        # Check database availability
        stats = db.get_statistics()
        print(f"   ✓ Patients database connected")
        print(f"   ✓ Absolute database path: {db.db_path.absolute()}")
        print(f"   ✓ Database file exists: {db.db_path.exists()}")
        print(f"   ✓ Database file size: {db.db_path.stat().st_size if db.db_path.exists() else 0} bytes")
        print(f"   ✓ Patients in database: {stats['patients_count']}")
        print(f"   ✓ Documents in database: {stats['documents_count']}")
        
        if stats['patients_count'] == 0 and old_db_path.exists():
            print(f"\n   [INFO] Current database is empty, but old database with data found")
            print(f"   [INFO] To migrate data run: python migrate_patient_db.py")
            
    except Exception as e:
        print(f"   ❌ ERROR initializing database: {e}")
        print(f"   ❌ Database path from config: {config.database.sqlite_path}")
        import traceback
        traceback.print_exc()
        logger.error(f"CRITICAL ERROR initializing patients database: {e}", exc_info=True)
        print(f"\n   IMPORTANT: Check:")
        print(f"   - Does database directory exist: {Path(config.database.sqlite_path).parent}")
        print(f"   - Do you have write permissions in the directory")
        print(f"   - Is the path correctly specified in config.yaml")
    
    # Initialization of other components can be added here
    print("\n[2/2] Initialization completed")
    print("="*70 + "\n")

# Global variables for RAG systems
_memo_rag_system = None
_patients_db = None
rag_system = None

# Global variable for WebSocket connections
active_connections: List[WebSocket] = []

# Vision-LLM prompt (column-based, stable)
VISION_LLM_EXTRACT_PROMPT = """
You see a printed Russian medical questionnaire.

Each row contains:
- a question text on the left
- columns labeled 0,1,2,3,4,5
- exactly ONE circled number per row

IMPORTANT:
- OCR of digits may be wrong
- The CORRECT score is defined ONLY by the COLUMN POSITION of the circled mark

TASK:
Extract ALL answered rows.

STRICT RULES:
- Use original Russian question text
- Determine score ONLY from circled column position
- Score must be integer 0–5
- Do NOT interpret
- Do NOT explain
- Do NOT summarize
- Return STRICT JSON ONLY

FORMAT:
[
  {
    "question": "...",
    "score": integer
  }
]
"""

def _parse_pages_input(pages_raw: Optional[str]) -> Optional[List[int]]:
    """Parse page list in format '1,2,5-7'"""
    if not pages_raw:
        return None
    pages = set()
    normalized = pages_raw.replace(";", ",")
    parts = [p.strip() for p in normalized.split(",") if p.strip()]
    for part in parts:
        if "-" in part:
            start_str, end_str = [x.strip() for x in part.split("-", 1)]
            if start_str.isdigit() and end_str.isdigit():
                start = int(start_str)
                end = int(end_str)
                if start > 0 and end >= start:
                    for i in range(start, end + 1):
                        pages.add(i)
        elif part.isdigit():
            page_num = int(part)
            if page_num > 0:
                pages.add(page_num)
    return sorted(pages) if pages else None

def _safe_json_loads(raw: str, context: str = ""):
    raw = raw.strip()
    if not raw:
        raise RuntimeError(f"Empty model response ({context})")
    if not (raw.startswith("{") or raw.startswith("[")):
        raise RuntimeError(
            f"Model response does not look like JSON ({context})\n"
            f"----- RAW BEGIN -----\n{raw}\n----- RAW END -----"
        )
    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        raise RuntimeError(
            f"JSON parsing error ({context})\n"
            f"{e}\n"
            f"----- RAW BEGIN -----\n{raw}\n----- RAW END -----"
        )

def _chat_stream_ollama(model: str, messages: List[Dict[str, Any]]) -> str:
    """Streaming chat via Ollama SDK"""
    from ollama import chat
    text = ""
    stream = chat(model=model, messages=messages, stream=True)
    for chunk in stream:
        token = chunk.get("message", {}).get("content", "")
        text += token
    return text.strip()

async def get_memo_rag_system() -> MemoRAGSystem:
    """Get MemoRAG system instance with timeout"""
    global _memo_rag_system
    if _memo_rag_system is None:
        try:
            import asyncio
            # Set timeout for RAG system initialization
            base_rag = await asyncio.wait_for(get_rag_system(), timeout=10.0)
            _memo_rag_system = MemoRAGSystem(base_rag)
        except asyncio.TimeoutError:
            logger.warning("Timeout during MemoRAG system initialization")
            # Create stub to avoid hanging
            _memo_rag_system = MemoRAGSystem(None)
        except Exception as e:
            logger.error(f"Error initializing MemoRAG system: {e}")
            _memo_rag_system = MemoRAGSystem(None)
    return _memo_rag_system

def get_patients_database() -> PatientsDatabase:
    """Get global instance of patients database"""
    global _patients_db
    if _patients_db is None:
        try:
            logger.info("Initializing patients database...")
            logger.info(f"DB path from configuration: {config.database.sqlite_path}")
            # PatientsDatabase gets path from config automatically if not explicitly specified
            _patients_db = PatientsDatabase()
            logger.info(f"✓ Patients database initialized")
            logger.info(f"✓ Absolute DB path: {_patients_db.db_path.absolute()}")
            logger.info(f"✓ DB file exists: {_patients_db.db_path.exists()}")
        except Exception as e:
            logger.error(f"❌ CRITICAL ERROR initializing patients database: {e}")
            logger.error(f"   DB path from configuration: {config.database.sqlite_path}")
            import traceback
            traceback.print_exc()
            raise
    return _patients_db

# WebSocket functions for progress
async def connect_websocket(websocket: WebSocket):
    """Connect WebSocket client"""
    await websocket.accept()
    active_connections.append(websocket)

async def disconnect_websocket(websocket: WebSocket):
    """Disconnect WebSocket client"""
    if websocket in active_connections:
        active_connections.remove(websocket)

async def broadcast_progress(message: dict):
    """Send progress message to all connected clients"""
    if active_connections:
        message_str = json.dumps(message, ensure_ascii=False)
        for connection in active_connections.copy():
            try:
                await connection.send_text(message_str)
            except:
                # Remove disconnected connections
                active_connections.remove(connection)

# Helper functions for batch patient processing
def _is_binary_data(text: str) -> bool:
    """Check if text is binary data (base64, binary characters)"""
    if not text or len(text) < 100:
        return False
    
    # Check for base64 (long strings of letters, numbers, +, /, =)
    base64_chars = set('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=')
    if len(text) > 500:
        # If text is very long and consists mainly of base64 characters
        base64_ratio = sum(1 for c in text[:1000] if c in base64_chars) / min(1000, len(text))
        if base64_ratio > 0.9:
            return True
    
    # Check for binary characters (non-printable characters)
    binary_chars = sum(1 for c in text[:1000] if ord(c) < 32 and c not in '\n\r\t')
    if binary_chars > len(text[:1000]) * 0.1:  # More than 10% non-printable characters
        return True
    
    return False

def _clean_text(text: str, max_length: int = 50000) -> str:
    """Clean and truncate text, removing binary data"""
    if not text:
        return ""
    
    # Check for binary data
    if _is_binary_data(text):
        return "[BINARY DATA: document contains images or binary data, skipped]"
    
    # Remove non-printable characters (except line breaks and tabs)
    cleaned = ''.join(c if (c.isprintable() or c in '\n\r\t') else ' ' for c in text)
    
    # Truncate to max length, preserving end (end is usually more important for LLM)
    if len(cleaned) > max_length:
        removed = len(cleaned) - max_length
        # Take last max_length characters
        cleaned = f"[... TEXT TRUNCATED: removed {removed} characters from start (was {len(cleaned)}, remaining {max_length}). Start may have contained repeated questions ...]\n" + cleaned[-max_length:]
    
    return cleaned

def _format_patient_context(patient: Dict[str, Any], documents: List[Dict[str, Any]]) -> str:
    """Format patient context exactly as in regular chat (frontend)"""
    lines = []
    lines.append("\n" + "=" * 80)
    lines.append("PATIENT DATA - YOU MUST USE THIS FOR YOUR ANSWER")
    lines.append("=" * 80 + "\n")
    lines.append("PATIENT:")
    lines.append(f"  Name: {patient.get('name')}")
    if patient.get("age"):
        lines.append(f"  Age: {patient.get('age')} years")
    if patient.get("gender"):
        lines.append(f"  Gender: {patient.get('gender')}")
    if patient.get("notes"):
        lines.append(f"  Notes: {patient.get('notes')}")
    if patient.get("created_at"):
        # Format date as in frontend (use ISO format for consistency)
        try:
            from datetime import datetime
            if isinstance(patient.get("created_at"), str):
                # Try to parse and format date
                dt = datetime.fromisoformat(patient.get("created_at").replace('Z', '+00:00'))
                lines.append(f"  Created: {dt.strftime('%d.%m.%Y')}")
            else:
                lines.append(f"  Created: {patient.get('created_at')}")
        except:
            lines.append(f"  Created: {patient.get('created_at')}")
    lines.append("")

    if documents:
        lines.append(f"MEDICAL DOCUMENTS ({len(documents)} documents):\n")
        lines.append("NOTE: These documents may contain data for outcome assessment!")
        lines.append("MUST look in each document for:")
        lines.append("  1. NPS (polyp score 0-8) - polyp mentions, polyp scores, severity")
        lines.append("  2. SNOT-22 (0-110) - SNOT-22 questionnaires, symptom scores")
        lines.append("  3. CRS control (EPOS 2020) - rhinosinusitis, CRS, control")
        lines.append("  4. T2 inflammation - eosinophils (EOS), IgE, FeNO, asthma, AERD")
        lines.append("  5. ACT (asthma control ≤19/20-24/25) - ACT questionnaires")
        lines.append("  6. Any numbers, measures, lab results, examinations\n")

        # Format documents exactly as in frontend (lines 1984-1988)
        for index, doc in enumerate(documents, start=0):
            content = doc.get("content") or ""
            # Remove empty lines exactly as in frontend stripEmptyLines
            # stripEmptyLines function removes only lines that are empty after trim()
            if content and isinstance(content, str):
                # Check for binary data and clean
                if _is_binary_data(content):
                    content_cleaned = "[BINARY DATA: document contains images or binary data, skipped]"
                else:
                    # Normalize line breaks
                    unified = content.replace('\r\n', '\n').replace('\r', '\n')
                    # Split into lines and remove only completely empty ones (after trim)
                    cleaned_lines = []
                    for line in unified.split('\n'):
                        if line.strip():  # Keep only non-empty lines
                            cleaned_lines.append(line)
                    content_cleaned = '\n'.join(cleaned_lines)
                    # Truncate to reasonable length (100000 characters per document), preserving end
                    if len(content_cleaned) > 100000:
                        removed = len(content_cleaned) - 100000
                        content_cleaned = f"[... TEXT TRUNCATED: removed {removed} chars from start (was {len(content_cleaned)}, kept 100000). Start may have had repeated content ...]\n" + content_cleaned[-100000:]
            else:
                content_cleaned = ""
            # Frontend uses index + 1 (lines 1986-1987)
            lines.append(f"\n[DOCUMENT {index + 1}/{len(documents)}] Type: {doc.get('document_type')}\n")
            lines.append(content_cleaned + '\n' if content_cleaned else '[Document content missing]\n')

        lines.append("INSTRUCTIONS FOR USING DOCUMENTS:")
        lines.append("1. Read ALL documents above VERY CAREFULLY")
        lines.append("2. Find in documents MENTIONS of: NPS, SNOT-22, eosinophils, IgE, FeNO, asthma, ACT")
        lines.append("3. Find NUMBERS and MEASURES that may relate to assessment")
        lines.append("4. Find DIAGNOSES: rhinosinusitis, CRS, polyps, asthma")
        lines.append("5. Find LAB RESULTS: eosinophils, leukocytes, IgE")
        lines.append("6. Find QUESTIONNAIRES: SNOT-22, ACT, NOSE")
        lines.append("7. If you find data - use it EXACTLY as in the document")
        lines.append("8. If no data - write \"no data for assessment\"")
        lines.append("9. DO NOT invent data, DO NOT use general knowledge - only from documents above!")
    else:
        lines.append("NOTE: Patient has no uploaded documents.")

    lines.append("\n" + "=" * 80 + "\n")
    return "\n".join(lines)

def _format_memorag_context(search_results: Dict[str, Any]) -> str:
    """Format MemoRAG context exactly as in chat (frontend, lines 1652-1687)"""
    results = search_results.get("results") or []
    memory_context = search_results.get("memory_context") or []
    clues_used = search_results.get("clues_used") or []
    
    # Return context if there are at least hints, memory context OR results
    # This is important because hints can exist even without found documents
    if not results and not memory_context and not clues_used:
        return ""

    # Format EXACTLY as in frontend (lines 1652-1687)
    memoragContext = '=' * 80 + '\n'
    memoragContext += 'KNOWLEDGE BASE FRAGMENTS (MemoRAG) - YOU MUST USE FOR YOUR ANSWER\n'
    memoragContext += '=' * 80 + '\n\n'
    
    # Add used hints FIRST (most important for understanding search context)
    if clues_used and len(clues_used) > 0:
        memoragContext += '-' * 80 + '\n'
        memoragContext += f'🔍 MEMORAG SEARCH CLUES ({len(clues_used)} clues):\n'
        memoragContext += '-' * 80 + '\n'
memoragContext += 'IMPORTANT: These clues were auto-generated by MemoRAG to improve search.\n'
    memoragContext += 'They show which keywords and concepts were used in the search.\n\n'
        for index, clue in enumerate(clues_used, start=1):
            cleaned_clue = _clean_text(str(clue), max_length=500)
            memoragContext += f'  Clue {index}: {cleaned_clue}\n'
        memoragContext += '\n' + '-' * 80 + '\n\n'
    
    # Add memory context if available (lines 1657-1664)
    if memory_context and len(memory_context) > 0:
        memoragContext += '-' * 80 + '\n'
        memoragContext += f'💾 MEMORAG MEMORY CONTEXT ({len(memory_context)} fragments):\n'
        memoragContext += '-' * 80 + '\n'
        memoragContext += 'These are facts and concepts from previous queries stored in MemoRAG memory.\n\n'
        for index, ctx in enumerate(memory_context, start=1):
            # Clean memory context
            cleaned_ctx = _clean_text(str(ctx), max_length=2000)
            memoragContext += f'  Fragment {index}: {cleaned_ctx}\n'
        memoragContext += '\n' + '-' * 80 + '\n\n'
    
    # Add found MemoRAG documents (lines 1667-1674)
    if results and len(results) > 0:
        memoragContext += '-' * 80 + '\n'
        memoragContext += f'📄 RELEVANT KNOWLEDGE BASE DOCUMENTS ({len(results)} documents):\n'
        memoragContext += '-' * 80 + '\n'
        memoragContext += 'These are documents found by MemoRAG using the clues above.\n\n'
        for index, result in enumerate(results, start=1):
            memoragContext += f'[DOCUMENT {index}/{len(results)}]\n'
            score = result.get("score")
            if score is not None:
                try:
                    memoragContext += f'Relevance: {(float(score) * 100):.1f}%\n'
                except Exception:
                    pass
            text = result.get("document") or result.get("text") or ""
            # Clean and truncate document text
            cleaned_text = _clean_text(str(text), max_length=50000)
            memoragContext += f'{cleaned_text}\n\n'
    else:
        # If no documents but there are hints or memory context, report it
        memoragContext += '-' * 80 + '\n'
        memoragContext += '📄 RELEVANT KNOWLEDGE BASE DOCUMENTS: none found\n'
        memoragContext += '-' * 80 + '\n'
        memoragContext += 'MemoRAG found no relevant documents in the knowledge base for this query.\n\n'
    
    memoragContext += '=' * 80 + '\n'
    memoragContext += 'END OF KNOWLEDGE BASE FRAGMENTS (MemoRAG)\n'
    memoragContext += '=' * 80 + '\n\n'
    return memoragContext

def _format_final_user_message(user_query: str, patient: Dict[str, Any], documents: List[Dict[str, Any]]) -> str:
    """Format final user message exactly as in regular chat (frontend, lines 2076-2082)"""
    if not patient:
        return user_query

    # Format EXACTLY as in frontend (lines 2077-2082)
    # In frontend this is formed as:
    # finalMessage = `\n${'='.repeat(80)}\n`;
    # finalMessage += `IMPORTANT: ABOVE IN THIS PROMPT THERE IS A "PATIENT DATA - REQUIRED FOR ANSWER" BLOCK!\n`;
    # finalMessage += `YOU MUST USE THIS DATA FOR YOUR ANSWER!\n`;
    # finalMessage += `${'='.repeat(80)}\n\n`;
    # finalMessage += `USER QUESTION:\n${message}\n\n`;
    # finalMessage += `ANSWER THE QUESTION USING PATIENT DATA FROM THE "PATIENT DATA" BLOCK ABOVE!`;
    
    final_message = "\n" + "=" * 80 + "\n"
    final_message += "IMPORTANT: ABOVE IN THIS PROMPT THERE IS A BLOCK \"PATIENT DATA - YOU MUST USE FOR YOUR ANSWER\"!\n"
    final_message += "YOU MUST USE THAT DATA IN YOUR ANSWER!\n"
    final_message += "=" * 80 + "\n\n"
    final_message += f"USER QUESTION:\n{user_query}\n\n"
    final_message += "ANSWER THE QUESTION USING THE PATIENT DATA FROM THE \"PATIENT DATA\" BLOCK ABOVE!"
    
    return final_message

# CORS configuration for web interface
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.api.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

import os
from pathlib import Path

# Get absolute path to frontend folder
frontend_path = Path(__file__).parent.parent / "frontend"

# Serve static files (web interface)
app.mount("/static", StaticFiles(directory=str(frontend_path)), name="static")

# Data models for API
class ChatMessage(BaseModel):
    role: str  # "user", "assistant", "system"
    content: str

class ChatCompletionRequest(BaseModel):
    model: str
    messages: List[ChatMessage]
    max_tokens: Optional[int] = 2000
    temperature: Optional[float] = 0.7
    top_p: Optional[float] = 0.9
    top_k: Optional[int] = 50
    stream: Optional[bool] = False

class ChatCompletionResponse(BaseModel):
    id: str
    object: str = "chat.completion"
    created: int
    model: str
    choices: List[Dict[str, Any]]
    usage: Dict[str, int]

class ModelInfo(BaseModel):
    id: str
    object: str = "model"
    created: int
    owned_by: str

class OllamaConnectRequest(BaseModel):
    url: str

class OllamaGenerateRequest(BaseModel):
    model: str
    prompt: str
    temperature: Optional[float] = 0.7
    top_p: Optional[float] = 0.9
    top_k: Optional[int] = 50
    num_predict: Optional[int] = 100

class OllamaModelRequest(BaseModel):
    model: str
    action: str  # "pull", "remove", "info"

class OllamaConfigRequest(BaseModel):
    gpu_layers: Optional[int] = None
    num_ctx: Optional[int] = None
    num_batch: Optional[int] = None
    num_thread: Optional[int] = None
    mode: Optional[str] = "balanced"  # "gpu", "cpu", "balanced"

class ModelsListResponse(BaseModel):
    object: str = "list"
    data: List[ModelInfo]

# RAG data models
class RAGDocumentRequest(BaseModel):
    documents: List[str]
    metadata: Optional[List[Dict[str, Any]]] = None

class RAGSearchRequest(BaseModel):
    query: str
    top_k: Optional[int] = 5
    context_length: Optional[int] = None

class RAGConfigRequest(BaseModel):
    vector_store_type: str  # "faiss" or "chroma"
    collection_name: Optional[str] = "documents"
    use_ollama: Optional[bool] = False
    ollama_embedding_model: Optional[str] = None
    chunk_size: Optional[int] = 1000  # Chunk size for MemoRAG
    chunk_overlap: Optional[int] = 200  # Chunk overlap

class RAGChatRequest(BaseModel):
    messages: List[ChatMessage]
    use_rag: Optional[bool] = True
    rag_top_k: Optional[int] = 3
    max_tokens: Optional[int] = 2000
    temperature: Optional[float] = 0.7

class FileUploadResponse(BaseModel):
    status: str
    message: str
    error: Optional[str] = None  # Error field
    file_info: Optional[Dict[str, Any]] = None
    processed_chunks: Optional[int] = None
    chunks: Optional[List[str]] = None  # Add chunks for MemoRAG

# Models for working with patients
class PatientRequest(BaseModel):
    name: str
    age: Optional[int] = None
    gender: Optional[str] = None
    notes: Optional[str] = None

class DocumentRequest(BaseModel):
    patient_id: int
    document_type: str
    content: str
    filename: Optional[str] = None

class PatientResponse(BaseModel):
    id: int
    name: str
    age: Optional[int] = None
    gender: Optional[str] = None
    notes: Optional[str] = None
    created_at: str
    updated_at: str

class DocumentResponse(BaseModel):
    id: int
    patient_id: int
    document_type: str
    content: str
    created_at: str

class BatchPatientQueryRequest(BaseModel):
    query: str
    model: Optional[str] = None
    system_prompt: Optional[str] = None
    use_memorag: Optional[bool] = False  # Disabled by default, must be explicitly enabled via checkbox
    memorag_top_k: Optional[int] = 5
    memorag_context_length: Optional[int] = 200
    max_tokens: Optional[int] = 2000
    temperature: Optional[float] = 0.7
    top_p: Optional[float] = 0.9
    top_k: Optional[int] = 40
    patient_ids: Optional[List[int]] = None

class BatchPatientQueryResult(BaseModel):
    patient_id: int
    patient_name: str
    prompt: Optional[str] = None
    response: Optional[str] = None
    error: Optional[str] = None

class BatchPatientQueryResponse(BaseModel):
    status: str
    total: int
    success: int
    failed: int
    results: List[BatchPatientQueryResult]

class PatientsStatsResponse(BaseModel):
    patients_count: int
    documents_count: int
    document_types: Dict[str, int]
    database_path: str
    database_exists: bool
    error: Optional[str] = None

# API endpoints

@app.get("/")
async def root():
    """Main page - web interface"""
    return FileResponse(str(frontend_path / "index.html"))

@app.get("/api")
async def api_info():
    """API information"""
    return {
        "message": "AI Assistant API",
        "version": "1.0.0",
        "endpoints": {
            "models": "/v1/models",
            "chat": "/v1/chat/completions",
            "health": "/health",
            "rag": "/rag/*",
            "memorag": "/memorag/*"
        }
    }

@app.get("/health")
async def health_check():
    """Server health check"""
    model_info = model_manager.get_model_info()
    
    # DIRECT OLLAMA CHECK - EXACTLY AS IN TEST
    ollama_available = False
    ollama_models_count = 0
    try:
        import httpx
        url = config.ollama.url
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{url}/api/tags")
            if response.status_code == 200:
                data = response.json()
                models = data.get("models", [])
                ollama_available = True
                ollama_models_count = len(models)
                logger.info(f"[HEALTH] Ollama available: {ollama_models_count} models")
    except Exception as e:
        logger.warning(f"[HEALTH] Ollama unavailable: {e}")
        ollama_available = False
    
    # For backward compatibility also get through embeddings
    ollama_embeddings = get_ollama_embeddings()
    connection_info = await ollama_embeddings.check_connection_status(force_check=True)
    
    # Use direct check if it passed successfully
    if ollama_available:
        connection_info["ollama_local_available"] = True
        connection_info["available_models_count"] = ollama_models_count
    
    return {
        "status": "healthy",
        "model_loaded": model_info["status"] == "model_loaded" or ollama_available,
        "device": model_info.get("device", "unknown"),
        "ollama_connected": ollama_available,  # Use direct check
        "offline_mode": connection_info["offline_mode"],
        "internet_available": connection_info["internet_available"],
        "connection_info": connection_info
    }

@app.websocket("/ws/progress")
async def websocket_progress(websocket: WebSocket):
    """WebSocket endpoint for progress tracking"""
    await connect_websocket(websocket)
    logger.info("WebSocket client connected")
    try:
        # Send initial welcome message
        await websocket.send_text(json.dumps({"type": "connected", "message": "WebSocket connected"}))
        
        while True:
            try:
                # Wait for client messages with timeout (for ping/pong or other messages)
                # Use shorter timeout as client sends ping every 20 seconds
                data = await asyncio.wait_for(websocket.receive_text(), timeout=25.0)
                
                # Process incoming messages
                try:
                    message = json.loads(data)
                    if message.get("type") == "ping":
                        # Send pong in response to ping
                        await websocket.send_text(json.dumps({"type": "pong", "message": "Connection active"}))
                    else:
                        logger.debug(f"WebSocket received message: {message.get('type', 'unknown')}")
                except json.JSONDecodeError:
                    # If not JSON, just ignore
                    logger.debug(f"WebSocket received non-JSON message: {data[:50]}")
                    pass
                    
            except asyncio.TimeoutError:
                # Timeout is normal, just keep connection open
                # Send keepalive message (client should send ping earlier)
                try:
                    await websocket.send_text(json.dumps({"type": "keepalive", "message": "Connection active"}))
                except Exception as send_error:
                    # If failed to send, connection is closed
                    logger.warning(f"WebSocket: failed to send keepalive: {send_error}")
                    break  # Exit loop so connection closes normally
            except WebSocketDisconnect:
                # Client disconnected
                logger.info("WebSocket: client disconnected (WebSocketDisconnect)")
                break
            except Exception as inner_error:
                # Other errors in loop - log and continue
                logger.warning(f"WebSocket: error in message processing loop: {inner_error}")
                # Check if connection is still open
                try:
                    await websocket.send_text(json.dumps({"type": "error", "message": "Processing error"}))
                except:
                    # Connection closed - exit
                    break
                    
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected normally")
    except Exception as e:
        logger.error(f"WebSocket connection error: {e}", exc_info=True)
    finally:
        # Always disconnect connection in finally
        await disconnect_websocket(websocket)
        logger.info("WebSocket connection closed")

@app.get("/v1/models", response_model=ModelsListResponse)
async def list_models():
    """Returns list of available models"""
    available_models = get_available_models()
    
    models_data = []
    for model_id, description in available_models.items():
        models_data.append(ModelInfo(
            id=model_id,
            created=1640995200,  # Fixed date
            owned_by="lm-studio-clone"
        ))
    
    return ModelsListResponse(data=models_data)

@app.post("/v1/chat/completions")
async def create_chat_completion(request: ChatCompletionRequest):
    """Create chat completion via Ollama"""
    
    # Log incoming request
    logger.info(f"Received generation request: model={request.model}, stream={request.stream}, messages_count={len(request.messages)}")
    logger.info(f"Parameters (create_chat_completion): max_tokens={request.max_tokens}, temperature={request.temperature}, top_p={request.top_p}, top_k={request.top_k}")
    
    # Check and validate parameters
    if request.temperature is None:
        request.temperature = 0.7
    if request.top_p is None:
        request.top_p = 0.9
    if request.top_k is None:
        request.top_k = 40
    if request.max_tokens is None:
        request.max_tokens = 2000
    
    logger.info(f"Validated parameters (create_chat_completion): max_tokens={request.max_tokens}, temperature={request.temperature}, top_p={request.top_p}, top_k={request.top_k}")
    
    # Build prompt from messages
    # IMPORTANT: System prompt is used WITHOUT CHANGES - exactly as passed from interface
    prompt_parts = []
    patient_data_present = False
    memorag_data_present = False
    for idx, message in enumerate(request.messages):
        role = message.role
        content = message.content
        
        # Check for patient data (support different formatting variants)
        content_upper = content.upper()
if ("PATIENT DATA" in content_upper or
            "PATIENT DATA - YOU MUST" in content_upper or
            "PATIENT DOCUMENTS" in content_upper or
            "MEDICAL DOCUMENTS" in content_upper or
            "<<<PATIENT DATA" in content_upper or
            "PATIENT INFO" in content_upper or
            "PATIENT:" in content_upper and "DOCUMENT" in content_upper):
            patient_data_present = True
            logger.info(f"✓ Patient data detected in message {idx} (length: {len(content)} characters)")
            # Log preview for verification
            preview = content[:500].replace('\n', ' ')
            logger.info(f"✓ Patient data preview: {preview}...")
        
        # Check for MemoRAG context
        if ("MEMORAG" in content_upper or
            "MEMORAG SEARCH CLUES" in content_upper or
            "KNOWLEDGE BASE FRAGMENTS" in content_upper or
            "RELEVANT KNOWLEDGE BASE DOCUMENTS" in content_upper or
            "MEMORAG MEMORY CONTEXT" in content_upper or
            "🔍" in content and "CLUES" in content_upper or
            "💾" in content and "MEMORY CONTEXT" in content_upper or
            "📄" in content and "RELEVANT" in content_upper):
            memorag_data_present = True
            logger.info(f"✅ MemoRAG context detected in message {idx} (length: {len(content)} characters)")
            # Log preview for verification
            preview = content[:500].replace('\n', ' ')
            logger.info(f"✅ MemoRAG context preview: {preview}...")
        
        # System prompt is used WITHOUT CHANGES - exactly as passed
        if role == "system":
            prompt_parts.append(f"System: {content}")
            logger.info(f"Message {idx} (system) added to prompt: length={len(content)} characters, first 200: {content[:200]}...")
        elif role == "user":
            prompt_parts.append(f"User: {content}")
            logger.info(f"Message {idx} (user) added to prompt: length={len(content)} characters, first 200: {content[:200]}...")
            # Check if this message contains MemoRAG
            if ("MEMORAG" in content_upper or "MEMORAG SEARCH CLUES" in content_upper or "KNOWLEDGE BASE FRAGMENTS" in content_upper):
                logger.info(f"   ✅ Message {idx} contains MemoRAG context and will be added to prompt!")
        elif role == "assistant":
            prompt_parts.append(f"Assistant: {content}")
            logger.info(f"Message {idx} (assistant) added to prompt: length={len(content)} characters")
    
    prompt = "\n".join(prompt_parts) + "\nAssistant:"
    
    # Immediately check for MemoRAG in formed prompt
    prompt_upper_check = prompt.upper()
    has_memorag_in_prompt = (
        "MEMORAG" in prompt_upper_check or
        "MEMORAG SEARCH CLUES" in prompt_upper_check or
        "KNOWLEDGE BASE FRAGMENTS" in prompt_upper_check or
        "🔍" in prompt and "CLUES" in prompt_upper_check or
        "💾" in prompt and "MEMORY CONTEXT" in prompt_upper_check or
        "📄" in prompt and "RELEVANT" in prompt_upper_check
    )
    
    logger.info(f"Final prompt length in create_chat_completion: {len(prompt)} characters")
    logger.info(f"Number of prompt parts: {len(prompt_parts)}")
    logger.info(f"MemoRAG detected in messages: {memorag_data_present}")
    logger.info(f"MemoRAG detected in final prompt: {has_memorag_in_prompt}")
    
    if has_memorag_in_prompt:
        # Find MemoRAG position in prompt
        memorag_pos = prompt_upper_check.find("KNOWLEDGE BASE FRAGMENTS")
        if memorag_pos < 0:
            memorag_pos = prompt_upper_check.find("MEMORAG SEARCH CLUES")
        if memorag_pos < 0:
            memorag_pos = prompt_upper_check.find("MEMORAG")
        if memorag_pos >= 0:
            logger.info(f"✅ MemoRAG position in prompt: character {memorag_pos}")
            logger.info(f"✅ Prompt fragment with MemoRAG (characters {memorag_pos}-{min(len(prompt), memorag_pos+1000)}):\n{prompt[memorag_pos:min(len(prompt), memorag_pos+1000)]}...")
        else:
        logger.warning(f"⚠️ MemoRAG NOT found in final prompt, although it was in messages: {memorag_data_present}")
        if memorag_data_present:
            logger.warning(f"⚠️ This means MemoRAG context was lost during prompt formation!")
            logger.warning(f"⚠️ Checking prompt parts:")
            for idx, part in enumerate(prompt_parts):
                if "MEMORAG" in part.upper() or "CLUES" in part or "KNOWLEDGE BASE FRAGMENTS" in part:
                    logger.warning(f"   ✓ Part {idx} contains MemoRAG: {part[:200]}...")
                else:
                    logger.warning(f"   ✗ Part {idx} does NOT contain MemoRAG: {part[:200]}...")
    
    logger.info(f"First 1000 characters of prompt in create_chat_completion: {prompt[:1000]}")
    logger.info(f"Last 1000 characters of prompt in create_chat_completion: ...{prompt[-1000:]}")
    
    # Save full prompt to separate file for debugging (chat only)
    from pathlib import Path
    log_dir = Path("logs")
    log_dir.mkdir(exist_ok=True)
    debug_prompt_file = log_dir / "prompt_chat_latest.txt"
    try:
        with open(debug_prompt_file, 'w', encoding='utf-8') as f:
            f.write("=" * 80 + "\n")
            f.write("ПРОМПТ ДЛЯ ЧАТА (последний запрос)\n")
            f.write("=" * 80 + "\n\n")
            f.write(prompt)
        logger.info(f"Full chat prompt saved to file: {debug_prompt_file}")
    except Exception as e:
        logger.warning(f"Failed to save chat prompt to file: {e}")
    
    # Additional check: search for patient data in final prompt
    prompt_upper = prompt.upper()
    patient_data_in_final_prompt = (
"PATIENT DATA" in prompt_upper or
        "MEDICAL DOCUMENTS" in prompt_upper or
        ("PATIENT:" in prompt_upper and "DOCUMENT" in prompt_upper)
    )
    
    # Check for MemoRAG context in final prompt
    memorag_in_final_prompt = (
        "MEMORAG" in prompt_upper or
        "MEMORAG SEARCH CLUES" in prompt_upper or
        "KNOWLEDGE BASE FRAGMENTS" in prompt_upper or
        "RELEVANT KNOWLEDGE BASE" in prompt_upper or
        "MEMORAG MEMORY CONTEXT" in prompt_upper or
        ("🔍" in prompt and "CLUES" in prompt_upper) or
        ("💾" in prompt and "MEMORY CONTEXT" in prompt_upper) or
        ("📄" in prompt and "RELEVANT" in prompt_upper)
    )
    
    if patient_data_present or patient_data_in_final_prompt:
        logger.info("✓ ✓ ✓ Patient data present in prompt ✓ ✓ ✓")
        # Find patient data position in prompt
        if "PATIENT DATA" in prompt_upper:
            patient_start = prompt_upper.find("PATIENT DATA")
            logger.info(f"✓ Patient data position in prompt: character {patient_start}")
            logger.info(f"✓ Patient data block length: ~{min(2000, len(prompt) - patient_start)} characters")
        else:
        logger.error("❌ ❌ ❌ CRITICAL ERROR: Patient data NOT found in prompt ❌ ❌ ❌")
        logger.error(f"   Check 1 (in messages): {patient_data_present}")
        logger.error(f"   Check 2 (in final prompt): {patient_data_in_final_prompt}")
        logger.error(f"   Number of messages: {len(request.messages)}")
        # Log all messages for debugging
        for idx, msg in enumerate(request.messages):
            content_preview = msg.content[:200].replace('\n', ' ')
            logger.error(f"   Message {idx}: role={msg.role}, length={len(msg.content)}, preview={content_preview}")
    
    # MemoRAG context check
    if memorag_in_final_prompt:
        logger.info("✅ ✅ ✅ MemoRAG context present in prompt ✅ ✅ ✅")
        # Find MemoRAG context position in prompt
        memorag_markers = [
            "KNOWLEDGE BASE FRAGMENTS (MEMORAG)",
            "MEMORAG SEARCH CLUES",
            "MEMORAG MEMORY CONTEXT",
            "RELEVANT KNOWLEDGE BASE DOCUMENTS"
        ]
        for marker in memorag_markers:
            marker_upper = marker.upper()
            if marker_upper in prompt_upper:
                memorag_start = prompt_upper.find(marker_upper)
                logger.info(f"✅ MemoRAG context position ({marker}) in prompt: character {memorag_start}")
                # Show fragment with MemoRAG context
                memorag_snippet = prompt[max(0, memorag_start-100):min(len(prompt), memorag_start+1000)]
                logger.info(f"✅ Prompt fragment with MemoRAG (characters {max(0, memorag_start-100)}-{min(len(prompt), memorag_start+1000)}):\n{memorag_snippet}...")
                break
    else:
        logger.warning("⚠️ ⚠️ ⚠️ WARNING: MemoRAG context NOT found in final prompt ⚠️ ⚠️ ⚠️")
        logger.warning(f"   Check performed by keywords: MEMORAG, CLUES, KNOWLEDGE BASE FRAGMENTS")
        logger.warning(f"   Number of messages: {len(request.messages)}")
        # Log all messages for debugging
        for idx, msg in enumerate(request.messages):
            content_preview = msg.content[:200].replace('\n', ' ')
            has_memorag = "MEMORAG" in msg.content.upper() or "CLUES" in msg.content or "KNOWLEDGE BASE FRAGMENTS" in msg.content
            logger.warning(f"   Message {idx}: role={msg.role}, length={len(msg.content)}, has_memorag={has_memorag}, preview={content_preview}")
    
    # Output FULL prompt for debugging
    logger.info("=" * 80)
    logger.info("📝 FULL PROMPT FOR OLLAMA:")
    logger.info("=" * 80)
    logger.info(prompt)
    logger.info("=" * 80)
    logger.info(f"Prompt length: {len(prompt)} characters")
    logger.info(f"Number of messages: {len(request.messages)}")
    
    # Also output first 1000 characters for quick preview
    logger.info(f"\nFirst 1000 characters of prompt:\n{prompt[:1000]}...")
    
    # Output fragment with patient data if available
    if patient_data_in_final_prompt:
        patient_start = prompt_upper.find("PATIENT DATA")
        if patient_start >= 0:
            patient_snippet = prompt[patient_start:patient_start + 1500]
            logger.info(f"\n📋 Prompt fragment with patient data (characters {patient_start}-{patient_start+1500}):\n{patient_snippet}...")
    
    # Output fragment with MemoRAG context if available
    if memorag_in_final_prompt:
        memorag_markers = [
            "KNOWLEDGE BASE FRAGMENTS (MEMORAG)",
            "MEMORAG SEARCH CLUES",
            "MEMORAG MEMORY CONTEXT",
            "RELEVANT KNOWLEDGE BASE DOCUMENTS"
        ]
        for marker in memorag_markers:
            marker_upper = marker.upper()
            if marker_upper in prompt_upper:
                memorag_start = prompt_upper.find(marker_upper)
                memorag_snippet = prompt[max(0, memorag_start-100):min(len(prompt), memorag_start+2000)]
                logger.info(f"\n🔍 Prompt fragment with MemoRAG context ({marker}, characters {max(0, memorag_start-100)}-{min(len(prompt), memorag_start+2000)}):\n{memorag_snippet}...")
                break
    
    # If streaming generation is requested
    if request.stream:
        return StreamingResponse(
            stream_chat_completion_ollama(prompt, request),
            media_type="text/plain"
        )
    
    # Regular generation via Ollama
    try:
        logger.info(f"Generating text via Ollama with model: {request.model}")
        # Increase timeout to 5 minutes for large prompts (especially for automatic patient analysis)
        async with httpx.AsyncClient(timeout=300.0) as client:
            payload = {
                "model": request.model,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": request.temperature,
                    "top_p": request.top_p,
                    "top_k": request.top_k,
                    "num_predict": request.max_tokens
                },
                "keep_alive": "0"  # Очищаем контекст модели перед каждым запросом
            }
            
            logger.info(f"Parameters for Ollama (non-streaming generation): num_predict={request.max_tokens}, temperature={request.temperature}, top_p={request.top_p}, top_k={request.top_k}")
            logger.info(f"Sending request to Ollama with payload: {payload}")
            
            ollama_response = await client.post(
                f"{config.ollama.url}/api/generate",
                json=payload
            )
            
            logger.info(f"Response from Ollama: status {ollama_response.status_code}")
            if ollama_response.status_code != 200:
                error_text = ollama_response.text
                logger.error(f"Ollama error: {ollama_response.status_code} - {error_text}")
            
            if ollama_response.status_code == 200:
                data = ollama_response.json()
                response_text = data.get("response", "")
                
                # Format response in OpenAI format
                response = ChatCompletionResponse(
                    id=f"chatcmpl-{hash(prompt) % 1000000}",
                    created=1640995200,
                    model=request.model,
                    choices=[{
                        "index": 0,
                        "message": {
                            "role": "assistant",
                            "content": response_text
                        },
                        "finish_reason": "stop"
                    }],
                    usage={
                        "prompt_tokens": len(prompt.split()),
                        "completion_tokens": len(response_text.split()),
                        "total_tokens": len(prompt.split()) + len(response_text.split())
                    }
                )
                
                return response
            else:
                raise HTTPException(status_code=400, detail=f"Ollama generation failed: {ollama_response.status_code}")
                
    except httpx.ConnectError as e:
        logger.error(f"Error connecting to Ollama: {e}")
        raise HTTPException(status_code=400, detail="Cannot connect to Ollama server. Ensure Ollama is running.")
    except httpx.TimeoutException as e:
        logger.error(f"Timeout when accessing Ollama: {e}")
        raise HTTPException(status_code=400, detail="Generation timeout")
    except Exception as e:
        logger.error(f"Unexpected generation error: {type(e).__name__}: {str(e)}")
        logger.error(f"Full error information: {repr(e)}")
        raise HTTPException(status_code=500, detail=f"Generation error: {str(e)}")

async def stream_chat_completion_ollama(prompt: str, request: ChatCompletionRequest):
    """Streaming chat generation via Ollama"""
    try:
        logger.info(f"Starting streaming generation with model: {request.model}")
        logger.info(f"Prompt length: {len(prompt)} characters")
        
        # Determine if the model is heavy
        heavy_models = ["gemma3n:e4b", "gpt-oss:20b", "internlm/internlm3-8b-instruct:latest", "cabelo/clinical-br-llama-2-7b:latest"]
        is_heavy_model = any(heavy in request.model for heavy in heavy_models)
        
        if is_heavy_model:
            logger.info(f"Heavy model detected: {request.model}. Increasing timeouts.")
            # Send special event for heavy models
            yield f"data: {json.dumps({'type': 'start', 'id': f'chatcmpl-{hash(prompt) % 1000000}', 'heavy_model': True, 'message': 'Loading heavy model, this may take a while...'})}\n\n"
        else:
            # Send regular initial event
            yield f"data: {json.dumps({'type': 'start', 'id': f'chatcmpl-{hash(prompt) % 1000000}'})}\n\n"
        
        # Check model availability in Ollama
        try:
            async with httpx.AsyncClient(timeout=30.0) as check_client:
                check_response = await check_client.get(f"{config.ollama.url}/api/tags")
                if check_response.status_code == 200:
                    models_data = check_response.json()
                    available_models = [model["name"] for model in models_data.get("models", [])]
                    if request.model not in available_models:
                        error_msg = f"Model {request.model} not found in Ollama. Available models: {', '.join(available_models)}"
                        logger.error(error_msg)
                        yield f"data: {json.dumps({'type': 'error', 'error': error_msg})}\n\n"
                        return
                    else:
                        logger.info(f"Model {request.model} found in Ollama")
                else:
                    logger.warning("Failed to check model availability in Ollama")
        except Exception as e:
            logger.warning(f"Model check error: {e}")
        
        # Send initial event
        yield f"data: {json.dumps({'type': 'start', 'id': f'chatcmpl-{hash(prompt) % 1000000}'})}\n\n"
        
        full_response = ""
        
        async with httpx.AsyncClient(timeout=300.0) as client:
                # Optimize parameters for heavy models
                options = {
                    "temperature": request.temperature,
                    "top_p": request.top_p,
                    "top_k": request.top_k,
                    "num_predict": request.max_tokens
                }
                logger.info(f"Parameters for Ollama (stream_chat_completion_ollama): num_predict={request.max_tokens}, temperature={request.temperature}, top_p={request.top_p}, top_k={request.top_k}")
                
                if is_heavy_model:
                    # Optimizations for heavy models
                    options.update({
                        "num_ctx": 2048,  # Limit context
                        "num_batch": 512,  # Increase batch size
                        "num_thread": 8,   # More threads
                        "gpu_layers": -1,  # All layers on GPU (if available)
                        "low_vram": True,  # VRAM saving
                        "f16_kv": True,    # Use float16 for keys/values
                        "logits_all": False,  # Don't compute logits for all tokens
                        "vocab_only": False,  # Load only vocabulary
                        "use_mmap": True,     # Use memory mapping
                        "use_mlock": False,  # Don't lock memory
                        "numa": False        # Disable NUMA
                    })
                    logger.info(f"Optimizations applied for heavy model: {request.model}")
                
                payload = {
                    "model": request.model,
                    "prompt": prompt,
                    "stream": True,
                    "options": options,
                    "keep_alive": "0"  # Очищаем контекст модели перед каждым запросом
                }
                logger.info(f"Sending request to Ollama with keep_alive=0 (context cleanup)")
                
                async with client.stream(
                    "POST",
                    f"{config.ollama.url}/api/generate",
                    json=payload
                ) as response:
                    logger.info(f"Response from Ollama: status {response.status_code}")
                    if response.status_code == 200:
                        logger.info("Starting Ollama stream processing")
                        async for line in response.aiter_lines():
                            if line.strip():
                                try:
                                    data = json.loads(line)
                                    logger.debug(f"Received string from Ollama: {data}")
                                    
                                    if "response" in data:
                                        chunk = data["response"]
                                        full_response += chunk
                                        # Send each chunk
                                        yield f"data: {json.dumps({'type': 'chunk', 'content': chunk})}\n\n"
                                    
                                    if data.get("done", False):
                                        logger.info("Generation completed successfully")
                                        break
                                        
                                    # Check for errors from Ollama
                                    if "error" in data:
                                        error_msg = data["error"]
                                        logger.error(f"Ollama returned error: {error_msg}")
                                        yield f"data: {json.dumps({'type': 'error', 'error': error_msg})}\n\n"
                                        return
                                        
                                except json.JSONDecodeError as e:
                                    logger.warning(f"JSON parsing error: {e}, line: {line}")
                                    continue
                    else:
                        logger.error(f"Ollama returned error: {response.status_code}")
                        raise HTTPException(status_code=400, detail=f"Ollama generation failed: {response.status_code}")
        
        # Send final event
        yield f"data: {json.dumps({'type': 'end', 'full_response': full_response})}\n\n"
        
    except httpx.ConnectError:
        logger.error("Error connecting to Ollama server")
        # Send error event
        yield f"data: {json.dumps({'type': 'error', 'error': 'Cannot connect to Ollama server. Ensure Ollama is running.'})}\n\n"
    except httpx.TimeoutException:
        logger.error("Timeout when accessing Ollama")
        # Send error event
        error_msg = f"Timeout contacting Ollama (5 min). Model {request.model} may be too heavy or not loaded. Try a lighter model or wait longer."
        yield f"data: {json.dumps({'type': 'error', 'error': error_msg})}\n\n"
    except Exception as e:
        error_msg = str(e) if str(e) else f"Unknown error type {type(e).__name__}"
        logger.error(f"Error in streaming generation: {error_msg}")
        logger.error(f"Error type: {type(e).__name__}")
        logger.error(f"Full error information: {repr(e)}")
        # Send error event
        yield f"data: {json.dumps({'type': 'error', 'error': error_msg})}\n\n"

@app.post("/load-model")
async def load_model(model_name: str):
    """Load specified model"""
    try:
        success = await load_preset_model(model_name)
        if success:
            return {"status": "success", "message": f"Model {model_name} loaded"}
        else:
            raise HTTPException(status_code=400, detail=f"Failed to load model {model_name}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/ollama/preload-model")
async def preload_ollama_model(model_name: str):
    """Preload model in Ollama for acceleration"""
    try:
        logger.info(f"Preloading model: {model_name}")
        
        # Determine if the model is heavy
        heavy_models = ["gemma3n:e4b", "gpt-oss:20b", "internlm/internlm3-8b-instruct:latest", "cabelo/clinical-br-llama-2-7b:latest"]
        is_heavy_model = any(heavy in model_name for heavy in heavy_models)
        
        # Optimized parameters for preloading
        options = {
            "num_ctx": 2048,
            "num_batch": 512,
            "num_thread": 8,
            "gpu_layers": -1,
            "low_vram": True,
            "f16_kv": True,
            "logits_all": False,
            "vocab_only": False,
            "use_mmap": True,
            "use_mlock": False,
            "numa": False
        }
        
        async with httpx.AsyncClient(timeout=300.0) as client:
            # Send test request to load model
            payload = {
                "model": model_name,
                "prompt": "Hello",
                "stream": False,
                "options": options
            }
            
            response = await client.post(
                f"{config.ollama.url}/api/generate",
                json=payload
            )
            
            if response.status_code == 200:
                logger.info(f"Model {model_name} successfully preloaded")
                return {
                    "status": "success", 
                    "message": f"Model {model_name} preloaded and ready",
                    "heavy_model": is_heavy_model
                }
            else:
                raise HTTPException(status_code=400, detail=f"Model preload error: {response.status_code}")
                
    except httpx.TimeoutException:
        raise HTTPException(status_code=400, detail=f"Timeout preloading model {model_name}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Preload error: {str(e)}")

@app.get("/model-info")
async def get_model_info():
    """Returns information about current model"""
    return model_manager.get_model_info()

@app.get("/available-models")
async def get_available_models_endpoint():
    """Returns list of available models (only locally installed Ollama models)"""
    try:
        # Get only actually available Ollama models
        ollama_models = await get_real_ollama_models()
        
        # Return only locally installed Ollama models
        return {
            "status": "success",
            "models": ollama_models,
            "ollama_models": ollama_models,
            "local_only": True
        }
    except Exception as e:
        logger.error(f"Error getting model list: {e}")
        return {"status": "error", "message": str(e)}

# Additional endpoints for management

@app.post("/unload-model")
async def unload_model():
    """Unloads current model from memory"""
    model_manager.current_model = None
    model_manager.current_tokenizer = None
    return {"status": "success", "message": "Model unloaded"}

@app.get("/status")
async def get_status():
    """Returns full system status"""
    model_info = model_manager.get_model_info()
    available_models = get_available_models()
    
    return {
        "server_status": "running",
        "model_info": model_info,
        "available_models": available_models,
        "device": model_manager.device
    }

# Ollama endpoints
@app.post("/ollama/connect")
async def connect_to_ollama(request: OllamaConnectRequest):
    """Checks connection to Ollama server"""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{request.url}/api/tags")
            if response.status_code == 200:
                data = response.json()
                models = data.get("models", [])
                return {
                    "status": "connected",
                    "url": request.url,
                    "models_count": len(models),
                    "models": [model["name"] for model in models]
                }
            else:
                raise HTTPException(status_code=400, detail=f"Ollama server returned status {response.status_code}")
    except httpx.ConnectError:
        raise HTTPException(status_code=400, detail="Cannot connect to Ollama server")
    except httpx.TimeoutException:
        raise HTTPException(status_code=400, detail="Ollama connection timeout")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Connection error: {str(e)}")

@app.get("/ollama/models")
async def get_ollama_models(url: str = None):
    """Gets list of Ollama models - uses the same approach as in test"""
    try:
        # Use URL from parameter or configuration (as in test)
        ollama_url = url or config.ollama.url
        
        # EXACTLY AS IN TEST
        import httpx
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{ollama_url}/api/tags")
            
            if response.status_code == 200:
                data = response.json()
                models = data.get("models", [])
                
                logger.info(f"✓ Ollama is available! Found models: {len(models)}")
                
                # Extract model names (support both formats)
                model_names = []
                for model in models:
                    if isinstance(model, dict):
                        model_names.append(model.get("name", str(model)))
                    else:
                        model_names.append(str(model))
                
                return {
                    "status": "success",
                    "models": model_names,
                    "models_full": models,
                    "count": len(model_names)
                }
            else:
                logger.error(f"Ollama returned status {response.status_code}")
                raise HTTPException(status_code=400, detail=f"Ollama server returned status {response.status_code}")
                
    except httpx.ConnectError as e:
        error_msg = f"Не удается подключиться к Ollama серверу на {ollama_url if 'ollama_url' in locals() else 'unknown'}"
        logger.error(f"{error_msg}: {e}")
        logger.error(f"Ensure Ollama is running and reachable at {ollama_url}")
        raise HTTPException(
            status_code=400, 
            detail=f"{error_msg}. Ensure Ollama is running and reachable at {ollama_url}"
        )
    except httpx.TimeoutException as e:
        error_msg = f"Таймаут подключения к Ollama серверу на {ollama_url if 'ollama_url' in locals() else 'unknown'}"
        logger.error(f"{error_msg}: {e}")
        raise HTTPException(status_code=400, detail=error_msg)
    except Exception as e:
        error_msg = f"Error getting Ollama models: {type(e).__name__}: {e}"
        logger.error(error_msg)
        logger.error(f"URL Ollama: {ollama_url if 'ollama_url' in locals() else 'unknown'}")
        raise HTTPException(status_code=400, detail=f"Ollama connection error: {str(e)}")

@app.post("/ollama/generate")
async def generate_with_ollama(request: OllamaGenerateRequest):
    """Generates text using Ollama"""
    try:
        # Increase timeout to 5 minutes for large prompts
        async with httpx.AsyncClient(timeout=300.0) as client:
            payload = {
                "model": request.model,
                "prompt": request.prompt,
                "stream": False,
                "options": {
                    "temperature": request.temperature,
                    "top_p": request.top_p,
                    "top_k": request.top_k,
                    "num_predict": request.num_predict
                }
            }
            
            response = await client.post(
                f"{config.ollama.url}/api/generate",
                json=payload
            )
            
            if response.status_code == 200:
                data = response.json()
                return {
                    "status": "success",
                    "response": data.get("response", ""),
                    "model": request.model
                }
            else:
                raise HTTPException(status_code=400, detail=f"Ollama generation failed: {response.status_code}")
    except httpx.ConnectError:
        raise HTTPException(status_code=400, detail="Cannot connect to Ollama server")
    except httpx.TimeoutException:
        raise HTTPException(status_code=400, detail="Generation timeout")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Generation error: {str(e)}")

@app.post("/ollama/generate-stream")
async def generate_with_ollama_stream(request: OllamaGenerateRequest):
    """Streaming text generation using Ollama"""
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            payload = {
                "model": request.model,
                "prompt": request.prompt,
                "stream": True,
                "options": {
                    "temperature": request.temperature,
                    "top_p": request.top_p,
                    "top_k": request.top_k,
                    "num_predict": request.num_predict
                }
            }
            
            async with client.stream(
                "POST",
                f"{config.ollama.url}/api/generate",
                json=payload
            ) as response:
                if response.status_code == 200:
                    return StreamingResponse(
                        stream_ollama_response(response),
                        media_type="text/plain"
                    )
                else:
                    raise HTTPException(status_code=400, detail=f"Ollama generation failed: {response.status_code}")
    except httpx.ConnectError:
        raise HTTPException(status_code=400, detail="Cannot connect to Ollama server")
    except httpx.TimeoutException:
        raise HTTPException(status_code=400, detail="Generation timeout")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Generation error: {str(e)}")

async def stream_ollama_response(response):
    """Streaming processing of response from Ollama"""
    try:
        # Send initial event
        yield f"data: {json.dumps({'type': 'start', 'model': 'ollama'})}\n\n"
        
        full_response = ""
        
        async for line in response.aiter_lines():
            if line.strip():
                try:
                    data = json.loads(line)
                    if "response" in data:
                        chunk = data["response"]
                        full_response += chunk
                        # Send each chunk
                        yield f"data: {json.dumps({'type': 'chunk', 'content': chunk})}\n\n"
                    
                    if data.get("done", False):
                        break
                except json.JSONDecodeError:
                    continue
        
        # Send final event
        yield f"data: {json.dumps({'type': 'end', 'full_response': full_response})}\n\n"
        
    except Exception as e:
        error_msg = str(e) if str(e) else f"Unknown error type {type(e).__name__}"
        logger.error(f"Error in stream_ollama_response: {error_msg}")
        # Send error event
        yield f"data: {json.dumps({'type': 'error', 'error': error_msg})}\n\n"

@app.post("/ollama/model")
async def manage_ollama_model(request: OllamaModelRequest):
    """Manage local Ollama models (remove, info)"""
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            if request.action == "remove":
                # Remove model
                response = await client.delete(f"{config.ollama.url}/api/delete", 
                                             json={"name": request.model})
                if response.status_code == 200:
                    return {"status": "success", "message": f"Модель {request.model} удалена"}
                else:
                    raise HTTPException(status_code=400, detail=f"Model deletion error: {response.status_code}")
            
            elif request.action == "info":
                # Model information
                response = await client.post(
                    f"{config.ollama.url}/api/show",
                    json={"name": request.model}
                )
                if response.status_code == 200:
                    data = response.json()
                    return {
                        "status": "success",
                        "model_info": {
                            "name": data.get("name", request.model),
                            "size": data.get("size", 0),
                            "modified_at": data.get("modified_at", ""),
                            "family": data.get("details", {}).get("family", ""),
                            "format": data.get("details", {}).get("format", ""),
                            "parameters": data.get("details", {}).get("parameter_size", ""),
                            "quantization": data.get("details", {}).get("quantization_level", "")
                        }
                    }
                else:
                    raise HTTPException(status_code=400, detail=f"Error getting info: {response.status_code}")
            
            else:
                raise HTTPException(status_code=400, detail="Only actions supported: remove, info")
                
    except httpx.ConnectError:
        raise HTTPException(status_code=400, detail="Cannot connect to Ollama server")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error: {str(e)}")

@app.post("/ollama/config")
async def configure_ollama(request: OllamaConfigRequest):
    """Configure Ollama parameters"""
    try:
        # Determine parameters based on mode
        config = {}
        
        if request.mode == "gpu":
            config.update({
                "gpu_layers": request.gpu_layers or -1,  # Все слои на GPU
                "num_ctx": request.num_ctx or 2048,
                "num_batch": request.num_batch or 512,
                "num_thread": request.num_thread or 1
            })
        elif request.mode == "cpu":
            config.update({
                "gpu_layers": 0,  # Все слои на CPU
                "num_ctx": request.num_ctx or 2048,
                "num_batch": request.num_batch or 512,
                "num_thread": request.num_thread or 4
            })
        elif request.mode == "balanced":
            config.update({
                "gpu_layers": request.gpu_layers or 20,  # Часть слоев на GPU
                "num_ctx": request.num_ctx or 2048,
                "num_batch": request.num_batch or 256,
                "num_thread": request.num_thread or 2
            })
        
        # Apply settings via environment variables or config
        return {
            "status": "success",
            "message": f"Режим {request.mode} настроен",
            "config": config
        }
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Settings error: {str(e)}")

@app.get("/ollama/system")
async def get_ollama_system_info():
    """Get Ollama system information"""
    try:
        # Get connection information
        ollama_embeddings = get_ollama_embeddings()
        connection_info = await ollama_embeddings.get_connection_info()
        
        if not connection_info["ollama_local_available"]:
            return {
                "status": "error",
                "message": "Ollama сервер недоступен",
                "connection_info": connection_info
            }
        
        # Use shorter timeout for offline mode
        timeout = 5.0 if connection_info["offline_mode"] else 10.0
        
        async with httpx.AsyncClient(timeout=timeout) as client:
            # Get system information
            response = await client.get(f"{config.ollama.url}/api/version")
            if response.status_code == 200:
                version_data = response.json()
                
                # Get GPU information
                gpu_info = "Not detected"
                try:
                    gpu_response = await client.get(f"{config.ollama.url}/api/ps")
                    if gpu_response.status_code == 200:
                        gpu_data = gpu_response.json()
                        if gpu_data.get("gpu"):
                            gpu_info = f"GPU: {gpu_data['gpu'].get('name', 'Неизвестно')}"
                except:
                    pass
                
                    return {
                        "status": "success",
                        "system_info": {
                            "version": version_data.get("version", "Неизвестно"),
                            "gpu": gpu_info,
                            "host": config.ollama.url.replace("http://", "").replace("https://", ""),
                            "offline_mode": connection_info["offline_mode"],
                            "internet_available": connection_info["internet_available"]
                        },
                        "connection_info": connection_info
                    }
            else:
                raise HTTPException(status_code=400, detail="Cannot get system information")
                
    except httpx.ConnectError:
        return {
            "status": "error",
            "message": "Не удается подключиться к Ollama серверу",
            "connection_info": connection_info
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Error: {str(e)}",
            "connection_info": connection_info
        }

@app.get("/ollama/connection-status")
async def get_ollama_connection_status():
    """Get Ollama connection status"""
    try:
        ollama_embeddings = get_ollama_embeddings()
        connection_info = await ollama_embeddings.get_connection_info()
        
        return {
            "status": "success",
            "connection_info": connection_info
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Error getting connection status: {str(e)}"
        }

# Configuration management endpoints
@app.get("/config")
async def get_config_info():
    """Get configuration information"""
    try:
        config_summary = config.get_config_summary()
        validation_result = config.validate_config()
        
        return {
            "status": "success",
            "config_summary": config_summary,
            "validation": validation_result,
            "config_file": config.config_path
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Error getting configuration: {str(e)}"
        }

@app.get("/config/full")
async def get_full_config():
    """Get full configuration (without passwords)"""
    try:
        # Create configuration copy without sensitive data
        safe_config = {
            "ollama": {
                "url": config.ollama.url,
                "timeout": config.ollama.timeout,
                "offline_timeout": config.ollama.offline_timeout,
                "max_retries": config.ollama.max_retries,
                "embedding_model": config.ollama.embedding_model,
                "default_model": config.ollama.default_model,
                "gpu_layers": config.ollama.gpu_layers,
                "num_ctx": config.ollama.num_ctx,
                "num_batch": config.ollama.num_batch,
                "num_thread": config.ollama.num_thread,
                "temperature": config.ollama.temperature,
                "top_p": config.ollama.top_p,
                "top_k": config.ollama.top_k,
                "max_tokens": config.ollama.max_tokens,
                "enable_offline_mode": config.ollama.enable_offline_mode,
                "connection_check_interval": config.ollama.connection_check_interval
            },
            "database": {
                "type": config.database.type,
                "host": config.database.host,
                "port": config.database.port,
                "database": config.database.database,
                "username": config.database.username,
                "password": "***" if config.database.password else "",
                "sqlite_path": config.database.sqlite_path,
                "connection_pool_size": config.database.connection_pool_size,
                "connection_timeout": config.database.connection_timeout,
                "enable_ssl": config.database.enable_ssl,
                "ssl_cert_path": config.database.ssl_cert_path
            },
            "anaconda": {
                "environment_name": config.anaconda.environment_name,
                "python_path": config.anaconda.python_path,
                "conda_path": config.anaconda.conda_path,
                "pip_path": config.anaconda.pip_path,
                "enable_gpu": config.anaconda.enable_gpu,
                "cuda_version": config.anaconda.cuda_version,
                "pytorch_version": config.anaconda.pytorch_version,
                "transformers_version": config.anaconda.transformers_version,
                "auto_activate_env": config.anaconda.auto_activate_env,
                "install_dependencies": config.anaconda.install_dependencies
            },
            "rag": {
                "vector_store_type": config.rag.vector_store_type,
                "collection_name": config.rag.collection_name,
                "use_ollama_embeddings": config.rag.use_ollama_embeddings,
                "ollama_embedding_model": config.rag.ollama_embedding_model,
                "chunk_size": config.rag.chunk_size,
                "chunk_overlap": config.rag.chunk_overlap,
                "max_chunks_per_document": config.rag.max_chunks_per_document,
                "similarity_threshold": config.rag.similarity_threshold,
                "enable_memorag": config.rag.enable_memorag,
                "memory_cache_size": config.rag.memory_cache_size,
                "enable_file_chunking": config.rag.enable_file_chunking
            },
            "api": {
                "host": config.api.host,
                "port": config.api.port,
                "workers": config.api.workers,
                "reload": config.api.reload,
                "log_level": config.api.log_level,
                "cors_origins": config.api.cors_origins,
                "enable_websocket": config.api.enable_websocket,
                "websocket_timeout": config.api.websocket_timeout,
                "max_request_size": config.api.max_request_size,
                "enable_rate_limiting": config.api.enable_rate_limiting,
                "rate_limit_requests": config.api.rate_limit_requests,
                "rate_limit_window": config.api.rate_limit_window
            },
            "logging": {
                "level": config.logging.level,
                "format": config.logging.format,
                "file_path": config.logging.file_path,
                "max_file_size": config.logging.max_file_size,
                "backup_count": config.logging.backup_count,
                "enable_console": config.logging.enable_console,
                "enable_file": config.logging.enable_file,
                "enable_rag_logging": config.logging.enable_rag_logging,
                "rag_log_path": config.logging.rag_log_path
            },
            "file_processing": {
                "temp_dir": config.file_processing.temp_dir,
                "max_file_size": config.file_processing.max_file_size,
                "allowed_extensions": config.file_processing.allowed_extensions,
                "enable_ocr": config.file_processing.enable_ocr,
                "ocr_languages": config.file_processing.ocr_languages,
                "enable_pdf_processing": config.file_processing.enable_pdf_processing,
                "enable_docx_processing": config.file_processing.enable_docx_processing,
                "enable_image_processing": config.file_processing.enable_image_processing,
                "image_formats": config.file_processing.image_formats,
                "auto_cleanup_temp_files": config.file_processing.auto_cleanup_temp_files,
                "cleanup_interval": config.file_processing.cleanup_interval
            },
            "system": {
                "project_name": config.system.project_name,
                "version": config.system.version,
                "debug_mode": config.system.debug_mode,
                "data_dir": config.system.data_dir,
                "logs_dir": config.system.logs_dir,
                "temp_dir": config.system.temp_dir,
                "enable_auto_backup": config.system.enable_auto_backup,
                "backup_interval": config.system.backup_interval,
                "max_backup_files": config.system.max_backup_files,
                "enable_health_checks": config.system.enable_health_checks,
                "health_check_interval": config.system.health_check_interval
            }
        }
        
        return {
            "status": "success",
            "config": safe_config,
            "config_file": config.config_path
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Error getting full configuration: {str(e)}"
        }

@app.post("/config/reload")
async def reload_config():
    """Reload configuration"""
    try:
        from config import reload_config as reload_config_func
        
        # Reload configuration
        reload_config_func()
        
        # Recreate global OllamaEmbeddings instance with new configuration
        from ollama_embeddings import reset_ollama_embeddings, get_ollama_embeddings
        reset_ollama_embeddings()
        get_ollama_embeddings()  # Create new instance with updated configuration
        
        # Update global config
        global config
        config = get_config()
        
        logger.info(f"Configuration reloaded. New Ollama URL: {config.ollama.url}")
        
        return {
            "status": "success",
            "message": "Конфигурация перезагружена",
            "ollama_url": config.ollama.url
        }
    except Exception as e:
        logger.error(f"Configuration reload error: {e}")
        return {
            "status": "error",
            "message": f"Error reloading configuration: {str(e)}"
        }

@app.post("/config/save")
async def save_config():
    """Save configuration"""
    try:
        from config import save_config as save_config_func
        save_config_func()
        
        return {
            "status": "success",
            "message": "Конфигурация сохранена"
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Error saving configuration: {str(e)}"
        }

# File upload endpoints
@app.post("/rag/upload-file", response_model=FileUploadResponse)
async def upload_file_to_rag(file: UploadFile = File(...)):
    """Upload file to RAG system"""
    try:
        global rag_system
        print(f"Received file: {file.filename}, size: {file.size}, type: {file.content_type}")
        
        file_processor = get_file_processor()
        
        # Check file format
        if not file_processor.is_supported_format(file.filename):
            print(f"Unsupported format: {file.filename}")
            return FileUploadResponse(
                status="error",
                message="Неподдерживаемый формат файла",
                error=f"Поддерживаемые форматы: {', '.join(file_processor.get_supported_formats())}"
            )
        
        print(f"File format is supported: {file.filename}")
        
        # Read file content
        file_content = await file.read()
        print(f"Read {len(file_content)} bytes from file")
        
        # Save file to temporary folder
        temp_file_path = await file_processor.save_uploaded_file(file_content, file.filename)
        print(f"File saved to temporary folder: {temp_file_path}")
        
        # Process file
        print(f"Starting file processing: {file.filename}")
        # Use current RAG settings for chunk sizes
        if rag_system is None:
            rag_system = await get_rag_system()
        result = await file_processor.process_file(
            temp_file_path,
            file.filename,
            chunk_size=rag_system.chunk_size,
            chunk_overlap=rag_system.chunk_overlap
        )
        print(f"Processing result: {result['status']}, chunks: {result.get('chunks_count', 0)}")
        
        if result["status"] == "error":
            print(f"File processing error: {result['error']}")
            file_processor.cleanup_temp_file(temp_file_path)
            return FileUploadResponse(
                status="error",
                message="Error обработки файла",
                error=result["error"]
            )
        
        # Add chunks to RAG system
        if rag_system is None:
            rag_system = await get_rag_system()
        
        # Create metadata for each chunk
        metadata_list = []
        for i, chunk in enumerate(result["chunks"]):
            metadata_list.append({
                "source": file.filename,
                "chunk_index": i,
                "file_format": result["format"],
                "total_chunks": result["chunks_count"]
            })
        
        # Add documents to RAG
        await rag_system.add_documents(result["chunks"], metadata_list, progress_callback=broadcast_progress)
        
        # Clean up temporary file
        file_processor.cleanup_temp_file(temp_file_path)
        
        return FileUploadResponse(
            status="success",
            message=f"Файл {file.filename} успешно загружен в RAG",
            file_info={
                "filename": result["filename"],
                "format": result["format"],
                "total_length": result["total_length"],
                "mime_type": result["mime_type"]
            },
            processed_chunks=result["chunks_count"],
            chunks=result["chunks"]  # Добавляем сами чанки для MemoRAG
        )
        
    except Exception as e:
        logger.error(f"File upload error {file.filename if 'file' in locals() else 'unknown'}: {type(e).__name__}: {e}")
        import traceback
        error_traceback = traceback.format_exc()
        logger.error(f"Traceback: {error_traceback}")
        
        return FileUploadResponse(
            status="error",
            message="Error загрузки файла",
            error=f"{type(e).__name__}: {str(e)}"
        )

@app.get("/rag/supported-formats")
async def get_supported_formats():
    """Get list of supported file formats"""
    try:
        file_processor = get_file_processor()
        formats = file_processor.get_supported_formats()
        
        return {
            "status": "success",
            "supported_formats": formats,
            "formats_info": {
                ".pdf": "PDF документы",
                ".txt": "Текстовые файлы",
                ".doc": "Microsoft Word документы (старый формат)",
                ".docx": "Microsoft Word документы"
            }
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error getting formats: {str(e)}")

@app.get("/rag/ollama-embedding-models")
async def get_ollama_embedding_models():
    """Get list of available embedding models in Ollama"""
    try:
        ollama_embeddings = get_ollama_embeddings()
        models = await ollama_embeddings.get_available_embedding_models()
        
        return {
            "status": "success",
            "models": models,
            "current_model": ollama_embeddings.get_current_model()
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error getting embedding models: {str(e)}")

@app.post("/rag/set-ollama-embedding-model")
async def set_ollama_embedding_model(model_name: str):
    """Set embedding model in Ollama"""
    try:
        ollama_embeddings = get_ollama_embeddings()
        success = await ollama_embeddings.set_embedding_model(model_name)
        
        if success:
            return {
                "status": "success",
                "message": f"Модель эмбеддингов установлена: {model_name}",
                "current_model": model_name,
                "dimension": await ollama_embeddings.get_embedding_dimension()
            }
        else:
            raise HTTPException(status_code=400, detail=f"Failed to set model: {model_name}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error setting embedding model: {str(e)}")

# RAG эндпоинты
@app.get("/rag/config")
async def get_rag_config():
    """Get current RAG configuration"""
    try:
        rag_config = {
            "vector_store_type": config.rag.vector_store_type,
            "collection_name": config.rag.collection_name,
            "use_ollama_embeddings": config.rag.use_ollama_embeddings,
            "ollama_embedding_model": config.rag.ollama_embedding_model,
            "chunk_size": config.rag.chunk_size,
            "chunk_overlap": config.rag.chunk_overlap,
            "max_chunks_per_document": config.rag.max_chunks_per_document,
            "similarity_threshold": config.rag.similarity_threshold,
            "enable_memorag": config.rag.enable_memorag,
            "memory_cache_size": config.rag.memory_cache_size,
            "enable_file_chunking": config.rag.enable_file_chunking
        }
        return {
            "status": "success",
            "config": rag_config
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error getting RAG configuration: {str(e)}")

@app.post("/rag/config")
async def configure_rag(request: RAGConfigRequest):
    """Configure RAG system (select FAISS or Chroma, Ollama embeddings)"""
    rag_logger = get_rag_logger()
    
    try:
        rag_logger.log_info(f"Запрос настройки RAG: {request.vector_store_type}, Ollama: {request.use_ollama}")
        
        # If using Ollama, set embedding model
        if request.use_ollama and request.ollama_embedding_model:
            ollama_embeddings = get_ollama_embeddings()
            success = await ollama_embeddings.set_embedding_model(request.ollama_embedding_model)
            if not success:
                error_msg = f"Не удалось установить модель эмбеддингов: {request.ollama_embedding_model}"
                rag_logger.log_error(error_msg)
                raise HTTPException(status_code=400, detail=error_msg)
        
        # Save configuration to config.yaml to avoid inconsistencies
        config.rag.vector_store_type = request.vector_store_type
        if request.collection_name:
            config.rag.collection_name = request.collection_name
        config.rag.use_ollama_embeddings = bool(request.use_ollama)
        config.rag.ollama_embedding_model = request.ollama_embedding_model
        if request.use_ollama and request.ollama_embedding_model:
            config.ollama.embedding_model = request.ollama_embedding_model
        if request.chunk_size:
            config.rag.chunk_size = request.chunk_size
        if request.chunk_overlap:
            config.rag.chunk_overlap = request.chunk_overlap
        try:
            from config import save_config as save_config_func
            save_config_func()
        except Exception as save_error:
            rag_logger.log_error(f"Не удалось сохранить config.yaml: {save_error}")

        # Save reference to configured RAG system
        global rag_system
        chunk_size = request.chunk_size if request.chunk_size else 1000
        chunk_overlap = request.chunk_overlap if request.chunk_overlap else 200
        rag_system = await get_rag_system(request.vector_store_type, request.use_ollama, force_reset=True, chunk_size=chunk_size, chunk_overlap=chunk_overlap)
        stats = rag_system.get_stats()
        
        # Log information about created system
        rag_logger.log_info(f"RAG система создана: {request.vector_store_type}, Ollama: {request.use_ollama}")
        rag_logger.log_info(f"Статистика после создания: {stats['documents_count']} документов, {stats['total_chunks']} чанков")
        
        message = f"RAG система настроена на {request.vector_store_type.upper()}"
        if request.use_ollama:
            message += f" с Ollama эмбеддингами ({request.ollama_embedding_model})"
        else:
            message += " с SentenceTransformers"
        
        rag_logger.log_rag_config(request.vector_store_type, request.use_ollama, request.ollama_embedding_model)
        
        return {
            "status": "success",
            "message": message,
            "stats": stats
        }
    except Exception as e:
        rag_logger.log_error(f"RAG configuration error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Error configuring RAG: {str(e)}")

@app.post("/rag/documents")
async def add_documents(request: RAGDocumentRequest):
    """Add documents to RAG system"""
    try:
        global rag_system
        if rag_system is None:
            rag_system = await get_rag_system()
        
        # Split each document into chunks
        all_chunks = []
        all_metadata = []
        total_length = 0
        
        for i, document in enumerate(request.documents):
            total_length += len(document)
            # Split document into chunks
            chunks = rag_system._split_text_into_chunks(document)
            
            # Create metadata for each chunk
            for j, chunk in enumerate(chunks):
                chunk_metadata = {
                    "source": f"text_doc_{i}",
                    "chunk_index": j,
                    "total_chunks": len(chunks),
                    "original_length": len(document)
                }
                
                # Add custom metadata if available
                if request.metadata and i < len(request.metadata):
                    chunk_metadata.update(request.metadata[i])
                
                all_chunks.append(chunk)
                all_metadata.append(chunk_metadata)
        
        # Add all chunks to RAG system
        await rag_system.add_documents(all_chunks, all_metadata, progress_callback=broadcast_progress)
        stats = rag_system.get_stats()
        
        return {
            "status": "success",
            "message": f"Добавлено {len(request.documents)} документов, создано {len(all_chunks)} чанков",
            "stats": stats,
            "documents_count": len(request.documents),
            "chunks_count": len(all_chunks),
            "processed_chunks": len(all_chunks),
            "total_length": total_length,
            "chunks": all_chunks  # Добавляем чанки для MemoRAG
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error adding documents: {str(e)}")

@app.post("/rag/search")
async def search_documents(request: RAGSearchRequest):
    """Search similar documents"""
    try:
        global rag_system
        if rag_system is None:
            rag_system = await get_rag_system()
        results = await rag_system.search(request.query, request.top_k)
        return {
            "status": "success",
            "query": request.query,
            "results": results,
            "count": len(results)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Search error: {str(e)}")

@app.get("/rag/stats")
async def get_rag_stats():
    """Get RAG system statistics"""
    try:
        # Get current configured RAG system, don't create new one
        # Use global variable if it already exists
        global rag_system
        if rag_system is None:
            # If RAG system not yet initialized, create with default settings
            rag_system = await get_rag_system()
            rag_logger = get_rag_logger()
            rag_logger.log_info("RAG система не была инициализирована, создана с настройками по умолчанию")
        
        stats = rag_system.get_stats()
        
        # Log information about retrieved statistics
        rag_logger = get_rag_logger()
        rag_logger.log_info(f"Запрос статистики RAG: {stats['documents_count']} документов, {stats['total_chunks']} чанков, тип: {stats['vector_store_type']}")
        
        return {
            "status": "success",
            "stats": stats
        }
    except Exception as e:
        rag_logger = get_rag_logger()
        rag_logger.log_error(f"Error getting statistics: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Error getting statistics: {str(e)}")

@app.delete("/rag/documents")
async def clear_rag_documents():
    """Clear all documents from RAG system"""
    try:
        global rag_system
        if rag_system is None:
            rag_system = await get_rag_system()
        
        # Log information before clearing
        rag_logger = get_rag_logger()
        stats_before = rag_system.get_stats()
        rag_logger.log_info(f"Очистка RAG: было {stats_before['documents_count']} документов, {stats_before['total_chunks']} чанков")
        
        rag_system.clear_all()
        stats = rag_system.get_stats()
        
        # Log information after clearing
        rag_logger.log_info(f"RAG очищен: стало {stats['documents_count']} документов, {stats['total_chunks']} чанков")
        
        return {
            "status": "success",
            "message": "Все документы удалены",
            "stats": stats
        }
    except Exception as e:
        rag_logger = get_rag_logger()
        rag_logger.log_error(f"Clear error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Clear error: {str(e)}")

@app.post("/rag/chat")
async def rag_chat_completion(request: RAGChatRequest):
    """Chat using RAG for improved responses"""
    try:
        global rag_system
        if rag_system is None:
            rag_system = await get_rag_system()
        
        # Get last user message
        user_message = None
        for msg in reversed(request.messages):
            if msg.role == "user":
                user_message = msg.content
                break
        
        if not user_message:
            raise HTTPException(status_code=400, detail="User message not found")
        
        # Search for relevant documents
        relevant_docs = []
        if request.use_rag:
            search_results = await rag_system.search(user_message, request.rag_top_k)
            relevant_docs = [doc["document"] for doc in search_results]
        
        # Form context with documents
        context = ""
        if relevant_docs:
            context = "\n\nРелевантная информация:\n" + "\n".join([f"- {doc}" for doc in relevant_docs])
        
        # Create prompt with context
        enhanced_messages = []
        for msg in request.messages:
            if msg.role == "user" and msg == request.messages[-1]:
                # Добавляем контекст к последнему сообщению пользователя
                enhanced_content = msg.content + context
                enhanced_messages.append(ChatMessage(role=msg.role, content=enhanced_content))
            else:
                enhanced_messages.append(msg)
        
        # Генерируем ответ через Ollama (так как мы используем Ollama модели)
        try:
            # Формируем промпт для Ollama
            prompt_parts = []
            for msg in enhanced_messages:
                if msg.role == "user":
                    prompt_parts.append(f"User: {msg.content}")
                elif msg.role == "assistant":
                    prompt_parts.append(f"Assistant: {msg.content}")
                elif msg.role == "system":
                    prompt_parts.append(f"System: {msg.content}")
            
            prompt = "\n".join(prompt_parts) + "\nAssistant:"
            
            # Используем Ollama для генерации
            async with httpx.AsyncClient(timeout=30.0) as client:
                payload = {
                    "model": config.ollama.default_model,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": request.temperature,
                        "num_predict": request.max_tokens
                    }
                }
                
                response = await client.post(
                    f"{config.ollama.url}/api/generate",
                    json=payload
                )
                
                if response.status_code == 200:
                    data = response.json()
                    response_text = data.get("response", "Извините, не удалось получить ответ.")
                else:
                    response_text = "Извините, модель не загружена. Пожалуйста, загрузите модель для использования RAG чата."
                    
        except Exception as e:
            response_text = f"Generation error: {str(e)}"
        
        return {
            "status": "success",
            "response": response_text,
            "used_rag": request.use_rag,
            "relevant_docs_count": len(relevant_docs),
            "context_added": bool(context)
        }
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error RAG чата: {str(e)}")

@app.post("/rag/chat-stream")
async def rag_chat_completion_stream(request: RAGChatRequest):
    """Streaming chat using RAG for improved responses"""
    try:
        global rag_system
        if rag_system is None:
            rag_system = await get_rag_system()
        
        # Get last user message
        user_message = None
        for msg in reversed(request.messages):
            if msg.role == "user":
                user_message = msg.content
                break
        
        if not user_message:
            raise HTTPException(status_code=400, detail="User message not found")
        
        # Search for relevant documents
        relevant_docs = []
        if request.use_rag:
            search_results = await rag_system.search(user_message, request.rag_top_k)
            relevant_docs = [doc["document"] for doc in search_results]
        
        # Form context with documents
        context = ""
        if relevant_docs:
            context = "\n\nРелевантная информация:\n" + "\n".join([f"- {doc}" for doc in relevant_docs])
        
        # Create prompt with context
        enhanced_messages = []
        for msg in request.messages:
            if msg.role == "user" and msg == request.messages[-1]:
                # Добавляем контекст к последнему сообщению пользователя
                enhanced_content = msg.content + context
                enhanced_messages.append(ChatMessage(role=msg.role, content=enhanced_content))
            else:
                enhanced_messages.append(msg)
        
        # Формируем промпт для генерации
        prompt = ""
        for msg in enhanced_messages:
            if msg.role == "user":
                prompt += f"Пользователь: {msg.content}\n"
            elif msg.role == "assistant":
                prompt += f"Ассистент: {msg.content}\n"
            elif msg.role == "system":
                prompt += f"Система: {msg.content}\n"
        
        return StreamingResponse(
            stream_rag_chat_completion(prompt, request, len(relevant_docs), bool(context)),
            media_type="text/plain"
        )
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error RAG чата: {str(e)}")

async def stream_rag_chat_completion(prompt: str, request: RAGChatRequest, relevant_docs_count: int, context_added: bool, model_name: Optional[str] = None):
    """Streaming RAG chat generation"""
    try:
        if not model_name:
            model_name = config.ollama.default_model
        # Отправляем начальное событие с метаданными RAG
        yield f"data: {json.dumps({'type': 'start', 'rag_info': {'used_rag': request.use_rag, 'relevant_docs_count': relevant_docs_count, 'context_added': context_added}})}\n\n"
        
        full_response = ""
        
        # Используем Ollama для потоковой генерации
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                payload = {
                    "model": model_name,
                    "prompt": prompt,
                    "stream": True,
                    "options": {
                        "temperature": request.temperature,
                        "num_predict": request.max_tokens
                    }
                }
                
                async with client.stream(
                    "POST",
                    f"{config.ollama.url}/api/generate",
                    json=payload
                ) as response:
                    if response.status_code == 200:
                        async for line in response.aiter_lines():
                            if line.strip():
                                try:
                                    data = json.loads(line)
                                    if "response" in data:
                                        chunk = data["response"]
                                        full_response += chunk
                                        # Send each chunk
                                        yield f"data: {json.dumps({'type': 'chunk', 'content': chunk})}\n\n"
                                    
                                    if data.get("done", False):
                                        break
                                except json.JSONDecodeError:
                                    continue
                    else:
                        yield f"data: {json.dumps({'type': 'error', 'error': f'Ollama generation failed: {response.status_code}'})}\n\n"
                        return
                        
        except httpx.ConnectError:
            yield f"data: {json.dumps({'type': 'error', 'error': 'Не удается подключиться к Ollama серверу'})}\n\n"
            return
        except Exception as e:
            error_msg = str(e) if str(e) else f"Unknown error type {type(e).__name__}"
            logger.error(f"Error in stream_rag_chat_completion: {error_msg}")
            yield f"data: {json.dumps({'type': 'error', 'error': error_msg})}\n\n"
            return
        
        # Отправляем финальное событие
        yield f"data: {json.dumps({'type': 'end', 'full_response': full_response, 'rag_info': {'used_rag': request.use_rag, 'relevant_docs_count': relevant_docs_count, 'context_added': context_added}})}\n\n"
        
    except Exception as e:
        error_msg = str(e) if str(e) else f"Unknown error type {type(e).__name__}"
        logger.error(f"Error in stream_rag_chat_completion (outer catch): {error_msg}")
        # Send error event
        yield f"data: {json.dumps({'type': 'error', 'error': error_msg})}\n\n"

# Эндпоинты для логов RAG
@app.get("/rag/logs")
async def get_rag_logs(limit: int = 100, level: Optional[str] = None):
    """Get RAG system logs"""
    try:
        rag_logger = get_rag_logger()
        logs = rag_logger.get_recent_logs(limit, level)
        
        return {
            "status": "success",
            "logs": logs,
            "count": len(logs),
            "limit": limit,
            "level_filter": level
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error getting logs: {str(e)}")

@app.get("/rag/logs/stats")
async def get_rag_log_stats():
    """Get RAG log statistics"""
    try:
        rag_logger = get_rag_logger()
        stats = rag_logger.get_log_stats()
        
        return {
            "status": "success",
            "stats": stats
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error getting log statistics: {str(e)}")

@app.delete("/rag/logs")
async def clear_rag_logs():
    """Clear RAG system logs"""
    try:
        rag_logger = get_rag_logger()
        rag_logger.clear_logs()
        
        return {
            "status": "success",
            "message": "Логи RAG системы очищены"
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error clearing logs: {str(e)}")

# MemoRAG эндпоинты
@app.post("/memorag/documents")
async def add_documents_to_memorag(request: RAGDocumentRequest):
    """Add documents to MemoRAG system"""
    try:
        memo_rag = await get_memo_rag_system()
        results = await memo_rag.add_documents(request.documents, metadata=request.metadata)
        
        return {
            "status": "success",
            "message": f"Добавлено {len(request.documents)} документов в MemoRAG",
            "results": results
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error adding documents to MemoRAG: {str(e)}")

@app.post("/memorag/search")
async def search_with_memory(request: RAGSearchRequest):
    """Search using MemoRAG global memory"""
    try:
        memo_rag = await get_memo_rag_system()
        
        # Устанавливаем размер контекста, если указан
        if request.context_length:
            memo_rag.set_context_length(request.context_length)
        
        results = await memo_rag.search_with_memory(request.query, request.top_k)
        
        return {
            "status": "success",
            "query": request.query,
            "results": results['results'],
            "memory_context": results['memory_context'],
            "clues_used": results['clues_used'],
            "total_clues": results['total_clues'],
            "count": len(results['results']),
            "context_length": memo_rag.context_length
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"MemoRAG search error: {str(e)}")

@app.post("/rag/search-with-memory")
async def rag_search_with_memory(request: RAGSearchRequest):
    """Search using MemoRAG for symptom analysis"""
    try:
        memo_rag = await get_memo_rag_system()
        
        # Устанавливаем размер контекста, если указан
        if request.context_length:
            memo_rag.set_context_length(request.context_length)
        
        results = await memo_rag.search_with_memory(request.query, request.top_k)
        
        return {
            "status": "success",
            "query": request.query,
            "results": results.get('results', []),
            "memory_context": results.get('memory_context', []),
            "clues_used": results.get('clues_used', []),
            "total_results": len(results.get('results', []))
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Memory search error: {str(e)}")

@app.post("/memorag/chat")
async def memorag_chat_completion(request: RAGChatRequest):
    """Chat using MemoRAG"""
    try:
        memo_rag = await get_memo_rag_system()
        
        # Конвертируем сообщения в нужный формат
        messages = [{"role": msg.role, "content": msg.content} for msg in request.messages]
        # Get last user message
        user_message = None
        for msg in reversed(request.messages):
            if msg.role == "user":
                user_message = msg.content
                break
        if not user_message:
            raise HTTPException(status_code=400, detail="User message not found")

        # Поиск через MemoRAG
        search_results = await memo_rag.search_with_memory(user_message, request.rag_top_k)
        memory_context = search_results.get("memory_context", [])
        results = search_results.get("results", [])
        clues_used = search_results.get("clues_used", [])

        # Формируем контекст для промпта
        context_parts = []
        if memory_context:
            context_parts.append("Контекст из памяти:")
            for ctx in memory_context[:3]:
                context_parts.append(f"- {ctx}")

        if results:
            context_parts.append("\nРелевантные документы:")
            for result in results[:request.rag_top_k]:
                text = result.get("text") or result.get("document") or ""
                if text:
                    context_parts.append(f"- {text}")

        if clues_used:
            context_parts.append(f"\nИспользованные подсказки: {', '.join(clues_used[:3])}")

        context_block = "\n".join(context_parts).strip()

        enhanced_messages = []
        for msg in request.messages:
            if msg.role == "user" and msg == request.messages[-1] and context_block:
                enhanced_content = msg.content + "\n\n" + context_block
                enhanced_messages.append(ChatMessage(role=msg.role, content=enhanced_content))
            else:
                enhanced_messages.append(msg)

        # Формируем промпт для Ollama
        prompt_parts = []
        for msg in enhanced_messages:
            if msg.role == "user":
                prompt_parts.append(f"User: {msg.content}")
            elif msg.role == "assistant":
                prompt_parts.append(f"Assistant: {msg.content}")
            elif msg.role == "system":
                prompt_parts.append(f"System: {msg.content}")
        prompt = "\n".join(prompt_parts) + "\nAssistant:"

        # Генерация через Ollama
        response_text = ""
        async with httpx.AsyncClient(timeout=60.0) as client:
            payload = {
                "model": config.ollama.default_model,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": request.temperature,
                    "num_predict": request.max_tokens
                }
            }
            response = await client.post(
                f"{config.ollama.url}/api/generate",
                json=payload
            )
            if response.status_code == 200:
                data = response.json()
                response_text = data.get("response", "Извините, не удалось получить ответ.")
            else:
                response_text = "Извините, модель не загружена. Пожалуйста, загрузите модель."

        return {
            "status": "success",
            "response": response_text,
            "memory_used": True,
            "memory_context_count": len(memory_context),
            "clues_count": len(clues_used),
            "documents_found": len(results),
            "context_added": bool(context_block)
        }
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error MemoRAG чата: {str(e)}")

@app.get("/memorag/memory-stats")
async def get_memory_stats():
    """Get MemoRAG global memory statistics"""
    try:
        memo_rag = await get_memo_rag_system()
        stats = memo_rag.get_memory_stats()
        
        return {
            "status": "success",
            "memory_stats": stats
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error getting memory statistics: {str(e)}")

@app.delete("/memorag/memory")
async def clear_memorag_memory():
    """Clear global MemoRAG memory."""
    try:
        memo_rag = await get_memo_rag_system()
        
        # Получаем статистику до очистки
        stats_before = memo_rag.get_memory_stats()
        print(f"DEBUG: Stats before clear: {stats_before['total_entries']} entries")
        
        memo_rag.clear_memory()
        
        # Получаем статистику после очистки
        stats_after = memo_rag.get_memory_stats()
        print(f"DEBUG: Stats after clear: {stats_after['total_entries']} entries")
        
        return {
            "status": "success",
            "message": "MemoRAG memory cleared",
            "stats_before": stats_before,
            "stats_after": stats_after
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error clearing memory: {str(e)}")

@app.get("/memorag/memory-debug")
async def get_memory_debug_info():
    """Get debug information about MemoRAG memory."""
    try:
        memo_rag = await get_memo_rag_system()
        debug_info = memo_rag.check_memory_content_lengths()
        
        return {
            "status": "success",
            "debug_info": debug_info
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error getting debug info: {str(e)}")

@app.post("/memorag/migrate-existing")
async def migrate_existing_rag_to_memorag():
    """Migrate existing RAG data into MemoRAG memory."""
    try:
        global rag_system
        if rag_system is None:
            rag_system = await get_rag_system()
        
        # Получаем все документы из существующей RAG системы
        if hasattr(rag_system, 'documents') and rag_system.documents:
            documents = rag_system.documents
            memo_rag = await get_memo_rag_system()
            
            # Добавляем все существующие документы в MemoRAG
            result = await memo_rag.add_documents(documents)
            
            return {
                "status": "success",
                "message": f"Migrated {len(documents)} documents to MemoRAG memory",
                "migrated_count": len(documents),
                "memo_rag_result": result
            }
        else:
            return {
                "status": "info",
                "message": "В RAG системе нет документов для миграции",
                "migrated_count": 0
            }
            
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Migration error: {str(e)}")

@app.get("/memorag/migrate-status")
async def get_migration_status():
    """Check migration status with timeouts."""
    try:
        import asyncio
        
        # Устанавливаем таймаут для проверки статуса
        timeout = 5.0  # 5 секунд максимум
        
        async def check_rag_status():
            try:
                # Проверяем файлы RAG системы напрямую без инициализации
                import os
                rag_data_dir = "data/rag"
                
                if not os.path.exists(rag_data_dir):
                    return {"total_chunks": 0}
                
                # Проверяем наличие файлов FAISS
                faiss_files = [f for f in os.listdir(rag_data_dir) if f.endswith('.index')]
                if faiss_files:
                    # Простая проверка размера файла как индикатор количества чанков
                    faiss_file = os.path.join(rag_data_dir, faiss_files[0])
                    file_size = os.path.getsize(faiss_file)
                    # Примерная оценка: 1KB на чанк
                    estimated_chunks = max(1, file_size // 1024)
                    return {"total_chunks": estimated_chunks}
                
                return {"total_chunks": 0}
            except Exception as e:
                logger.warning(f"Error getting RAG stats: {e}")
                return {"total_chunks": 0}
        
        async def check_memo_status():
            try:
                # Проверяем файлы MemoRAG напрямую без инициализации
                import os
                memo_file = "data/rag/memo_memory.pkl"
                
                if not os.path.exists(memo_file):
                    return {"total_entries": 0}
                
                # Простая проверка размера файла как индикатор количества записей
                file_size = os.path.getsize(memo_file)
                # Примерная оценка: 100 байт на запись
                estimated_entries = max(0, file_size // 100)
                return {"total_entries": estimated_entries}
            except Exception as e:
                logger.warning(f"Error getting MemoRAG stats: {e}")
                return {"total_entries": 0}
        
        # Выполняем проверки с таймаутом
        try:
            rag_stats, memo_stats = await asyncio.wait_for(
                asyncio.gather(
                    check_rag_status(),
                    check_memo_status(),
                    return_exceptions=True
                ),
                timeout=timeout
            )
            
            # Обрабатываем исключения
            if isinstance(rag_stats, Exception):
                logger.warning(f"RAG check failed: {rag_stats}")
                rag_stats = {"total_chunks": 0}
            
            if isinstance(memo_stats, Exception):
                logger.warning(f"MemoRAG check failed: {memo_stats}")
                memo_stats = {"total_entries": 0}
            
        except asyncio.TimeoutError:
            logger.warning("Timeout checking migration status")
            rag_stats = {"total_chunks": 0}
            memo_stats = {"total_entries": 0}
        
        rag_docs = rag_stats.get("total_chunks", 0)
        memo_entries = memo_stats.get("total_entries", 0)
        
        return {
            "status": "success",
            "rag_documents": rag_docs,
            "memo_rag_entries": memo_entries,
            "migration_needed": rag_docs > 0 and memo_entries == 0,
            "migration_complete": memo_entries > 0,
            "timeout_used": False
        }
        
    except Exception as e:
        logger.error(f"Critical status check error: {e}")
        return {
            "status": "error",
            "message": f"Error checking status: {str(e)}",
            "rag_documents": 0,
            "memo_rag_entries": 0,
            "migration_needed": False,
            "migration_complete": False,
            "timeout_used": True
        }

if __name__ == "__main__":
    print("Starting AI Assistant API server...")
    
    # Проверка подключения к Ollama при старте - ТОЧНО КАК В ТЕСТЕ
    print("\nChecking Ollama connection...")
    async def check_ollama_startup():
        try:
            # Прямой HTTP запрос (как в тесте)
            import httpx
            url = config.ollama.url
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{url}/api/tags")
                if response.status_code == 200:
                    data = response.json()
                    models = data.get("models", [])
                    print(f"✓ Ollama connected! Models found: {len(models)}")
                else:
                    print(f"⚠ Ollama returned status {response.status_code}")
        except httpx.ConnectError:
            print(f"⚠ Ollama unavailable at {config.ollama.url}")
            print("  Ensure Ollama is running!")
        except Exception as e:
            print(f"⚠ Ollama check error: {e}")
    
    asyncio.run(check_ollama_startup())
    
    print("\nAvailable endpoints:")
    print("- GET  / - web interface")
    print("- GET  /api - API info")
    print("- GET  /health - health check")
    print("- GET  /v1/models - model list")
    print("- POST /v1/chat/completions - text generation")
    print("- POST /load-model - load model")
    print("- GET  /model-info - model info")
    print("- GET  /status - full status")
    print("- POST /ollama/connect - connect to Ollama")
    print("- GET  /ollama/models - Ollama models")
    print("- POST /ollama/generate - generate via Ollama")
    print("- POST /ollama/generate-stream - stream generate via Ollama")
    print("- POST /ollama/model - manage local models (remove/info)")
    print("- POST /ollama/config - set modes (GPU/CPU/Balanced)")
    print("- GET  /ollama/system - system info")
    print("- GET  /ollama/connection-status - connection status")
    print("- GET  /config - configuration info")
    print("- GET  /config/full - full configuration")
    print("- POST /config/reload - reload configuration")
    print("- POST /config/save - save configuration")
    print("- POST /rag/config - configure RAG (FAISS/Chroma/Ollama)")
    print("- POST /rag/documents - add documents")
    print("- POST /rag/search - search documents")
    print("- GET  /rag/stats - RAG statistics")
    print("- DELETE /rag/documents - clear documents")
    print("- POST /rag/chat - RAG chat")
    print("- POST /rag/chat-stream - RAG stream chat")
    print("- POST /rag/upload-file - upload files to RAG")
    print("- GET  /rag/supported-formats - supported formats")
    print("- GET  /rag/ollama-embedding-models - Ollama embedding models")
    print("- POST /rag/set-ollama-embedding-model - set embedding model")
    print("- GET  /rag/logs - RAG logs")
    print("- GET  /rag/logs/stats - log statistics")
    print("- DELETE /rag/logs - clear logs")
    print("- POST /memorag/documents - add documents to MemoRAG")
    print("- POST /memorag/search - search with global memory")
    print("- POST /memorag/chat - MemoRAG chat")
    print("- GET  /memorag/memory-stats - MemoRAG memory statistics")
    print("- DELETE /memorag/memory - clear MemoRAG memory")

# Patient API endpoints
@app.get("/patients/stats", response_model=PatientsStatsResponse)
async def get_patients_stats():
    """Get patient database statistics."""
    try:
        db = get_patients_database()
        stats = db.get_statistics()
        return PatientsStatsResponse(**stats)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error getting statistics: {str(e)}")

@app.get("/patients", response_model=List[PatientResponse])
async def get_all_patients():
    """Get list of all patients."""
    try:
        db = get_patients_database()
        patients = db.get_all_patients()
        return [PatientResponse(**patient) for patient in patients]
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error getting patients: {str(e)}")

@app.post("/patients", response_model=PatientResponse)
async def add_patient(patient: PatientRequest):
    """Add a new patient."""
    try:
        db = get_patients_database()
        patient_id = db.add_patient(
            name=patient.name,
            age=patient.age,
            gender=patient.gender,
            notes=patient.notes
        )
        
        # Получаем созданного пациента
        created_patient = db.get_patient(patient_id)
        if created_patient:
            return PatientResponse(**created_patient)
        else:
            raise HTTPException(status_code=400, detail="Error creating patient")
            
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error adding patient: {str(e)}")

@app.get("/patients/{patient_id}", response_model=PatientResponse)
async def get_patient(patient_id: int):
    """Get patient information."""
    try:
        db = get_patients_database()
        patient = db.get_patient(patient_id)
        if patient:
            return PatientResponse(**patient)
        else:
            raise HTTPException(status_code=404, detail="Patient not found")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error getting patient: {str(e)}")

@app.put("/patients/{patient_id}", response_model=PatientResponse)
async def update_patient(patient_id: int, patient: PatientRequest):
    """Update patient information."""
    try:
        db = get_patients_database()
        success = db.update_patient(
            patient_id=patient_id,
            name=patient.name,
            age=patient.age,
            gender=patient.gender,
            notes=patient.notes
        )
        
        if success:
            updated_patient = db.get_patient(patient_id)
            if updated_patient:
                return PatientResponse(**updated_patient)
            else:
                raise HTTPException(status_code=400, detail="Error getting updated patient")
        else:
            raise HTTPException(status_code=404, detail="Patient not found")
            
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error updating patient: {str(e)}")

@app.delete("/patients/clear-database")
async def clear_patients_database():
    """Fully clear the patient database."""
    print("DEBUG: Эндпоинт clear_patients_database вызван")
    try:
        db = get_patients_database()
        print("DEBUG: Получен экземпляр базы данных")
        
        success = db.clear_database()
        print(f"DEBUG: Database clear result: {success}")
        
        if success:
            print("DEBUG: Database cleared successfully")
            return {"status": "success", "message": "Patient database cleared"}
        else:
            print("DEBUG: Database clear error")
            raise HTTPException(status_code=400, detail="Error clearing database")
            
    except Exception as e:
        print(f"DEBUG: Exception during database clear: {e}")
        raise HTTPException(status_code=400, detail=f"Error clearing database: {str(e)}")

@app.get("/patients-db/export")
async def export_patients_database(format: str = "sqlite"):
    """
    Выгрузка базы данных пациентов в различных форматах
    
    Форматы:
    - sqlite: SQLite файл (.db) - полная копия базы данных
    - sql: SQL дамп (.sql) - SQL скрипт для восстановления
    - json: JSON файл (.json) - структурированные данные
    - zip: ZIP архив со всеми форматами
    """
    try:
        import shutil
        import zipfile
        import io
        from datetime import datetime
        
        db = get_patients_database()
        db_path = Path(db.db_path)
        
        if not db_path.exists():
            raise HTTPException(status_code=404, detail="Database not found")
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        base_filename = f"patients_db_backup_{timestamp}"
        
        if format == "sqlite":
            # Возвращаем SQLite файл напрямую
            return FileResponse(
                path=str(db_path),
                filename=f"{base_filename}.db",
                media_type="application/x-sqlite3"
            )
        
        elif format == "sql":
            # Создаем SQL дамп
            sql_dump = []
            sql_dump.append("-- SQL Dump of Patients Database\n")
            sql_dump.append(f"-- Generated: {datetime.now().isoformat()}\n\n")
            sql_dump.append("BEGIN TRANSACTION;\n\n")
            
            conn = sqlite3.connect(str(db_path))
            cursor = conn.cursor()
            
            # Получаем структуру таблиц
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = [row[0] for row in cursor.fetchall()]
            
            for table in tables:
                if table == "sqlite_sequence":
                    continue
                
                sql_dump.append(f"-- Table: {table}\n")
                
                # Получаем данные
                cursor.execute(f"SELECT * FROM {table}")
                rows = cursor.fetchall()
                
                if rows:
                    # Получаем названия колонок
                    cursor.execute(f"PRAGMA table_info({table})")
                    columns = [col[1] for col in cursor.fetchall()]
                    
                    # Создаем INSERT statements
                    for row in rows:
                        values = []
                        for val in row:
                            if val is None:
                                values.append("NULL")
                            elif isinstance(val, str):
                                # Экранируем кавычки
                                val_escaped = val.replace("'", "''")
                                values.append(f"'{val_escaped}'")
                            else:
                                values.append(str(val))
                        
                        sql_dump.append(f"INSERT INTO {table} ({', '.join(columns)}) VALUES ({', '.join(values)});\n")
                
                sql_dump.append("\n")
            
            conn.close()
            
            sql_dump.append("COMMIT;\n")
            
            sql_content = "".join(sql_dump)
            
            return Response(
                content=sql_content,
                media_type="application/sql",
                headers={"Content-Disposition": f'attachment; filename="{base_filename}.sql"'}
            )
        
        elif format == "json":
            # Создаем JSON структуру
            conn = sqlite3.connect(str(db_path))
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # Получаем всех пациентов
            cursor.execute("SELECT * FROM patients ORDER BY id")
            patients = [dict(row) for row in cursor.fetchall()]
            
            # Получаем все документы
            cursor.execute("SELECT * FROM documents ORDER BY id")
            documents = [dict(row) for row in cursor.fetchall()]
            
            conn.close()

            # Строим удобную структуру: пациент -> его документы
            documents_by_patient: Dict[int, List[Dict[str, Any]]] = {}
            for doc in documents:
                pid = doc.get("patient_id")
                if pid is None:
                    continue
                if pid not in documents_by_patient:
                    documents_by_patient[pid] = []
                documents_by_patient[pid].append(doc)

            patients_with_documents: List[Dict[str, Any]] = []
            for patient in patients:
                pid = patient.get("id")
                patient_copy = dict(patient)
                patient_copy["documents"] = documents_by_patient.get(pid, [])
                patients_with_documents.append(patient_copy)
            
            # Формируем JSON структуру
            export_data = {
                "export_info": {
                    "format": "JSON",
                    "version": "1.1",
                    "export_date": datetime.now().isoformat(),
                    "database_path": str(db_path)
                },
                "statistics": {
                    "total_patients": len(patients),
                    "total_documents": len(documents)
                },
                "patients": patients,
                "documents": documents,
                "patients_with_documents": patients_with_documents
            }
            
            json_content = json.dumps(export_data, ensure_ascii=False, indent=2)
            
            return Response(
                content=json_content,
                media_type="application/json",
                headers={"Content-Disposition": f'attachment; filename="{base_filename}.json"'}
            )
        
        elif format == "zip":
            # Создаем ZIP архив со всеми форматами
            zip_buffer = io.BytesIO()
            
            with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
                # 1. SQLite файл
                zip_file.write(str(db_path), f"{base_filename}.db")
                
                # 2. SQL дамп
                sql_dump = []
                sql_dump.append("-- SQL Dump of Patients Database\n")
                sql_dump.append(f"-- Generated: {datetime.now().isoformat()}\n\n")
                sql_dump.append("BEGIN TRANSACTION;\n\n")
                
                conn = sqlite3.connect(str(db_path))
                cursor = conn.cursor()
                
                cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
                tables = [row[0] for row in cursor.fetchall()]
                
                for table in tables:
                    if table == "sqlite_sequence":
                        continue
                    
                    sql_dump.append(f"-- Table: {table}\n")
                    cursor.execute(f"SELECT * FROM {table}")
                    rows = cursor.fetchall()
                    
                    if rows:
                        cursor.execute(f"PRAGMA table_info({table})")
                        columns = [col[1] for col in cursor.fetchall()]
                        
                        for row in rows:
                            values = []
                            for val in row:
                                if val is None:
                                    values.append("NULL")
                                elif isinstance(val, str):
                                    val_escaped = val.replace("'", "''")
                                    values.append(f"'{val_escaped}'")
                                else:
                                    values.append(str(val))
                            
                            sql_dump.append(f"INSERT INTO {table} ({', '.join(columns)}) VALUES ({', '.join(values)});\n")
                    
                    sql_dump.append("\n")
                
                conn.close()
                sql_dump.append("COMMIT;\n")
                zip_file.writestr(f"{base_filename}.sql", "".join(sql_dump))
                
                # 3. JSON файл
                conn = sqlite3.connect(str(db_path))
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                
                cursor.execute("SELECT * FROM patients ORDER BY id")
                patients = [dict(row) for row in cursor.fetchall()]
                
                cursor.execute("SELECT * FROM documents ORDER BY id")
                documents = [dict(row) for row in cursor.fetchall()]
                
                conn.close()
                
                # Строим удобную структуру: пациент -> его документы
                documents_by_patient: Dict[int, List[Dict[str, Any]]] = {}
                for doc in documents:
                    pid = doc.get("patient_id")
                    if pid is None:
                        continue
                    if pid not in documents_by_patient:
                        documents_by_patient[pid] = []
                    documents_by_patient[pid].append(doc)

                patients_with_documents: List[Dict[str, Any]] = []
                for patient in patients:
                    pid = patient.get("id")
                    patient_copy = dict(patient)
                    patient_copy["documents"] = documents_by_patient.get(pid, [])
                    patients_with_documents.append(patient_copy)

                export_data = {
                    "export_info": {
                        "format": "JSON",
                        "version": "1.1",
                        "export_date": datetime.now().isoformat(),
                        "database_path": str(db_path)
                    },
                    "statistics": {
                        "total_patients": len(patients),
                        "total_documents": len(documents)
                    },
                    "patients": patients,
                    "documents": documents,
                    "patients_with_documents": patients_with_documents
                }
                
                json_content = json.dumps(export_data, ensure_ascii=False, indent=2)
                zip_file.writestr(f"{base_filename}.json", json_content.encode('utf-8'))
            
            zip_buffer.seek(0)
            
            return Response(
                content=zip_buffer.getvalue(),
                media_type="application/zip",
                headers={"Content-Disposition": f'attachment; filename="{base_filename}.zip"'}
            )
        
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported format: {format}. Available: sqlite, sql, json, zip"
            )
            
    except Exception as e:
        logger.error(f"Ошибка выгрузки базы данных: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error exporting database: {str(e)}")

@app.post("/patients-db/import")
async def import_patients_database(
    file: UploadFile = File(...),
    mode: str = Form("merge")
):
    """
    Импорт базы данных пациентов из файла
    
    Поддерживаемые форматы:
    - SQLite (.db) - полная замена базы данных
    - SQL (.sql) - выполнение SQL скрипта
    - JSON (.json) - импорт из структурированных данных
    
    Параметры:
    - mode: "merge" (добавить к существующим) или "replace" (заменить все)
    """
    try:
        import shutil
        import tempfile
        from datetime import datetime
        
        db = get_patients_database()
        db_path = Path(db.db_path)
        
        # Определяем формат по расширению файла
        filename = file.filename.lower()
        if filename.endswith('.db'):
            format_type = 'sqlite'
        elif filename.endswith('.sql'):
            format_type = 'sql'
        elif filename.endswith('.json'):
            format_type = 'json'
        else:
            raise HTTPException(
                status_code=400,
                detail="Unsupported file format. Use .db, .sql or .json"
            )
        
        # Читаем содержимое файла
        content = await file.read()
        
        if format_type == "sqlite":
            # Импорт SQLite файла
            if mode == "replace":
                backup_path = None
                # Создаем бэкап существующей БД
                if db_path.exists():
                    backup_path = db_path.parent / f"patients_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db"
                    shutil.copy2(str(db_path), str(backup_path))
                    logger.info(f"Создан бэкап БД: {backup_path}")
                
                # Сохраняем новый файл
                with open(str(db_path), 'wb') as f:
                    f.write(content)
                
                # Проверяем валидность новой БД
                try:
                    test_conn = sqlite3.connect(str(db_path))
                    test_cursor = test_conn.cursor()
                    test_cursor.execute("SELECT COUNT(*) FROM patients")
                    patients_count = test_cursor.fetchone()[0]
                    test_cursor.execute("SELECT COUNT(*) FROM documents")
                    docs_count = test_cursor.fetchone()[0]
                    test_conn.close()
                except Exception as e:
                    # Восстанавливаем из бэкапа при ошибке
                    if backup_path and backup_path.exists():
                        shutil.copy2(str(backup_path), str(db_path))
                    raise HTTPException(status_code=400, detail=f"Invalid database: {str(e)}")
                
                return {
                    "status": "success",
                    "message": f"Database replaced. Patients: {patients_count}, Documents: {docs_count}",
                    "patients_count": patients_count,
                    "documents_count": docs_count,
                    "backup_created": backup_path.exists() if backup_path else False
                }
            else:
                raise HTTPException(
                    status_code=400,
                    detail="For SQLite files only 'replace' mode is available. Use mode=replace"
                )
        
        elif format_type == "sql":
            # Импорт SQL скрипта
            sql_content = content.decode('utf-8')
            
            # Проверяем наличие BEGIN TRANSACTION
            if "BEGIN TRANSACTION" not in sql_content:
                raise HTTPException(
                    status_code=400,
                    detail="SQL file must contain BEGIN TRANSACTION"
                )
            
            conn = sqlite3.connect(str(db_path))
            cursor = conn.cursor()
            
            try:
                # Выполняем SQL скрипт
                if mode == "replace":
                    # Очищаем существующие данные
                    cursor.execute("DELETE FROM documents")
                    cursor.execute("DELETE FROM patients")
                
                # Выполняем SQL
                cursor.executescript(sql_content)
                conn.commit()
                
                # Получаем статистику
                cursor.execute("SELECT COUNT(*) FROM patients")
                patients_count = cursor.fetchone()[0]
                cursor.execute("SELECT COUNT(*) FROM documents")
                docs_count = cursor.fetchone()[0]
                
                conn.close()
                
                return {
                    "status": "success",
                    "message": f"SQL скрипт выполнен. Пациентов: {patients_count}, Документов: {docs_count}",
                    "patients_count": patients_count,
                    "documents_count": docs_count
                }
            except Exception as e:
                conn.rollback()
                conn.close()
                raise HTTPException(status_code=400, detail=f"Error executing SQL: {str(e)}")
        
        elif format_type == "json":
            # Импорт JSON файла
            try:
                import_data = json.loads(content.decode('utf-8'))
            except json.JSONDecodeError as e:
                raise HTTPException(status_code=400, detail=f"Invalid JSON: {str(e)}")
            
            # Проверяем структуру
            if 'patients_with_documents' not in import_data and 'patients' not in import_data:
                raise HTTPException(
                    status_code=400,
                    detail="JSON must contain 'patients' or 'patients_with_documents'"
                )
            
            # Используем patients_with_documents если есть, иначе patients
            if 'patients_with_documents' in import_data:
                patients_data = import_data['patients_with_documents']
            else:
                patients_data = import_data.get('patients', [])
                documents_data = import_data.get('documents', [])
            
            conn = sqlite3.connect(str(db_path))
            cursor = conn.cursor()
            
            try:
                if mode == "replace":
                    # Очищаем существующие данные
                    cursor.execute("DELETE FROM documents")
                    cursor.execute("DELETE FROM patients")
                
                imported_patients = 0
                imported_documents = 0
                
                # Импортируем пациентов
                for patient_data in patients_data:
                    # Извлекаем документы если они есть в структуре
                    patient_docs = []
                    if 'documents' in patient_data:
                        patient_docs = patient_data['documents']
                        # Удаляем документы из данных пациента для вставки
                        patient_copy = {k: v for k, v in patient_data.items() if k != 'documents'}
                    else:
                        patient_copy = patient_data
                    
                    # Вставляем пациента (без id, чтобы использовать автоинкремент)
                    cursor.execute("""
                        INSERT INTO patients (name, age, gender, notes, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?)
                    """, (
                        patient_copy.get('name'),
                        patient_copy.get('age'),
                        patient_copy.get('gender'),
                        patient_copy.get('notes'),
                        patient_copy.get('created_at'),
                        patient_copy.get('updated_at')
                    ))
                    
                    patient_id = cursor.lastrowid
                    imported_patients += 1
                    
                    # Импортируем документы пациента
                    for doc in patient_docs:
                        cursor.execute("""
                            INSERT INTO documents (patient_id, document_type, content, filename, created_at)
                            VALUES (?, ?, ?, ?, ?)
                        """, (
                            patient_id,
                            doc.get('document_type'),
                            doc.get('content'),
                            doc.get('filename'),
                            doc.get('created_at')
                        ))
                        imported_documents += 1
                
                # Если документы были отдельно (старый формат)
                if 'documents' in import_data and not any('documents' in p for p in patients_data):
                    # Создаем маппинг старых ID на новые
                    cursor.execute("SELECT id, name FROM patients ORDER BY id")
                    new_patients = {name: id for id, name in cursor.fetchall()}
                    
                    for doc in documents_data:
                        # Пытаемся найти пациента по имени или использовать patient_id
                        patient_id = doc.get('patient_id')
                        if patient_id:
                            # Проверяем существование пациента
                            cursor.execute("SELECT id FROM patients WHERE id = ?", (patient_id,))
                            if cursor.fetchone():
                                cursor.execute("""
                                    INSERT INTO documents (patient_id, document_type, content, filename, created_at)
                                    VALUES (?, ?, ?, ?, ?)
                                """, (
                                    patient_id,
                                    doc.get('document_type'),
                                    doc.get('content'),
                                    doc.get('filename'),
                                    doc.get('created_at')
                                ))
                                imported_documents += 1
                
                conn.commit()
                
                # Получаем финальную статистику
                cursor.execute("SELECT COUNT(*) FROM patients")
                total_patients = cursor.fetchone()[0]
                cursor.execute("SELECT COUNT(*) FROM documents")
                total_docs = cursor.fetchone()[0]
                
                conn.close()
                
                return {
                    "status": "success",
                    "message": f"Импортировано пациентов: {imported_patients}, документов: {imported_documents}",
                    "imported_patients": imported_patients,
                    "imported_documents": imported_documents,
                    "total_patients": total_patients,
                    "total_documents": total_docs
                }
                
            except Exception as e:
                conn.rollback()
                conn.close()
                raise HTTPException(status_code=400, detail=f"Error importing JSON: {str(e)}")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка импорта базы данных: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error importing database: {str(e)}")

@app.delete("/patients/{patient_id}")
async def delete_patient(patient_id: int):
    """Delete a patient."""
    try:
        db = get_patients_database()
        success = db.delete_patient(patient_id)
        
        if success:
            return {"status": "success", "message": f"Пациент {patient_id} удален"}
        else:
            raise HTTPException(status_code=404, detail="Patient not found")
            
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error deleting patient: {str(e)}")

@app.post("/patients/{patient_id}/documents", response_model=DocumentResponse)
async def add_document_to_patient(patient_id: int, document: DocumentRequest):
    """Add a document to a patient."""
    try:
        db = get_patients_database()
        
        # Проверяем существование пациента
        patient = db.get_patient(patient_id)
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")
        
        document_id = db.add_document(
            patient_id=patient_id,
            document_type=document.document_type,
            content=document.content,
            filename=document.filename
        )
        
        # Получаем созданный документ
        documents = db.get_patient_documents(patient_id)
        created_document = next((doc for doc in documents if doc['id'] == document_id), None)
        
        if created_document:
            return DocumentResponse(**created_document)
        else:
            raise HTTPException(status_code=400, detail="Error creating document")
            
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error adding document: {str(e)}")

@app.post("/patients/{patient_id}/vision-llm")
async def add_vision_llm_document(
    patient_id: int,
    file: UploadFile = File(...),
    pages: Optional[str] = Form(None),
    filename: Optional[str] = Form(None),
    model: Optional[str] = Form(None)
):
    """Extract data from PDF via Vision-LLM and add document to patient."""
    try:
        db = get_patients_database()
        patient = db.get_patient(patient_id)
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")

        try:
            from pdf2image import convert_from_path
            from PIL import Image
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Не удалось импортировать pdf2image/PIL: {str(e)}")

        # Защита от DecompressionBombError
        Image.MAX_IMAGE_PIXELS = None

        # Сохраняем PDF во временную папку
        temp_dir = Path(config.file_processing.temp_dir) / "vision_llm"
        temp_dir.mkdir(parents=True, exist_ok=True)
        temp_pdf_path = temp_dir / file.filename
        file_bytes = await file.read()
        with open(temp_pdf_path, "wb") as f:
            f.write(file_bytes)

        pages_to_parse = _parse_pages_input(pages)
        poppler_path = config.vision_llm.poppler_path
        pages_dir = Path(config.vision_llm.pages_dir)
        pages_dir.mkdir(parents=True, exist_ok=True)

        # PDF -> изображения
        await broadcast_progress({
            "type": "vision_llm_progress",
            "stage": "convert",
            "message": "Vision-LLM: конвертация PDF в изображения..."
        })
        pdf_pages = convert_from_path(
            temp_pdf_path,
            dpi=300,
            poppler_path=poppler_path
        )

        image_paths = []
        for i, page in enumerate(pdf_pages, start=1):
            if pages_to_parse is not None and i not in pages_to_parse:
                continue
            path = pages_dir / f"page_{i}.png"
            page.save(path)
            image_paths.append(path)

        if not image_paths:
            raise HTTPException(status_code=400, detail="Не удалось извлечь страницы из PDF")

        model_name = model or config.vision_llm.model
        pages_results = []
        total_pages = len(image_paths)

        for page_index, page_path in enumerate(image_paths, start=1):
            await broadcast_progress({
                "type": "vision_llm_progress",
                "stage": "page",
                "current_page": page_index,
                "total_pages": total_pages,
                "message": f"Vision-LLM: обработка страницы {page_index}/{total_pages}..."
            })
            raw = _chat_stream_ollama(
                model=model_name,
                messages=[{
                    "role": "user",
                    "content": VISION_LLM_EXTRACT_PROMPT,
                    "images": [str(page_path)]
                }]
            )

            page_answers = _safe_json_loads(raw, context=f"page={page_path.name}")
            page_score = sum(int(a["score"]) for a in page_answers)

            pages_results.append({
                "page": page_path.name,
                "page_score": page_score,
                "answers": page_answers
            })

        total_score = sum(p["page_score"] for p in pages_results)
        result = {
            "pages": pages_results,
            "total_score": total_score
        }

        await broadcast_progress({
            "type": "vision_llm_complete",
            "message": "Vision-LLM: завершено"
        })

        content = json.dumps(result, ensure_ascii=False, indent=2)
        document_filename = filename or file.filename
        document_id = db.add_document(
            patient_id=patient_id,
            document_type="scan_result",
            content=content,
            filename=document_filename
        )
        created_document = next(
            (doc for doc in db.get_patient_documents(patient_id) if doc["id"] == document_id),
            None
        )

        return {
            "status": "success",
            "document": created_document,
            "result": result,
            "model": model_name
        }
    except HTTPException:
        raise
    except Exception as e:
        detail = str(e)
        if len(detail) > 400:
            detail = detail[:400] + "..."
        raise HTTPException(status_code=400, detail=f"Error Vision-LLM: {detail}")

@app.get("/patients/{patient_id}/documents", response_model=List[DocumentResponse])
async def get_patient_documents(patient_id: int):
    """Get patient documents."""
    try:
        db = get_patients_database()
        
        # Проверяем существование пациента
        patient = db.get_patient(patient_id)
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")
        
        documents = db.get_patient_documents(patient_id)
        return [DocumentResponse(**doc) for doc in documents]
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error getting documents: {str(e)}")

@app.get("/patients/{patient_id}/full", response_model=Dict[str, Any])
async def get_patient_full_info(patient_id: int):
    """Get full patient information (all fields + documents)."""
    try:
        db = get_patients_database()
        
        # Получаем основную информацию о пациенте
        patient = db.get_patient(patient_id)
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")
        
        # Получаем документы пациента
        documents = db.get_patient_documents(patient_id)
        
        # Формируем полную информацию
        full_info = {
            "patient": PatientResponse(**patient),
            "documents": [DocumentResponse(**doc) for doc in documents]
        }
        
        return full_info
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error getting full patient info: {str(e)}")

@app.post("/patients/batch-query", response_model=BatchPatientQueryResponse)
async def batch_query_patients(request: BatchPatientQueryRequest):
    """Batch LLM query for all patients."""
    if not request.query or not request.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    db = get_patients_database()
    results: List[BatchPatientQueryResult] = []

    # Список пациентов
    patients: List[Dict[str, Any]] = []
    if request.patient_ids:
        for patient_id in request.patient_ids:
            patient = db.get_patient(patient_id)
            if patient:
                patients.append(patient)
            else:
                results.append(BatchPatientQueryResult(
                    patient_id=patient_id,
                    patient_name=f"ID {patient_id}",
                    error="Пациент не найден"
                ))
    else:
        patients = db.get_all_patients()

    # MemoRAG контекст (общий для всех пациентов)
    # Логируем значение use_memorag для отладки
    logger.info(f"Пакетный запрос: use_memorag={request.use_memorag} (тип: {type(request.use_memorag).__name__})")
    memorag_context = ""
    if request.use_memorag:
        logger.info("MemoRAG включен - загружаем систему MemoRAG")
        try:
            memo_rag = await get_memo_rag_system()
            if request.memorag_context_length:
                memo_rag.set_context_length(request.memorag_context_length)
            logger.info(f"Выполняем поиск MemoRAG: запрос='{request.query[:100]}...', top_k={request.memorag_top_k or 5}")
            search_results = await memo_rag.search_with_memory(
                request.query,
                request.memorag_top_k or 5
            )
            # Детальное логирование результатов поиска
            results_count = len(search_results.get('results', []))
            memory_context_count = len(search_results.get('memory_context', []))
            clues_used_count = len(search_results.get('clues_used', []))
            logger.info(f"Результаты поиска MemoRAG: results={results_count}, memory_context={memory_context_count}, clues_used={clues_used_count}")
            
            # Логируем детали, если есть данные
            if clues_used_count > 0:
                logger.info(f"   Подсказки MemoRAG: {search_results.get('clues_used', [])[:3]}")
            if memory_context_count > 0:
                logger.info(f"   Контекст из памяти (первые 200 символов): {str(search_results.get('memory_context', [])[0])[:200] if search_results.get('memory_context') else ''}")
            if results_count > 0:
                logger.info(f"   Найдено документов: {results_count}, первый документ (первые 200 символов): {str(search_results.get('results', [])[0].get('document', '') or search_results.get('results', [])[0].get('text', ''))[:200]}")
            
            memorag_context = _format_memorag_context(search_results)
            if memorag_context:
                logger.info(f"✅ MemoRAG контекст получен: длина={len(memorag_context)} символов")
                logger.info(f"   Первые 500 символов: {memorag_context[:500]}...")
                # Проверяем наличие ключевых элементов в контексте
                if "🔍" in memorag_context and "MEMORAG" in memorag_context:
                    logger.info(f"   ✓ Подсказки MemoRAG присутствуют в контексте")
                if "💾 КОНТЕКСТ ИЗ ПАМЯТИ" in memorag_context:
                    logger.info(f"   ✓ Контекст из памяти присутствует в контексте")
                if "📄 РЕЛЕВАНТНЫЕ ДОКУМЕНТЫ" in memorag_context:
                    logger.info(f"   ✓ Релевантные документы присутствуют в контексте")
            else:
                logger.warning(f"⚠️ MemoRAG контекст пустой после форматирования!")
                logger.warning(f"   Причина: results={results_count}, memory_context={memory_context_count}, clues_used={clues_used_count}")
                logger.warning(f"   Функция _format_memorag_context вернула пустую строку")
        except Exception as e:
            logger.error(f"Ошибка при получении MemoRAG контекста: {e}", exc_info=True)
            memorag_context = ""
    else:
        logger.info("MemoRAG отключен (use_memorag=False или None)")

    model_name = request.model or config.ollama.default_model
    # Удаляем префикс ollama: если он есть
    if model_name and model_name.startswith('ollama:'):
        model_name = model_name.replace('ollama:', '', 1)
    logger.info(f"Пакетный запрос: модель={model_name}, пациентов={len(patients)}, запрос={request.query[:100]}...")
    total_patients = len(patients)

    # Отправляем начальное сообщение о прогрессе
    await broadcast_progress({
        "type": "patient_analysis_progress",
        "current": 0,
        "total": total_patients,
        "patient_name": "",
        "message": "Начинается анализ пациентов..."
    })

    for index, patient in enumerate(patients, start=1):
        try:
            # Отправляем прогресс перед обработкой пациента
            await broadcast_progress({
                "type": "patient_analysis_progress",
                "current": index,
                "total": total_patients,
                "patient_name": patient.get("name") or f"ID {patient['id']}",
                "message": f"Обработка пациента {index}/{total_patients}"
            })

            documents = db.get_patient_documents(patient["id"])
            patient_context = _format_patient_context(patient, documents)
            final_user_message = _format_final_user_message(request.query, patient, documents)

            messages = []
            # Используем системный промпт ТОЛЬКО из запроса (который приходит из поля System Prompt в интерфейсе)
            # НЕ добавляем никаких дополнительных инструкций или модификаций
            if request.system_prompt and request.system_prompt.strip():
                system_prompt_content = request.system_prompt.strip()
                # Используем системный промпт БЕЗ ИЗМЕНЕНИЙ - точно так, как передан из интерфейса
                messages.append(ChatMessage(role="system", content=system_prompt_content))
                logger.info(f"Системный промпт для пациента {patient.get('id', 0)}: длина={len(system_prompt_content)} символов, первые 200: {system_prompt_content[:200]}...")
                logger.info(f"Системный промпт для пациента {patient.get('id', 0)}: последние 200: ...{system_prompt_content[-200:]}")
            else:
                logger.info(f"Системный промпт для пациента {patient.get('id', 0)}: не используется (не передан в запросе)")
            messages.append(ChatMessage(role="user", content=patient_context))
            logger.info(f"Данные пациента для пациента {patient.get('id', 0)}: длина={len(patient_context)} символов, первые 300: {patient_context[:300]}...")
            
            if memorag_context:
                messages.append(ChatMessage(role="user", content=memorag_context))
                logger.info(f"✅ MemoRAG контекст для пациента {patient.get('id', 0)}: длина={len(memorag_context)} символов")
                logger.info(f"   Первые 500 символов: {memorag_context[:500]}...")
                # Проверяем наличие подсказок в контексте
                if "🔍" in memorag_context and "MEMORAG" in memorag_context:
                    logger.info(f"   ✓ Подсказки MemoRAG найдены в контексте")
                else:
                    logger.warning(f"   ⚠ Подсказки MemoRAG НЕ найдены в контексте!")
            else:
                logger.warning(f"❌ MemoRAG контекст для пациента {patient.get('id', 0)}: не используется (пустой или не включен)")
            
            messages.append(ChatMessage(role="user", content=final_user_message))
            logger.info(f"Финальное сообщение пользователя для пациента {patient.get('id', 0)}: длина={len(final_user_message)} символов, первые 300: {final_user_message[:300]}...")
            
            # Логируем все сообщения перед отправкой в create_chat_completion
            logger.info(f"📋 Все сообщения для пациента {patient.get('id', 0)} перед отправкой в create_chat_completion:")
            for idx, msg in enumerate(messages):
                has_memorag = "MEMORAG" in msg.content.upper() or "CLUES" in msg.content or "KNOWLEDGE BASE FRAGMENTS" in msg.content
                has_patient = "PATIENT DATA" in msg.content.upper() or "PATIENT:" in msg.content.upper()
                logger.info(f"   Сообщение {idx}: role={msg.role}, длина={len(msg.content)} символов, has_memorag={has_memorag}, has_patient={has_patient}")
                if has_memorag:
                    logger.info(f"      ✓ MemoRAG контекст обнаружен в сообщении {idx}!")
                    logger.info(f"      Первые 500 символов: {msg.content[:500]}...")
                if has_patient:
                    logger.info(f"      ✓ Данные пациента обнаружены в сообщении {idx}!")

            # Используем create_chat_completion для валидации параметров (как в чате)
            # Затем используем stream_chat_completion_ollama с валидированными параметрами
            chat_request = ChatCompletionRequest(
                model=model_name,
                messages=messages,
                max_tokens=request.max_tokens,
                temperature=request.temperature,
                top_p=request.top_p,
                top_k=request.top_k,
                stream=True  # Используем потоковую генерацию, как в чате
            )
            
            # Валидируем параметры так же, как в create_chat_completion
            logger.info(f"Параметры ДО валидации (batch): max_tokens={chat_request.max_tokens}, temperature={chat_request.temperature}, top_p={chat_request.top_p}, top_k={chat_request.top_k}")
            if chat_request.temperature is None:
                chat_request.temperature = 0.7
            if chat_request.top_p is None:
                chat_request.top_p = 0.9
            if chat_request.top_k is None:
                chat_request.top_k = 40
            if chat_request.max_tokens is None:
                chat_request.max_tokens = 2000
            logger.info(f"Параметры ПОСЛЕ валидации (batch): max_tokens={chat_request.max_tokens}, temperature={chat_request.temperature}, top_p={chat_request.top_p}, top_k={chat_request.top_k}")
            
            # Формируем промпт точно так же, как в create_chat_completion
            prompt_parts = []
            for msg in messages:
                if msg.role == "system":
                    prompt_parts.append(f"System: {msg.content}")
                elif msg.role == "user":
                    prompt_parts.append(f"User: {msg.content}")
                elif msg.role == "assistant":
                    prompt_parts.append(f"Assistant: {msg.content}")
            full_prompt = "\n".join(prompt_parts) + "\nAssistant:"

            # Логируем параметры и структуру промпта для отладки
            logger.info(f"Пакетный запрос для пациента {patient.get('id', 0)}: max_tokens={chat_request.max_tokens}, temperature={chat_request.temperature}, top_p={chat_request.top_p}, top_k={chat_request.top_k}")
            logger.info(f"Количество сообщений для пациента {patient.get('id', 0)}: {len(messages)}")
            for i, msg in enumerate(messages):
                logger.info(f"  Сообщение {i}: role={msg.role}, длина={len(msg.content)} символов, первые 100: {msg.content[:100]}...")
            logger.info(f"Длина финального промпта для пациента {patient.get('id', 0)}: {len(full_prompt)} символов")
            logger.info(f"Первые 1000 символов промпта для пациента {patient.get('id', 0)}: {full_prompt[:1000]}")
            logger.info(f"Последние 1000 символов промпта для пациента {patient.get('id', 0)}: ...{full_prompt[-1000:]}")
            
            # Сохраняем полный промпт в отдельный файл для отладки
            debug_prompt_file = log_dir / f"prompt_patient_{patient.get('id', 0)}.txt"
            try:
                with open(debug_prompt_file, 'w', encoding='utf-8') as f:
                    f.write("=" * 80 + "\n")
                    f.write(f"ПРОМПТ ДЛЯ ПАЦИЕНТА {patient.get('id', 0)} ({patient.get('name', 'Unknown')})\n")
                    f.write("=" * 80 + "\n\n")
                    f.write(full_prompt)
                logger.info(f"Полный промпт сохранен в файл: {debug_prompt_file}")
            except Exception as e:
                logger.warning(f"Не удалось сохранить промпт в файл: {e}")
            
            # Используем stream_chat_completion_ollama напрямую с валидированными параметрами
            # Это гарантирует 100% идентичное поведение с чатом
            response_text = ""
            try:
                full_response = ""
                chunk_count = 0
                async for chunk in stream_chat_completion_ollama(full_prompt, chat_request):
                    chunk_count += 1
                    logger.debug(f"Получен чанк {chunk_count} для пациента {patient.get('id', 0)}: первые 200 символов: {chunk[:200]}")
                    
                    # Парсим SSE формат: "data: {...}\n\n"
                    if chunk.startswith('data: '):
                        try:
                            json_str = chunk[6:].strip()  # Убираем "data: " и лишние пробелы
                            data = json.loads(json_str)
                            
                            if data.get('type') == 'chunk' and 'content' in data:
                                content = data['content']
                                full_response += content
                                logger.debug(f"Добавлен чанк для пациента {patient.get('id', 0)}: {len(content)} символов, всего накоплено: {len(full_response)}")
                            elif data.get('type') == 'end' and 'full_response' in data:
                                # Если есть полный ответ, используем его
                                full_response = data['full_response']
                                logger.info(f"Получен полный ответ для пациента {patient.get('id', 0)}: {len(full_response)} символов")
                                break
                            elif data.get('type') == 'error':
                                error_msg = data.get('error', 'Unknown error')
                                logger.error(f"Ошибка в потоке для пациента {patient.get('id', 0)}: {error_msg}")
                                raise Exception(f"Stream error: {error_msg}")
                            else:
                                logger.debug(f"Неизвестный тип события для пациента {patient.get('id', 0)}: {data.get('type')}")
                        except json.JSONDecodeError as e:
                            logger.warning(f"Ошибка парсинга JSON в потоке для пациента {patient.get('id', 0)}: {e}, chunk: {chunk[:200]}")
                            continue
                    else:
                        logger.warning(f"Чанк не начинается с 'data: ' для пациента {patient.get('id', 0)}: первые 200 символов: {chunk[:200]}")
                
                response_text = full_response
                logger.info(f"Финальный ответ для пациента {patient.get('id', 0)}: {len(response_text)} символов, первые 500: {response_text[:500]}")
                
                if not response_text:
                    logger.warning(f"Пустой ответ для пациента {patient.get('id', 0)} после обработки {chunk_count} чанков")
                    raise Exception("Получен пустой ответ от модели")
                
                # Проверяем, не является ли ответ просто повторением запроса/вопросов
                # Улучшенная проверка для определения, когда модель повторяет вопросы
                user_query_lower = request.query.lower().strip()
                response_text_lower = response_text.lower().strip()
                
                # Извлекаем вопросы из запроса (строки, начинающиеся с цифр)
                question_patterns = re.findall(r'\d+\.\s*[^\n]+', request.query)
                question_texts = [q.lower().strip() for q in question_patterns]
                
                # Проверяем, содержит ли ответ вопросы из запроса
                questions_in_response = 0
                for question in question_texts[:5]:  # Проверяем первые 5 вопросов
                    # Убираем номер вопроса для сравнения
                    question_clean = re.sub(r'^\d+\.\s*', '', question).strip()
                    if len(question_clean) > 20:  # Только если вопрос достаточно длинный
                        # Проверяем, есть ли этот вопрос в ответе
                        if question_clean in response_text_lower:
                            questions_in_response += 1
                
                # Если в ответе найдено более 2 вопросов из запроса - это проблема
                if questions_in_response >= 2:
                    logger.warning(f"ВНИМАНИЕ: Ответ для пациента {patient.get('id', 0)} содержит {questions_in_response} вопросов из запроса!")
                    logger.warning(f"  Запрос (первые 500): {request.query[:500]}")
                    logger.warning(f"  Ответ (первые 500): {response_text[:500]}")
                    
                    # Пытаемся найти, где начинается реальный ответ
                    # Ищем маркеры начала ответа (номера с ответами, например "1. Течение" или "1. Оцени")
                    answer_markers = [
                        r'1\.\s*(течение|оцени|определи|контроль|признаки|соответствует|нет\s+ли|сформируй|необходимость|порекомендовать|ответь)',
                        r'1\)\s*(течение|оцени|определи)',
                        r'первое[:\s]+(течение|оцени)',
                    ]
                    
                    answer_start_pos = -1
                    for pattern in answer_markers:
                        match = re.search(pattern, response_text_lower)
                        if match:
                            pos = match.start()
                            # Проверяем, что это не слишком далеко от начала (не более 30% длины ответа)
                            if pos < len(response_text) * 0.3:
                                answer_start_pos = pos
                                logger.info(f"Найден маркер начала ответа на позиции {pos}: '{match.group()}'")
                                break
                    
                    if answer_start_pos > 0:
                        # Нашли маркер начала ответа - используем часть после него
                        potential_answer = response_text[answer_start_pos:].strip()
                        if len(potential_answer) > 100:
                            logger.info(f"Обнаружен повтор вопросов, используем часть после маркера: {len(potential_answer)} символов")
                            response_text = potential_answer
                        else:
                            logger.error(f"Ответ для пациента {patient.get('id', 0)} - это просто повторение вопросов, нет реального ответа")
                            raise Exception("Модель повторила вопросы вместо ответа")
                    else:
                        # Не нашли маркер - проверяем, может быть ответ начинается сразу с ответа на первый вопрос
                        # Ищем паттерны типа "1. Течение..." в начале ответа
                        first_answer_pattern = re.match(r'^\s*\d+\.\s*(течение|оцени|определи|контроль|признаки)', response_text_lower)
                        if first_answer_pattern:
                            logger.info(f"Ответ начинается сразу с ответа на вопрос, используем как есть")
                        else:
                            logger.error(f"Ответ для пациента {patient.get('id', 0)} - это просто повторение вопросов, не удалось найти начало реального ответа")
                            logger.error(f"  Полный ответ: {response_text[:1000]}")
                            raise Exception("Модель повторила вопросы вместо ответа")
                
                # Дополнительная проверка: если ответ начинается с вопросов (цифры + точки)
                # и не содержит ответов (слов типа "течение", "оцени" и т.д.)
                if re.match(r'^\s*\d+\.\s*[^\n]+', response_text) and len(response_text) > 200:
                    # Проверяем, есть ли в ответе слова, указывающие на ответ (а не на вопрос)
                    answer_indicators = ['течение', 'оцени', 'определи', 'контроль', 'признаки', 'соответствует', 
                                       'нет данных', 'показана', 'не показана', 'ведется', 'не требуется']
                    has_answer_indicators = any(indicator in response_text_lower for indicator in answer_indicators)
                    
                    if not has_answer_indicators:
                        # Ответ содержит только вопросы, без ответов
                        logger.error(f"Ответ для пациента {patient.get('id', 0)} содержит только вопросы без ответов")
                        logger.error(f"  Ответ: {response_text[:500]}")
                        raise Exception("Модель выдала только вопросы без ответов")
            except httpx.TimeoutException as e:
                logger.error(f"Таймаут при обращении к Ollama для пациента {patient.get('id', 0)}: {e}")
                raise Exception("Таймаут генерации")
            except httpx.ConnectError as e:
                logger.error(f"Ошибка подключения к Ollama для пациента {patient.get('id', 0)}: {e}")
                raise Exception("Не удается подключиться к Ollama серверу")

            result = BatchPatientQueryResult(
                patient_id=patient["id"],
                patient_name=patient.get("name") or f"ID {patient['id']}",
                prompt=full_prompt,
                response=response_text
            )
            results.append(result)
            
            # Отправляем результат через WebSocket для автоматического сохранения на фронтенде
            await broadcast_progress({
                "type": "patient_analysis_result",
                "result": {
                    "patient_id": result.patient_id,
                    "patient_name": result.patient_name,
                    "prompt": result.prompt,
                    "response": result.response,
                    "error": result.error
                }
            })
        except Exception as e:
            error_msg = str(e)
            logger.error(f"Ошибка обработки пациента {patient.get('id', 0)} ({patient.get('name', 'Unknown')}): {error_msg}", exc_info=True)
            result = BatchPatientQueryResult(
                patient_id=patient.get("id", 0),
                patient_name=patient.get("name") or f"ID {patient.get('id', 0)}",
                error=error_msg
            )
            results.append(result)
            
            # Отправляем результат с ошибкой через WebSocket
            await broadcast_progress({
                "type": "patient_analysis_result",
                "result": {
                    "patient_id": result.patient_id,
                    "patient_name": result.patient_name,
                    "prompt": result.prompt,
                    "response": result.response,
                    "error": result.error
                }
            })

    # Отправляем сообщение о завершении
    await broadcast_progress({
        "type": "patient_analysis_complete",
        "total": total_patients,
        "success": len([r for r in results if r.response and not r.error]),
        "failed": len([r for r in results if r.error]),
        "message": "Анализ всех пациентов завершен"
    })

    success = len([r for r in results if r.response and not r.error])
    failed = len(results) - success

    return BatchPatientQueryResponse(
        status="success",
        total=len(results),
        success=success,
        failed=failed,
        results=results
    )

@app.delete("/patients/documents/{document_id}")
async def delete_document(document_id: int):
    """Delete a document."""
    try:
        db = get_patients_database()
        success = db.delete_document(document_id)
        
        if success:
            return {"status": "success", "message": f"Документ {document_id} удален"}
        else:
            raise HTTPException(status_code=404, detail="Document not found")
            
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error deleting document: {str(e)}")

# OCR эндпоинты
@app.post("/ocr/extract-text")
async def extract_text_from_image(file: UploadFile = File(...)):
    """Extract text from uploaded image using OCR."""
    try:
        # Проверяем, что файл является изображением
        if not file.content_type or not file.content_type.startswith('image/'):
            raise HTTPException(status_code=400, detail="File must be an image")
        
        # Читаем данные файла
        image_data = await file.read()
        
        # Извлекаем текст
        result = extract_text_from_image_data(image_data, file.filename)
        
        if result["success"]:
            return {
                "status": "success",
                "text": result["text"],
                "filename": result["filename"],
                "confidence": result.get("confidence", 0.0)
            }
        else:
            raise HTTPException(status_code=400, detail=f"Error OCR: {result['error']}")
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing image: {str(e)}")

@app.get("/ocr/status")
async def get_ocr_status():
    """Check OCR system status."""
    try:
        processor = get_ocr_processor()
        is_available = processor.is_tesseract_available()
        
        return {
            "status": "success",
            "tesseract_available": is_available,
            "supported_formats": processor.get_supported_formats(),
            "languages": processor.languages
        }
    except Exception as e:
        return {
            "status": "error",
            "tesseract_available": False,
            "error": str(e)
        }

@app.post("/ocr/test")
async def test_ocr():
    """Test OCR system."""
    try:
        processor = get_ocr_processor()
        
        if not processor.is_tesseract_available():
            return {
                "status": "error",
                "message": "Tesseract not available"
            }
        
        # Создаем простое тестовое изображение с текстом
        from PIL import Image, ImageDraw, ImageFont
        import io
        
        # Создаем изображение с текстом
        img = Image.new('RGB', (400, 100), color='white')
        draw = ImageDraw.Draw(img)
        
        try:
            # Пытаемся использовать системный шрифт
            font = ImageFont.truetype("arial.ttf", 20)
        except:
            # Если не найден, используем стандартный
            font = ImageFont.load_default()
        
        draw.text((10, 30), "Тест OCR распознавания", fill='black', font=font)
        
        # Конвертируем в байты
        img_byte_arr = io.BytesIO()
        img.save(img_byte_arr, format='PNG')
        img_byte_arr = img_byte_arr.getvalue()
        
        # Тестируем OCR
        result = extract_text_from_image_data(img_byte_arr, "test.png")
        
        return {
            "status": "success",
            "test_result": result,
            "message": "OCR тест выполнен"
        }
        
    except Exception as e:
        return {
            "status": "error",
            "message": f"OCR test error: {str(e)}"
        }

if __name__ == "__main__":
    print("\n=== Пациенты ===")
    print("- GET  /patients/stats - статистика базы данных пациентов")
    print("- GET  /patients - получение списка всех пациентов")
    print("- POST /patients - добавление нового пациента")
    print("- GET  /patients/{patient_id} - получение информации о пациенте")
    print("- PUT  /patients/{patient_id} - обновление информации о пациенте")
    print("- DELETE /patients/{patient_id} - удаление пациента")
    print("- POST /patients/{patient_id}/documents - добавление документа к пациенту")
    print("- GET  /patients/{patient_id}/documents - получение документов пациента")
    print("- DELETE /patients/documents/{document_id} - удаление документа")    
    print("- DELETE /patients/clear-database - полная очистка базы данных пациентов")
    
    print("\n=== OCR ===")
    print("- POST /ocr/extract-text - извлечение текста из изображения")
    print("- GET  /ocr/status - проверка статуса OCR системы")
    print("- POST /ocr/test - тестирование OCR системы")
    
    # Запускаем сервер с настройками из конфигурации
    uvicorn.run(
        app, 
        host=config.api.host, 
        port=config.api.port,
        workers=config.api.workers,
        reload=config.api.reload,
        log_level=config.api.log_level.lower()
    )
