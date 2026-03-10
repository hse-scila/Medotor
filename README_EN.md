# 🏥 LM Studio Project - AI Assistant for Medical Diagnosis of ENT Diseases

[English](README_EN.md) | [Русский](README.md)

> 📦 **Deploying on a new computer?** See [Deployment Guide](DEPLOYMENT_EN.md) | [Инструкция по развертыванию](DEPLOYMENT.md)

## 📋 Project Description

**LM Studio Project** is a full-featured AI system for medical diagnosis of ENT (Ear, Nose, Throat) diseases, built on modern machine learning and natural language processing technologies. The project combines language models, retrieval and generation systems (RAG/MemoRAG), patient data management, and medical document processing.

### Key Features

- 🧠 **Language Models** - Integration with Ollama for local models
- 📚 **RAG and MemoRAG Systems** - Intelligent search in medical literature
- 👥 **Patient Management** - Database with documents and history
- 🔍 **OCR Functionality** - Text recognition from medical images
- 📄 **Document Processing** - Support for PDF, DOCX, images
- 🌐 **Web Interface** - Modern UI with dark/light theme
- ⚡ **Real-time Updates** - WebSocket for progress tracking

---

## 🚀 Quick Start

### Simple Solution

1. **Run the project:**
   ```bash
   start.bat
   ```
   This automatically:
   - Checks and frees port 8000 (if occupied)
   - Starts the backend server
   - Opens browser with web interface

2. **Open in browser:**
   ```
   http://localhost:8000
   ```

3. **Stop the server:**
   ```bash
   stop.bat
   ```
   or close the terminal window with the server

### Requirements

- **Python** 3.8+
- **Anaconda** with TorchLama environment (for GPU optimization)
- **Ollama** - Local language models
- **Tesseract OCR** (optional, for OCR functionality)

### Installing Dependencies

```bash
pip install -r requirements.txt
```

---

## 📁 Project Structure

```
LM_studio_project/
├── backend/                    # Backend components (Python)
│   ├── api_server.py           # Main FastAPI server
│   ├── config.py               # Configuration system
│   ├── rag_system.py           # Basic RAG system
│   ├── memo_rag_system.py      # MemoRAG system with memory
│   ├── patients_database.py    # Patients database
│   ├── file_processor.py       # File processing
│   ├── ocr_module.py           # OCR module
│   ├── ollama_embeddings.py    # Ollama integration
│   ├── model_server.py         # Model management
│   ├── rag_logger.py           # Specialized logging
│   └── data/                   # Data and indexes
│       ├── patients.db         # SQLite database
│       └── rag/                # Vector indexes (FAISS/ChromaDB)
│
├── frontend/                   # Frontend components
│   ├── index.html             # Main page
│   ├── script.js              # Main JS
│   ├── styles.css             # Interface styles
│   └── js/                    # JS modules
│       ├── patients.js        # Patient management
│       ├── rag.js             # RAG interface
│       └── ocr.js             # OCR functionality
│
├── books/                      # Medical literature (PDF)
├── config.yaml                 # Main configuration
├── requirements.txt            # Python dependencies
├── start.bat                   # Startup script
├── start_server.bat            # Backend only
├── start_frontend.bat          # Frontend only
├── stop.bat                    # Stop server
└── README_EN.md                # Documentation (this file)
```

---

## 🏗️ Architecture

### Three-Tier Architecture

```
┌─────────────────────────────────────────┐
│         PRESENTATION LAYER               │
│  • Web UI (HTML/CSS/JavaScript)         │
│  • WebSocket for real-time updates      │
│  • REST API client                      │
└───────────────────┬─────────────────────┘
                    │ HTTP/WebSocket
┌───────────────────▼─────────────────────┐
│         APPLICATION LAYER                │
│  • FastAPI server (60+ endpoints)       │
│  • CORS middleware                       │
│  • WebSocket for progress                │
│  • Data validation                       │
└───────────────────┬─────────────────────┘
                    │
┌───────────────────▼─────────────────────┐
│         BUSINESS LOGIC LAYER            │
│  • RAG System (FAISS/ChromaDB)          │
│  • MemoRAG System (global memory)      │
│  • Model Server (Ollama)                │
│  • Patients Database (SQLite)           │
│  • File Processor                        │
│  • OCR Module                            │
└───────────────────┬─────────────────────┘
                    │
┌───────────────────▼─────────────────────┐
│            DATA LAYER                    │
│  • SQLite (patients.db)                 │
│  • FAISS indexes                        │
│  • Temporary files                       │
│  • Logs                                  │
└─────────────────────────────────────────┘
```

---

## 🔧 Technology Stack

### Backend
- **Python** 3.8+ - main language
- **FastAPI** 0.100.0+ - web framework
- **PyTorch** 2.0.0+ - ML framework (with CUDA 11.8)
- **Transformers** 4.30.0+ - language models
- **FAISS** 1.7.4+ - vector search
- **ChromaDB** 0.4.15+ - vector store
- **Sentence Transformers** 2.2.2+ - embeddings
- **PyPDF2** 3.0.1+ - PDF processing
- **python-docx** 0.8.11+ - DOCX processing
- **Tesseract OCR** - text recognition

### Frontend
- **HTML5/CSS3** - structure and styles
- **Vanilla JavaScript** - application logic
- **WebSocket API** - real-time updates
- **SheetJS (XLSX)** - Excel export
- **Font Awesome** - icons

### Infrastructure
- **Anaconda** - Python environment
- **TorchLama** - GPU optimization
- **Ollama** - local language models
- **YAML/JSON** - configuration

---

## 📡 API Endpoints

### System
- `GET /` - web interface
- `GET /api` - API information
- `GET /health` - health check

### Models
- `GET /v1/models` - list models
- `POST /v1/chat/completions` - generation (OpenAI-compatible)
- `POST /load-model` - load model
- `GET /available-models` - available models

### Ollama
- `POST /ollama/connect` - connect to Ollama
- `GET /ollama/models` - Ollama models
- `POST /ollama/generate` - generate via Ollama
- `POST /ollama/generate-stream` - streaming generation

### RAG System
- `POST /rag/upload-file` - upload file
- `POST /rag/documents` - add documents
- `POST /rag/search` - search in RAG
- `GET /rag/stats` - RAG statistics
- `POST /rag/chat` - chat with RAG
- `POST /rag/chat-stream` - streaming chat

### MemoRAG System
- `POST /memorag/documents` - add documents
- `POST /memorag/search` - search with memory
- `POST /memorag/chat` - chat with MemoRAG
- `GET /memorag/memory-stats` - memory statistics

### Patients
- `GET /patients` - list patients
- `POST /patients` - create patient
- `GET /patients/{id}` - patient information
- `PUT /patients/{id}` - update patient
- `DELETE /patients/{id}` - delete patient
- `POST /patients/{id}/documents` - add document
- `GET /patients/{id}/documents` - patient documents

### Patients database export
- `GET /patients-db/export?format=sqlite` - export DB as SQLite file (`.db`), full database copy
- `GET /patients-db/export?format=sql` - export DB as SQL dump (`.sql`) with INSERT for all tables
- `GET /patients-db/export?format=json` - export DB as JSON (`.json`)
  - Fields: `export_info`, `statistics`, `patients`, `documents`, `patients_with_documents`
  - `patients_with_documents` — convenient structure: each patient contains an array of their documents (`documents`)
- `GET /patients-db/export?format=zip` - export as ZIP archive (`.zip`) containing `.db`, `.sql` and `.json` with `patients_with_documents`

### Patients database import
- `POST /patients-db/import` - import DB from external file
  - **Parameters:**
    - `file` (FormData) - file to import (`.db`, `.sql` or `.json`)
    - `mode` (FormData) - import mode: `merge` (add to existing) or `replace` (replace all)
  - **Supported formats:**
    - **SQLite (`.db`)** - full database replacement
      - Only `replace` mode is available
      - Automatic backup of existing DB is created before replacement
      - Imported DB validity is checked
      - Automatic restore from backup on error
    - **SQL (`.sql`)** - SQL script execution
      - Both `merge` and `replace` modes are supported
      - SQL file must contain `BEGIN TRANSACTION`
      - Transaction rollback on error
    - **JSON (`.json`)** - import from structured data
      - Both `merge` and `replace` modes are supported
      - Supports `patients_with_documents` structure (each patient with array of documents)
      - Supports old format (`patients` + `documents` separately)
      - Automatic linking of documents to patients
  - **Features:**
    - If database doesn't exist, it's automatically created with correct structure
    - All relationships between patients and documents are preserved
    - Statistics and patient list are automatically updated after successful import

### OCR
- `POST /ocr/extract-text` - extract text
- `GET /ocr/status` - OCR status

### Configuration
- `GET /config` - brief configuration
- `GET /config/full` - full configuration
- `POST /config/reload` - reload configuration

### WebSocket
- `WS /ws/progress` - progress tracking

---

## ⚙️ Configuration

Main configuration file: `config.yaml`

### Main Sections:

1. **Ollama** - Ollama connection settings
2. **Database** - database settings
3. **RAG** - RAG system settings
4. **API** - API server settings
5. **File Processing** - file processing settings
6. **Logging** - logging settings
7. **System** - general system settings

For more details see [CONFIG_SYSTEM.md](CONFIG_SYSTEM.md)

---

## 🧠 Key Components

### 1. RAG System
Search and generation system based on vector stores:
- Support for FAISS and ChromaDB
- Automatic document chunking
- Similar document search
- Embeddings via Sentence Transformers or Ollama

### 2. MemoRAG System
Advanced system with global memory:
- Global memory for the entire system
- Two-stage query processing
- Clue generation for retriever
- Memory compression for optimization

### 3. Patients Database
SQLite database for patient management:
- CRUD operations
- Document management
- Automatic data migration
- Statistics and reports

### 4. File Processor
Processing various document formats:
- PDF (PyPDF2)
- DOCX (python-docx)
- Images (JPEG, PNG, BMP, TIFF)
- Text (TXT)

### 5. OCR Module
Text recognition from images:
- Tesseract OCR
- Support for Russian and English languages
- Image preprocessing
- Integration with bulk import

---

## 💡 Features

### Medical Specialization
- System prompts for ENT diagnosis
- Integration with medical literature
- Work with medical documents
- Patient symptom analysis

### Performance
- Asynchronous request processing
- Embedding caching
- GPU optimization via TorchLama
- Optimization for heavy Ollama models

### Security and Privacy
- Offline mode - work with local models
- Local Ollama models - data doesn't leave the server
- Input data validation
- Secure configuration storage

### User Experience
- Dark/light theme interface
- Responsive design
- Real-time updates via WebSocket
- Progress bars for long operations
- Export results to Excel

---

## 📖 Usage

### Starting the Server

```bash
# Full startup (backend + frontend)
start.bat

# Backend only
start_server.bat

# Frontend only (if backend is already running)
start_frontend.bat
```

### Working with Patients

1. Open web interface: `http://localhost:8000`
2. Go to "Patients" section
3. Add a new patient or select existing one
4. Upload patient documents
5. Use chat to analyze patient data

### Working with RAG

1. Upload medical documents (PDF, DOCX)
2. Documents are automatically indexed
3. Use search to find relevant information
4. Use RAG chat to get answers based on documents

### OCR Functionality

1. Upload an image with text
2. System automatically recognizes text
3. Results can be used in chat or saved

### Export and Import Patients Database

#### Export Database

1. Open "Patients" section in the web interface
2. In "Database Export/Import" section, select export format:
   - **SQLite (.db)** - full database copy
   - **SQL (.sql)** - SQL script with data
   - **JSON (.json)** - structured data with convenient `patients_with_documents` structure
   - **ZIP Archive** - all formats in one archive
3. Click "Export Database"
4. File will be saved to your browser's "Downloads" folder

#### Import Database

1. Open "Patients" section in the web interface
2. In "Database Export/Import" section, select import mode:
   - **Merge** - add data to existing
   - **Replace** - replace all data (⚠️ requires confirmation)
3. Click "Select File and Import"
4. Select file to import (`.db`, `.sql` or `.json`)
5. Confirm operation if using `replace` mode
6. After successful import, data is automatically updated

**Important:**
- When importing SQLite file in `replace` mode, automatic backup of current DB is created
- If database was deleted, it's automatically created on import
- All formats support full data structure restoration

---

## 🔍 Troubleshooting

### Problem: Cannot connect to Ollama

**Solution:**
1. Make sure Ollama is running: `ollama serve`
2. Check URL in configuration: `http://127.0.0.1:11434`
3. Restart backend server

For more details see [INSTRUKCIYA_PODKLYUCHENIYA.md](INSTRUKCIYA_PODKLYUCHENIYA.md)

### Problem: Port 8000 is busy

**Solution:**
```bash
# Stop old process
stop.bat

# Or manually find and terminate process
netstat -ano | findstr :8000
taskkill /PID <PID> /F
```

### Problem: Errors when processing PDF

**Solution:**
1. Make sure the file is not corrupted
2. Check file size (maximum 50MB by default)
3. Check logs: `backend/logs/api_server.log`

---

## 📚 Additional Documentation

- [CONFIG_SYSTEM.md](CONFIG_SYSTEM.md) - Configuration system
- [INSTRUKCIYA_PODKLYUCHENIYA.md](INSTRUKCIYA_PODKLYUCHENIYA.md) - Ollama connection instructions
- [АНАЛИЗ_ТЕКУЩЕЙ_ВЕРСИИ.md](АНАЛИЗ_ТЕКУЩЕЙ_ВЕРСИИ.md) - Detailed project analysis
- [Презентация_LM_Studio_Project.md](Презентация_LM_Studio_Project.md) - Project presentation

---

## 🛠️ Development

### Code Structure

- **Backend:** Python modules in `backend/`
- **Frontend:** HTML/CSS/JS in `frontend/`
- **Configuration:** YAML files in project root

### Adding New Features

1. Backend: add endpoints in `api_server.py`
2. Frontend: add UI in `index.html` and logic in `script.js`
3. Configuration: add parameters in `config.yaml` and `config.py`

### Testing

```bash
# Check system health
curl http://localhost:8000/health

# Check Ollama connection
curl http://localhost:8000/ollama/models
```

---

## 📊 Project Statistics

- **Backend:** ~8500+ lines of code
- **Frontend:** ~6400+ lines of code
- **API Endpoints:** 60+
- **Modules:** 14 main modules
- **Version:** 1.0.0

---

## 🤝 Contributing

1. Fork the repository
2. Create a branch for new feature
3. Make changes
4. Create Pull Request

---

## 📝 License

This project is developed for research and educational purposes.

---

## 👥 Authors

The project is developed for medical diagnosis of ENT diseases using modern AI technologies.

---

## 🔗 Useful Links

- [Ollama](https://ollama.ai/) - Local language models
- [FastAPI](https://fastapi.tiangolo.com/) - Web framework
- [FAISS](https://github.com/facebookresearch/faiss) - Vector search
- [ChromaDB](https://www.trychroma.com/) - Vector store

---

**Version:** 1.0.0  
**Last Updated:** 2025
