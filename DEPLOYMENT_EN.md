# 🚀 LM Studio Project Deployment Guide

[English] | [Russian](DEPLOYMENT.md)

## 📋 Table of Contents

1. [System Requirements](#system-requirements)
2. [System Preparation](#system-preparation)
3. [Installing Dependencies](#installing-dependencies)
4. [Copying the Project](#copying-the-project)
5. [Project Configuration](#project-configuration)
6. [Running the Project](#running-the-project)
7. [Verification](#verification)
8. [Troubleshooting](#troubleshooting)

---

## 💻 System Requirements

### Minimum Requirements

- **OS**: Windows 10/11, Linux (Ubuntu 20.04+), macOS 10.15+
- **Processor**: x64 architecture
- **RAM**: 8 GB (16 GB recommended)
- **Disk Space**: 10 GB free space
- **Python**: 3.8 or higher
- **Internet**: For initial download of models and dependencies

### Recommended Requirements

- **OS**: Windows 11, Linux (Ubuntu 22.04+)
- **RAM**: 16 GB or more
- **Disk Space**: 50 GB (for models and data)
- **GPU**: NVIDIA with CUDA 11.8+ support (optional, for acceleration)
- **Processor**: Multi-core processor (4+ cores)

---

## 🔧 System Preparation

### Step 1: Install Python

#### Windows

1. Download Python from [python.org](https://www.python.org/downloads/)
2. During installation, check "Add Python to PATH"
3. Verify installation:
   ```cmd
   python --version
   ```
   Should show version 3.8 or higher

#### Linux (Ubuntu/Debian)

```bash
sudo apt update
sudo apt install python3 python3-pip python3-venv
python3 --version
```

#### macOS

```bash
# Using Homebrew
brew install python3
python3 --version
```

### Step 2: Install Anaconda (Recommended)

Anaconda simplifies Python environment and dependency management.

#### Windows

1. Download Anaconda from [anaconda.com](https://www.anaconda.com/download)
2. Run the installer and follow instructions
3. Verify installation:
   ```cmd
   conda --version
   ```

#### Linux/macOS

```bash
# Download installer from Anaconda website
# Or use:
wget https://repo.anaconda.com/archive/Anaconda3-2024.02-1-Linux-x86_64.sh
bash Anaconda3-2024.02-1-Linux-x86_64.sh
```

### Step 3: Install Ollama

Ollama is required for working with local language models.

#### Windows

1. Download installer from [ollama.com](https://ollama.com/download)
2. Run the installer
3. Ollama should start automatically after installation
4. Verify installation:
   ```cmd
   ollama --version
   ```

#### Linux

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama --version
```

#### macOS

```bash
brew install ollama
ollama --version
```

### Step 4: Install Tesseract OCR (Optional)

Tesseract is required for OCR functionality.

#### Windows

1. Download installer from [GitHub](https://github.com/UB-Mannheim/tesseract/wiki)
2. Install Tesseract
3. Add Tesseract path to PATH environment variable:
   ```
   C:\Program Files\Tesseract-OCR
   ```
4. Verify installation:
   ```cmd
   tesseract --version
   ```

#### Linux (Ubuntu/Debian)

```bash
sudo apt install tesseract-ocr tesseract-ocr-rus tesseract-ocr-eng
tesseract --version
```

#### macOS

```bash
brew install tesseract tesseract-lang
tesseract --version
```

### Step 5: Install Poppler (for PDF Processing)

Poppler is required for converting PDF to images.

#### Windows

1. Download Poppler from [GitHub](https://github.com/oschwartz10612/poppler-windows/releases)
2. Extract the archive
3. Add `bin` path to PATH environment variable

#### Linux (Ubuntu/Debian)

```bash
sudo apt install poppler-utils
```

#### macOS

```bash
brew install poppler
```

---

## 📦 Installing Dependencies

### Option 1: Using Anaconda (Recommended)

#### Creating Conda Environment

```bash
# Create new environment
conda create -n lm_studio python=3.10 -y

# Activate environment
# Windows:
conda activate lm_studio
# Linux/macOS:
source activate lm_studio

# Install PyTorch with CUDA (if GPU available)
conda install pytorch torchvision torchaudio pytorch-cuda=11.8 -c pytorch -c nvidia -y

# Or without CUDA (CPU only)
conda install pytorch torchvision torchaudio cpuonly -c pytorch -y
```

#### Installing Python Dependencies

```bash
# Navigate to project directory
cd LM_studio_project

# Install dependencies
pip install -r requirements.txt
```

### Option 2: Using venv (Standard Python)

```bash
# Create virtual environment
python -m venv venv

# Activate environment
# Windows:
venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

# Upgrade pip
pip install --upgrade pip

# Install dependencies
pip install -r requirements.txt
```

---

## 📁 Copying the Project

### Option 1: Cloning from Git Repository

```bash
git clone <REPOSITORY_URL> lm_studio_project
cd lm_studio_project
```

### Option 2: Copying Project Folder

1. Copy the entire project folder to the new computer
2. Ensure directory structure is preserved:
   ```
   LM_studio_project/
   ├── backend/
   ├── frontend/
   ├── config.yaml
   ├── requirements.txt
   └── ...
   ```

### Option 3: Transfer via Archive

1. On source computer, create project archive:
   ```bash
   # Windows
   tar -czf lm_studio_project.tar.gz LM_studio_project
   
   # Or use ZIP
   ```
2. Transfer archive to new computer
3. Extract archive:
   ```bash
   tar -xzf lm_studio_project.tar.gz
   ```

---

## ⚙️ Project Configuration

### Step 1: Configuration Setup

Open `config.yaml` file and configure parameters:

```yaml
# Main settings
api:
  host: 0.0.0.0  # Use 0.0.0.0 for network access
  port: 8000     # Server port

# Ollama settings
ollama:
  url: http://127.0.0.1:11434  # Ollama server URL
  default_model: qwen2.5:latest
  embedding_model: embeddinggemma:latest

# Database path
database:
  sqlite_path: data/patients.db  # Relative path

# Tesseract path (if different from standard)
file_processing:
  tesseract_cmd: null  # Specify path if Tesseract not in PATH
```

### Step 2: Configuring Paths in Launch Scripts (Windows)

If using Windows with different Python path, edit `start_server.bat`:

```batch
REM Replace Python path with yours
C:\Users\YOUR_NAME\anaconda3\envs\lm_studio\python.exe api_server.py
```

Or use relative path if Python is in PATH:

```batch
python api_server.py
```

### Step 3: Creating Required Directories

Project will automatically create required directories on first run, but you can create them manually:

```bash
mkdir -p data
mkdir -p logs
mkdir -p temp/uploads
mkdir -p temp/vision_pages
```

### Step 4: Setting Up Ollama Models

After installing Ollama, download required models:

```bash
# Main model for chat
ollama pull qwen2.5:latest

# Embedding model
ollama pull embeddinggemma:latest

# Vision model (optional)
ollama pull qwen3-vl:8b
```

Check model list:

```bash
ollama list
```

---

## 🚀 Running the Project

### Windows

#### Method 1: Using Ready Scripts

```cmd
# Start all components
start.bat

# Or separately:
# Backend only
start_server.bat

# Frontend only (if backend already running)
start_frontend.bat
```

#### Method 2: Manual Launch

```cmd
# Activate environment
conda activate lm_studio
# or
venv\Scripts\activate

# Navigate to backend directory
cd backend

# Start server
python api_server.py
```

### Linux/macOS

```bash
# Activate environment
conda activate lm_studio
# or
source venv/bin/activate

# Navigate to backend directory
cd backend

# Start server
python api_server.py
```

### Launch Verification

After starting server, you should see:

```
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000
```

Open browser and navigate to: `http://localhost:8000`

---

## ✅ Verification

### 1. Server Check

Open in browser:
- `http://localhost:8000` - web interface
- `http://localhost:8000/health` - API health check
- `http://localhost:8000/api` - API documentation

### 2. Ollama Check

In web interface:
1. Go to "Settings" section
2. Check Ollama connection status
3. Should show "Connected" and list of available models

### 3. Database Check

In web interface:
1. Go to "Patients" section
2. Verify database is initialized
3. Statistics should show 0 patients (if DB is empty)

### 4. RAG System Check

1. Upload test PDF file in "RAG" section
2. Verify file is being indexed
3. Perform search on uploaded document

### 5. OCR Check

1. Upload test image with text
2. Verify text is recognized correctly

---

## 🔍 Troubleshooting

### Problem: Port 8000 is Busy

**Solution:**
```bash
# Windows
netstat -ano | findstr :8000
taskkill /PID <PID> /F

# Linux/macOS
lsof -ti:8000 | xargs kill -9
```

Or change port in `config.yaml`:
```yaml
api:
  port: 8001  # Different port
```

### Problem: Ollama Not Connecting

**Solution:**
1. Ensure Ollama is running:
   ```bash
   ollama serve
   ```
2. Check URL in `config.yaml`:
   ```yaml
   ollama:
     url: http://127.0.0.1:11434
   ```
3. Check availability:
   ```bash
   curl http://127.0.0.1:11434/api/tags
   ```

### Problem: Models Not Loading

**Solution:**
1. Check if models are loaded in Ollama:
   ```bash
   ollama list
   ```
2. If no models, load them:
   ```bash
   ollama pull qwen2.5:latest
   ```

### Problem: Dependency Installation Errors

**Solution:**
1. Update pip:
   ```bash
   pip install --upgrade pip
   ```
2. Install dependencies one by one:
   ```bash
   pip install torch
   pip install fastapi
   # etc.
   ```
3. For Windows, Visual C++ Build Tools may be required

### Problem: Tesseract Not Found

**Solution:**
1. Ensure Tesseract is installed
2. Add path in `config.yaml`:
   ```yaml
   file_processing:
     tesseract_cmd: "C:/Program Files/Tesseract-OCR/tesseract.exe"
   ```

### Problem: Database Not Created

**Solution:**
1. Ensure write permissions in `data/` directory
2. Check path in `config.yaml`:
   ```yaml
   database:
     sqlite_path: data/patients.db
   ```
3. Create directory manually:
   ```bash
   mkdir -p data
   ```

### Problem: GPU Not Used

**Solution:**
1. Ensure PyTorch with CUDA is installed:
   ```bash
   python -c "import torch; print(torch.cuda.is_available())"
   ```
2. If False, reinstall PyTorch:
   ```bash
   conda install pytorch pytorch-cuda=11.8 -c pytorch -c nvidia
   ```

---

## 📝 Additional Information

### Data Migration

If migrating project with data:

1. **Patient Database:**
   - Copy `data/patients.db` file
   - Or use export/import via web interface

2. **RAG Indexes:**
   - Copy `backend/data/rag/` directory
   - Or re-index documents after migration

3. **Configuration:**
   - Copy `config.yaml`
   - Configure paths for new system

### Project Update

```bash
# If using Git
git pull origin main

# Update dependencies
pip install -r requirements.txt --upgrade
```

### Backup

Regular backups are recommended:
- Database: `data/patients.db`
- Configuration: `config.yaml`
- RAG indexes: `backend/data/rag/`

Use database export function in web interface.

---

## 📞 Support

If you encounter problems:
1. Check logs in `logs/` directory
2. Check browser console (F12)
3. Check server output in terminal
4. Refer to project documentation: `README.md`

---

**Happy Deployment! 🎉**
