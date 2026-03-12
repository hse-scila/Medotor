// LM Studio Clone - JavaScript for UI

class LMStudioClone {
    constructor() {
        this.apiBaseUrl = 'http://localhost:8000';
        this.currentModel = null;
        this.isConnected = false;
        this.isDarkTheme = false; // Default light theme
        this.ollamaUrl = 'http://127.0.0.1:11434';
        this.isOllamaConnected = false;
        this.ollamaModelsLoaded = false;
        this.checkingOllamaStatus = false; // Prevent multiple simultaneous checks
        this.isStreaming = false;
        this.currentEventSource = null;
        this.chatHistory = []; // Message history for context
        this.chatScrollContainer = null; // ⥪ ஫ ப ஫ 
        this.isEmbeddingInProgress = false; // Embedding in progress flag
        this.shouldStopEmbedding = false; // Stop embedding flag
        
        this.initializeElements();
        this.setupEventListeners();
        this.loadTheme();
        this.loadSystemPrompt();
        this.checkConnection();
        this.loadAvailableModels();
        
        // Load MemoRAG stats on init
        setTimeout(async () => {
            this.updateMemoRagStats();
            this.checkMigrationStatus();
            this.checkOCRStatus();
            this.loadPatientsForChat();
            this.loadPatientsList(); // Load patient list for document management
            // Check Ollama separately with delay so it doesn't block load
            await this.checkOllamaStatus();
            
            // If Ollama connected but models not loaded, force load them
            if (this.isOllamaConnected && !this.ollamaModelsLoaded) {
                console.log('DEBUG: Ollama connected but models not loaded, loading...');
                await this.loadOllamaModels();
            }
            
            // Final check: if models still not loaded, try again
            if (this.isOllamaConnected && !this.ollamaModelsLoaded) {
                console.warn('DEBUG: Ollama models still not loaded after check, retrying...');
                setTimeout(async () => {
                    await this.loadOllamaModels();
                }, 2000);
            }
        }, 1000);
        
        // Extra check 3 seconds after load (in case first check didn't run)
        setTimeout(async () => {
            if (this.isOllamaConnected && !this.ollamaModelsLoaded) {
                console.log('DEBUG: Extra check: loading Ollama models...');
                await this.loadOllamaModels();
                
                // Check result
                if (this.modelSelect) {
                    const ollamaModelsCount = Array.from(this.modelSelect.options).filter(
                        opt => opt.value.startsWith('ollama:')
                    ).length;
                    console.log(`DEBUG: After extra check: ${ollamaModelsCount} Ollama models in list`);
                    
                    if (ollamaModelsCount === 0 && this.isOllamaConnected) {
                        console.error('DEBUG: CRITICAL: Ollama connected but models not in list!');
                        this.logToConsole('⚠️ Ollama models not loaded in list. Try refreshing the page.', 'warning');
                    }
                }
            }
        }, 3000);
    }

    // Generic fetch with timeout
    async fetchWithTimeout(url, options = {}, timeout = 10000) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error(`Request timeout to ${url} (${timeout}ms)`);
            }
            throw error;
        }
    }

    initializeElements() {
        // Main elements
        this.modelSelect = document.getElementById('modelSelect');
        this.loadModelBtn = document.getElementById('loadModelBtn');
        this.statusIndicator = document.getElementById('statusIndicator');
        this.modelInfo = document.getElementById('modelInfo');
        this.console = document.getElementById('console');
        
        // Settings
        this.temperature = document.getElementById('temperature');
        this.temperatureValue = document.getElementById('temperatureValue');
        this.maxTokens = document.getElementById('maxTokens');
        this.topP = document.getElementById('topP');
        this.topPValue = document.getElementById('topPValue');
        this.topK = document.getElementById('topK');
        
        // Chat
        this.chatMessages = document.getElementById('chatMessages');
        if (!this.chatMessages) {
            const unified = document.querySelector('.unified-chat-window');
            if (unified) {
                this.chatMessages = unified;
            }
        }
        if (!this.chatMessages) {
            const classicMessages = document.querySelector('.chat-messages');
            if (classicMessages) {
                this.chatMessages = classicMessages;
            }
        }
        if (!this.chatMessages) {
            const chatContainer = document.querySelector('.chat-container');
            if (chatContainer) {
                this.chatMessages = chatContainer;
            }
        }
        const chatScrollCandidate = this.chatMessages ? this.chatMessages.closest('.chat-scroll-container') : null;
        this.chatScrollContainer = chatScrollCandidate || document.querySelector('.chat-scroll-container');

        this.chatInput = document.getElementById('chatInput');
        this.sendBtn = document.getElementById('sendBtn');
        
        // Chat settings with patients
        this.chatPatientSelect = document.getElementById('chatPatientSelect');
        this.usePatientData = document.getElementById('usePatientData');
        this.clearChatHistoryBtn = document.getElementById('clearChatHistoryBtn');
        this.exportChatHistoryBtn = document.getElementById('exportChatHistoryBtn');
        this.importChatHistoryBtn = document.getElementById('importChatHistoryBtn');
        this.importChatHistoryInput = document.getElementById('importChatHistoryInput');
        this.viewPromptBtn = document.getElementById('viewPromptBtn');
        this.promptPreviewContainer = document.getElementById('promptPreviewContainer');
        this.promptPreviewText = document.getElementById('promptPreviewText');
        this.copyPromptPreviewBtn = document.getElementById('copyPromptPreviewBtn');
        
        // Automatic patient analysis
        this.patientAnalysisQuestions = document.getElementById('patientAnalysisQuestions');
        this.patientAnalysisUseMemoRag = document.getElementById('patientAnalysisUseMemoRag');
        this.patientAnalysisPercent = document.getElementById('patientAnalysisPercent');
        this.patientAnalysisCountInfo = document.getElementById('patientAnalysisCountInfo');
        this.patientAnalysisCountValue = document.getElementById('patientAnalysisCountValue');
        this.runPatientAnalysisBtn = document.getElementById('runPatientAnalysisBtn');
        this.downloadPatientAnalysisBtn = document.getElementById('downloadPatientAnalysisBtn');
        this.patientAnalysisProgress = document.getElementById('patientAnalysisProgress');
        this.patientAnalysisProgressText = document.getElementById('patientAnalysisProgressText');
        this.patientAnalysisProgressFill = document.getElementById('patientAnalysisProgressFill');
        this.patientAnalysisProgressCounter = document.getElementById('patientAnalysisProgressCounter');
        this.patientAnalysisCurrentPatient = document.getElementById('patientAnalysisCurrentPatient');
        this.patientAnalysisSummary = document.getElementById('patientAnalysisSummary');
        this.lastPatientAnalysisResults = null;
        this.patientAnalysisTotal = 0;
        this.patientAnalysisCurrent = 0;
        this.allPatientsList = []; // All patients for selection
        this.accumulatedResults = []; // Accumulated results for auto-save
        this.autoSaveInterval = null; // Auto-save timer
        this.autoSaveEnabled = true; // Auto-save enabled
        this.autoSaveIntervalMs = 30000; // Auto-save interval (30 seconds)
        this.analysisStartTime = null; // Analysis start time (for filename)
        this.autoSaveFileName = null; // Auto-save filename
        this.autoSaveFileHandle = null; // File handle for File System Access API
        this.savedPatientIds = new Set(); // IDs of patients already saved
        
        // API test
        this.apiTestInput = document.getElementById('apiTestInput');
        this.testApiBtn = document.getElementById('testApiBtn');
        this.apiTestResult = document.getElementById('apiTestResult');
        
        // Tabs
        this.tabs = document.querySelectorAll('.tab');
        this.tabPanels = document.querySelectorAll('.tab-panel');
        
        // Theme
        this.themeToggle = document.getElementById('themeToggle');
        
        // Ollama
        this.ollamaUrl = document.getElementById('ollamaUrl');
        this.ollamaStatus = document.getElementById('ollamaStatus');
        this.ollamaMode = document.getElementById('ollamaMode');
        this.applyConfigBtn = document.getElementById('applyConfigBtn');
        this.selectedModelForAction = document.getElementById('selectedModelForAction');
        this.modelInfoBtn = document.getElementById('modelInfoBtn');
        this.removeModelBtn = document.getElementById('removeModelBtn');
        
        // System prompt
        this.systemPrompt = document.getElementById('systemPrompt');
        this.saveSystemPromptBtn = document.getElementById('saveSystemPromptBtn');
        this.clearSystemPromptBtn = document.getElementById('clearSystemPromptBtn');
        this.useSystemPrompt = document.getElementById('useSystemPrompt');
        
        // RAG elements
        this.ragVectorStore = document.getElementById('ragVectorStore');
        this.useOllamaEmbeddings = document.getElementById('useOllamaEmbeddings');
        this.ollamaEmbeddingGroup = document.getElementById('ollamaEmbeddingGroup');
        this.ollamaEmbeddingModel = document.getElementById('ollamaEmbeddingModel');
        this.ragChunkSize = document.getElementById('ragChunkSize');
        this.ragChunkOverlap = document.getElementById('ragChunkOverlap');
        this.configureRagBtn = document.getElementById('configureRagBtn');
        this.refreshRagStatsBtn = document.getElementById('refreshRagStatsBtn');
        this.ragStatus = document.getElementById('ragStatus');
        this.ragDocCount = document.getElementById('ragDocCount');
        this.ragChunkCount = document.getElementById('ragChunkCount');
        this.ragLastUpload = document.getElementById('ragLastUpload');
        
        // RAG stats elements
        this.ragStatusValue = document.getElementById('ragStatusValue');
        this.ragVectorStoreType = document.getElementById('ragVectorStoreType');
        this.ragDimension = document.getElementById('ragDimension');
        this.ragIndexSize = document.getElementById('ragIndexSize');
        this.ragEmbeddingModel = document.getElementById('ragEmbeddingModel');
        this.ragEmbeddingModelType = document.getElementById('ragEmbeddingModelType');
        this.ragEmbeddingCreatedAt = document.getElementById('ragEmbeddingCreatedAt');
        this.ragUseOllama = document.getElementById('ragUseOllama');
        this.ragFileUpload = document.getElementById('ragFileUpload');
        this.uploadFileBtn = document.getElementById('uploadFileBtn');
        this.uploadedFilesStatus = document.getElementById('uploadedFilesStatus');
        this.ragDocuments = document.getElementById('ragDocuments');
        this.addDocumentsBtn = document.getElementById('addDocumentsBtn');
        
        // File chunking settings
        this.enableFileChunking = document.getElementById('enableFileChunking');
        this.chunkingSettings = document.getElementById('chunkingSettings');
        this.chunkSize = document.getElementById('chunkSize');
        
        // Progress elements
        this.uploadProgress = document.getElementById('uploadProgress');
        this.progressTitle = document.getElementById('progressTitle');
        this.progressPercent = document.getElementById('progressPercent');
        this.progressFill = document.getElementById('progressFill');
        this.progressDetails = document.getElementById('progressDetails');
        this.stopEmbeddingBtn = document.getElementById('stopEmbeddingBtn');
        this.ragSearchQuery = document.getElementById('ragSearchQuery');
        this.searchDocumentsBtn = document.getElementById('searchDocumentsBtn');
        this.searchResults = document.getElementById('searchResults');
        this.searchResultsList = document.getElementById('searchResultsList');
        this.clearRagBtn = document.getElementById('clearRagBtn');
        this.clearRagIndexBtn = document.getElementById('clearRagIndexBtn');
        this.resetRagBtn = document.getElementById('resetRagBtn');
        this.useRagInChat = document.getElementById('useRagInChat');
        
        // RAG logs
        this.refreshLogsBtn = document.getElementById('refreshLogsBtn');
        this.clearLogsBtn = document.getElementById('clearLogsBtn');
        this.logLevelFilter = document.getElementById('logLevelFilter');
        this.logStats = document.getElementById('logStats');
        this.logEntries = document.getElementById('logEntries');
        
        // MemoRAG elements
        this.useMemoRag = document.getElementById('useMemoRag');
        this.memoragChunksCount = document.getElementById('memoragChunksCount');
        this.memoragMemorySize = document.getElementById('memoragMemorySize');
        this.refreshMemoRagStatsBtn = document.getElementById('refreshMemoRagStatsBtn');
        
        // MemoRAG stats
        this.memoragTotalEntries = document.getElementById('memoragTotalEntries');
        this.memoragFacts = document.getElementById('memoragFacts');
        this.memoragConcepts = document.getElementById('memoragConcepts');
        this.memoragRelationships = document.getElementById('memoragRelationships');
        this.memoragSummaries = document.getElementById('memoragSummaries');
        this.memoragIndexedWords = document.getElementById('memoragIndexedWords');
        this.memoragCacheSize = document.getElementById('memoragCacheSize');
        this.memoragCompressionRatio = document.getElementById('memoragCompressionRatio');
        
        // MemoRAG controls
        this.clearMemoRagMemoryBtn = document.getElementById('clearMemoRagMemoryBtn');
        this.exportMemoRagMemoryBtn = document.getElementById('exportMemoRagMemoryBtn');
        this.migrateToMemoRagBtn = document.getElementById('migrateToMemoRagBtn');
        this.checkMigrationStatusBtn = document.getElementById('checkMigrationStatusBtn');
        
        // MemoRAG testing
        this.memoragTestQuery = document.getElementById('memoragTestQuery');
        this.memoragTestTopK = document.getElementById('memoragTestTopK');
        this.memoragContextLength = document.getElementById('memoragContextLength');
        this.testMemoRagBtn = document.getElementById('testMemoRagBtn');
        this.memoragTestResults = document.getElementById('memoragTestResults');
        this.memoragTestOutput = document.getElementById('memoragTestOutput');
        
        // Patients elements
        this.patientsCount = document.getElementById('patientsCount');
        this.documentsCount = document.getElementById('documentsCount');
        this.patientsDbStatus = document.getElementById('patientsDbStatus');
        this.patientName = document.getElementById('patientName');
        this.patientAge = document.getElementById('patientAge');
        this.patientGender = document.getElementById('patientGender');
        this.patientNotes = document.getElementById('patientNotes');
        this.addPatientBtn = document.getElementById('addPatientBtn');
        this.exportDatabaseBtn = document.getElementById('exportDatabaseBtn');
        this.exportDbFormat = document.getElementById('exportDbFormat');
        this.importDatabaseBtn = document.getElementById('importDatabaseBtn');
        this.importDatabaseFile = document.getElementById('importDatabaseFile');
        this.importDbMode = document.getElementById('importDbMode');
        this.selectedPatient = document.getElementById('selectedPatient');
        this.documentType = document.getElementById('documentType');
        this.documentContent = document.getElementById('documentContent');
        this.addDocumentBtn = document.getElementById('addDocumentBtn');
        this.ocrDocumentBtn = document.getElementById('ocrDocumentBtn');
        this.documentFileInput = document.getElementById('documentFileInput');
        this.visionLlmBtn = document.getElementById('visionLlmBtn');
        this.visionLlmFileInput = document.getElementById('visionLlmFileInput');
        this.visionLlmProgress = document.getElementById('visionLlmProgress');
        this.visionLlmProgressText = document.getElementById('visionLlmProgressText');
        this.batchPatientQuery = document.getElementById('batchPatientQuery');
        this.batchUseMemoRag = document.getElementById('batchUseMemoRag');
        this.batchMemoRagTopK = document.getElementById('batchMemoRagTopK');
        this.batchMemoRagContextLength = document.getElementById('batchMemoRagContextLength');
        this.runBatchQueryBtn = document.getElementById('runBatchQueryBtn');
        this.downloadBatchResultsBtn = document.getElementById('downloadBatchResultsBtn');
        this.batchQueryProgress = document.getElementById('batchQueryProgress');
        this.batchQueryProgressText = document.getElementById('batchQueryProgressText');
        this.batchQuerySummary = document.getElementById('batchQuerySummary');
        
        // Bulk import elements
        this.massImportFolder = document.getElementById('massImportFolder');
        this.selectFolderBtn = document.getElementById('selectFolderBtn');
        this.selectedFolderPath = document.getElementById('selectedFolderPath');
        this.massImportPatientInfo = document.getElementById('massImportPatientInfo');
        this.startMassImportBtn = document.getElementById('startMassImportBtn');
        this.stopMassImportBtn = document.getElementById('stopMassImportBtn');
        this.massImportProgress = document.getElementById('massImportProgress');
        this.progressStatus = document.getElementById('progressStatus');
        this.progressCounter = document.getElementById('progressCounter');
        this.progressBarFill = document.getElementById('progressBarFill');
        this.progressDetails = document.getElementById('progressDetails');
        
        // Debug messages for document control elements
        console.log('DEBUG: Initializing document control elements:');
        console.log('DEBUG: selectedPatient:', this.selectedPatient);
        console.log('DEBUG: documentType:', this.documentType);
        console.log('DEBUG: documentContent:', this.documentContent);
        console.log('DEBUG: addDocumentBtn:', this.addDocumentBtn);
        console.log('DEBUG: ocrDocumentBtn:', this.ocrDocumentBtn);
        console.log('DEBUG: visionLlmBtn:', this.visionLlmBtn);
        console.log('DEBUG: visionLlmProgress:', this.visionLlmProgress);
        
        // Ensure all elements are found
        if (!this.selectedPatient) {
            console.error('ERROR: selectedPatient not found!');
        }
        if (!this.documentType) {
            console.error('ERROR: documentType not found!');
        }
        if (!this.documentContent) {
            console.error('ERROR: documentContent not found!');
        }
        if (!this.addDocumentBtn) {
            console.error('ERROR: addDocumentBtn not found!');
        }
        if (!this.ocrDocumentBtn) {
            console.error('ERROR: ocrDocumentBtn not found!');
        }
        if (!this.visionLlmBtn) {
            console.error('ERROR: visionLlmBtn not found!');
        }
        this.patientsList = document.getElementById('patientsList');
        this.refreshPatientsBtn = document.getElementById('refreshPatientsBtn');
        this.clearPatientsDbBtn = document.getElementById('clearPatientsDbBtn');
        
        // Streaming generation
        this.streamingIndicator = document.getElementById('streamingIndicator');
        
        // WebSocket for progress
        this.websocket = null;
        this.wsPingInterval = null;
        this.connectWebSocket();
        
        // Bulk import variables
        this.massImportData = {
            isRunning: false,
            isStopped: false,
            totalPatients: 0,
            processedPatients: 0,
            totalFiles: 0,
            processedFiles: 0,
            patients: [],
            currentPatient: null,
            currentFile: null
        };
    }
    // Show full prompt: from messages array (role/content)
    showFullPromptPreview(messages) {
        try {
            const lines = [];
            for (const m of (messages || [])) {
                if (!m || !m.content) continue;
                const role = m.role || 'user';
                lines.push(`[${role.toUpperCase()}]`);
                lines.push(this.stripEmptyLines(m.content));
                lines.push('');
            }
            const text = lines.join('\n');
            if (this.promptPreviewText) this.promptPreviewText.value = text;
            if (this.promptPreviewContainer) {
                this.promptPreviewContainer.style.display = 'block';
                try { this.promptPreviewContainer.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch(_) {}
                // brief highlight
                this.promptPreviewContainer.style.boxShadow = '0 0 0 3px rgba(255,200,0,0.6)';
                setTimeout(() => { this.promptPreviewContainer.style.boxShadow = ''; }, 1200);
            }
            this.logToConsole(`📝 Full prompt generated (${text.length} chars)`, 'info');
        } catch (_) {}
    }

    // Show full prompt: from ready string
    showFullPromptPreviewFromText(text) {
        try {
            if (this.promptPreviewText) this.promptPreviewText.value = this.stripEmptyLines(text || '');
            if (this.promptPreviewContainer) {
                this.promptPreviewContainer.style.display = 'block';
                try { this.promptPreviewContainer.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch(_) {}
                this.promptPreviewContainer.style.boxShadow = '0 0 0 3px rgba(255,200,0,0.6)';
                setTimeout(() => { this.promptPreviewContainer.style.boxShadow = ''; }, 1200);
            }
            this.logToConsole(`📝 Full prompt generated (${(text||'').length} chars)`, 'info');
        } catch (_) {}
    }

    // Normalize prompt text: remove repeated empty lines and decorative lines
    normalizePromptText(text) {
        const unified = String(text || '').replace(/\r\n/g, '\n');
        const srcLines = unified.split('\n');
        const out = [];
        for (let raw of srcLines) {
            const line = raw.replace(/[\t ]+$/g, '');
            const onlyDecor = /^\s*([=\-\_]{3,})\s*$/.test(line);
            if (onlyDecor) continue;
            const isBlank = line.trim() === '';
            if (isBlank) {
                if (out.length === 0 || out[out.length - 1] === '') continue;
                out.push('');
            } else {
                out.push(line);
            }
        }
        while (out.length && out[0] === '') out.shift();
        while (out.length && out[out.length - 1] === '') out.pop();
        return out.join('\n');
    }

    // Remove only empty lines, leave the rest as is
    stripEmptyLines(text) {
        const unified = String(text || '').replace(/\r\n/g, '\n');
        const out = [];
        for (const raw of unified.split('\n')) {
            if (raw.trim() === '') continue;
            out.push(raw);
        }
        return out.join('\n');
    }

    // Safe addEventListener (class method for use everywhere)
    safeAddEventListener(element, event, handler) {
        if (!element) {
            console.warn(`safeAddEventListener: element not found for event ${event}`);
            return;
        }
        if (typeof element.addEventListener !== 'function') {
            console.warn(`safeAddEventListener: element does not support addEventListener`, element);
            return;
        }
        try {
            element.addEventListener(event, handler);
        } catch (error) {
            console.error(`safeAddEventListener: error adding handler ${event}:`, error);
        }
    }

    setupEventListeners() {
        try {
        
        // Model loading
        this.safeAddEventListener(this.loadModelBtn, 'click', () => this.loadSelectedModel());
        
        // Settings
        if (this.temperature && this.temperatureValue) {
            this.safeAddEventListener(this.temperature, 'input', (e) => {
            this.temperatureValue.textContent = e.target.value;
        });
        }
        
        if (this.topP && this.topPValue) {
            this.safeAddEventListener(this.topP, 'input', (e) => {
            this.topPValue.textContent = e.target.value;
        });
        }
        
        // Chat
        this.safeAddEventListener(this.sendBtn, 'click', () => this.sendMessage());
        this.safeAddEventListener(this.chatInput, 'keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        // API test
        this.safeAddEventListener(this.testApiBtn, 'click', () => this.testApi());
        
        // Tabs
        if (this.tabs && this.tabs.length > 0) {
        this.tabs.forEach(tab => {
                this.safeAddEventListener(tab, 'click', () => this.switchTab(tab.dataset.tab));
        });
        }
        
        // View prompt
        if (this.viewPromptBtn) {
            console.log('DEBUG: Attaching handler for viewPromptBtn');
            this.safeAddEventListener(this.viewPromptBtn, 'click', (e) => {
                e.preventDefault();
                console.log('DEBUG: Click on view prompt button');
                this.showPromptPreview();
            });
        } else {
            console.error('ERROR: viewPromptBtn not found!');
        }
        
        // Track patient selection change
        if (this.chatPatientSelect) {
            this.safeAddEventListener(this.chatPatientSelect, 'change', () => {
                const patientId = this.chatPatientSelect.value;
                console.log('DEBUG: Patient selection change in chat:', patientId);
                
                // Save selected patient to localStorage
                if (patientId) {
                    localStorage.setItem('lm-studio-selected-patient-id', patientId);
                    const selectedOption = this.chatPatientSelect.options[this.chatPatientSelect.selectedIndex];
                    const patientName = selectedOption ? selectedOption.textContent : `ID=${patientId}`;
                    this.logToConsole(`✅ Selected patient: ${patientName}`, 'success');
                } else {
                    localStorage.removeItem('lm-studio-selected-patient-id');
                    this.logToConsole('⚠️ Patient selection cleared', 'warning');
                }
            });
        }
        
        // Copy prompt from preview button
        if (this.copyPromptPreviewBtn && this.promptPreviewText) {
            this.safeAddEventListener(this.copyPromptPreviewBtn, 'click', () => {
                navigator.clipboard.writeText(this.promptPreviewText.value).then(() => {
                    this.copyPromptPreviewBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
                    setTimeout(() => {
                        this.copyPromptPreviewBtn.innerHTML = '<i class="fas fa-copy"></i> Copy';
                    }, 2000);
                }).catch(err => {
                    console.error('Copy error:', err);
                    this.copyPromptPreviewBtn.innerHTML = '<i class="fas fa-exclamation"></i> Error';
                    setTimeout(() => {
                        this.copyPromptPreviewBtn.innerHTML = '<i class="fas fa-copy"></i> Copy';
                    }, 2000);
                });
            });
        }
        
        // Theme
        if (this.themeToggle) {
            this.safeAddEventListener(this.themeToggle, 'click', () => this.toggleTheme());
        } else {
            console.error('ERROR: themeToggle not found!');
        }
        
        // Ollama
        this.safeAddEventListener(this.applyConfigBtn, 'click', () => this.applyOllamaConfig());
        this.safeAddEventListener(this.modelInfoBtn, 'click', () => this.getOllamaModelInfo());
        this.safeAddEventListener(this.removeModelBtn, 'click', () => this.removeOllamaModel());
        
        // System prompt
        this.safeAddEventListener(this.saveSystemPromptBtn, 'click', () => this.saveSystemPrompt());
        this.safeAddEventListener(this.clearSystemPromptBtn, 'click', () => this.clearSystemPrompt());
        this.safeAddEventListener(this.systemPrompt, 'input', () => this.autoSaveSystemPrompt());
        
        // RAG
        if (this.useOllamaEmbeddings && !this.useOllamaEmbeddings._ragBound) {
            this.safeAddEventListener(this.useOllamaEmbeddings, 'change', () => this.toggleOllamaEmbeddings());
            this.useOllamaEmbeddings._ragBound = true;
        }
        // RAG bindings moved to ensureRagBindings()
        
        // RAG logs
        this.safeAddEventListener(this.refreshLogsBtn, 'click', () => this.refreshLogs());
        this.safeAddEventListener(this.clearLogsBtn, 'click', () => this.clearLogs());
        this.safeAddEventListener(this.logLevelFilter, 'change', () => this.refreshLogs());
        
        // MemoRAG
        this.safeAddEventListener(this.refreshMemoRagStatsBtn, 'click', () => this.updateMemoRagStats());
        this.safeAddEventListener(this.clearMemoRagMemoryBtn, 'click', () => this.clearMemoRagMemory());
        this.safeAddEventListener(this.exportMemoRagMemoryBtn, 'click', () => this.exportMemoRagMemory());
        this.safeAddEventListener(this.migrateToMemoRagBtn, 'click', () => this.migrateToMemoRag());
        this.safeAddEventListener(this.checkMigrationStatusBtn, 'click', () => this.checkMigrationStatus());
        this.safeAddEventListener(this.testMemoRagBtn, 'click', () => this.testMemoRag());
        
        // Patients handlers
        this.safeAddEventListener(this.addPatientBtn, 'click', () => this.addPatient());
        this.safeAddEventListener(this.exportDatabaseBtn, 'click', () => this.exportDatabase());
        this.safeAddEventListener(this.importDatabaseBtn, 'click', () => this.importDatabaseFile?.click());
        this.safeAddEventListener(this.importDatabaseFile, 'change', (e) => this.handleDatabaseImport(e));
        this.safeAddEventListener(this.addDocumentBtn, 'click', () => {
            console.log('DEBUG: Click on addDocumentBtn');
            
            // Prevent multiple clicks
            if (this.addDocumentBtn && this.addDocumentBtn.disabled) {
                console.log('DEBUG: Button already blocked, ignoring click');
                return;
            }
            
            this.selectDocumentFile();
        });
        
        // File selection handler
        if (this.documentFileInput) {
            this.safeAddEventListener(this.documentFileInput, 'change', (event) => {
                this.handleDocumentFileSelection(event);
            });
        }
        this.safeAddEventListener(this.ocrDocumentBtn, 'click', () => this.ocrDocument());
        if (this.visionLlmBtn) {
            this.safeAddEventListener(this.visionLlmBtn, 'click', () => {
                if (typeof this.selectVisionLlmFile === 'function') {
                    this.selectVisionLlmFile();
                } else {
                    this.logToConsole('❌ selectVisionLlmFile is unavailable (patients.js not loaded?)', 'error');
                }
            });
            this._visionLlmBound = true;
        }
        if (this.visionLlmFileInput) {
            this.safeAddEventListener(this.visionLlmFileInput, 'change', (event) => {
                if (typeof this.handleVisionLlmFileSelection === 'function') {
                    this.handleVisionLlmFileSelection(event);
                } else {
                    this.logToConsole('❌ handleVisionLlmFileSelection is unavailable (patients.js not loaded?)', 'error');
                }
            });
            this._visionLlmFileBound = true;
        }
        this.safeAddEventListener(this.refreshPatientsBtn, 'click', () => {
            if (typeof this.refreshPatients === 'function') {
                this.refreshPatients();
            } else {
                this.logToConsole('❌ refreshPatients is unavailable (patients.js not loaded?)', 'error');
                console.error('refreshPatients is not a function');
            }
        });
        this.safeAddEventListener(this.clearPatientsDbBtn, 'click', () => this.clearPatientsDatabase());
        this.safeAddEventListener(this.runBatchQueryBtn, 'click', () => {
                if (typeof this.runBatchQuery === 'function') {
                    this.runBatchQuery();
                } else {
                    this.logToConsole('❌ runBatchQuery is unavailable (patients.js not loaded?)', 'error');
                }
            });
        this.safeAddEventListener(this.downloadBatchResultsBtn, 'click', () => {
                if (typeof this.downloadBatchResults === 'function') {
                    this.downloadBatchResults();
                } else {
                    this.logToConsole('❌ downloadBatchResults is unavailable (patients.js not loaded?)', 'error');
                }
            });
        
        // Chat history clear handler
        this.safeAddEventListener(this.clearChatHistoryBtn, 'click', () => this.clearChatHistory());
        
        // Chat history import/export handlers
        this.safeAddEventListener(this.exportChatHistoryBtn, 'click', () => this.exportChatHistory());
        this.safeAddEventListener(this.importChatHistoryBtn, 'click', () => this.importChatHistory());
        if (this.importChatHistoryInput) {
            this.safeAddEventListener(this.importChatHistoryInput, 'change', (e) => this.handleImportFile(e));
        }
        
        // Automatic patient analysis handlers
        this.safeAddEventListener(this.runPatientAnalysisBtn, 'click', () => this.runPatientAnalysis());
        this.safeAddEventListener(this.downloadPatientAnalysisBtn, 'click', () => this.downloadPatientAnalysisResults());
        this.safeAddEventListener(this.patientAnalysisPercent, 'input', () => this.updatePatientAnalysisCount());
        this.safeAddEventListener(this.patientAnalysisPercent, 'change', () => this.updatePatientAnalysisCount());
        
        // Bulk import handlers
        this.safeAddEventListener(this.selectFolderBtn, 'click', () => {
                if (typeof this.selectMassImportFolder === 'function') {
                    this.selectMassImportFolder();
                } else {
                    this.logToConsole('❌ selectMassImportFolder is unavailable (patients.js not loaded?)', 'error');
                    console.error('selectMassImportFolder is not a function');
                }
            });
        
        this.safeAddEventListener(this.startMassImportBtn, 'click', () => {
                if (typeof this.startMassImport === 'function') {
                    this.startMassImport();
                } else {
                    this.logToConsole('❌ startMassImport is unavailable (patients.js not loaded?)', 'error');
                }
            });
        
        this.safeAddEventListener(this.stopMassImportBtn, 'click', () => {
                if (typeof this.stopMassImport === 'function') {
                    this.stopMassImport();
                } else {
                    this.logToConsole('❌ stopMassImport is unavailable (patients.js not loaded?)', 'error');
                }
            });
        
        if (this.massImportFolder) {
            this.safeAddEventListener(this.massImportFolder, 'change', (event) => {
                if (typeof this.handleMassImportFolderSelection === 'function') {
                    this.handleMassImportFolderSelection(event);
                } else {
                    this.logToConsole('❌ handleMassImportFolderSelection is unavailable (patients.js not loaded?)', 'error');
                }
            });
        }
        
        // Connection check every 10 seconds (increased from 5 to reduce load)
        setInterval(() => this.checkConnection(), 10000);
        // Ollama status check every 60 seconds (infrequent to avoid load)
        // Check once on load, then on interval
        setTimeout(() => {
            this.checkOllamaStatus();
            setInterval(() => {
                // Check only if no other check is running
                if (!this.checkingOllamaStatus && !this.isOllamaConnected) {
                    // Check only if Ollama not connected to avoid extra requests
                    this.checkOllamaStatus();
                }
            }, 60000); // Interval set to 60 seconds
        }, 2000); // First check 2 seconds after load
        } catch (error) {
            console.error('setupEventListeners failed:', error);
        } finally {
            this.ensureRagBindings();
        }
    }

    ensureRagBindings() {
        if (this.useOllamaEmbeddings && !this.useOllamaEmbeddings._ragBound) {
            this.useOllamaEmbeddings.addEventListener('change', () => this.toggleOllamaEmbeddings());
            this.useOllamaEmbeddings._ragBound = true;
        }
        if (this.stopEmbeddingBtn && !this.stopEmbeddingBtn._ragBound) {
            this.safeAddEventListener(this.stopEmbeddingBtn, 'click', () => this.stopEmbeddingProcess());
            this.stopEmbeddingBtn._ragBound = true;
        }
        if (this.enableFileChunking && !this.enableFileChunking._ragBound) {
            this.safeAddEventListener(this.enableFileChunking, 'change', () => this.toggleChunkingSettings());
            this.enableFileChunking._ragBound = true;
        }
        if (this.configureRagBtn && !this.configureRagBtn._ragBound) {
            this.safeAddEventListener(this.configureRagBtn, 'click', () => this.configureRag());
            this.configureRagBtn._ragBound = true;
        }
        if (this.refreshRagStatsBtn && !this.refreshRagStatsBtn._ragBound) {
            this.safeAddEventListener(this.refreshRagStatsBtn, 'click', () => this.updateRagStats());
            this.refreshRagStatsBtn._ragBound = true;
        }
        if (this.uploadFileBtn && !this.uploadFileBtn._ragBound) {
            this.safeAddEventListener(this.uploadFileBtn, 'click', () => this.uploadFiles());
            this.uploadFileBtn._ragBound = true;
        }
        if (this.addDocumentsBtn && !this.addDocumentsBtn._ragBound) {
            this.safeAddEventListener(this.addDocumentsBtn, 'click', () => this.addDocuments());
            this.addDocumentsBtn._ragBound = true;
        }
        if (this.searchDocumentsBtn && !this.searchDocumentsBtn._ragBound) {
            this.safeAddEventListener(this.searchDocumentsBtn, 'click', () => this.searchDocuments());
            this.searchDocumentsBtn._ragBound = true;
        }
        if (this.clearRagBtn && !this.clearRagBtn._ragBound) {
            this.safeAddEventListener(this.clearRagBtn, 'click', () => this.clearRag());
            this.clearRagBtn._ragBound = true;
        }
        if (this.clearRagIndexBtn && !this.clearRagIndexBtn._ragBound) {
            this.safeAddEventListener(this.clearRagIndexBtn, 'click', () => this.clearRagIndex());
            this.clearRagIndexBtn._ragBound = true;
        }
        if (this.resetRagBtn && !this.resetRagBtn._ragBound) {
            this.safeAddEventListener(this.resetRagBtn, 'click', () => this.resetRag());
            this.resetRagBtn._ragBound = true;
        }
    }

    connectWebSocket() {
        try {
            const baseUrl = this.apiBaseUrl || 'http://localhost:8000';
            const wsBase = baseUrl.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
            const wsUrl = `${wsBase}/ws/progress`;
            this.websocket = new WebSocket(wsUrl);
            
            // Clear previous ping interval if any
            if (this.wsPingInterval) {
                clearInterval(this.wsPingInterval);
                this.wsPingInterval = null;
            }
            
            this.websocket.onopen = () => {
                console.log('WebSocket connected for progress tracking');
                
                // Send ping every 20 seconds to keep connection alive
                this.wsPingInterval = setInterval(() => {
                    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                        try {
                            this.websocket.send(JSON.stringify({ type: 'ping' }));
                        } catch (error) {
                            console.error('Ping send error:', error);
                        }
                    }
                }, 20000);
            };
            
            this.websocket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    
                    // Ignore service messages (connected, pong, keepalive)
                    if (data.type === 'connected' || data.type === 'pong' || data.type === 'keepalive') {
                        // Just confirm connection is active
                        return;
                    }
                    
                    this.handleProgressUpdate(data);
                } catch (error) {
                    console.error('WebSocket message parse error:', error);
                }
            };
            
            this.websocket.onclose = (event) => {
                const closeInfo = {
                    code: event.code,
                    reason: event.reason || 'no reason',
                    wasClean: event.wasClean
                };
                console.log('WebSocket connection closed', closeInfo);
                
                // Clear ping interval
                if (this.wsPingInterval) {
                    clearInterval(this.wsPingInterval);
                    this.wsPingInterval = null;
                }
                
// Reconnect in all cases except intentional close by client
        // Code 1000 = normal close (may be from server or client)
        // Code 1001 = going away (e.g. server closed connection)
        // Code 1006 = abnormal close (connection lost without close frame)
        // We reconnect everywhere since this is for progress tracking and should stay active
                if (event.code !== 1000 || !event.wasClean) {
                    // Reconnect with short delay to avoid reconnect loops
                    const delay = event.code === 1006 ? 5000 : 3000; // Wait longer on abnormal close
                    console.log(`Reconnecting in ${delay/1000} seconds (code: ${event.code}, wasClean: ${event.wasClean})`);
                    setTimeout(() => {
                        if (!this.websocket || this.websocket.readyState === WebSocket.CLOSED) {
                            this.connectWebSocket();
                        }
                    }, delay);
                } else {
                    console.log('WebSocket closed normally (code 1000), no reconnect needed');
                }
            };
            
            this.websocket.onerror = (error) => {
                console.error('WebSocket error:', error);
                // On error connection usually closes automatically
                // onclose will fire after that
            };
        } catch (error) {
            console.error('WebSocket connection error:', error);
        }
    }

    handleProgressUpdate(data) {
        if (data.type === 'embedding_progress') {
            this.updateProgressBar(data);
        } else if (data.type === 'embedding_complete') {
            this.hideProgressBar();
        } else if (data.type === 'vision_llm_progress') {
            if (this.visionLlmProgress) {
                this.visionLlmProgress.style.display = 'block';
            }
            if (this.visionLlmProgressText) {
                const msg = data.message || 'Vision-LLM: processing...';
                if (data.current_page && data.total_pages) {
                    this.visionLlmProgressText.textContent = `${msg} (${data.current_page}/${data.total_pages})`;
                } else {
                    this.visionLlmProgressText.textContent = msg;
                }
            }
        } else if (data.type === 'vision_llm_complete') {
            if (this.visionLlmProgressText) {
                this.visionLlmProgressText.textContent = 'Vision-LLM: completed';
            }
            if (this.visionLlmProgress) {
                setTimeout(() => {
                    this.visionLlmProgress.style.display = 'none';
                }, 2000);
            }
        } else if (data.type === 'patient_analysis_progress') {
            this.updatePatientAnalysisProgress(data);
        } else if (data.type === 'patient_analysis_result') {
            this.handlePatientAnalysisResult(data);
        } else if (data.type === 'patient_analysis_complete') {
            this.handlePatientAnalysisComplete(data);
        }
    }

    updatePatientAnalysisProgress(data) {
        if (!this.patientAnalysisProgress) return;
        
        const current = data.current || 0;
        const total = data.total || 0;
        const patientName = data.patient_name || '';
        const percent = total > 0 ? Math.round((current / total) * 100) : 0;
        
        this.patientAnalysisCurrent = current;
        this.patientAnalysisTotal = total;
        
        // Ensure progress is visible
        if (this.patientAnalysisProgress) {
            this.patientAnalysisProgress.style.display = 'block';
        }
        
        // Update progress bar
        if (this.patientAnalysisProgressFill) {
            this.patientAnalysisProgressFill.style.width = `${percent}%`;
            // Remove green color (if set on completion)
            this.patientAnalysisProgressFill.style.backgroundColor = '#007acc';
        }
        
        // Update counter
        if (this.patientAnalysisProgressCounter) {
            this.patientAnalysisProgressCounter.textContent = `${current} / ${total}`;
        }
        
        // Update current patient
        if (this.patientAnalysisCurrentPatient) {
            if (patientName) {
                this.patientAnalysisCurrentPatient.textContent = `Processing: ${patientName}`;
            } else {
                this.patientAnalysisCurrentPatient.textContent = '';
            }
        }
        
        // Update progress text
        if (this.patientAnalysisProgressText) {
            // Keep loading icon if present
            const existingSpinner = this.patientAnalysisProgressText.querySelector('i.fa-spinner');
            // Remove check icon (if set on completion)
            const checkIcon = this.patientAnalysisProgressText.querySelector('i.fa-check-circle');
            if (checkIcon) {
                checkIcon.remove();
            }
            // Update text, keeping loading icon
            if (existingSpinner) {
                // If loading icon present, update only text after it
                const textNode = Array.from(this.patientAnalysisProgressText.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
                if (textNode) {
                    textNode.textContent = ` Patient analysis: ${percent}%`;
                } else {
                    this.patientAnalysisProgressText.appendChild(document.createTextNode(` Patient analysis: ${percent}%`));
                }
            } else {
                // If no icon, add it and text
                this.patientAnalysisProgressText.innerHTML = '';
                const spinner = document.createElement('i');
                spinner.className = 'fas fa-spinner fa-spin';
                spinner.style.marginRight = '5px';
                this.patientAnalysisProgressText.appendChild(spinner);
                this.patientAnalysisProgressText.appendChild(document.createTextNode(` Patient analysis: ${percent}%`));
            }
        }
    }

    handlePatientAnalysisResult(data) {
        // Process single patient result from WebSocket
        if (!data.result) {
            console.warn('handlePatientAnalysisResult: no result data');
            return;
        }
        
        const result = data.result;
        
        // Add result to accumulated list
        // Check if we already have this result (by patient_id)
        const existingIndex = this.accumulatedResults.findIndex(r => r.patient_id === result.patient_id);
        if (existingIndex >= 0) {
            // Update existing result
            this.accumulatedResults[existingIndex] = result;
        } else {
            // Add new result
            this.accumulatedResults.push(result);
        }
        
        // Update lastPatientAnalysisResults for compatibility
        if (!this.lastPatientAnalysisResults) {
            this.lastPatientAnalysisResults = [];
        }
        const lastIndex = this.lastPatientAnalysisResults.findIndex(r => r.patient_id === result.patient_id);
        if (lastIndex >= 0) {
            this.lastPatientAnalysisResults[lastIndex] = result;
        } else {
            this.lastPatientAnalysisResults.push(result);
        }
        
        console.log(`DEBUG: Result for patient ${result.patient_id} (${result.patient_name}), total accumulated: ${this.accumulatedResults.length}`);
        
        // If auto-save on and this is first result, start timer
        if (this.autoSaveEnabled && this.accumulatedResults.length === 1 && !this.autoSaveInterval) {
            this.startAutoSave();
        }
    }
    
    startAutoSave() {
        // Do NOT start periodic auto-save to avoid many files
        // Save only at end of analysis
        // For periodic save, browser would create files with suffixes (1), (2), etc.
        console.log(`DEBUG: Auto-save disabled (will save only at end of analysis)`);
    }
    
    stopAutoSave() {
        // Stop auto-save
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
            this.autoSaveInterval = null;
            console.log('DEBUG: Auto-save stopped');
        }
    }
    
    async autoSaveToExcel() {
        // Auto-save accumulated results to Excel
        // Adds only new results to existing file
        if (!this.accumulatedResults || this.accumulatedResults.length === 0) {
            return;
        }
        
        if (typeof XLSX === 'undefined') {
            console.warn('Auto-save: SheetJS not loaded');
            return;
        }
        
        try {
            const MAX_CELL_LENGTH = 32767;
            
            // Truncate text to fit cell
            const truncateText = (text, maxLength) => {
                if (!text || text.length <= maxLength) {
                    return text || '';
                }
                const messageSize = 150;
                const availableLength = maxLength - messageSize;
                const end = text.substring(text.length - availableLength);
                const removedLength = text.length - availableLength;
                return `[... TEXT TRUNCATED: ${removedLength} chars removed from start (was ${text.length}, kept ${availableLength}). Start may have repeated questions ...]\n\n` + end;
            };
            
            // Fixed filename (same for entire analysis)
            if (!this.autoSaveFileName) {
                if (this.analysisStartTime) {
                    const dateStr = this.analysisStartTime.toISOString().split('T')[0];
                    const timeStr = this.analysisStartTime.toTimeString().split(' ')[0].replace(/:/g, '-');
                    this.autoSaveFileName = `patient-analysis-${dateStr}-${timeStr}.xlsx`;
                } else {
                    const timestamp = new Date().toISOString().split('T')[0];
                    this.autoSaveFileName = `patient-analysis-auto-${timestamp}.xlsx`;
                }
            }
            
            // Always save ALL accumulated results (not just new)
            // Ensures file has full up-to-date info
            // Browser may add suffix (1), (2) but better than losing data
            
            const headers = ['Patient', 'final prompt', 'llm response'];
            const rows = this.accumulatedResults.map((row) => {
                const prompt = row.prompt || '';
                const response = row.response || (row.error ? `Error: ${row.error}` : '');
                
                return {
                    'Patient': row.patient_name || `ID ${row.patient_id}`,
                    'final prompt': truncateText(prompt, MAX_CELL_LENGTH),
                    'llm response': truncateText(response, MAX_CELL_LENGTH)
                };
            });
            
            const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Patient Analysis');
            
            // Save file with fixed name
            // Browser may add (1), (2) if file already exists in downloads
            // Better than creating many differently named files
            XLSX.writeFile(workbook, this.autoSaveFileName);
            
            // Mark all results as saved
            this.accumulatedResults.forEach(row => {
                this.savedPatientIds.add(row.patient_id);
            });
            
            this.logToConsole(`💾 Auto-save: saved ${this.accumulatedResults.length} results to ${this.autoSaveFileName}`, 'info');
        } catch (error) {
            console.error('Auto-save error:', error);
            this.logToConsole(`❌ Auto-save error: ${error.message}`, 'error');
        }
    }

    handlePatientAnalysisComplete(data) {
        const total = data.total || 0;
        const success = data.success || 0;
        const failed = data.failed || 0;
        
        // Update progress to 100%
        if (this.patientAnalysisProgressFill) {
            this.patientAnalysisProgressFill.style.width = '100%';
            // Set green color to indicate completion
            this.patientAnalysisProgressFill.style.backgroundColor = '#28a745';
        }
        
        // Update counter
        if (this.patientAnalysisProgressCounter) {
            this.patientAnalysisProgressCounter.textContent = `${total} / ${total}`;
        }
        
        // Clear current patient
        if (this.patientAnalysisCurrentPatient) {
            this.patientAnalysisCurrentPatient.textContent = '';
        }
        
        // Update text with check icon
        if (this.patientAnalysisProgressText) {
            // Remove loading icon
            const spinner = this.patientAnalysisProgressText.querySelector('i.fa-spinner');
            if (spinner) {
                spinner.remove();
            }
            // Remove old check icon if any
            const oldCheck = this.patientAnalysisProgressText.querySelector('i.fa-check-circle');
            if (oldCheck) {
                oldCheck.remove();
            }
            // Add check icon
            const checkIcon = document.createElement('i');
            checkIcon.className = 'fas fa-check-circle';
            checkIcon.style.marginRight = '5px';
            checkIcon.style.color = '#28a745';
            // Set text
            this.patientAnalysisProgressText.textContent = `Analysis complete: ${success} success, ${failed} errors`;
            // Insert icon at start
            this.patientAnalysisProgressText.insertBefore(checkIcon, this.patientAnalysisProgressText.firstChild);
        }
        
        // Show summary
        if (this.patientAnalysisSummary) {
            this.patientAnalysisSummary.innerHTML = `
                <strong style="color: #28a745;">✓ Analysis complete!</strong><br>
                Total patients: ${total}<br>
                Processed successfully: <span style="color: #28a745;">${success}</span><br>
                Errors: <span style="color: ${failed > 0 ? '#dc3545' : '#28a745'}">${failed}</span>
            `;
            this.patientAnalysisSummary.style.display = 'block';
        }
        
        // Enable download button if we have results
        // Check results again as they may have been set after this call via WebSocket
        if (this.downloadPatientAnalysisBtn) {
            if (this.lastPatientAnalysisResults && this.lastPatientAnalysisResults.length > 0) {
                this.downloadPatientAnalysisBtn.disabled = false;
                console.log(`DEBUG: Download button enabled in handlePatientAnalysisComplete (${this.lastPatientAnalysisResults.length} results)`);
            } else {
                console.log('DEBUG: Download button not enabled - results not yet received or empty');
            }
        }
        
        // Enable start button
        if (this.runPatientAnalysisBtn) {
            this.runPatientAnalysisBtn.disabled = false;
        }
        
        // Stop auto-save and do final save
        this.stopAutoSave();
        if (this.accumulatedResults.length > 0) {
            this.autoSaveToExcel();
            this.logToConsole(`💾 Final auto-save: saved ${this.accumulatedResults.length} results`, 'success');
        }
        
        // Do NOT hide progress immediately - leave visible for user
        // User can close or it will hide via timeout in runPatientAnalysis
        this.logToConsole(`✅ All patients analysis complete: ${success} success, ${failed} errors`, 'success');
    }

    updateProgressBar(data) {
        this.uploadProgress.style.display = 'block';
        this.progressTitle.textContent = 'Creating embeddings...';
        this.progressPercent.textContent = `${data.progress_percent}%`;
        this.progressFill.style.width = `${data.progress_percent}%`;
        
        // Show more detailed info
        const processedDocs = Math.min(data.current_batch * 10, data.total_documents); // Approx
        this.progressDetails.textContent = 
            `Batch ${data.current_batch}/${data.total_batches} • Processed ~${processedDocs}/${data.total_documents} documents`;
        
        // Single scroll
        this.scrollToBottom();
    }

    hideProgressBar() {
        setTimeout(() => {
            this.uploadProgress.style.display = 'none';
            this.progressFill.style.width = '0%';
        }, 2000);
    }

    async checkConnection() {
        try {
            const response = await this.fetchWithTimeout(`${this.apiBaseUrl}/health`);
            const data = await response.json();
            
            if (data.status === 'healthy') {
                this.isConnected = true;
                
                // Update status considering offline mode
                let statusText = 'Connected';
                if (data.offline_mode) {
                    statusText = 'Connected (offline)';
                }
                
                this.updateStatus(statusText, true);
                await this.updateModelInfo();
                
                // Update connection info
                // Use direct ollama_connected from health if available
                if (data.ollama_connected !== undefined) {
                    const modelsCount = data.connection_info?.available_models_count || 0;
                    const wasConnected = this.isOllamaConnected;
                    this.isOllamaConnected = data.ollama_connected;
                    
                    // Update status only if changed or on first load
                    if (wasConnected !== this.isOllamaConnected || !this.ollamaModelsLoaded) {
                        this.updateOllamaStatus(data.ollama_connected, modelsCount);
                        // Log only on status change or first load
                        if (!wasConnected || !this.ollamaModelsLoaded) {
                            console.log('DEBUG: Ollama status from /health:', data.ollama_connected, 'models:', modelsCount);
                        }
                    }
                }
                
                if (data.connection_info) {
                    this.updateConnectionInfo(data.connection_info);
                }
            } else {
                this.isConnected = false;
                this.updateStatus('Server error', false);
            }
        } catch (error) {
            this.isConnected = false;
            this.updateStatus('Disconnected', false);
            this.logToConsole('Server connection error', 'error');
        }
    }

    updateStatus(text, connected) {
        const statusText = this.statusIndicator.querySelector('span');
        const statusIcon = this.statusIndicator.querySelector('i');
        
        statusText.textContent = text;
        
        if (connected) {
            this.statusIndicator.classList.add('connected');
        } else {
            this.statusIndicator.classList.remove('connected');
        }
    }

    updateConnectionInfo(connectionInfo) {
        // Update connection info in UI
        if (connectionInfo.offline_mode) {
            this.logToConsole('🌐 Offline mode (internet unavailable)', 'warning');
        } else {
            this.logToConsole('🌐 Online mode (internet available)', 'success');
        }
        
        // Update Ollama status from connectionInfo only if not already set directly
        // (so we don't overwrite correct status from /health)
        if (!this.isOllamaConnected && connectionInfo.ollama_local_available) {
            this.isOllamaConnected = true;
            this.updateOllamaStatus(true, connectionInfo.available_models_count || 0);
        } else if (!connectionInfo.ollama_local_available && !this.isOllamaConnected) {
            // If not connected, do direct check
            setTimeout(() => {
                if (!this.checkingOllamaStatus) {
                    this.checkOllamaStatus();
                }
            }, 500);
        }
    }

    async loadAvailableModels() {
        try {
            const response = await this.fetchWithTimeout(`${this.apiBaseUrl}/available-models`);
            const data = await response.json();
            
            // Clear model list but keep Ollama models if already loaded
            const ollamaOptions = [];
            if (this.ollamaModelsLoaded && this.modelSelect) {
                // Save Ollama options before clear
                Array.from(this.modelSelect.options).forEach(opt => {
                    if (opt.value.startsWith('ollama:')) {
                        ollamaOptions.push({
                            value: opt.value,
                            text: opt.textContent
                        });
                    }
                });
            }
            
            // Clear list
            if (this.modelSelect) {
            this.modelSelect.innerHTML = '<option value="">Select a model...</option>';
                
                // Restore Ollama models if they were there
                ollamaOptions.forEach(opt => {
                    const option = document.createElement('option');
                    option.value = opt.value;
                    option.textContent = opt.text;
                    this.modelSelect.appendChild(option);
                });
            }
            
            // Ensure we got a successful response
            if (data.status === 'success' && data.models) {
                const models = data.models;
                
                Object.keys(models).forEach(modelId => {
                    // Ensure this model is not already in list
                    const existingOption = Array.from(this.modelSelect.options).find(opt => opt.value === modelId);
                    if (!existingOption) {
                    const option = document.createElement('option');
                    option.value = modelId;
                    option.textContent = modelId; // Show only model name
                    
                    // Highlight qwen2.5:latest as recommended
                    if (modelId === 'qwen2.5:latest') {
                        option.textContent += ' (recommended)';
                        option.selected = true;
                        this.currentModel = modelId;
                    }
                    
                    this.modelSelect.appendChild(option);
                    }
                });
                
                this.logToConsole(`Loaded ${Object.keys(models).length} locally installed models`);
            } else {
                this.logToConsole('Failed to load model list', 'error');
            }
            
            // Update RAG stats
            await this.updateRagStats();
            
            // Update patients stats
            await this.updatePatientsStats();
            await this.loadPatientsList();
            
            // Always load Ollama models AFTER stats update when Ollama is connected
            // Ensures models are added even if list was cleared
            if (this.isOllamaConnected) {
                console.log('DEBUG: loadAvailableModels: Ollama connected, loading models...');
                await this.loadOllamaModels();
            }
        } catch (error) {
            this.logToConsole('Error loading model list', 'error');
            console.error('DEBUG: loadAvailableModels error:', error);
        }
    }

    async loadSelectedModel() {
        const selectedModel = this.modelSelect.value;
        if (!selectedModel) {
            this.showNotification('Select a model to load', 'error');
            this.logToConsole('Select a model to load', 'error');
            return;
        }

        this.loadModelBtn.disabled = true;
        this.loadModelBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
        
        try {
            // Remove ollama: prefix if present
            const modelName = selectedModel.replace('ollama:', '');
            
            // Load via API for all models
            // 5 min timeout for large models
            const response = await this.fetchWithTimeout(`${this.apiBaseUrl}/load-model?model_name=${modelName}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            }, 300000); // 5 min (300000ms) for large model load
            
            const data = await response.json();
            
            if (response.ok) {
                this.currentModel = selectedModel;
                this.showNotification(`✅ Model ${selectedModel} loaded successfully!`, 'success');
                this.logToConsole(`Model ${selectedModel} loaded successfully`, 'success');
                
                // Update model info
                await this.updateModelInfo();
                
                // Update connection status
                await this.checkConnection();
                
            } else {
                const errorDetail = data.detail || data.message || 'Unknown error';
                this.showNotification(`❌ Model load error: ${errorDetail}`, 'error');
                this.logToConsole(`Model load error: ${errorDetail}`, 'error');
            }
        } catch (error) {
            const errorMessage = error.message || error.toString();
            this.showNotification(`❌ Model load error: ${errorMessage}`, 'error');
            this.logToConsole(`Model load error: ${errorMessage}`, 'error');
        } finally {
            this.loadModelBtn.disabled = false;
            this.loadModelBtn.innerHTML = '<i class="fas fa-download"></i> Load';
        }
    }

    async updateModelInfo() {
        try {
            const response = await this.fetchWithTimeout(`${this.apiBaseUrl}/model-info`);
            const info = await response.json();
            
            if (info.status === 'model_loaded') {
                this.modelInfo.innerHTML = `
                    <p><strong>Status:</strong> Loaded</p>
                    <p><strong>Device:</strong> ${info.device}</p>
                    <p><strong>Parameters:</strong> ${info.parameters.toLocaleString()}</p>
                    <p><strong>Memory:</strong> ${(info.memory_usage / 1024 / 1024).toFixed(1)} MB</p>
                `;
            } else {
                this.modelInfo.innerHTML = '<p>No model loaded</p>';
            }
        } catch (error) {
            this.modelInfo.innerHTML = '<p>Error fetching info</p>';
        }
    }

    updateModelInfoForOllama(modelName) {
        this.modelInfo.innerHTML = `
            <p><strong>Status:</strong> Ready to use</p>
            <p><strong>Type:</strong> Ollama</p>
            <p><strong>Model:</strong> ${modelName}</p>
            <p><strong>Server:</strong> ${this.ollamaUrl}</p>
        `;
    }
    async sendMessage() {
        const message = this.chatInput.value.trim();
        if (!message) return;
        
        if (!this.currentModel) {
            this.logToConsole('❌ Load a model first', 'error');
            this.addMessage('Error: Model not loaded. Select and load a model on the left panel first.', 'system');
            return;
        }
        
        // Diagnostic logging
        this.logToConsole(`🔍 Pre-send diagnostics:`, 'info');
        this.logToConsole(`  - Current model: ${this.currentModel}`, 'info');
        this.logToConsole(`  - Connection status: ${this.isConnected ? 'connected' : 'disconnected'}`, 'info');
        this.logToConsole(`  - Message length: ${message.length} chars`, 'info');

        // MemoRAG always enabled
        const useMemoRag = true; // MemoRAG always on
        const chunksCount = this.memoragChunksCount ? parseInt(this.memoragChunksCount.value) : 5;

        // Add user message
        this.addMessage(message, 'user');
        this.chatInput.value = '';
        this.sendBtn.disabled = true;
        this.sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        try {
            if (useMemoRag) {
                // Use MemoRAG for richer context
                await this.sendMessageWithMemoRag(message, chunksCount);
            } else {
                // Use plain streaming generation
                await this.sendMessageStream(message);
            }
        } catch (error) {
            const errorMessage = error.message || error.toString();
            
            // Detailed error logging
            this.logToConsole(`❌ Message send error: ${errorMessage}`, 'error');
            this.logToConsole(`🔍 Error details:`, 'error');
            this.logToConsole(`  - Error type: ${error.name || 'Unknown'}`, 'error');
            this.logToConsole(`  - Error stack: ${error.stack || 'Unavailable'}`, 'error');
            
            // Show user-friendly message
            let userMessage = `Error: ${errorMessage}`;
            
            if (errorMessage.includes('Failed to fetch')) {
                userMessage += '\n💡 Check server connection (http://localhost:8000)';
            } else if (errorMessage.includes('HTTP error')) {
                userMessage += '\n💡 Make sure the model is loaded and the server is running';
            } else if (errorMessage.includes('Model not loaded')) {
                userMessage += '\n💡 Select and load a model on the left panel';
            }
            
            this.addMessage(userMessage, 'system');
        } finally {
            this.sendBtn.disabled = false;
            this.sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
        }
    }
    
    async sendMessageWithMemoRag(message, chunksCount) {
        try {
            // Show MemoRAG analysis indicator
            const loadingMessage = this.addMessage('🤔 Analyzing with MemoRAG...', 'assistant');
            
            // Get relevant docs via MemoRAG
            const contextLength = parseInt(this.memoragContextLength?.value) || 200;
            
            // Get full patient info if selected
            let patientData = null;
            console.log('DEBUG: Patient data check for MemoRAG:', {
                usePatientData: this.usePatientData,
                checked: this.usePatientData?.checked,
                chatPatientSelect: this.chatPatientSelect,
                patientId: this.chatPatientSelect?.value,
                selectOptions: this.chatPatientSelect ? Array.from(this.chatPatientSelect.options).map(opt => ({ value: opt.value, text: opt.text })) : []
            });
            
            // Get current patient selection at send time
            const currentPatientId = this.chatPatientSelect ? this.chatPatientSelect.value : null;
            
            console.log('DEBUG: Current patient selection on send:', {
                currentPatientId: currentPatientId,
                currentPatientIdType: typeof currentPatientId,
                currentPatientIdLength: currentPatientId ? currentPatientId.length : 0,
                isEmpty: !currentPatientId || currentPatientId.trim() === '',
                chatPatientSelectExists: !!this.chatPatientSelect,
                selectedIndex: this.chatPatientSelect ? this.chatPatientSelect.selectedIndex : -1,
                selectedOptionText: this.chatPatientSelect && this.chatPatientSelect.selectedIndex >= 0 ? 
                    this.chatPatientSelect.options[this.chatPatientSelect.selectedIndex]?.textContent : null
            });
            
            // Warn if "include patient" is checked but no patient selected
            if (this.usePatientData && this.usePatientData.checked && (!this.chatPatientSelect || !currentPatientId || currentPatientId.trim() === '')) {
                console.warn('DEBUG: ⚠️ "Include patient data" is checked but no patient selected!');
                
                // Explicit warning to user
                const warningMessage = this.addMessage('⚠️ WARNING: "Include patient data" is enabled, but no patient is selected. Select a patient above so data is added to the prompt.', 'warning');
                setTimeout(() => {
                    if (warningMessage && warningMessage.parentNode) {
                        warningMessage.remove();
                    }
                }, 10000); // Show for 10 seconds
                
                this.logToConsole('⚠️ WARNING: "Include patient data" is enabled but no patient is selected!', 'warning');
                this.logToConsole('   → Select a patient above so patient data is added to the prompt', 'warning');
                this.showNotification('Select a patient from the list. "Include patient data" is enabled but no patient is selected.', 'warning');
            }
            
            if (this.usePatientData && this.usePatientData.checked && this.chatPatientSelect && currentPatientId && currentPatientId.trim() !== '') {
                try {
                    const patientId = parseInt(currentPatientId);
                    
                    // Validate patient ID
                    if (isNaN(patientId) || patientId <= 0) {
                        console.error(`DEBUG: Invalid patient ID: "${currentPatientId}" -> ${patientId}`);
                        this.logToConsole(`❌ Invalid patient ID: "${currentPatientId}". Select a patient from the list.`, 'error');
                        this.showNotification('Select a valid patient from the list!', 'error');
                        return;
                    }
                    
                    console.log(`DEBUG: Loading patient data ID=${patientId} for MemoRAG`);
                    const patientResponse = await this.fetchWithTimeout(`${this.apiBaseUrl}/patients/${patientId}/full`, {}, 10000);
                    
                    console.log('DEBUG: Patient API response:', patientResponse.status, patientResponse.ok);
                    
                    if (patientResponse.ok) {
                        patientData = await patientResponse.json();
                        console.log('DEBUG: Patient data received:', {
                            patient: patientData.patient?.name,
                            documentsCount: patientData.documents?.length,
                            documents: patientData.documents?.map(d => ({ type: d.document_type, contentLength: d.content?.length }))
                        });
                        
                        if (patientData && patientData.patient) {
                            this.logToConsole(`📋 Loaded full patient info: ${patientData.patient.name} (${patientData.documents?.length || 0} documents)`, 'info');
                        } else {
                            console.warn('DEBUG: Patient data received but structure is invalid');
                            this.logToConsole('⚠️ Patient data received but structure is invalid', 'warning');
                        }
                    } else {
                        // Improved error handling
                        let errorDetail = '';
                        try {
                            const errorData = await patientResponse.json();
                            errorDetail = errorData.detail || errorData.message || `HTTP ${patientResponse.status}`;
                        } catch {
                            errorDetail = `HTTP ${patientResponse.status}`;
                        }
                        
                        console.error(`DEBUG: Patient data fetch error: ${patientResponse.status} - ${errorDetail}`);
                        
                        if (patientResponse.status === 404) {
                            this.logToConsole(`❌ Patient ID=${patientId} not found in the database. It may have been deleted or the ID is invalid.`, 'error');
                            this.showNotification(`Patient with ID=${patientId} not found! Updating patient list...`, 'error');
                            // Refresh patient list and clear selection
                            if (this.chatPatientSelect) {
                                this.chatPatientSelect.value = '';
                            }
                            // Reload patient dropdown
                            try {
                                await this.loadPatientsForChat();
                                this.logToConsole('📋 Patient list updated', 'info');
                            } catch (e) {
                                console.error('Error updating patient list:', e);
                            }
                        } else {
                            this.logToConsole(`⚠️ Failed to fetch patient data: ${errorDetail}`, 'warning');
                        }
                    }
                } catch (error) {
                    console.error('DEBUG: Exception loading patient data:', error);
                    this.logToConsole(`❌ Failed to load patient data: ${error.message}`, 'error');
                    this.showNotification(`Error loading patient data: ${error.message}`, 'error');
                }
            } else {
                console.log('DEBUG: Patient data will not be loaded for MemoRAG:', {
                    usePatientDataExists: !!this.usePatientData,
                    usePatientDataChecked: this.usePatientData?.checked,
                    chatPatientSelectExists: !!this.chatPatientSelect,
                    patientSelected: !!currentPatientId,
                    currentPatientId: currentPatientId,
                    reason: !this.usePatientData ? 'usePatientData missing' :
                            !this.usePatientData.checked ? 'checkbox unchecked' :
                            !this.chatPatientSelect ? 'select missing' :
                            !currentPatientId || currentPatientId.trim() === '' ? 'no patient selected' : 'unknown'
                });
            }
            
            const searchResponse = await this.fetchWithTimeout(`${this.apiBaseUrl}/memorag/search`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    query: message,
                    top_k: chunksCount,
                    context_length: contextLength
                })
            });
            
            const searchData = await searchResponse.json();
            
            if (searchResponse.ok && searchData.status === 'success') {
                // Remove loading indicator
                loadingMessage.remove();
                
                // Build correct LLM request structure
                await this.sendMessageWithMemoRagContext(message, searchData, patientData);
                
                // Update MemoRAG stats
                this.updateMemoRagStats();
                
                // Log MemoRAG usage
                const totalDocs = searchData.count + (patientData ? patientData.documents.length : 0);
            this.logToConsole(`🧠 MemoRAG used: ${searchData.count} relevant docs${patientData ? ` + ${patientData.documents.length} patient docs` : ''}`, 'info');
                
                // Show info about found documents in chat
                if (searchData.results && searchData.results.length > 0) {
                    const infoText = `📚 Found ${totalDocs} relevant documents${patientData ? ` (including ${patientData.documents.length} patient docs)` : ''} from MemoRAG`;
                    const infoMessage = this.addMessage(infoText, 'info');
                    // Auto-hide after 3 seconds
                    setTimeout(() => {
                        if (infoMessage && infoMessage.parentNode) {
                            infoMessage.remove();
                        }
                    }, 3000);
                }
                
            } else {
                throw new Error(searchData.detail || 'MemoRAG search error');
            }
        } catch (error) {
            this.logToConsole(`❌ MemoRAG error: ${error.message}`, 'error');
            // Fallback to plain chat
            await this.sendMessageStream(message);
        }
    }

    async sendMessageWithMemoRagContext(userMessage, searchData, patientData = null) {
        // Build LLM request structure:
        // 1. system → system prompt
        // 2. context → patient data (if selected)
        // 3. context → MemoRAG data
        // 4. user → current user question
        
        const messages = [];
        
        // 1. Add system prompt (global role)
        if (this.useSystemPrompt.checked && this.systemPrompt.value.trim()) {
            const systemContent = this.systemPrompt.value.trim();
            messages.push({
                role: 'system',
                content: systemContent
            });
            this.logToConsole(`📋 System prompt applied (${systemContent.length} chars)`, 'info');
        } else {
            this.logToConsole('⚠️ System prompt not applied', 'warning');
        }
        
        // 2. Build patient context (if enabled)
        console.log('DEBUG: Building patient context:', {
            patientDataExists: !!patientData,
            patientExists: !!(patientData?.patient),
            documentsCount: patientData?.documents?.length || 0
        });
        
        if (patientData && patientData.patient) {
            let patientContext = '\n' + '='.repeat(80) + '\n';
            patientContext += 'PATIENT DATA - USE FOR YOUR ANSWER\n';
            patientContext += '='.repeat(80) + '\n\n';
            
            // Add main patient info
            const patient = patientData.patient;
            patientContext += `PATIENT:\n`;
            patientContext += `  Name: ${patient.name}\n`;
            if (patient.age) patientContext += `  Age: ${patient.age} years\n`;
            if (patient.gender) patientContext += `  Gender: ${patient.gender}\n`;
            if (patient.notes) patientContext += `  Notes: ${patient.notes}\n`;
            patientContext += `  Created: ${new Date(patient.created_at).toLocaleDateString()}\n\n`;
            
            // Add patient documents
            if (patientData.documents && patientData.documents.length > 0) {
                patientContext += `MEDICAL DOCUMENTS (${patientData.documents.length} documents):\n\n`;
                patientContext += `ATTENTION: These documents may contain data for outcome assessment!\n`;
                patientContext += `Look in each document for:\n`;
                patientContext += `  1. NPS (polyp score 0-8) - polyp mentions, polyp scores, severity\n`;
                patientContext += `  2. SNOT-22 (0-110) - SNOT-22 questionnaires, symptom scores\n`;
                patientContext += `  3. CRS control (EPOS 2020) - rhinosinusitis, CRS, control\n`;
                patientContext += `  4. T2 inflammation - eosinophils (EOS), IgE, FeNO, asthma, AERD\n`;
                patientContext += `  5. ACT (asthma control ≤19/20-24/25) - ACT questionnaires\n`;
                patientContext += `  6. Any numbers, scores, labs, examinations\n\n`;
                
                patientData.documents.forEach((doc, index) => {
                    const content = (doc && typeof doc.content === 'string') ? this.stripEmptyLines(doc.content) : '';
                    patientContext += `\n[DOCUMENT ${index + 1}/${patientData.documents.length}] Type: ${doc.document_type}\n`;
                    patientContext += (content ? content + '\n' : '[Document content missing]\n');
                });
                
                console.log(`DEBUG: Added ${patientData.documents.length} patient documents to prompt`);
                patientContext += '\nINSTRUCTIONS FOR USING DOCUMENTS:\n';
                patientContext += '1. Read ALL documents above VERY CAREFULLY\n';
                patientContext += '2. Find MENTIONS of: NPS, SNOT-22, eosinophils, IgE, FeNO, asthma, ACT\n';
                patientContext += '3. Find NUMBERS and SCORES that may relate to assessment\n';
                patientContext += '4. Find DIAGNOSES: rhinosinusitis, CRS, polyps, asthma\n';
                patientContext += '5. Find LAB RESULTS: eosinophils, leukocytes, IgE\n';
                patientContext += '6. Find QUESTIONNAIRES: SNOT-22, ACT, NOSE\n';
                patientContext += '7. If you find data - use it EXACTLY as in the document\n';
                patientContext += '8. If no data - write "no data for assessment"\n';
                patientContext += '9. Do NOT invent data; use ONLY the documents above!\n\n';
            } else {
                console.log('DEBUG: Patient has no documents');
                patientContext += `ATTENTION: Patient has no uploaded documents.\n\n`;
            }
            
            patientContext += '='.repeat(80) + '\n\n';
            
            const patientContextLength = patientContext.length;
            console.log(`DEBUG: Patient context built: ${patientContextLength} chars`);
            console.log(`DEBUG: Patient context preview (first 500 chars):\n${patientContext.substring(0, 500)}...`);
            
            messages.push({
                role: 'user',
                content: patientContext
            });
            
            this.logToConsole(`📋 Patient data added to prompt: ${patient.name} (${patientData.documents?.length || 0} documents, ${patientContextLength} chars)`, 'info');
        } else {
            console.warn('DEBUG: Patient data NOT added to prompt:', {
                patientData: patientData,
                patientExists: !!(patientData?.patient),
                reason: !patientData ? 'patientData is null' : !patientData.patient ? 'patient is missing' : 'unknown'
            });
            this.logToConsole('⚠️ Patient data not added to prompt (missing or not selected)', 'warning');
        }
        
        // 3. Build MemoRAG context
        let memoragContext = '';
        let hasMemoRagData = false;
        
        console.log('DEBUG: Checking MemoRAG data:', {
            searchDataExists: !!searchData,
            searchDataStatus: searchData?.status,
            resultsExists: !!searchData?.results,
            resultsLength: searchData?.results?.length || 0,
            memoryContextExists: !!searchData?.memory_context,
            memoryContextLength: searchData?.memory_context?.length || 0,
            cluesExists: !!searchData?.clues_used,
            cluesLength: searchData?.clues_used?.length || 0
        });
        
        if (searchData && searchData.results && searchData.results.length > 0) {
            hasMemoRagData = true;
            memoragContext = '='.repeat(80) + '\n';
            memoragContext += 'KNOWLEDGE BASE FRAGMENTS (MemoRAG) - USE FOR YOUR ANSWER\n';
            memoragContext += '='.repeat(80) + '\n\n';
            
            // Add search clues first (most important for search context)
            if (searchData.clues_used && searchData.clues_used.length > 0) {
                memoragContext += '-'.repeat(80) + '\n';
                memoragContext += `🔍 MEMORAG SEARCH CLUES (${searchData.clues_used.length} clues):\n`;
                memoragContext += '-'.repeat(80) + '\n';
                memoragContext += 'These clues were auto-generated by MemoRAG to improve search.\n';
                memoragContext += 'They show which keywords and concepts were used for the search.\n\n';
                searchData.clues_used.forEach((clue, index) => {
                    memoragContext += `  Clue ${index + 1}: ${clue}\n`;
                });
                memoragContext += '\n' + '-'.repeat(80) + '\n\n';
                console.log(`DEBUG: Added ${searchData.clues_used.length} clues`);
            }
            
            // Add memory context if present
            if (searchData.memory_context && searchData.memory_context.length > 0) {
                memoragContext += '-'.repeat(80) + '\n';
                memoragContext += `💾 MEMORAG MEMORY CONTEXT (${searchData.memory_context.length} snippets):\n`;
                memoragContext += '-'.repeat(80) + '\n';
                memoragContext += 'Saved MemoRAG facts and concepts from previous requests.\n\n';
                searchData.memory_context.forEach((ctx, index) => {
                    memoragContext += `  Snippet ${index + 1}: ${ctx}\n`;
                });
                memoragContext += '\n' + '-'.repeat(80) + '\n\n';
                console.log(`DEBUG: Added ${searchData.memory_context.length} memory snippets`);
            }
            
            // Add MemoRAG result documents
            memoragContext += '-'.repeat(80) + '\n';
            memoragContext += `📄 RELEVANT DOCUMENTS FROM KNOWLEDGE BASE (${searchData.results.length} documents):\n`;
            memoragContext += '-'.repeat(80) + '\n';
            memoragContext += 'Documents found by MemoRAG using the clues above.\n\n';
            searchData.results.forEach((result, index) => {
                memoragContext += `[DOCUMENT ${index + 1}/${searchData.results.length}]\n`;
                if (result.score !== undefined) {
                    memoragContext += `Relevance: ${(result.score * 100).toFixed(1)}%\n`;
                }
                memoragContext += `${result.document}\n\n`;
            });
            console.log(`DEBUG: Added ${searchData.results.length} MemoRAG documents`);
            
            memoragContext += '='.repeat(80) + '\n';
            memoragContext += 'END OF KNOWLEDGE BASE FRAGMENTS (MemoRAG)\n';
            memoragContext += '='.repeat(80) + '\n\n';
            
            const memoragContextLength = memoragContext.length;
            console.log(`DEBUG: MemoRAG context built: ${memoragContextLength} chars`);
            console.log(`DEBUG: MemoRAG context preview (first 500 chars):\n${memoragContext.substring(0, 500)}...`);
            
            // Add MemoRAG context as separate message
            messages.push({
                role: 'user',
                content: memoragContext
            });
            
            this.logToConsole(`📚 MemoRAG data added to prompt: ${searchData.results.length} documents (${memoragContextLength} chars)`, 'info');
        } else {
            console.warn('DEBUG: MemoRAG data NOT found or empty:', {
                searchData: searchData,
                hasResults: !!searchData?.results,
                resultsLength: searchData?.results?.length || 0
            });
            this.logToConsole('⚠️ MemoRAG returned no documents for the query', 'warning');
        }
        
        // 4. Add chat history (recent messages)
        if (this.chatHistory.length > 0) {
            let historyContext = '<<<Chat history>>>\n\n';
            const recentHistory = this.chatHistory.slice(-10); // Last 10 messages
            recentHistory.forEach((msg, index) => {
                historyContext += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n\n`;
            });
            messages.push({
                role: 'user',
                content: historyContext
            });
        }
        
            // 5. Add user question with explicit reminder
            // Match batch mode format (backend _format_final_user_message)
            let finalUserMessage = userMessage;
            if (patientData && patientData.patient) {
                finalUserMessage = "\n" + "=".repeat(80) + "\n";
                finalUserMessage += "IMPORTANT: ABOVE IN THIS PROMPT THERE IS A \"PATIENT DATA - USE FOR YOUR ANSWER\" BLOCK!\n";
                finalUserMessage += "YOU MUST USE THAT DATA TO ANSWER!\n";
                finalUserMessage += "=".repeat(80) + "\n\n";
                finalUserMessage += `USER QUESTION:\n${userMessage}\n\n`;
                finalUserMessage += "ANSWER THE QUESTION USING THE PATIENT DATA FROM THE \"PATIENT DATA\" BLOCK ABOVE!";
            }
            
            messages.push({
                role: 'user',
                content: finalUserMessage
            });
            
            console.log(`DEBUG: Final user message: ${finalUserMessage.length} chars`);
            console.log(`DEBUG: Final message preview (first 500 chars):\n${finalUserMessage.substring(0, 500)}...`);
        
        // Log prompt structure for debugging
        this.logToConsole('📝 Prompt structure (total messages): ' + messages.length, 'info');
        let hasPatientData = false;
        let hasMemoRagDataInPrompt = false;
        let patientDataMessageIndex = -1;
        let patientDataPreview = '';
        
        messages.forEach((msg, index) => {
            let preview = msg.content;
            if (preview.length > 200) {
                preview = preview.substring(0, 200) + '...';
            }
            
            // Determine message type for logging
            let messageType = msg.role;
            if (msg.content.includes('PATIENT DATA') || msg.content.includes('Patient data')) {
                messageType = 'patient-data';
                hasPatientData = true;
                patientDataMessageIndex = index;
                patientDataPreview = msg.content.substring(0, 300) + '...';
            } else if (msg.content.includes('<<<Knowledge base fragments>>>') || msg.content.includes('KNOWLEDGE BASE FRAGMENTS')) {
                messageType = 'knowledge-base-memorag';
                hasMemoRagDataInPrompt = true;
            } else if (msg.content.includes('<<<Chat history>>>')) {
                messageType = 'chat-history';
            }
            
            console.log(`DEBUG: Message ${index + 1} [${messageType}]:`, {
                role: msg.role,
                contentLength: msg.content.length,
                preview: preview.substring(0, 100),
                hasMemoRagMarker: msg.content.includes('KNOWLEDGE BASE FRAGMENTS') || msg.content.includes('<<<Knowledge base fragments>>>'),
                hasPatientMarker: msg.content.includes('PATIENT DATA') || msg.content.includes('Patient data')
            });
            
            this.logToConsole(`  ${index + 1}. [${messageType}] Length: ${msg.content.length} chars`, 'info');
            if (messageType === 'patient-data') {
                this.logToConsole(`     Preview: ${preview.substring(0, 150)}...`, 'info');
            } else if (messageType === 'knowledge-base-memorag') {
                this.logToConsole(`     MemoRAG preview: ${preview.substring(0, 150)}...`, 'info');
            }
        });
        
        // Check patient data presence
        if (hasPatientData) {
            this.logToConsole(`✅ ✓ ✓ ✓ Patient data present in prompt ✓ ✓ ✓`, 'success');
            this.logToConsole(`   Position in prompt: message #${patientDataMessageIndex + 1} of ${messages.length}`, 'info');
            this.logToConsole(`   Preview: ${patientDataPreview}`, 'info');
            console.log(`DEBUG: ✓ ✓ ✓ Patient data found in prompt at position ${patientDataMessageIndex} ✓ ✓ ✓`);
        } else {
            this.logToConsole('❌ ⚠ ⚠ ⚠ Patient data NOT found in prompt ⚠ ⚠ ⚠', 'error');
            console.error('DEBUG: ❌ ❌ ❌ Patient data NOT found in prompt ❌ ❌ ❌');
            console.error('DEBUG: Check:', {
                patientDataReceived: !!patientData,
                patientExists: !!(patientData?.patient),
                documentsCount: patientData?.documents?.length || 0,
                messagesCount: messages.length,
                allMessages: messages.map((m, i) => ({ index: i, role: m.role, contentPreview: m.content.substring(0, 100) }))
            });
        }
        
        // Check MemoRAG data presence
        if (hasMemoRagDataInPrompt) {
            this.logToConsole('✅ ✓ ✓ ✓ MemoRAG data present in prompt ✓ ✓ ✓', 'success');
            console.log('DEBUG: ✓ ✓ ✓ MemoRAG data found in prompt ✓ ✓ ✓');
        } else {
            this.logToConsole('❌ ⚠ ⚠ ⚠ MemoRAG data NOT found in prompt ⚠ ⚠ ⚠', 'error');
            console.error('DEBUG: ❌ ❌ ❌ MemoRAG data NOT found in prompt ❌ ❌ ❌');
            console.error('DEBUG: Check:', {
                searchDataReceived: !!searchData,
                searchDataStatus: searchData?.status,
                resultsCount: searchData?.results?.length || 0,
                hasMemoRagData: hasMemoRagData
            });
        }
        
        // Send request with correct structure
        await this.sendMessageStreamWithStructure(messages);
    }

    async sendMessageStreamWithStructure(messages) {
        // Check model state before sending
        if (!this.currentModel) {
            throw new Error('Model not loaded. Load a model first.');
        }
        
        // Verify patient data is in messages before sending
        let hasPatientDataInMessages = false;
        messages.forEach((msg, idx) => {
            const contentUpper = msg.content.toUpperCase();
            if (contentUpper.includes('PATIENT DATA') || 
                contentUpper.includes('MEDICAL DOCUMENTS') ||
                (contentUpper.includes('PATIENT:') && contentUpper.includes('DOCUMENT'))) {
                hasPatientDataInMessages = true;
                console.log(`DEBUG: ✓ Patient data found in message ${idx}, length: ${msg.content.length}`);
            }
        });
        
        if (hasPatientDataInMessages) {
            console.log('DEBUG: ✓ ✓ ✓ Patient data confirmed before sending to server ✓ ✓ ✓');
            this.logToConsole('✓ Patient data confirmed before sending', 'success');
        } else {
            console.error('DEBUG: ❌ ❌ ❌ CRITICAL: Patient data NOT found in messages before sending ❌ ❌ ❌');
            console.error('DEBUG: Message structure:', messages.map((m, i) => ({
                index: i,
                role: m.role,
                contentLength: m.content.length,
                preview: m.content.substring(0, 100)
            })));
            this.logToConsole('❌ WARNING: Patient data not found in messages before sending!', 'error');
        }
        
        // Send request to LLM with prepared message structure
        const requestData = {
            model: this.currentModel,
            messages: messages,
            max_tokens: parseInt(this.maxTokens?.value || '2000', 10),
            temperature: parseFloat(this.temperature.value),
            top_p: parseFloat(this.topP.value),
            top_k: parseInt(this.topK.value),
            stream: true
        };
        
        // Use unified API for all models
        const url = `${this.apiBaseUrl}/v1/chat/completions`;
        
        // Format prompt for display (as sent to Ollama)
        const formattedPrompt = this.formatMessagesForOllama(messages);
        
        // Check MemoRAG and patient data in final prompt
        const hasMemoRagInFinalPrompt = formattedPrompt.includes('KNOWLEDGE BASE FRAGMENTS') || 
                                         formattedPrompt.includes('<<<Knowledge base fragments>>>') ||
                                         formattedPrompt.includes('RELEVANT DOCUMENTS FROM KNOWLEDGE BASE') ||
                                         formattedPrompt.includes('Relevant documents:');
        const hasPatientDataInFinalPrompt = formattedPrompt.includes('PATIENT DATA') || 
                                            formattedPrompt.includes('Patient data') ||
                                            formattedPrompt.includes('MEDICAL DOCUMENTS');
        
        // Detailed prompt structure logging
        console.log('='.repeat(80));
        console.log('📝 FULL PROMPT FOR OLLAMA (FINAL CHECK):');
        console.log('='.repeat(80));
        console.log(`Prompt length: ${formattedPrompt.length} chars`);
        console.log(`Message count: ${messages.length}`);
        console.log(`✓ Patient data in prompt: ${hasPatientDataInFinalPrompt ? 'YES ✓' : 'NO ❌'}`);
        console.log(`✓ MemoRAG data in prompt: ${hasMemoRagInFinalPrompt ? 'YES ✓' : 'NO ❌'}`);
        console.log('='.repeat(80));
        
        if (hasMemoRagInFinalPrompt) {
            const memoragIndex = formattedPrompt.search(/KNOWLEDGE BASE FRAGMENTS|<<<Knowledge base fragments>>>/);
            if (memoragIndex !== -1) {
                const memoragPreview = formattedPrompt.substring(memoragIndex, memoragIndex + 500);
                console.log('DEBUG: MemoRAG data preview in prompt:');
                console.log(memoragPreview);
            }
        } else {
            console.warn('DEBUG: ⚠️ MemoRAG data NOT found in final prompt!');
        }
        
        if (hasPatientDataInFinalPrompt) {
            const patientIndex = formattedPrompt.search(/PATIENT DATA|Patient data/);
            if (patientIndex !== -1) {
                const patientPreview = formattedPrompt.substring(patientIndex, patientIndex + 500);
                console.log('DEBUG: Patient data preview in prompt:');
                console.log(patientPreview);
            }
        }
        
        console.log('='.repeat(80));
        console.log('📝 FULL PROMPT:');
        console.log('='.repeat(80));
        console.log(formattedPrompt);
        console.log('='.repeat(80));
        
        this.logToConsole(`📝 Full prompt for Ollama (${formattedPrompt.length} chars):`, 'info');
        
        if (hasMemoRagInFinalPrompt) {
            this.logToConsole('✅ MemoRAG data found in final prompt ✓', 'success');
        } else {
            this.logToConsole('❌ MemoRAG data NOT found in final prompt ⚠️', 'error');
        }
        
        if (hasPatientDataInFinalPrompt) {
            this.logToConsole('✅ Patient data found in final prompt ✓', 'success');
        } else {
            this.logToConsole('❌ Patient data NOT found in final prompt ⚠️', 'warning');
        }
        
        // Show prompt in UI if container exists
        if (this.promptPreviewContainer && this.promptPreviewText) {
            this.promptPreviewText.value = formattedPrompt;
            this.promptPreviewContainer.style.display = 'block';
            console.log('DEBUG: Prompt displayed in UI');
        } else {
            const promptPreviewContainer = document.getElementById('promptPreviewContainer');
            const promptPreviewText = document.getElementById('promptPreviewText');
            if (promptPreviewContainer && promptPreviewText) {
                promptPreviewText.value = formattedPrompt;
                promptPreviewContainer.style.display = 'block';
                console.log('DEBUG: Prompt displayed in UI (fallback)');
            }
        }
        
        const promptPreview = formattedPrompt.substring(0, 500);
        this.logToConsole(`   ${promptPreview}...`, 'info');
        this.logToConsole(`   (Full prompt is also shown above and in the browser console (F12))`, 'info');
        
        console.log('Sending request with MemoRAG context:', { url, requestData });
        this.logToConsole(`📤 Sending request to model: ${this.currentModel}`, 'info');
        
        const assistantMessageElement = this.addMessage('', 'assistant');
        this.isStreaming = true;
        
        try {
            // Send POST request for stream
            const response = await this.fetchWithTimeout(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestData)
            });
            
            console.log('Response received:', response.status, response.statusText);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Response error:', errorText);
                throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
            }
            
            // Process stream
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop(); // Keep incomplete line
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            console.log('SSE chunk received:', data);
                            this.handleStreamEvent(data, assistantMessageElement);
                        } catch (e) {
                            console.warn('SSE parse error:', e, 'Line:', line);
                        }
                    }
                }
            }
            
        } catch (error) {
            console.error('Stream generation error:', error);
            assistantMessageElement.querySelector('.message-content').textContent = `Error: ${error.message}`;
        } finally {
            this.isStreaming = false;
        }
    }
    async sendMessageStream(message) {
        const messages = [];
        
        // Add system prompt if enabled (from System Prompt field, unchanged)
        if (this.useSystemPrompt.checked && this.systemPrompt.value.trim()) {
            const systemContent = this.systemPrompt.value.trim();
            messages.push({
                role: 'system',
                content: systemContent
            });
            this.logToConsole(`📋 System prompt applied (${systemContent.length} chars)`, 'info');
            console.log('DEBUG: sendMessageStream - system prompt:', {
                length: systemContent.length,
                preview: systemContent.substring(0, 200)
            });
        } else {
            this.logToConsole('⚠️ System prompt not applied', 'warning');
        }
        
        // Add patient data if enabled
        console.log('DEBUG: Patient data check:', {
            usePatientData: this.usePatientData,
            checked: this.usePatientData?.checked,
            chatPatientSelect: this.chatPatientSelect,
            patientId: this.chatPatientSelect?.value
        });
        
        if (this.usePatientData && this.usePatientData.checked && this.chatPatientSelect && this.chatPatientSelect.value) {
            try {
                const patientIdValue = this.chatPatientSelect.value;
                const patientId = parseInt(patientIdValue);
                
                // Validate patient ID
                if (isNaN(patientId) || patientId <= 0) {
                    console.error(`DEBUG: Invalid patient ID: "${patientIdValue}" -> ${patientId}`);
                    this.logToConsole(`❌ Invalid patient ID: "${patientIdValue}". Select a patient from the list.`, 'error');
                    this.showNotification('Select a valid patient from the list!', 'error');
                    // Continue without patient data
                } else {
                    console.log(`DEBUG: Loading patient data ID=${patientId}`);
                    const patientResponse = await this.fetchWithTimeout(`${this.apiBaseUrl}/patients/${patientId}/full`, {}, 10000);
                    
                    if (patientResponse.ok) {
                        const patientData = await patientResponse.json();
                        console.log('DEBUG: Patient data received:', {
                            patient: patientData.patient?.name,
                            documentsCount: patientData.documents?.length
                        });
                        
                        if (patientData && patientData.patient) {
                        // Same format as MemoRAG for consistency
                        let patientContext = '\n' + '='.repeat(80) + '\n';
                        patientContext += 'PATIENT DATA - USE FOR YOUR ANSWER\n';
                        patientContext += '='.repeat(80) + '\n\n';
                        
                        const patient = patientData.patient;
                        patientContext += `PATIENT:\n`;
                        patientContext += `  Name: ${patient.name}\n`;
                        if (patient.age) patientContext += `  Age: ${patient.age} years\n`;
                        if (patient.gender) patientContext += `  Gender: ${patient.gender}\n`;
                        if (patient.notes) patientContext += `  Notes: ${patient.notes}\n`;
                        patientContext += `  Created: ${new Date(patient.created_at).toLocaleDateString()}\n\n`;
                        
                        if (patientData.documents && patientData.documents.length > 0) {
                            patientContext += `MEDICAL DOCUMENTS (${patientData.documents.length} documents):\n\n`;
                            patientContext += `ATTENTION: These documents may contain data for outcome assessment!\n`;
                            patientContext += `Look in each document for:\n`;
                            patientContext += `  1. NPS (polyp score 0-8) - polyp mentions, polyp scores, severity\n`;
                            patientContext += `  2. SNOT-22 (0-110) - SNOT-22 questionnaires, symptom scores\n`;
                            patientContext += `  3. CRS control (EPOS 2020) - rhinosinusitis, CRS, control\n`;
                            patientContext += `  4. T2 inflammation - eosinophils (EOS), IgE, FeNO, asthma, AERD\n`;
                            patientContext += `  5. ACT (asthma control ≤19/20-24/25) - ACT questionnaires\n`;
                            patientContext += `  6. Any numbers, scores, labs, examinations\n\n`;
                            
                            patientData.documents.forEach((doc, index) => {
                                const content = (doc && typeof doc.content === 'string') ? this.stripEmptyLines(doc.content) : '';
                                patientContext += `\n[DOCUMENT ${index + 1}/${patientData.documents.length}] Type: ${doc.document_type}\n`;
                                patientContext += (content ? content + '\n' : '[Document content missing]\n');
                            });
                            
                            patientContext += '\nINSTRUCTIONS FOR USING DOCUMENTS:\n';
                            patientContext += '1. Read ALL documents above VERY CAREFULLY\n';
                            patientContext += '2. Find MENTIONS of: NPS, SNOT-22, eosinophils, IgE, FeNO, asthma, ACT\n';
                            patientContext += '3. Find NUMBERS and SCORES that may relate to assessment\n';
                            patientContext += '4. Find DIAGNOSES: rhinosinusitis, CRS, polyps, asthma\n';
                            patientContext += '5. Find LAB RESULTS: eosinophils, leukocytes, IgE\n';
                            patientContext += '6. Find QUESTIONNAIRES: SNOT-22, ACT, NOSE\n';
                            patientContext += '7. If you find data - use it EXACTLY as in the document\n';
                            patientContext += '8. If no data - write "no data for assessment"\n';
                            patientContext += '9. Do NOT invent data; use ONLY the documents above!\n\n';
                        } else {
                            patientContext += `ATTENTION: Patient has no uploaded documents.\n\n`;
                        }
                        
                        patientContext += '='.repeat(80) + '\n\n';
                        
                        messages.push({
                            role: 'user',
                            content: patientContext
                        });
                        
                        console.log(`DEBUG: Patient data added to prompt (${patientContext.length} chars)`);
                        console.log(`DEBUG: Patient context preview (first 500 chars):\n${patientContext.substring(0, 500)}...`);
                        this.logToConsole(`📋 Patient data added to prompt: ${patient.name} (${patientData.documents?.length || 0} documents, ${patientContext.length} chars)`, 'info');
                        } else {
                            console.warn('DEBUG: Patient data received but structure is invalid');
                            this.logToConsole('⚠️ Patient data received but patient info is missing', 'warning');
                        }
                    } else {
                        // Improved error handling
                        let errorDetail = '';
                        try {
                            const errorData = await patientResponse.json();
                            errorDetail = errorData.detail || errorData.message || `HTTP ${patientResponse.status}`;
                        } catch {
                            errorDetail = `HTTP ${patientResponse.status}`;
                        }
                        
                        console.error(`DEBUG: Failed to fetch patient data: ${patientResponse.status} - ${errorDetail}`);
                        
                        if (patientResponse.status === 404) {
                            this.logToConsole(`❌ Patient ID=${patientId} not found in the database. It may have been deleted or the ID is invalid.`, 'error');
                            this.showNotification(`Patient ID=${patientId} not found. Refreshing patient list...`, 'error');
                            if (this.chatPatientSelect) {
                                this.chatPatientSelect.value = '';
                            }
                            try {
                                await this.loadPatientsForChat();
                                this.logToConsole('📋 Patient list updated', 'info');
                            } catch (e) {
                                console.error('Error updating patient list:', e);
                            }
                        } else {
                            this.logToConsole(`⚠️ Failed to fetch patient data: ${errorDetail}`, 'warning');
                        }
                    }
                }
            } catch (error) {
                console.error('DEBUG: Exception while loading patient data:', error);
                this.logToConsole(`❌ Failed to load patient data: ${error.message}`, 'error');
                this.showNotification(`Failed to load patient data: ${error.message}`, 'error');
            }
        } else {
            console.log('DEBUG: Patient data will not be loaded:', {
                usePatientDataExists: !!this.usePatientData,
                usePatientDataChecked: this.usePatientData?.checked,
                chatPatientSelectExists: !!this.chatPatientSelect,
                patientSelected: !!this.chatPatientSelect?.value
            });
        }
        
        // Add chat history AFTER patient data (so it doesn't override it)
        if (this.chatHistory.length > 0) {
            const recentHistory = this.chatHistory.slice(-10); // Last 10 messages
            recentHistory.forEach(msg => {
                messages.push({
                    role: msg.role,
                    content: msg.content
                });
            });
        }
        
        // Add current user message with explicit patient-data reminder
        let finalMessage = message;
        if (messages.some(msg => msg.content && msg.content.includes('PATIENT DATA'))) {
            finalMessage = `\n${'='.repeat(80)}\n`;
            finalMessage += `IMPORTANT: ABOVE IN THIS PROMPT THERE IS A "PATIENT DATA - USE FOR YOUR ANSWER" BLOCK!\n`;
            finalMessage += `YOU MUST USE THAT DATA TO ANSWER!\n`;
            finalMessage += `${'='.repeat(80)}\n\n`;
            finalMessage += `USER QUESTION:\n${message}\n\n`;
            finalMessage += `ANSWER THE QUESTION USING THE PATIENT DATA FROM THE "PATIENT DATA" BLOCK ABOVE!`;
            
            console.log(`DEBUG: Patient data detected in prompt, adding explicit reminder to final message`);
        }
        
        messages.push({
            role: 'user',
            content: finalMessage
        });
        
        console.log(`DEBUG: Final message added: ${finalMessage.length} chars`);
        
        const requestData = {
            model: this.currentModel,
            messages: messages,
            max_tokens: parseInt(this.maxTokens?.value || '2000', 10),
            temperature: parseFloat(this.temperature.value),
            top_p: parseFloat(this.topP.value),
            top_k: parseInt(this.topK.value),
            stream: true
        };
        
        const url = `${this.apiBaseUrl}/v1/chat/completions`;
        
        console.log('Sending request:', { url, requestData });
        
        const assistantMessageElement = this.addMessage('', 'assistant');
        this.isStreaming = true;
        
        try {
            // Send POST request for stream
            const response = await this.fetchWithTimeout(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestData)
            });
            
            console.log('Response received:', response.status, response.statusText);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Response error:', errorText);
                throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
            }
            
            // Process stream
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop(); // Keep incomplete line
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            console.log('SSE chunk received:', data);
                            this.handleStreamEvent(data, assistantMessageElement);
                        } catch (e) {
                            console.warn('SSE parse error:', e, 'Line:', line);
                        }
                    }
                }
            }
            
        } catch (error) {
            console.error('Stream generation error:', error);
            assistantMessageElement.querySelector('.message-content').textContent = `Error: ${error.message}`;
        } finally {
            this.isStreaming = false;
        }
    }
    
    handleStreamEvent(data, messageElement) {
        const contentElement = messageElement.querySelector('.entry-content');
        
        if (!contentElement) {
            console.error('.entry-content element not found in message:', messageElement);
        this.logToConsole('❌ Error: message content element not found', 'error');
            return;
        }
        
        console.log('Processing event:', data.type, data);
        console.log('Full event data:', JSON.stringify(data, null, 2));
        this.logToConsole(`📡 Stream event: ${data.type}`, 'info');
        
        switch (data.type) {
            case 'start':
                contentElement.textContent = '';
                console.log('Generation started');
                
                // Check if model is heavy
                if (data.heavy_model) {
                    contentElement.textContent = data.message || 'Loading a heavy model, this may take a while...';
                    this.logToConsole(`🐌 Heavy model: ${data.message || 'Loading...'}`, 'info');
                }
                
                this.streamingIndicator.style.display = 'flex';
                this.scrollToBottom();
                break;
                
            case 'chunk':
                contentElement.textContent += data.content;
                console.log('Chunk added:', data.content);
                
                const lastMessage = this.chatHistory[this.chatHistory.length - 1];
                if (lastMessage && lastMessage.role === 'assistant') {
                    lastMessage.content = contentElement.textContent;
                }
                this.scrollToBottom();
                break;
                
            case 'end':
                console.log('Stream generation complete');
                this.streamingIndicator.style.display = 'none';
                
                if (data.full_response) {
                    contentElement.textContent = data.full_response;
                    console.log('Full response set:', data.full_response);
                    console.log('Content element:', contentElement);
                    console.log('Current element text:', contentElement.textContent);
                    
                    const lastMessage = this.chatHistory[this.chatHistory.length - 1];
                    if (lastMessage && lastMessage.role === 'assistant') {
                        lastMessage.content = data.full_response;
                        console.log('Chat history updated with full response');
                    }
                } else {
                    console.log('Full response not found in data:', data);
                    
                    const lastMsg = this.chatHistory[this.chatHistory.length - 1];
                    if (lastMsg && lastMsg.role === 'assistant') {
                        lastMsg.content = contentElement.textContent;
                        console.log('Chat history updated with element content:', contentElement.textContent);
                    }
                }
                this.scrollToBottom();
                break;
            
            default:
                break;
        }
    }
    
    formatMessagesForOllama(messages) {
        // Format messages for Ollama
        let prompt = '';
        for (const message of messages) {
            if (message.role === 'system') {
                prompt += `System: ${message.content}\n`;
            } else if (message.role === 'user') {
                prompt += `User: ${message.content}\n`;
            } else if (message.role === 'assistant') {
                prompt += `Assistant: ${message.content}\n`;
            }
        }
        prompt += 'Assistant:';
        return prompt;
    }

    async sendMessageToLocalAPI(message) {
        // Show full prompt in preview
        // Build messages and strip only empty lines
        const previewMessages = this.buildMessages(message).map(m => ({
            ...m,
            content: this.stripEmptyLines(m.content)
        }));
        this.showFullPromptPreview(previewMessages);

        const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        const response = await this.fetchWithTimeout(`${this.apiBaseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: this.currentModel,
                messages: previewMessages,
                max_tokens: parseInt(this.maxTokens?.value || '2000', 10),
                temperature: parseFloat(this.temperature.value),
                top_p: parseFloat(this.topP.value),
                top_k: parseInt(this.topK.value)
            })
        }, 30000); // 30 s for text generation
        const t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        const ms = Math.round(t1 - t0);
        try { this.logToConsole(`⏱️ Chat LocalAPI: ${ms} ms`, 'info'); } catch(_) { console.log('Chat LocalAPI ms=', ms); }
        const data = await response.json();
        
        if (response.ok) {
            const assistantMessage = data.choices[0].message.content;
            this.addMessage(assistantMessage, 'assistant');
            this.logToConsole(`Response received (${data.usage.total_tokens} tokens)`, 'success');
        } else {
            this.addMessage(`Error: ${data.detail}`, 'system');
            this.logToConsole(`API error: ${data.detail}`, 'error');
        }
    }

    // Unified chat-compatible request with arbitrary messages and configurable timeout
    async requestChatCompletions(messages, timeoutMs = 300000) {
        const payload = {
            model: this.currentModel,
            messages: messages,
            max_tokens: parseInt(this.maxTokens?.value) || 1000,
            temperature: parseFloat(this.temperature?.value) || 0.7,
            top_p: parseFloat(this.topP?.value) || 0.9,
            top_k: parseInt(this.topK?.value) || 50
        };
        const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        const resp = await this.fetchWithTimeout(`${this.apiBaseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }, timeoutMs);
        const t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        const ms = Math.round(t1 - t0);
        try { this.logToConsole(`⏱️ requestChatCompletions: ${ms} ms`, 'info'); } catch(_) {}
        return resp;
    }

    // Streaming chat-compatible call (OpenAI-like stream), collects full response into string
    async requestChatCompletionsStream(messages, timeoutMs = 300000) {
        const controller = new AbortController();
        const to = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const resp = await fetch(`${this.apiBaseUrl}/v1/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.currentModel,
                    messages,
                    stream: true,
                    max_tokens: parseInt(this.maxTokens?.value) || 1000,
                    temperature: parseFloat(this.temperature?.value) || 0.7,
                    top_p: parseFloat(this.topP?.value) || 0.9,
                    top_k: parseInt(this.topK?.value) || 50
                }),
                signal: controller.signal
            });
            if (!resp.ok || !resp.body) {
                const txt = await resp.text().catch(()=> '');
                throw new Error(`HTTP ${resp.status} ${txt}`);
            }
            const reader = resp.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let result = '';
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                // Parse SSE: lines like "data: {...}"
                const lines = chunk.split(/\r?\n/);
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith('data:')) continue;
                    const payload = trimmed.substring(5).trim();
                    if (payload === '[DONE]') continue;
                    try {
                        const json = JSON.parse(payload);
                        const delta = json?.choices?.[0]?.delta?.content || '';
                        if (delta) result += delta;
                    } catch (_) {}
                }
            }
            return result;
        } finally {
            clearTimeout(to);
        }
    }

    // Streaming Ollama call, collects full response (via /ollama/generate with stream=true)
    async requestOllamaGenerateStream(fullPrompt, timeoutMs = 300000) {
        const controller = new AbortController();
        const to = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const resp = await fetch(`${this.apiBaseUrl}/ollama/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: (this.currentModel || '').replace('ollama:', ''),
                    prompt: fullPrompt,
                    stream: true,
                    temperature: parseFloat(this.temperature?.value) || 0.7,
                    top_p: parseFloat(this.topP?.value) || 0.9,
                    top_k: parseInt(this.topK?.value) || 50,
                    num_predict: parseInt(this.maxTokens?.value) || 1000
                }),
                signal: controller.signal
            });
            if (!resp.ok || !resp.body) {
                const txt = await resp.text().catch(()=> '');
                throw new Error(`HTTP ${resp.status} ${txt}`);
            }
            const reader = resp.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let result = '';
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                // Backend response for Ollama stream must contain JSON lines with response field
                const lines = chunk.split(/\r?\n/).filter(Boolean);
                for (const line of lines) {
                    try {
                        const json = JSON.parse(line);
                        const piece = json?.response || json?.text || '';
                        if (piece) result += piece;
                    } catch (_) {}
                }
            }
            return result;
        } finally {
            clearTimeout(to);
        }
    }

    // Unified Ollama generate call (as in chat), without adding messages to UI
    async requestOllamaGenerate(fullPrompt, timeoutMs = 300000) {
        const modelName = (this.currentModel || '').replace('ollama:', '');
        const payload = {
            model: modelName,
            prompt: fullPrompt,
            temperature: parseFloat(this.temperature?.value) || 0.7,
            top_p: parseFloat(this.topP?.value) || 0.9,
            top_k: parseInt(this.topK?.value) || 50,
            num_predict: parseInt(this.maxTokens?.value) || 1000
        };
        const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        const resp = await this.fetchWithTimeout(`${this.apiBaseUrl}/ollama/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }, timeoutMs);
        const t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        const ms = Math.round(t1 - t0);
        try { this.logToConsole(`⏱️ requestOllamaGenerate: ${ms} ms`, 'info'); } catch(_) {}
        return resp;
    }

    async sendMessageToOllama(message) {
        const modelName = this.currentModel.replace('ollama:', '');
        
        // Build prompt with system message
        let fullPrompt = this.stripEmptyLines(message);
        if (this.useSystemPrompt.checked && this.systemPrompt.value.trim()) {
            const systemContent = this.systemPrompt.value.trim();
            fullPrompt = `System: ${this.stripEmptyLines(systemContent)}\n\nUser: ${fullPrompt}`;
            this.logToConsole(`📋 System prompt applied for Ollama (${systemContent.length} chars)`, 'info');
        } else {
            this.logToConsole('⚠️ System prompt not applied for Ollama', 'warning');
        }

        // Full prompt preview for Ollama
        this.showFullPromptPreviewFromText(fullPrompt);
        
        const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        const response = await this.fetchWithTimeout(`${this.apiBaseUrl}/ollama/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: modelName,
                prompt: fullPrompt,
                temperature: parseFloat(this.temperature.value),
                top_p: parseFloat(this.topP.value),
                top_k: parseInt(this.topK.value),
                num_predict: parseInt(this.maxTokens.value)
            })
        }, 30000); // 30 s for Ollama generation
        const t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        const ms = Math.round(t1 - t0);
        try { this.logToConsole(`⏱️ Chat Ollama: ${ms} ms`, 'info'); } catch(_) { console.log('Chat Ollama ms=', ms); }
        const data = await response.json();
        
        if (response.ok && data.status === 'success') {
            this.addMessage(data.response, 'assistant');
            this.logToConsole(`Response from Ollama received`, 'success');
        } else {
            this.addMessage(`Ollama error: ${data.detail || 'Unknown error'}`, 'system');
            this.logToConsole(`Ollama error: ${data.detail || 'Unknown error'}`, 'error');
        }
    }

    addMessage(content, role) {
        const entryDiv = document.createElement('div');
        entryDiv.className = `chat-entry ${role}-entry`;
        
        const labelSpan = document.createElement('span');
        labelSpan.className = 'entry-label';
        
        const contentSpan = document.createElement('span');
        contentSpan.className = 'entry-content';
        contentSpan.textContent = content;
        
        // Set correct labels
        switch(role) {
            case 'user':
                labelSpan.textContent = 'User:';
                break;
            case 'assistant':
                labelSpan.textContent = 'LLM:';
                break;
            case 'system':
                labelSpan.textContent = 'System:';
                break;
            default:
                labelSpan.textContent = 'Unknown:';
        }
        
        entryDiv.appendChild(labelSpan);
        entryDiv.appendChild(contentSpan);
        this.chatMessages.appendChild(entryDiv);
        
        // Save message to history (except system and info)
        if (role === 'user' || role === 'assistant') {
            this.chatHistory.push({
                role: role,
                content: content,
                timestamp: new Date().toISOString()
            });
            
            // Keep only last 20 messages in history
            if (this.chatHistory.length > 20) {
                this.chatHistory = this.chatHistory.slice(-20);
            }
        }
        
        this.scrollToBottom();
        
        return entryDiv;
    }

    scrollToBottom() {
        // ��஫��� ������ ��ப� ����� ��஫� �� ����ᥭ�� ���⥩���
        const containers = [];
        if (this.chatScrollContainer) {
            containers.push(this.chatScrollContainer);
        }
        if (this.chatMessages && !containers.includes(this.chatMessages)) {
            containers.push(this.chatMessages);
        }
        if (containers.length === 0) {
            return;
        }

        containers.forEach((container, index) => {
            container.scrollTop = container.scrollHeight;
            if (index === 0) {
                const containerLabel = container.id || container.className || 'chat-container';
                console.log(`Scrolling chat window (${containerLabel}):`, container.scrollHeight);
            }
        });
    }

    async testApi() {
        const testInput = this.apiTestInput.value.trim();
        if (!testInput) {
            this.logToConsole('Enter JSON to test the API', 'error');
            return;
        }

        this.testApiBtn.disabled = true;
        this.testApiBtn.textContent = 'Testing...';

        try {
            const requestData = JSON.parse(testInput);
            
            const response = await this.fetchWithTimeout(`${this.apiBaseUrl}/v1/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestData)
            });

            const data = await response.json();
            
            this.apiTestResult.textContent = JSON.stringify(data, null, 2);
            this.apiTestResult.classList.add('show');
            
            if (response.ok) {
                this.logToConsole('API test completed successfully', 'success');
            } else {
                this.logToConsole(`API test failed: ${data.detail}`, 'error');
            }
        } catch (error) {
            this.apiTestResult.textContent = `Error: ${error.message}`;
            this.apiTestResult.classList.add('show');
            this.logToConsole(`JSON parse error: ${error.message}`, 'error');
        } finally {
            this.testApiBtn.disabled = false;
            this.testApiBtn.textContent = 'Test API';
        }
    }

    switchTab(tabName) {
        // Update tabs
        this.tabs.forEach(tab => {
            tab.classList.remove('active');
            if (tab.dataset.tab === tabName) {
                tab.classList.add('active');
            }
        });

        // Update panels
        this.tabPanels.forEach(panel => {
            panel.classList.remove('active');
            if (panel.id === `${tabName}Tab`) {
                panel.classList.add('active');
            }
        });
        
        // Refresh data when switching to Patients tab
        if (tabName === 'patients') {
            this.updatePatientsStats();
            this.loadPatientsList();
        }
        
        // Expose test helpers on window
        window.testDocumentElements = () => {
            console.log('=== Document controls test ===');
            console.log('selectedPatient:', document.getElementById('selectedPatient'));
            console.log('documentType:', document.getElementById('documentType'));
            console.log('documentContent:', document.getElementById('documentContent'));
            console.log('addDocumentBtn:', document.getElementById('addDocumentBtn'));
            console.log('ocrDocumentBtn:', document.getElementById('ocrDocumentBtn'));
            
            const content = document.getElementById('documentContent');
            if (content) {
                console.log('documentContent.value:', content.value);
                console.log('documentContent.value.length:', content.value.length);
                console.log('documentContent.value.trim():', content.value.trim());
            }
        };
        
        window.testAddDocument = () => {
            console.log('=== Test addDocument ===');
            if (window.lmStudioClone) {
                console.log('lmStudioClone found, calling addDocument()');
                window.lmStudioClone.addDocument();
            } else {
                console.error('ERROR: lmStudioClone not found');
            }
        };
        
        window.testDocumentContent = () => {
            console.log('=== Test document content ===');
            const element = document.getElementById('documentContent');
            if (element) {
                console.log('Element found:', element);
                console.log('Value:', JSON.stringify(element.value));
                console.log('Length:', element.value?.length);
                console.log('Trim:', JSON.stringify(element.value?.trim()));
                console.log('Trim length:', element.value?.trim()?.length);
                
                element.value = 'Test document';
                console.log('Test value set');
                console.log('New value:', JSON.stringify(element.value));
            } else {
                console.error('documentContent element not found!');
            }
        };
    }

    sanitizeUiText(message, type = 'info') {
        if (!message || typeof message !== 'string') return message;
        if (!/[А-Яа-яЁё]/.test(message)) return message;
        console.warn('UI text sanitized (non-English):', message);
        if (type === 'error') return 'Error. See browser console for details.';
        if (type === 'warning') return 'Warning. See browser console for details.';
        if (type === 'success') return 'Done.';
        return 'Processing...';
    }

    logToConsole(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logLine = document.createElement('div');
        logLine.className = `console-line console-message ${type}`;
        
        // Build log line
        const timestampSpan = document.createElement('span');
        timestampSpan.className = 'log-timestamp';
        timestampSpan.textContent = `[${timestamp}]`;
        
        const messageSpan = document.createElement('span');
        messageSpan.className = 'log-message';
        messageSpan.textContent = this.sanitizeUiText(message, type);
        
        logLine.appendChild(timestampSpan);
        logLine.appendChild(messageSpan);
        
        this.console.appendChild(logLine);
        this.console.scrollTop = this.console.scrollHeight;
        
        // Limit console line count
        const lines = this.console.querySelectorAll('.console-line');
        if (lines.length > 50) {
            lines[0].remove();
        }
    }

    showNotification(message, type = 'info') {
        // Create notification
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
                <span>${this.sanitizeUiText(message, type)}</span>
                <button class="notification-close" onclick="this.parentElement.parentElement.remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        
        // Append to notification container
        let container = document.getElementById('notificationContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'notificationContainer';
            container.className = 'notification-container';
            document.body.appendChild(container);
        }
        
        container.appendChild(notification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 5000);
        
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);
    }

    // View prompt
    async showPromptPreview() {
        console.log('DEBUG: showPromptPreview called');
        
        const message = this.chatInput.value.trim();
        if (!message) {
            this.showNotification('Enter a message to preview the prompt', 'warning');
            this.logToConsole('⚠️ Enter a message to preview the prompt', 'warning');
            return;
        }

        try {
            this.logToConsole('🔍 Building prompt preview...', 'info');
            
            // Build prompt same as on send (with MemoRAG)
            const messages = [];
            
            // 1. System prompt
            if (this.useSystemPrompt && this.useSystemPrompt.checked && this.systemPrompt && this.systemPrompt.value.trim()) {
                messages.push({
                    role: 'system',
                    content: this.systemPrompt.value.trim()
                });
                console.log('DEBUG: System prompt added');
            }
            
            // 2. Patient data (if enabled) - same format as on send
            if (this.usePatientData && this.usePatientData.checked && this.chatPatientSelect && this.chatPatientSelect.value) {
                try {
                    const patientId = parseInt(this.chatPatientSelect.value);
                    console.log(`DEBUG: Loading patient data ID=${patientId} for prompt preview`);
                    const patientResponse = await this.fetchWithTimeout(`${this.apiBaseUrl}/patients/${patientId}/full`, {}, 10000);
                    
                    if (patientResponse.ok) {
                        const patientData = await patientResponse.json();
                        if (patientData && patientData.patient) {
                            let patientContext = '<<<Patient data - USE FOR ASSESSMENT>>>\n\n';
                            const patient = patientData.patient;
                            patientContext += `PATIENT INFO:\n`;
                            patientContext += `Name: ${patient.name}\n`;
                            if (patient.age) patientContext += `Age: ${patient.age} years\n`;
                            if (patient.gender) patientContext += `Gender: ${patient.gender}\n`;
                            if (patient.notes) patientContext += `Notes: ${patient.notes}\n`;
                            patientContext += `Created: ${new Date(patient.created_at).toLocaleDateString()}\n\n`;
                            
                            if (patientData.documents && patientData.documents.length > 0) {
                                patientContext += `PATIENT DOCUMENTS (use for NPS, SNOT-22, EPOS 2020, T2 inflammation, ACT):\n\n`;
                                patientData.documents.forEach((doc, index) => {
                                    const content = (doc && typeof doc.content === 'string') ? this.stripEmptyLines(doc.content) : '';
                                    patientContext += `DOCUMENT ${index + 1} [Type: ${doc.document_type}]:\n`;
                                    patientContext += (content ? content + '\n\n' : '[Document content missing]\n\n');
                                });
                                patientContext += `IMPORTANT: All data from patient documents above MUST be used for NPS, SNOT-22, CRS control (EPOS 2020), T2 inflammation, ACT and other outcomes.\n`;
                                patientContext += `If documents contain scores, labs, symptoms, exam data - use them.\n\n`;
                            } else {
                                patientContext += `ATTENTION: Patient has no uploaded documents.\n\n`;
                            }
                            
                            messages.push({
                                role: 'user',
                                content: patientContext
                            });
                            console.log(`DEBUG: Patient data added (${patientContext.length} chars)`);
                        }
                    } else {
                        console.warn(`DEBUG: Patient data fetch error: ${patientResponse.status}`);
                    }
                } catch (error) {
                    console.error('DEBUG: Error loading patient data for preview:', error);
                    this.logToConsole(`⚠️ Failed to load patient data: ${error.message}`, 'warning');
                }
            }
            
            // 3. MemoRAG data (always on now)
            const chunksCount = this.memoragChunksCount ? parseInt(this.memoragChunksCount.value) : 5;
            const contextLength = parseInt(this.memoragContextLength?.value) || 200;
            
            try {
                console.log(`DEBUG: Requesting MemoRAG for preview (chunks: ${chunksCount})`);
                const searchResponse = await this.fetchWithTimeout(`${this.apiBaseUrl}/memorag/search`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        query: message,
                        top_k: chunksCount,
                        context_length: contextLength
                    })
                }, 15000);
                
                if (searchResponse.ok) {
                    const searchData = await searchResponse.json();
                    if (searchData.status === 'success' && searchData.results && searchData.results.length > 0) {
                        let memoragContext = '<<<Knowledge base fragments>>>\n\n';
                        
                        if (searchData.memory_context && searchData.memory_context.length > 0) {
                            memoragContext += 'Memory context:\n';
                            searchData.memory_context.forEach((ctx, index) => {
                                memoragContext += `${index + 1}. ${ctx}\n`;
                            });
                            memoragContext += '\n';
                        }
                        
                        memoragContext += 'Relevant documents:\n';
                        searchData.results.forEach((result, index) => {
                            memoragContext += `${index + 1}. ${result.document}\n\n`;
                        });
                        
                        if (searchData.clues_used && searchData.clues_used.length > 0) {
                            memoragContext += 'Search clues used:\n';
                            searchData.clues_used.forEach((clue, index) => {
                                memoragContext += `${index + 1}. ${clue}\n`;
                            });
                            memoragContext += '\n';
                        }
                        
                        messages.push({
                            role: 'user',
                            content: memoragContext
                        });
                        console.log(`DEBUG: MemoRAG data added (${memoragContext.length} chars)`);
                    }
                } else {
                    console.warn(`DEBUG: MemoRAG fetch error: ${searchResponse.status}`);
                }
            } catch (error) {
                console.error('DEBUG: Error loading MemoRAG for preview:', error);
                this.logToConsole(`⚠️ Failed to load MemoRAG: ${error.message}`, 'warning');
            }
            
            // 4. Chat history
            if (this.chatHistory && this.chatHistory.length > 0) {
                let historyContext = '<<<Chat history>>>\n\n';
                const recentHistory = this.chatHistory.slice(-10);
                recentHistory.forEach((msg, index) => {
                    historyContext += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n\n`;
                });
                messages.push({
                    role: 'user',
                    content: historyContext
                });
                console.log(`DEBUG: Chat history added (${this.chatHistory.length} messages)`);
            }
            
            // 5. Current user message
            messages.push({
                role: 'user',
                content: message
            });
            
            console.log(`DEBUG: Total messages in prompt: ${messages.length}`);
            
            const formattedPrompt = this.formatMessagesForOllama(messages);
            console.log(`DEBUG: Prompt formatted, length: ${formattedPrompt.length} chars`);
            
            this.showPromptModal(formattedPrompt, messages);
            this.logToConsole('✅ Prompt built and displayed', 'success');
            
        } catch (error) {
            console.error('DEBUG: Critical error in showPromptPreview:', error);
            this.logToConsole(`❌ Prompt build error: ${error.message}`, 'error');
            this.showNotification(`Error: ${error.message}`, 'error');
        }
    }
    showPromptModal(formattedPrompt, messages) {
        console.log('DEBUG: showPromptModal called');
        
        const oldModal = document.getElementById('promptPreviewModal');
        if (oldModal) {
            console.log('DEBUG: Removing old modal');
            oldModal.remove();
        }
        
        // Escape text for safe HTML
        const escapeHtml = (text) => {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        };
        
        // Build sections list
        const sectionsList = messages.map((msg, idx) => {
            let sectionType = msg.role;
            if (msg.content.includes('Patient data') || msg.content.includes('<<<Patient data')) {
                sectionType = 'patient-data';
            } else if (msg.content.includes('<<<Knowledge base fragments>>>')) {
                sectionType = 'knowledge-base';
            } else if (msg.content.includes('<<<Chat history>>>')) {
                sectionType = 'chat-history';
            }
            const preview = escapeHtml(msg.content.substring(0, 100) + (msg.content.length > 100 ? '...' : ''));
            return `<li><strong>[${idx + 1}]</strong> ${escapeHtml(sectionType)}: ${preview}</li>`;
        }).join('');
        
        const modal = document.createElement('div');
        modal.id = 'promptPreviewModal';
        modal.className = 'prompt-modal';
        
        const modalContent = document.createElement('div');
        modalContent.className = 'prompt-modal-content';
        
        const header = document.createElement('div');
        header.className = 'prompt-modal-header';
        header.innerHTML = `
            <h2><i class="fas fa-eye"></i> Prompt preview</h2>
            <button class="prompt-modal-close">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        const body = document.createElement('div');
        body.className = 'prompt-modal-body';
        
        const info = document.createElement('div');
        info.className = 'prompt-info';
        info.innerHTML = `
            <div class="prompt-stat">
                <span class="stat-label">Messages:</span>
                <span class="stat-value">${messages.length}</span>
            </div>
            <div class="prompt-stat">
                <span class="stat-label">Prompt length:</span>
                <span class="stat-value">${formattedPrompt.length.toLocaleString()} chars</span>
            </div>
            <div class="prompt-stat">
                <span class="stat-label">Words:</span>
                <span class="stat-value">${formattedPrompt.split(/\s+/).length.toLocaleString()}</span>
            </div>
        `;
        
        const sections = document.createElement('div');
        sections.className = 'prompt-sections';
        sections.innerHTML = `
            <h3>Prompt structure:</h3>
            <ul class="prompt-sections-list">
                ${sectionsList}
            </ul>
        `;
        
        const textContainer = document.createElement('div');
        textContainer.className = 'prompt-text-container';
        textContainer.innerHTML = `
            <h3>Full prompt:</h3>
            <textarea readonly class="prompt-text" rows="20"></textarea>
            <button class="btn btn-secondary copy-prompt-btn">
                <i class="fas fa-copy"></i> Copy
            </button>
        `;
        
        const textarea = textContainer.querySelector('.prompt-text');
        textarea.value = formattedPrompt;
        
        const copyBtn = textContainer.querySelector('.copy-prompt-btn');
        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(formattedPrompt).then(() => {
                copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
                setTimeout(() => {
                    copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy';
                }, 2000);
            }).catch(err => {
                console.error('Copy error:', err);
                copyBtn.innerHTML = '<i class="fas fa-exclamation"></i> Error';
                setTimeout(() => {
                    copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy';
                }, 2000);
            });
        });
        
        body.appendChild(info);
        body.appendChild(sections);
        body.appendChild(textContainer);
        
        modalContent.appendChild(header);
        modalContent.appendChild(body);
        modal.appendChild(modalContent);
        
        const closeBtn = header.querySelector('.prompt-modal-close');
        closeBtn.addEventListener('click', () => {
            modal.remove();
        });
        
        document.body.appendChild(modal);
        console.log('DEBUG: Modal added to DOM');
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
        
        const escapeHandler = (e) => {
            if (e.key === 'Escape') {
                modal.remove();
                document.removeEventListener('keydown', escapeHandler);
            }
        };
        document.addEventListener('keydown', escapeHandler);
        
        console.log('DEBUG: Modal created and configured');
    }

    // Theme handling
    loadTheme() {
        const savedTheme = localStorage.getItem('lm-studio-theme');
        console.log('DEBUG: loadTheme() called, saved theme:', savedTheme);
        
        if (savedTheme === 'dark') {
            this.isDarkTheme = true;
            document.body.classList.remove('light-theme');
            console.log('DEBUG: Dark theme applied');
        } else {
            this.isDarkTheme = false;
            document.body.classList.add('light-theme');
            console.log('DEBUG: Light theme applied');
        }
        
        console.log('DEBUG: body classes after theme load:', document.body.className);
        this.updateThemeIcon();
    }

    toggleTheme() {
        console.log('DEBUG: toggleTheme() called, current theme:', this.isDarkTheme);
        this.isDarkTheme = !this.isDarkTheme;
        
        if (this.isDarkTheme) {
            document.body.classList.remove('light-theme');
            localStorage.setItem('lm-studio-theme', 'dark');
            console.log('DEBUG: Switched to dark theme');
        } else {
            document.body.classList.add('light-theme');
            localStorage.setItem('lm-studio-theme', 'light');
            console.log('DEBUG: Switched to light theme');
        }
        
        console.log('DEBUG: body classes after toggle:', document.body.className);
        this.updateThemeIcon();
        this.logToConsole(`Theme set to ${this.isDarkTheme ? 'dark' : 'light'}`, 'success');
    }

    updateThemeIcon() {
        if (!this.themeToggle) {
            console.warn('DEBUG: themeToggle not found, cannot update icon');
            return;
        }
        
        const icon = this.themeToggle.querySelector('i');
        if (!icon) {
            console.warn('DEBUG: Icon in themeToggle not found');
            return;
        }
        
        if (this.isDarkTheme) {
            icon.className = 'fas fa-moon';
            this.themeToggle.title = 'Switch to light theme';
            console.log('DEBUG: Icon updated: moon (dark theme)');
        } else {
            icon.className = 'fas fa-sun';
            this.themeToggle.title = 'Switch to dark theme';
            console.log('DEBUG: Icon updated: sun (light theme)');
        }
    }

    // Ollama handling
    async checkOllamaStatus() {
        if (this.checkingOllamaStatus) {
            console.log('DEBUG: Ollama check already in progress, skipping');
            return;
        }
        
        this.checkingOllamaStatus = true;
        
        try {
            console.log('DEBUG: Checking Ollama server status...');
            
            // Check /health first (faster)
            try {
                const healthResponse = await this.fetchWithTimeout(`${this.apiBaseUrl}/health`, {}, 5000);
                if (healthResponse.ok) {
                    const healthData = await healthResponse.json();
                    if (healthData.ollama_connected !== undefined) {
                        const modelsCount = healthData.connection_info?.available_models_count || 0;
                        if (healthData.ollama_connected && modelsCount > 0) {
                            console.log('DEBUG: Ollama connected via /health, models:', modelsCount);
                            this.isOllamaConnected = true;
                            this.updateOllamaStatus(true, modelsCount);
                            
                            // Load models if not loaded yet
                            if (!this.ollamaModelsLoaded) {
                                await this.loadOllamaModels();
                            }
                            
                            this.checkingOllamaStatus = false;
                            return;
                        }
                    }
                }
            } catch (healthError) {
                console.log('DEBUG: /health unavailable, using direct request');
            }
            
            // Get Ollama URL from input or default
            const ollamaUrlInput = document.getElementById('ollamaUrl');
            const ollamaUrl = ollamaUrlInput ? (ollamaUrlInput.value || ollamaUrlInput.defaultValue || 'http://127.0.0.1:11434') : 'http://127.0.0.1:11434';
            
            console.log('DEBUG: Checking Ollama at:', ollamaUrl);
            console.log('DEBUG: Backend API URL:', this.apiBaseUrl);
            console.log('DEBUG: Full request URL:', `${this.apiBaseUrl}/ollama/models?url=${encodeURIComponent(ollamaUrl)}`);
            
            try {
                const healthCheck = await this.fetchWithTimeout(`${this.apiBaseUrl}/health`, {}, 3000);
                if (!healthCheck.ok) {
                    throw new Error(`Backend unavailable (status ${healthCheck.status})`);
                }
                console.log('DEBUG: Backend available, continuing Ollama check');
            } catch (healthError) {
                console.error('DEBUG: Backend unavailable:', healthError);
                throw new Error(`Backend unavailable at ${this.apiBaseUrl}. Make sure the server is running.`);
            }
            
            // Check Ollama via /ollama/models
            // Use longer timeout for large model lists
            const response = await this.fetchWithTimeout(
                `${this.apiBaseUrl}/ollama/models?url=${encodeURIComponent(ollamaUrl)}`, 
                {}, 
                10000  // 10 s timeout for large model lists
            );
            
            console.log('DEBUG: API response received, status:', response.status, response.ok);
            
            if (response.ok) {
                const data = await response.json();
                console.log('DEBUG: Ollama models response:', data);
                
                if (data.status === 'success' && Array.isArray(data.models)) {
                    const modelsCount = data.models.length;
                    this.isOllamaConnected = true;
                    this.updateOllamaStatus(true, modelsCount);
                    
                    // Load models if not loaded yet
                    if (!this.ollamaModelsLoaded) {
                        // Load models synchronously so they are added to the list
                        await this.loadOllamaModels();
                    }
                    
                        this.logToConsole(`✅ Ollama available (${modelsCount} models)`, 'success');
                } else {
                    this.isOllamaConnected = false;
                    this.updateOllamaStatus(false);
                    console.warn('DEBUG: Ollama returned invalid response:', data);
                }
            } else {
                // Log error for diagnostics
                const errorText = await response.text().catch(() => 'Failed to read response');
                console.error(`DEBUG: Ollama API error: status ${response.status}, response: ${errorText}`);
                this.isOllamaConnected = false;
                this.updateOllamaStatus(false);
                this.logToConsole(`❌ Failed to connect to Ollama (status ${response.status})`, 'error');
            }
        } catch (error) {
            // Log errors for diagnostics
            if (error.name !== 'AbortError') {
                console.error('DEBUG: Исключение при проверке Ollama:', error.name, error.message);
                console.error('DEBUG: Error stack:', error.stack);
                
                // Show user-friendly message
                let errorMessage = 'Unknown error';
                if (error.name === 'TypeError' && error.message.includes('fetch')) {
                    errorMessage = 'Failed to connect to server. Check that the backend is running.';
                } else if (error.message.includes('timeout') || error.message.includes('Timeout')) {
                    errorMessage = 'Ollama connection timeout. Check that Ollama is running and reachable.';
                } else if (error.message.includes('Failed to fetch')) {
                    errorMessage = 'Request failed. Check connection to backend.';
                } else {
                    errorMessage = `Error: ${error.message}`;
                }
                
                this.logToConsole(`❌ ${errorMessage}`, 'error');
            }
            this.isOllamaConnected = false;
            this.updateOllamaStatus(false);
        } finally {
            this.checkingOllamaStatus = false;
        }
    }

    updateOllamaStatus(connected, modelCount = 0) {
        if (connected) {
            this.ollamaStatus.innerHTML = `<p>✓ Connected (${modelCount} models)</p>`;
            this.ollamaStatus.classList.add('connected');
        } else {
            this.ollamaStatus.innerHTML = '<p>Not connected</p>';
            this.ollamaStatus.classList.remove('connected');
        }
    }

    async loadOllamaModels() {
        if (!this.isOllamaConnected) {
            console.log('DEBUG: loadOllamaModels: Ollama not connected, skipping');
            return;
        }

        // Re-resolve modelSelect in case DOM is not ready
        if (!this.modelSelect) {
            this.modelSelect = document.getElementById('modelSelect');
        }
        
        if (!this.modelSelect) {
            console.error('DEBUG: loadOllamaModels: modelSelect not found! Retrying...');
            // Попробуем найти элемент еще раз через небольшую задержку
            await new Promise(resolve => setTimeout(resolve, 100));
            this.modelSelect = document.getElementById('modelSelect');
            if (!this.modelSelect) {
                console.error('DEBUG: loadOllamaModels: modelSelect still not found after delay!');
                return;
            }
        }

        try {
            console.log('DEBUG: loadOllamaModels: Loading Ollama models...');
            
            // Use URL from input or default
            const ollamaUrlInput = document.getElementById('ollamaUrl');
            const ollamaUrl = ollamaUrlInput ? (ollamaUrlInput.value || ollamaUrlInput.defaultValue || 'http://127.0.0.1:11434') : 'http://127.0.0.1:11434';
            // Longer timeout for model list (can be large)
            const response = await this.fetchWithTimeout(`${this.apiBaseUrl}/ollama/models?url=${encodeURIComponent(ollamaUrl)}`, {}, 15000);
            const data = await response.json();
            
            console.log('DEBUG: loadOllamaModels: Получен ответ от API:', data);
            console.log('DEBUG: loadOllamaModels: Тип data.models:', typeof data.models, 'isArray:', Array.isArray(data.models));
            
            if (data.status === 'success') {
                // Add Ollama models to chat list
                let ollamaModels = [];
                
                // Handle different response formats
                if (Array.isArray(data.models)) {
                    ollamaModels = data.models;
                    console.log('DEBUG: loadOllamaModels: data.models - это массив');
                } else if (data.models && typeof data.models === 'object' && !Array.isArray(data.models)) {
                    // Если models - это объект (не массив), преобразуем в массив
                    ollamaModels = Object.values(data.models);
                    console.log('DEBUG: loadOllamaModels: data.models - это объект, преобразован в массив');
                } else if (data.data && Array.isArray(data.data)) {
                    ollamaModels = data.data;
                    console.log('DEBUG: loadOllamaModels: Using data.data (array)');
                } else {
                    console.warn('DEBUG: loadOllamaModels: Unknown data format:', data);
                }
                
                console.log(`DEBUG: loadOllamaModels: Found ${ollamaModels.length} Ollama models`);
                if (ollamaModels.length > 0) {
                    console.log('DEBUG: loadOllamaModels: First 3 models:', ollamaModels.slice(0, 3));
                } else {
                    console.warn('DEBUG: loadOllamaModels: Model array is empty!');
                }
                console.log(`DEBUG: loadOllamaModels: modelSelect существует: ${!!this.modelSelect}`);
                if (this.modelSelect) {
                    console.log(`DEBUG: loadOllamaModels: Текущее количество опций в списке: ${this.modelSelect.options.length}`);
                }
                
                if (ollamaModels.length > 0) {
                    let addedCount = 0;
                    let skippedCount = 0;
                    
                ollamaModels.forEach(model => {
                        if (!this.modelSelect) {
                            console.warn('DEBUG: loadOllamaModels: modelSelect not found in forEach!');
                            return;
                        }
                        
                        // API returns array of strings (model names) or objects
                        let modelName = '';
                        if (typeof model === 'string') {
                            modelName = model;
                        } else if (model && typeof model === 'object') {
                            modelName = model.name || model.model || String(model);
                        } else {
                            modelName = String(model);
                        }
                        
                        if (!modelName) {
                            console.warn(`DEBUG: loadOllamaModels: Empty model name for:`, model);
                            return;
                        }
                        
                        // Ensure this model is not already in list
                        const existingOption = Array.from(this.modelSelect.options).find(
                            opt => opt.value === `ollama:${modelName}` || opt.value === modelName
                        );
                        if (!existingOption) {
                    const option = document.createElement('option');
                            option.value = `ollama:${modelName}`;
                            option.textContent = `🦙 ${modelName} (Ollama)`;
                    this.modelSelect.appendChild(option);
                            addedCount++;
                            console.log(`DEBUG: loadOllamaModels: Added model: ${modelName}`);
                        } else {
                            skippedCount++;
                            console.log(`DEBUG: loadOllamaModels: Model ${modelName} already exists, skipped`);
                        }
                });
                
                console.log(`DEBUG: loadOllamaModels: Добавлено новых: ${addedCount}, пропущено (уже есть): ${skippedCount}`);
                
                // Add models to action list
                // Переинициализируем selectedModelForAction на случай, если DOM еще не готов
                if (!this.selectedModelForAction) {
                    this.selectedModelForAction = document.getElementById('selectedModelForAction');
                }
                
                if (this.selectedModelForAction) {
                this.selectedModelForAction.innerHTML = '<option value="">Select model...</option>';
                ollamaModels.forEach(model => {
                            // API returns array of strings (model names) or objects
                            let modelName = '';
                            if (typeof model === 'string') {
                                modelName = model;
                            } else if (model && typeof model === 'object') {
                                modelName = model.name || model.model || String(model);
                            } else {
                                modelName = String(model);
                            }
                            
                            if (modelName) {
                    const option = document.createElement('option');
                                option.value = modelName;
                                option.textContent = modelName;
                    this.selectedModelForAction.appendChild(option);
                            }
                });
                    }
                
                    this.logToConsole(`Loaded ${ollamaModels.length} Ollama models`, 'success');
                this.ollamaModelsLoaded = true;
                    
                    // Verify models were added
                    const totalOllamaModelsCount = Array.from(this.modelSelect.options).filter(opt => opt.value.startsWith('ollama:')).length;
                    console.log(`DEBUG: loadOllamaModels: Total Ollama models in list: ${totalOllamaModelsCount} (expected ${ollamaModels.length})`);
                } else {
                    this.logToConsole('⚠️ Ollama connected but no models found', 'warning');
                    console.warn('DEBUG: loadOllamaModels: No models in API response');
                }
            } else {
                throw new Error(data.detail || 'Unknown error');
            }
        } catch (error) {
            console.error('DEBUG: loadOllamaModels: Error:', error);
            this.logToConsole(`Ollama model load error: ${error.message}`, 'error');
        }
    }

    // Новые методы для управления Ollama
    async applyOllamaConfig() {
        const mode = this.ollamaMode.value;
        const ollamaUrlInput = document.getElementById('ollamaUrl');
        const ollamaUrl = ollamaUrlInput ? (ollamaUrlInput.value || ollamaUrlInput.defaultValue || 'http://127.0.0.1:11434') : 'http://127.0.0.1:11434';
        
        this.applyConfigBtn.disabled = true;
        this.applyConfigBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Applying...';

        try {
            console.log('DEBUG: applyOllamaConfig: Checking Ollama connection:', ollamaUrl);
            const connectResponse = await this.fetchWithTimeout(`${this.apiBaseUrl}/ollama/connect`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url: ollamaUrl })
            });

            const connectData = await connectResponse.json();
            
            if (!connectResponse.ok || connectData.status !== 'connected') {
                throw new Error(connectData.detail || `Failed to connect to Ollama at ${ollamaUrl}`);
            }
            
            this.logToConsole(`✅ Connected to Ollama (${connectData.models_count} models)`, 'success');
            
            // Применяем режим
            const response = await this.fetchWithTimeout(`${this.apiBaseUrl}/ollama/config`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ mode: mode })
            });

            const data = await response.json();
            
            if (response.ok && data.status === 'success') {
                this.logToConsole(`Mode ${mode} applied successfully`, 'success');
                this.logToConsole(`Settings: ${JSON.stringify(data.config)}`, 'info');
                
                this.isOllamaConnected = true;
                this.ollamaModelsLoaded = false; // Reset so models reload
                await this.checkOllamaStatus();
            } else {
                throw new Error(data.detail || 'Unknown error');
            }
        } catch (error) {
            const errorMessage = error.message || error.toString();
            this.logToConsole(`❌ Failed to apply settings: ${errorMessage}`, 'error');
            console.error('DEBUG: applyOllamaConfig error:', error);
            this.isOllamaConnected = false;
            this.updateOllamaStatus(false);
        } finally {
            this.applyConfigBtn.disabled = false;
            this.applyConfigBtn.innerHTML = '<i class="fas fa-cog"></i> Apply settings';
        }
    }


    async getOllamaModelInfo() {
        const modelName = this.selectedModelForAction.value;
        if (!modelName) {
            this.logToConsole('Select a model to get info', 'error');
            return;
        }

        this.modelInfoBtn.disabled = true;
        this.modelInfoBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';

        try {
            const response = await this.fetchWithTimeout(`${this.apiBaseUrl}/ollama/model`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    model: modelName, 
                    action: 'info' 
                })
            });

            const data = await response.json();
            
            if (response.ok && data.status === 'success') {
                const info = data.model_info;
                this.logToConsole(`Model info for ${modelName}:`, 'success');
                this.logToConsole(`Размер: ${(info.size / 1024 / 1024 / 1024).toFixed(2)} GB`, 'info');
                this.logToConsole(`Семейство: ${info.family}`, 'info');
                this.logToConsole(`Параметры: ${info.parameters}`, 'info');
                this.logToConsole(`Квантизация: ${info.quantization}`, 'info');
            } else {
                throw new Error(data.detail || 'Unknown error');
            }
        } catch (error) {
            const errorMessage = error.message || error.toString();
            this.logToConsole(`Error getting info: ${errorMessage}`, 'error');
        } finally {
            this.modelInfoBtn.disabled = false;
            this.modelInfoBtn.innerHTML = '<i class="fas fa-info"></i> Информация';
        }
    }

    async removeOllamaModel() {
        const modelName = this.selectedModelForAction.value;
        if (!modelName) {
            this.logToConsole('Select a model to remove', 'error');
            return;
        }

        if (!confirm(`Are you sure you want to remove model "${modelName}"?`)) {
            return;
        }

        this.removeModelBtn.disabled = true;
        this.removeModelBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Удаление...';

        try {
            const response = await this.fetchWithTimeout(`${this.apiBaseUrl}/ollama/model`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    model: modelName, 
                    action: 'remove' 
                })
            });

            const data = await response.json();
            
            if (response.ok && data.status === 'success') {
                this.logToConsole(`Model ${modelName} removed`, 'success');
                await this.loadOllamaModels();
            } else {
                throw new Error(data.detail || 'Unknown error');
            }
        } catch (error) {
            const errorMessage = error.message || error.toString();
            this.logToConsole(`Error removing model: ${errorMessage}`, 'error');
        } finally {
            this.removeModelBtn.disabled = false;
            this.removeModelBtn.innerHTML = '<i class="fas fa-trash"></i> Удалить';
        }
    }

    // System prompt helpers
    buildMessages(userMessage) {
        const messages = [];
        
        // Add system prompt if enabled
        if (this.useSystemPrompt.checked && this.systemPrompt.value.trim()) {
            const systemContent = this.systemPrompt.value.trim();
            messages.push({
                role: 'system',
                content: systemContent
            });
            this.logToConsole(`📋 System prompt applied in buildMessages (${systemContent.length} chars)`, 'info');
        } else {
            this.logToConsole('⚠️ System prompt not applied in buildMessages', 'warning');
        }
        
        // Add user message
        messages.push({
            role: 'user',
            content: userMessage
        });
        
        return messages;
    }

    loadSystemPrompt() {
        const savedPrompt = localStorage.getItem('lm-studio-system-prompt');
        const savedUsePrompt = localStorage.getItem('lm-studio-use-system-prompt');
        
        // Check if saved prompt has problematic content
        if (savedPrompt && this.isProblematicPrompt(savedPrompt)) {
            this.logToConsole('⚠️ Problematic system prompt detected, resetting to default', 'warning');
            this.resetToDefaultPrompt();
            return;
        }
        
        if (savedPrompt) {
            this.systemPrompt.value = savedPrompt;
        }
        
        if (savedUsePrompt !== null) {
            this.useSystemPrompt.checked = savedUsePrompt === 'true';
        }
        
        // Показываем состояние чекбокса
        this.logToConsole(`📋 System prompt usage: ${this.useSystemPrompt.checked ? 'on' : 'off'}`, 'info');
        
        this.logToConsole('System prompt loaded', 'success');
        
        // Show current system prompt in console
        if (this.systemPrompt.value.trim()) {
            const preview = this.systemPrompt.value.trim().substring(0, 100);
            const fullText = this.systemPrompt.value.trim().length > 100 ? preview + '...' : preview;
            this.logToConsole(`📋 Current system prompt: "${fullText}"`, 'info');
        }
    }
    
    isProblematicPrompt(prompt) {
        // Check for Chinese characters or other problematic patterns
        const chinesePattern = /[\u4e00-\u9fff]/;
        const problematicPatterns = [
            /需求分析/,
            /用户似乎/,
            /获取我的注意/,
            /没有收到具体的/,
            /因此，我需要/,
            /进一步的信息/
        ];
        
        return chinesePattern.test(prompt) || problematicPatterns.some(pattern => pattern.test(prompt));
    }
    
    resetToDefaultPrompt() {
        this.systemPrompt.value = `Ты профессиональный медицинский AI-ассистент со специализацией в оториноларингологии (ЛОР) на русском языке.

ТВОЯ РОЛЬ:
- Предоставлять медицинскую информацию и консультации по вопросам ЛОР-заболеваний
- Анализировать симптомы и давать рекомендации
- Помогать в интерпретации медицинских данных и документов
- Отвечать на вопросы о диагностике и лечении исключительно на русском языке.

ПРАВИЛА ПРИОРИТЕТОВ:
1. Данные пациента (если предоставлены) → высший приоритет
2. Фрагменты базы знаний из MemoRAG (EPOS 2020, AAO-HNS, Минздрав РФ, ВОЗ и др.) → средний приоритет  
   - Используй их напрямую и указывай источник
   - Если в MemoRAG есть противоречия — отмечай это и предлагай варианты
3. Общие медицинские знания → низший приоритет  
Если информации нет — укажи честно, не придумывай.

ОСОБЕННОСТИ РАБОТЫ С MEMORAG:
- MemoRAG предоставляет фрагменты документов (гайдлайны, статьи, учебники) в отдельном блоке
- Всегда используй эти фрагменты для подтверждения своих выводов
- Явно указывай, что информация взята из документа MemoRAG («Согласно EPOS 2020…»)
- Не изменяй формулировки рекомендаций из базы знаний без необходимости

ПРАВИЛА ОБЩЕНИЯ:
- Отвечай только на русском языке
- Будь профессиональным, но понятным
- Всегда подчеркивай, что это не замена врачебной консультации
- При серьёзных симптомах обязательно рекомендуй обратиться к врачу
- Используй медицинскую терминологию корректно
- Будь кратким, но информативным

ФОРМАТ ОТВЕТА:
1.  Краткое заключение (10 предложений на русском языке)
2.  Подробное объяснение
3.  Указание источников (данные пациента, MemoRAG, общие знания)
4. Рекомендации по дальнейшим действиям`;
        this.useSystemPrompt.checked = true;
        this.saveSystemPrompt();
    }

    saveSystemPrompt() {
        const prompt = this.systemPrompt.value.trim();
        localStorage.setItem('lm-studio-system-prompt', prompt);
        localStorage.setItem('lm-studio-use-system-prompt', this.useSystemPrompt.checked);
        
        this.logToConsole('System prompt saved', 'success');
        
        // Визуальная обратная связь
        this.saveSystemPromptBtn.innerHTML = '<i class="fas fa-check"></i> Сохранено';
        setTimeout(() => {
            this.saveSystemPromptBtn.innerHTML = '<i class="fas fa-save"></i> Сохранить';
        }, 2000);
    }

    clearSystemPrompt() {
        if (confirm('Reset system prompt to default?')) {
            this.systemPrompt.value = `Ты профессиональный медицинский AI-ассистент со специализацией в оториноларингологии (ЛОР) на русском языке.

ТВОЯ РОЛЬ:
- Предоставлять медицинскую информацию и консультации по вопросам ЛОР-заболеваний
- Анализировать симптомы и давать рекомендации
- Помогать в интерпретации медицинских данных и документов
- Отвечать на вопросы о диагностике и лечении исключительно на русском языке.

ПРАВИЛА ПРИОРИТЕТОВ:
1. Данные пациента (если предоставлены) → высший приоритет
2. Фрагменты базы знаний из MemoRAG (EPOS 2020, AAO-HNS, Минздрав РФ, ВОЗ и др.) → средний приоритет  
   - Используй их напрямую и указывай источник
   - Если в MemoRAG есть противоречия — отмечай это и предлагай варианты
3. Общие медицинские знания → низший приоритет  
Если информации нет — укажи честно, не придумывай.
ОСОБЕННОСТИ РАБОТЫ С MEMORAG:
- MemoRAG предоставляет фрагменты документов (гайдлайны, статьи, учебники) в отдельном блоке
- Всегда используй эти фрагменты для подтверждения своих выводов
- Явно указывай, что информация взята из документа MemoRAG («Согласно EPOS 2020…»)
- Не изменяй формулировки рекомендаций из базы знаний без необходимости

ПРАВИЛА ОБЩЕНИЯ:
- Отвечай только на русском языке
- Будь профессиональным, но понятным
- Всегда подчеркивай, что это не замена врачебной консультации
- При серьёзных симптомах обязательно рекомендуй обратиться к врачу
- Используй медицинскую терминологию корректно
- Будь кратким, но информативным

ФОРМАТ ОТВЕТА:
1.  Краткое заключение (10 предложений на русском языке)
2.  Подробное объяснение
3.  Указание источников (данные пациента, MemoRAG, общие знания)
4. Рекомендации по дальнейшим действиям`;
            this.useSystemPrompt.checked = true;
            this.saveSystemPrompt();
            this.logToConsole('System prompt reset to default', 'success');
        }
    }

    autoSaveSystemPrompt() {
        // Автосохранение с задержкой
        clearTimeout(this.autoSaveTimeout);
        this.autoSaveTimeout = setTimeout(() => {
            this.saveSystemPrompt();
        }, 2000);
    }

    // RAG методы
    toggleOllamaEmbeddings() {
        if (this.useOllamaEmbeddings.checked) {
            this.ollamaEmbeddingGroup.style.display = 'block';
            this.loadOllamaEmbeddingModels();
        } else {
            this.ollamaEmbeddingGroup.style.display = 'none';
        }
    }

    async loadRagConfig() {
        try {
            const response = await this.fetchWithTimeout(`${this.apiBaseUrl}/rag/config`);
            const data = await response.json();
            
            if (data.status === 'success') {
                const config = data.config;
                
                // Устанавливаем значения из конфигурации
                if (this.ragVectorStore) {
                    this.ragVectorStore.value = config.vector_store_type || 'faiss';
                }
                
                if (this.useOllamaEmbeddings) {
                    this.useOllamaEmbeddings.checked = config.use_ollama_embeddings || false;
                    this.toggleOllamaEmbeddings(); // Обновляем видимость группы
                }
                
                if (this.ragChunkSize) {
                    this.ragChunkSize.value = config.chunk_size || 1000;
                }
                
                if (this.ragChunkOverlap) {
                    this.ragChunkOverlap.value = config.chunk_overlap || 200;
                }
                
                // If using Ollama, load models
                if (config.use_ollama_embeddings) {
                    await this.loadOllamaEmbeddingModels();
                }
                
                this.logToConsole('Конфигурация RAG загружена', 'success');
            }
        } catch (error) {
            this.logToConsole(`RAG config load error: ${error.message}`, 'error');
        }
    }

    async loadOllamaEmbeddingModels() {
        try {
            const response = await this.fetchWithTimeout(`${this.apiBaseUrl}/rag/ollama-embedding-models`);
            const data = await response.json();
            
            if (data.status === 'success') {
                this.ollamaEmbeddingModel.innerHTML = '<option value="">Select model...</option>';
                data.models.forEach(model => {
                    const option = document.createElement('option');
                    option.value = model.name;
                    option.textContent = `${model.name} (${Math.round(model.size / 1024 / 1024)}MB)`;
                    this.ollamaEmbeddingModel.appendChild(option);
                });
                
                if (data.current_model) {
                    this.ollamaEmbeddingModel.value = data.current_model;
                }
                
                this.logToConsole(`Загружено ${data.models.length} моделей эмбеддингов`, 'success');
            }
        } catch (error) {
            this.logToConsole(`Ошибка загрузки моделей эмбеддингов: ${error.message}`, 'error');
        }
    }

    async configureRag() {
        const vectorStore = this.ragVectorStore.value;
        const useOllama = this.useOllamaEmbeddings.checked;
        const ollamaModel = this.ollamaEmbeddingModel.value;

        if (useOllama && !ollamaModel) {
            this.logToConsole('Выберите модель эмбеддингов для Ollama', 'error');
            return;
        }

        this.configureRagBtn.disabled = true;
        this.configureRagBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Настройка...';

        try {
            const response = await this.fetchWithTimeout(`${this.apiBaseUrl}/rag/config`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    vector_store_type: vectorStore,
                    use_ollama: useOllama,
                    ollama_embedding_model: ollamaModel,
                    chunk_size: parseInt(this.ragChunkSize?.value) || 1000,
                    chunk_overlap: parseInt(this.ragChunkOverlap?.value) || 200
                })
            });

            const data = await response.json();
            
                if (response.ok && data.status === 'success') {
                    this.ragStatus.textContent = 'Configured';
                    this.ragStatus.className = 'rag-status configured';
                    this.logToConsole(data.message, 'success');
                    
                    // Update RAG stats
                    await this.updateRagStats();
                } else {
                    throw new Error(data.detail || 'Unknown error');
                }
        } catch (error) {
            this.ragStatus.textContent = 'Error';
            this.ragStatus.className = 'rag-status error';
            
            // Более понятные сообщения об ошибках
            let errorMessage = error.message;
            if (errorMessage.includes('FAISS не установлен')) {
                errorMessage = 'FAISS не установлен. Установите faiss-cpu: pip install faiss-cpu';
            } else if (errorMessage.includes('ChromaDB')) {
                errorMessage = 'Ошибка ChromaDB. Попробуйте перезапустить сервер.';
            }
            
            this.logToConsole(`Ошибка настройки RAG: ${errorMessage}`, 'error');
        } finally {
            this.configureRagBtn.disabled = false;
            this.configureRagBtn.innerHTML = '<i class="fas fa-cog"></i> Настроить RAG';
        }
    }
    
    async splitFileIntoChunks(file, chunkSizeMB = 5) {
        const chunkSizeBytes = chunkSizeMB * 1024 * 1024; // Конвертируем MB в байты
        const chunks = [];
        
        if (file.size <= chunkSizeBytes) {
            // Файл не нужно разбивать
            return [file];
        }
        
        this.logToConsole(`📁 Разбиение файла ${file.name} на части по ${chunkSizeMB}MB...`, 'info');
        
        let start = 0;
        let chunkIndex = 1;
        
        while (start < file.size) {
            const end = Math.min(start + chunkSizeBytes, file.size);
            const chunk = file.slice(start, end);
            
            // Создаем новый файл с именем части
            const chunkFileName = `${file.name.replace(/\.[^/.]+$/, '')}_part${chunkIndex}${file.name.match(/\.[^/.]+$/)?.[0] || ''}`;
            const chunkFile = new File([chunk], chunkFileName, { type: file.type });
            
            chunks.push(chunkFile);
            start = end;
            chunkIndex++;
        }
        
        this.logToConsole(`✅ Файл разбит на ${chunks.length} частей`, 'success');
        return chunks;
    }

    async uploadFiles() {
        const files = this.ragFileUpload.files;
        console.log('Выбранные файлы:', files);
        
        if (files.length === 0) {
            this.logToConsole('Выберите файлы для загрузки', 'error');
            return;
        }

        // Сбрасываем флаг остановки при начале новой загрузки
        this.shouldStopEmbedding = false;
        this.isEmbeddingInProgress = false;

        this.uploadFileBtn.disabled = true;
        this.uploadFileBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Загрузка...';

        try {
            // Подготавливаем список всех файлов для обработки (включая части)
            let allFilesToProcess = [];
            
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                
                // Проверяем флаг остановки в каждой итерации
                if (this.shouldStopEmbedding) {
                    this.logToConsole('🛑 Обработка файлов остановлена пользователем', 'warning');
                    break;
                }
                
                // Проверяем, нужно ли разбивать файл
                const shouldChunk = this.enableFileChunking.checked && file.size > 10 * 1024 * 1024; // >10MB
                
                if (shouldChunk) {
                    const chunkSizeMB = parseInt(this.chunkSize.value) || 5;
                    const chunks = await this.splitFileIntoChunks(file, chunkSizeMB);
                    allFilesToProcess.push(...chunks);
                } else {
                    allFilesToProcess.push(file);
                }
            }
            
            this.logToConsole(`📁 Всего файлов для обработки: ${allFilesToProcess.length}`, 'info');
            
            // Обрабатываем все файлы (включая части)
            for (let i = 0; i < allFilesToProcess.length; i++) {
                // Проверяем флаг остановки в каждой итерации
                if (this.shouldStopEmbedding) {
                    this.logToConsole('🛑 Обработка файлов остановлена пользователем', 'warning');
                    break;
                }
                
                const file = allFilesToProcess[i];
                const fileNumber = i + 1;
                const totalFiles = allFilesToProcess.length;
                
                console.log(`Загружаем файл ${fileNumber}/${totalFiles}: ${file.name}, размер: ${file.size}, тип: ${file.type}`);
                
                this.logToConsole(`📁 Обработка файла ${fileNumber}/${totalFiles}: ${file.name}`, 'info');
                
                // Показываем индикатор сразу, чтобы не было ощущения "зависания"
                if (this.uploadProgress) {
                    this.uploadProgress.style.display = 'block';
                }
                if (this.progressTitle) {
                    this.progressTitle.textContent = 'Uploading file...';
                }
                if (this.progressPercent) {
                    this.progressPercent.textContent = '0%';
                }
                if (this.progressFill) {
                    this.progressFill.style.width = '5%';
                }
                if (this.progressDetails) {
                    this.progressDetails.textContent = `Uploading ${file.name} (${fileNumber}/${totalFiles})...`;
                }
                
                const formData = new FormData();
                formData.append('file', file);

                console.log('Отправляем запрос на:', `${this.apiBaseUrl}/rag/upload-file`);
                
                const response = await this.fetchWithTimeout(`${this.apiBaseUrl}/rag/upload-file`, {
                    method: 'POST',
                    body: formData
                }, 15 * 60 * 1000); // 15 минут для загрузки и обработки файлов

                console.log('Ответ сервера:', response.status, response.statusText);
                
                // Читаем ответ как текст сначала, чтобы не потерять ошибки парсинга
                const responseText = await response.text();
                console.log('Ответ сервера (raw):', responseText);
                
                let data;
                try {
                    data = JSON.parse(responseText);
                    console.log('Данные ответа (parsed):', data);
                } catch (parseError) {
                    console.error('JSON parse error:', parseError);
                    console.error('Невалидный JSON:', responseText);
                    throw new Error(`Сервер вернул некорректный ответ: ${responseText.substring(0, 200)}`);
                }
                
                // Проверяем наличие данных и статус
                if (!data) {
                    throw new Error(`Сервер вернул пустой ответ. HTTP ${response.status}: ${response.statusText}`);
                }
                
                // Проверяем статус HTTP ответа
                if (!response.ok) {
                    const errorMessage = data.error || data.detail || data.message || `HTTP ${response.status}: ${response.statusText}`;
                    throw new Error(`Ошибка сервера: ${errorMessage}`);
                }
                
                // Проверяем статус в данных (даже если HTTP 200, status может быть 'error')
                if (data.status === 'success') {
                    const fileSizeKB = Math.round(file.size / 1024);
                    const fileSizeMB = (fileSizeKB / 1024).toFixed(2);
                    
                    this.logToConsole(`✅ Файл ${file.name} успешно загружен в RAG систему!`, 'success');
                    this.logToConsole(`   📊 Размер файла: ${fileSizeKB} KB (${fileSizeMB} MB)`, 'info');
                    this.logToConsole(`   📄 Создано чанков: ${data.processed_chunks}`, 'info');
                    this.logToConsole(`   📝 Длина текста: ${data.file_info.total_length} символов`, 'info');
                    this.logToConsole(`   🎯 Формат: ${data.file_info.format.toUpperCase()}`, 'info');
                    this.logToConsole(`   🔄 Создание эмбеддингов...`, 'info');
                    
                    if (this.uploadedFilesStatus) {
                        const entry = document.createElement('div');
                        entry.textContent = `✅ Загружен файл: ${file.name}`;
                        this.uploadedFilesStatus.prepend(entry);
                        
                        const maxEntries = 5;
                        while (this.uploadedFilesStatus.children.length > maxEntries) {
                            this.uploadedFilesStatus.removeChild(this.uploadedFilesStatus.lastChild);
                        }
                    }
                    
                    // Показываем прогресс создания эмбеддингов
                    await this.showEmbeddingProgress(data.processed_chunks);
                    
                    // Показываем итоговую статистику
                    this.logToConsole(`🎉 Файл полностью интегрирован в RAG систему!`, 'success');
                    if (data.file_info.total_length > 0) {
                        this.logToConsole(`   📈 Эффективность: ${Math.round((data.processed_chunks / data.file_info.total_length) * 10000)} чанков на 10K символов`, 'info');
                    }
                    
                    // Update RAG stats
                    await this.updateRagStats();
                    
                    // Автоматически добавляем документы в MemoRAG
                    await this.addDocumentsToMemoRag(data.chunks);
                    
                    // Если прогресс по WebSocket не пришел, завершаем индикатор вручную
                    if (this.uploadProgress) {
                        if (this.progressTitle) {
                            this.progressTitle.textContent = 'Embedding complete';
                        }
                        if (this.progressPercent) {
                            this.progressPercent.textContent = '100%';
                        }
                        if (this.progressFill) {
                            this.progressFill.style.width = '100%';
                        }
                        if (this.progressDetails) {
                            this.progressDetails.textContent = `Processed ${data.processed_chunks} chunks`;
                        }
                        this.hideProgressBar();
                    }
                    
                } else {
                    // Детальная обработка ошибки (status !== 'success')
                    const errorMessage = data.error || data.detail || data.message || data.status || 'Неизвестная ошибка';
                    
                    console.error('Детали ошибки загрузки:', {
                        status: response.status,
                        statusText: response.statusText,
                        dataStatus: data.status,
                        data: data
                    });
                    
                    // Показываем детальную информацию об ошибке
                    let detailedError = `Ошибка загрузки файла ${file.name}: ${errorMessage}`;
                    
                    // Специальные сообщения для типичных ошибок
                    if (errorMessage.includes('PyPDF2') || errorMessage.includes('не установлен')) {
                        detailedError += '\n💡 Установите: pip install PyPDF2';
                    } else if (errorMessage.includes('Неподдерживаемый формат')) {
                        detailedError += '\n💡 Поддерживаемые форматы: .pdf, .txt, .doc, .docx';
                    } else if (errorMessage.includes('пуст') || errorMessage.includes('empty') || errorMessage.includes('не содержит')) {
                        detailedError += '\n💡 Файл не содержит текста или поврежден. Возможно, это сканированный PDF';
                    } else if (errorMessage.includes('ImportError')) {
                        detailedError += '\n💡 Проверьте установку необходимых библиотек';
                    } else if (errorMessage.includes('ValueError') || errorMessage.includes('PdfReadError')) {
                        detailedError += '\n💡 PDF файл может быть поврежден, зашифрован или содержать только изображения';
                    }
                    
                    throw new Error(detailedError);
                }
            }
            
            this.ragFileUpload.value = '';
            this.logToConsole(`🎉 Все файлы успешно загружены в RAG систему!`, 'success');
        } catch (error) {
            console.error('File upload error:', error);
            const errorMsg = error.message || error.toString();
            
            // Показываем детальное сообщение об ошибке
            this.logToConsole(`❌ Ошибка загрузки файлов: ${errorMsg}`, 'error');
            
            // Если ошибка содержит полезную информацию, выводим её отдельными строками
            if (errorMsg.includes('\n')) {
                const lines = errorMsg.split('\n');
                for (let i = 1; i < lines.length; i++) {
                    if (lines[i].trim()) {
                        this.logToConsole(lines[i].trim(), 'info');
                    }
                }
            }
            
            // Скрываем прогресс при ошибке, чтобы не висел индикатор
            if (this.uploadProgress) {
                this.uploadProgress.style.display = 'none';
            }
            if (this.progressFill) {
                this.progressFill.style.width = '0%';
            }
        } finally {
            this.uploadFileBtn.disabled = false;
            this.uploadFileBtn.innerHTML = '<i class="fas fa-upload"></i> Загрузить файлы';
            
            // Сбрасываем флаги в любом случае
            this.shouldStopEmbedding = false;
            this.isEmbeddingInProgress = false;
            this.stopEmbeddingBtn.style.display = 'none';
        }
    }

    async showEmbeddingProgress(totalChunks) {
        // Показываем начальное состояние прогресса
        this.uploadProgress.style.display = 'block';
        this.progressTitle.textContent = 'Creating embeddings...';
        this.progressPercent.textContent = '0%';
        this.progressFill.style.width = '0%';
        this.progressDetails.textContent = `Processing ${totalChunks} documents...`;
        
        // Показываем кнопку остановки для больших файлов
        if (totalChunks > 1000) {
            this.stopEmbeddingBtn.style.display = 'inline-block';
            this.isEmbeddingInProgress = true;
            this.shouldStopEmbedding = false;
        }
        
        this.logToConsole(`   🔄 Начато создание эмбеддингов для ${totalChunks} чанков`, 'info');
        this.logToConsole(`   📡 Подключение к серверу для отслеживания прогресса...`, 'info');
        
        // Предупреждение для больших файлов
        if (totalChunks > 10000) {
            this.logToConsole(`⚠️ ВНИМАНИЕ: Обработка ${totalChunks} документов может занять много времени!`, 'warning');
            this.logToConsole(`💡 Рекомендуется разбить файл на части или использовать кнопку "Остановить" при необходимости`, 'info');
        }
    }
    
    stopEmbeddingProcess() {
        this.shouldStopEmbedding = true;
        this.isEmbeddingInProgress = false;
        this.stopEmbeddingBtn.style.display = 'none';
        
        this.logToConsole('🛑 Процесс создания эмбеддингов остановлен пользователем', 'warning');
        this.logToConsole('⚠️ Частично обработанные данные могут быть сохранены', 'info');
        this.logToConsole('💡 Для новой загрузки просто выберите файлы снова', 'info');
        
        // Скрываем прогресс-бар
        this.uploadProgress.style.display = 'none';
        
        // Включаем кнопки обратно
        this.uploadFileBtn.disabled = false;
        this.uploadFileBtn.innerHTML = '<i class="fas fa-upload"></i> Загрузить файлы';
        this.addDocumentsBtn.disabled = false;
        this.addDocumentsBtn.innerHTML = '<i class="fas fa-plus"></i> Добавить документы';
    }
    
    toggleChunkingSettings() {
        if (this.enableFileChunking.checked) {
            this.chunkingSettings.style.display = 'block';
            this.logToConsole('📁 Разбиение файлов включено', 'info');
        } else {
            this.chunkingSettings.style.display = 'none';
            this.logToConsole('📁 Разбиение файлов отключено', 'info');
        }
    }

    async updateRagStats() {
        // Добавляем визуальную обратную связь
        const originalText = this.refreshRagStatsBtn.innerHTML;
        this.refreshRagStatsBtn.disabled = true;
        this.refreshRagStatsBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Обновление...';
        
        try {
            this.logToConsole('🔄 Запрос статистики RAG системы...', 'info');
            const response = await this.fetchWithTimeout(`${this.apiBaseUrl}/rag/stats`);
            const data = await response.json();
            
            this.logToConsole(`📊 Получен ответ от сервера: ${response.status}`, 'info');
            console.log('RAG Stats Response:', data);
            
            if (response.ok && data.status === 'success') {
                const stats = data.stats;
                console.log('RAG Stats Data:', stats);
                
                // Обновляем все поля статистики
                console.log('Обновление статистики RAG:', stats);
                console.log('Элементы DOM:', {
                    ragStatusValue: !!this.ragStatusValue,
                    ragVectorStoreType: !!this.ragVectorStoreType,
                    ragDocCount: !!this.ragDocCount,
                    ragChunkCount: !!this.ragChunkCount,
                    ragDimension: !!this.ragDimension,
                    ragIndexSize: !!this.ragIndexSize,
                    ragEmbeddingModel: !!this.ragEmbeddingModel,
                    ragUseOllama: !!this.ragUseOllama
                });
                
                if (this.ragStatusValue) this.ragStatusValue.textContent = stats.status || 'Неизвестно';
                if (this.ragVectorStoreType) this.ragVectorStoreType.textContent = stats.vector_store_type || '-';
                if (this.ragDocCount) this.ragDocCount.textContent = stats.documents_count || 0;
                if (this.ragChunkCount) this.ragChunkCount.textContent = stats.total_chunks || 0;
                if (this.ragDimension) {
                    this.ragDimension.textContent = stats.dimension || 0;
                    console.log('Обновлена размерность:', stats.dimension);
                }
                if (this.ragIndexSize) this.ragIndexSize.textContent = stats.index_size || '0 MB';
                if (this.ragEmbeddingModel) {
                    this.ragEmbeddingModel.textContent = stats.embedding_model || '-';
                    console.log('Обновлена модель эмбеддингов:', stats.embedding_model);
                }
                if (this.ragEmbeddingModelType) {
                    this.ragEmbeddingModelType.textContent = stats.embedding_model_type || '-';
                }
                if (this.ragEmbeddingCreatedAt) {
                    const createdAt = stats.embedding_created_at;
                    if (createdAt) {
                        // Форматируем дату для отображения
                        const date = new Date(createdAt);
                        this.ragEmbeddingCreatedAt.textContent = date.toLocaleString('ru-RU');
                    } else {
                        this.ragEmbeddingCreatedAt.textContent = '-';
                    }
                }
                if (this.ragUseOllama) this.ragUseOllama.textContent = stats.use_ollama ? 'Да' : 'Нет';
                
                // Обновляем цвет статуса
                if (this.ragStatusValue) {
                    if (stats.status === 'ready') {
                        this.ragStatusValue.style.color = '#4caf50';
                    } else {
                        this.ragStatusValue.style.color = '#f44336';
                    }
                }
                
                this.logToConsole(`📊 Статистика RAG обновлена: ${stats.documents_count} документов, ${stats.total_chunks} чанков, ${stats.vector_store_type}`, 'success');
                this.logToConsole(`📈 Размерность эмбеддингов: ${stats.dimension}, Модель: ${stats.embedding_model}`, 'info');
            } else {
                this.logToConsole(`❌ Ошибка получения статистики RAG: ${data.detail || 'Неизвестная ошибка'}`, 'error');
            }
        } catch (error) {
            console.error('RAG stats fetch error:', error);
            this.logToConsole(`❌ Ошибка получения статистики RAG: ${error.message}`, 'error');
        } finally {
            // Восстанавливаем кнопку
            this.refreshRagStatsBtn.disabled = false;
            this.refreshRagStatsBtn.innerHTML = originalText;
        }
    }

    async addDocuments() {
        const documents = this.ragDocuments.value.trim();
        if (!documents) {
            this.logToConsole('Введите документы для добавления', 'error');
            return;
        }

        // Сбрасываем флаг остановки при начале новой загрузки
        this.shouldStopEmbedding = false;
        this.isEmbeddingInProgress = false;

        const documentList = documents.split('\n').filter(doc => doc.trim());
        
        this.addDocumentsBtn.disabled = true;
        this.addDocumentsBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Добавление...';

        try {
            this.logToConsole(`📝 Обработка ${documentList.length} документов...`, 'info');
            
            const response = await this.fetchWithTimeout(`${this.apiBaseUrl}/rag/documents`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    documents: documentList
                })
            });

            const data = await response.json();
            
            if (response.ok && data.status === 'success') {
                this.logToConsole(`✅ Документы успешно добавлены в RAG систему!`, 'success');
                this.logToConsole(`   📄 Обработано документов: ${data.documents_count}`, 'info');
                this.logToConsole(`   📊 Создано чанков: ${data.processed_chunks}`, 'info');
                this.logToConsole(`   📝 Общая длина текста: ${data.total_length || 'неизвестно'} символов`, 'info');
                this.logToConsole(`   🔄 Создание эмбеддингов...`, 'info');
                
                // Показываем прогресс создания эмбеддингов
                await this.showEmbeddingProgress(data.processed_chunks);
                
                // Показываем итоговую статистику
                this.logToConsole(`🎉 Документы полностью интегрированы в RAG систему!`, 'success');
                if (data.total_length) {
                    this.logToConsole(`   📈 Эффективность: ${Math.round((data.processed_chunks / data.total_length) * 10000)} чанков на 10K символов`, 'info');
                }
                
                // Update RAG stats
                await this.updateRagStats();
                
                // Автоматически добавляем документы в MemoRAG
                await this.addDocumentsToMemoRag(data.chunks);
                
                this.ragDocuments.value = '';
            } else {
                throw new Error(data.detail || 'Unknown error');
            }
        } catch (error) {
            this.logToConsole(`❌ Ошибка добавления документов: ${error.message}`, 'error');
        } finally {
            this.addDocumentsBtn.disabled = false;
            this.addDocumentsBtn.innerHTML = '<i class="fas fa-plus"></i> Добавить документы';
            
            // Сбрасываем флаги в любом случае
            this.shouldStopEmbedding = false;
            this.isEmbeddingInProgress = false;
            this.stopEmbeddingBtn.style.display = 'none';
        }
    }

    async searchDocuments() {
        const query = this.ragSearchQuery.value.trim();
        if (!query) {
            this.logToConsole('Введите запрос для поиска', 'error');
            return;
        }

        this.searchDocumentsBtn.disabled = true;
        this.searchDocumentsBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Поиск...';

        try {
            const response = await this.fetchWithTimeout(`${this.apiBaseUrl}/rag/search`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query: query,
                    top_k: 5
                })
            });

            const data = await response.json();
            
            if (response.ok && data.status === 'success') {
                this.displaySearchResults(data.results);
                this.logToConsole(`Найдено ${data.count} результатов`, 'success');
            } else {
                throw new Error(data.detail || 'Unknown error');
            }
        } catch (error) {
            this.logToConsole(`Ошибка поиска: ${error.message}`, 'error');
        } finally {
            this.searchDocumentsBtn.disabled = false;
            this.searchDocumentsBtn.innerHTML = '<i class="fas fa-search"></i> Найти';
        }
    }

    displaySearchResults(results) {
        if (results.length === 0) {
            this.searchResults.style.display = 'none';
            return;
        }

        this.searchResultsList.innerHTML = '';
        
        results.forEach((result, index) => {
            const resultItem = document.createElement('div');
            resultItem.className = 'search-result-item';
            
            resultItem.innerHTML = `
                <div class="search-result-score">Релевантность: ${(result.score * 100).toFixed(1)}%</div>
                <div class="search-result-text">${result.document}</div>
                <div class="search-result-metadata">
                    Источник: ${result.metadata.source || 'Неизвестно'} | 
                    Индекс: ${result.index}
                </div>
            `;
            
            this.searchResultsList.appendChild(resultItem);
        });
        
        this.searchResults.style.display = 'block';
    }

    async clearRag() {
        if (!confirm('Вы уверены, что хотите очистить все документы из RAG?')) {
            return;
        }

        this.clearRagBtn.disabled = true;
        this.clearRagBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Очистка...';

        try {
            const response = await this.fetchWithTimeout(`${this.apiBaseUrl}/rag/documents`, {
                method: 'DELETE'
            });

            const data = await response.json();
            
            if (response.ok && data.status === 'success') {
                this.logToConsole(data.message, 'success');
                this.searchResults.style.display = 'none';
                
                // Update RAG stats
                await this.updateRagStats();
            } else {
                throw new Error(data.detail || 'Unknown error');
            }
        } catch (error) {
            this.logToConsole(`Ошибка очистки RAG: ${error.message}`, 'error');
        } finally {
            this.clearRagBtn.disabled = false;
            this.clearRagBtn.innerHTML = '<i class="fas fa-trash"></i> Очистить все документы';
        }
    }

    async clearRagIndex() {
        if (!confirm('Вы уверены, что хотите очистить векторный индекс RAG?\n\nЭто удалит все эмбеддинги, но сохранит исходные документы.')) {
            return;
        }

        this.clearRagIndexBtn.disabled = true;
        this.clearRagIndexBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Очистка индекса...';

        try {
            // Сначала очищаем документы (что также очистит индекс)
            const response = await this.fetchWithTimeout(`${this.apiBaseUrl}/rag/documents`, {
                method: 'DELETE'
            });

            const data = await response.json();
            
            if (response.ok && data.status === 'success') {
                this.logToConsole('🗑️ Векторный индекс RAG очищен', 'success');
                this.searchResults.style.display = 'none';
                
                // Update RAG stats
                await this.updateRagStats();
            } else {
                throw new Error(data.detail || 'Unknown error');
            }
        } catch (error) {
            this.logToConsole(`❌ Ошибка очистки индекса RAG: ${error.message}`, 'error');
        } finally {
            this.clearRagIndexBtn.disabled = false;
            this.clearRagIndexBtn.innerHTML = '<i class="fas fa-database"></i> Очистить индекс';
        }
    }
    async resetRag() {
        if (!confirm('⚠️ ВНИМАНИЕ! Вы уверены, что хотите выполнить ПОЛНЫЙ СБРОС RAG системы?\n\nЭто удалит:\n• Все документы\n• Векторный индекс\n• Настройки RAG\n• Логи системы\n\nДанное действие НЕОБРАТИМО!')) {
            return;
        }

        // Дополнительное подтверждение
        if (!confirm('Последнее предупреждение!\n\nВы действительно хотите полностью сбросить RAG систему?\n\nВведите "СБРОС" в следующем окне для подтверждения.')) {
            return;
        }

        const confirmation = prompt('Для подтверждения полного сброса введите слово "СБРОС":');
        if (confirmation !== 'СБРОС') {
            this.logToConsole('❌ Полный сброс отменен - неправильное подтверждение', 'error');
            return;
        }

        this.resetRagBtn.disabled = true;
        this.resetRagBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Полный сброс...';

        try {
            // 1. Очищаем документы
            this.logToConsole('🔄 Шаг 1/4: Очистка документов...', 'info');
            const clearResponse = await this.fetchWithTimeout(`${this.apiBaseUrl}/rag/documents`, { method: 'DELETE' });
            const clearData = await clearResponse.json();
            
            if (clearResponse.ok) {
                this.logToConsole(`✅ Документы очищены: ${clearData.stats.documents_count} документов, ${clearData.stats.total_chunks} чанков`, 'success');
            } else {
                throw new Error(clearData.detail || 'Ошибка очистки документов');
            }

            // Небольшая пауза для завершения операции
            await new Promise(resolve => setTimeout(resolve, 500));

            // 2. Очищаем логи
            this.logToConsole('🔄 Шаг 2/4: Очистка логов...', 'info');
            const logsResponse = await this.fetchWithTimeout(`${this.apiBaseUrl}/rag/logs`, { method: 'DELETE' });
            const logsData = await logsResponse.json();
            
            if (logsResponse.ok) {
                this.logToConsole('✅ Логи очищены', 'success');
            } else {
                this.logToConsole('⚠️ Предупреждение: не удалось очистить логи', 'warning');
            }

            // Небольшая пауза для завершения операции
            await new Promise(resolve => setTimeout(resolve, 500));

            // 3. Сбрасываем настройки RAG (перезагружаем с настройками по умолчанию)
            this.logToConsole('🔄 Шаг 3/4: Сброс настроек...', 'info');
            const configResponse = await this.fetchWithTimeout(`${this.apiBaseUrl}/rag/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vector_store_type: 'faiss',
                    use_ollama: false,
                    ollama_embedding_model: null
                })
            });
            
            const configData = await configResponse.json();
            
            if (configResponse.ok) {
                this.logToConsole(`✅ Настройки сброшены: ${configData.message}`, 'success');
                this.logToConsole(`📊 Статистика после сброса: ${configData.stats.documents_count} документов, ${configData.stats.total_chunks} чанков`, 'info');
            } else {
                throw new Error(configData.detail || 'Ошибка сброса настроек');
            }

            // Небольшая пауза для завершения операции
            await new Promise(resolve => setTimeout(resolve, 500));

            // 4. Обновляем статистику
            this.logToConsole('🔄 Шаг 4/4: Обновление статистики...', 'info');
            await this.updateRagStats();

            this.logToConsole('🎉 RAG система полностью сброшена!', 'success');
            this.logToConsole('💡 Теперь вы можете заново настроить RAG систему', 'info');
            
            // Очищаем результаты поиска
            this.searchResults.style.display = 'none';
            
        } catch (error) {
            this.logToConsole(`❌ Ошибка полного сброса RAG: ${error.message}`, 'error');
        } finally {
            this.resetRagBtn.disabled = false;
            this.resetRagBtn.innerHTML = '<i class="fas fa-bomb"></i> Полный сброс RAG';
        }
    }

    // Методы для работы с логами RAG
    async refreshLogs() {
        try {
            const level = this.logLevelFilter.value || undefined;
            const response = await this.fetchWithTimeout(`${this.apiBaseUrl}/rag/logs?limit=100${level ? `&level=${level}` : ''}`);
            const data = await response.json();
            
            if (data.status === 'success') {
                this.displayLogs(data.logs);
                await this.updateLogStats();
            } else {
                this.logToConsole('Ошибка загрузки логов', 'error');
            }
        } catch (error) {
            this.logToConsole(`Ошибка загрузки логов: ${error.message}`, 'error');
        }
    }

    async updateLogStats() {
        try {
            const response = await this.fetchWithTimeout(`${this.apiBaseUrl}/rag/logs/stats`);
            const data = await response.json();
            
            if (data.status === 'success') {
                const stats = data.stats;
                let statsText = `Всего: ${stats.total}`;
                
                if (stats.by_level) {
                    const levelCounts = Object.entries(stats.by_level)
                        .map(([level, count]) => `${level}: ${count}`)
                        .join(', ');
                    statsText += ` | ${levelCounts}`;
                }
                
                this.logStats.textContent = statsText;
            }
        } catch (error) {
            this.logStats.textContent = 'Failed to load stats';
        }
    }

    displayLogs(logs) {
        this.logEntries.innerHTML = '';
        
        if (logs.length === 0) {
            this.logEntries.innerHTML = '<div class="log-entry">Логи не найдены</div>';
            return;
        }
        
        logs.forEach(log => {
            const logEntry = document.createElement('div');
            logEntry.className = `log-entry ${log.level.toLowerCase()}`;
            
            const timestamp = new Date(log.timestamp).toLocaleTimeString();
            
            logEntry.innerHTML = `
                <span class="log-timestamp">${timestamp}</span>
                <span class="log-level">[${log.level}]</span>
                <span class="log-message">${log.message}</span>
            `;
            
            this.logEntries.appendChild(logEntry);
        });
        
        // Прокручиваем к последнему логу
        this.logEntries.scrollTop = this.logEntries.scrollHeight;
    }

    async clearLogs() {
        if (!confirm('Вы уверены, что хотите очистить все логи RAG системы?')) {
            return;
        }

        this.clearLogsBtn.disabled = true;
        this.clearLogsBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Очистка...';

        try {
            const response = await this.fetchWithTimeout(`${this.apiBaseUrl}/rag/logs`, {
                method: 'DELETE'
            });

            const data = await response.json();
            
            if (response.ok && data.status === 'success') {
                this.logToConsole(data.message, 'success');
                this.refreshLogs();
            } else {
                throw new Error(data.detail || 'Unknown error');
            }
        } catch (error) {
            this.logToConsole(`Ошибка очистки логов: ${error.message}`, 'error');
        } finally {
            this.clearLogsBtn.disabled = false;
            this.clearLogsBtn.innerHTML = '<i class="fas fa-trash"></i> Очистить логи';
        }
    }
    
    // MemoRAG методы
    
    async updateMemoRagStats() {
        try {
            this.logToConsole('🔄 Запрос статистики MemoRAG памяти...', 'info');
            
            const response = await this.fetchWithTimeout(`${this.apiBaseUrl}/memorag/memory-stats`);
            const data = await response.json();
            
            if (response.ok && data.status === 'success') {
                const stats = data.memory_stats;
                
                // Обновляем статистику памяти
                if (this.memoragTotalEntries) this.memoragTotalEntries.textContent = stats.total_entries || 0;
                if (this.memoragFacts) this.memoragFacts.textContent = stats.memory_types?.fact || 0;
                if (this.memoragConcepts) this.memoragConcepts.textContent = stats.memory_types?.concept || 0;
                if (this.memoragRelationships) this.memoragRelationships.textContent = stats.memory_types?.relationship || 0;
                if (this.memoragSummaries) this.memoragSummaries.textContent = stats.memory_types?.summary || 0;
                if (this.memoragIndexedWords) this.memoragIndexedWords.textContent = stats.indexed_keywords || 0;
                if (this.memoragCacheSize) this.memoragCacheSize.textContent = stats.cache_size || 0;
                if (this.memoragCompressionRatio) this.memoragCompressionRatio.textContent = `${(stats.compression_ratio * 100).toFixed(1)}%`;
                
                this.logToConsole(`📊 Статистика MemoRAG обновлена: ${stats.total_entries} записей памяти`, 'success');
            } else {
                this.logToConsole(`❌ Ошибка получения статистики MemoRAG: ${data.detail || 'Неизвестная ошибка'}`, 'error');
            }
        } catch (error) {
            console.error('MemoRAG stats fetch error:', error);
            this.logToConsole(`❌ Ошибка получения статистики MemoRAG: ${error.message}`, 'error');
        }
    }
    
    async clearMemoRagMemory() {
        if (!confirm('⚠️ ВНИМАНИЕ! Вы уверены, что хотите очистить всю память MemoRAG?\n\nЭто удалит все сохраненные записи памяти. Данное действие НЕОБРАТИМО!')) {
            return;
        }
        
        this.clearMemoRagMemoryBtn.disabled = true;
        this.clearMemoRagMemoryBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Очистка...';
        
        try {
            const response = await this.fetchWithTimeout(`${this.apiBaseUrl}/memorag/memory`, {
                method: 'DELETE'
            });
            
            const data = await response.json();
            
            if (response.ok && data.status === 'success') {
                this.logToConsole('🗑️ Память MemoRAG очищена', 'success');
                
                // Показываем статистику до и после очистки
                if (data.stats_before && data.stats_after) {
                    this.logToConsole(`📊 До очистки: ${data.stats_before.total_entries} записей`, 'info');
                    this.logToConsole(`📊 После очистки: ${data.stats_after.total_entries} записей`, 'info');
                }
                
                // Небольшая задержка перед обновлением статистики
                setTimeout(() => {
                    this.updateMemoRagStats();
                }, 500);
            } else {
                throw new Error(data.detail || 'Unknown error');
            }
        } catch (error) {
            this.logToConsole(`❌ Ошибка очистки памяти MemoRAG: ${error.message}`, 'error');
        } finally {
            this.clearMemoRagMemoryBtn.disabled = false;
            this.clearMemoRagMemoryBtn.innerHTML = '<i class="fas fa-trash"></i> Очистить память';
        }
    }
    
    async exportMemoRagMemory() {
        try {
            this.logToConsole('📥 Экспорт памяти MemoRAG...', 'info');
            
            const response = await this.fetchWithTimeout(`${this.apiBaseUrl}/memorag/memory-stats`);
            const data = await response.json();
            
            if (response.ok && data.status === 'success') {
                const stats = data.memory_stats;
                
                // Создаем JSON файл для экспорта
                const exportData = {
                    timestamp: new Date().toISOString(),
                    memory_stats: stats,
                    export_info: {
                        total_entries: stats.total_entries,
                        memory_types: stats.memory_types,
                        indexed_keywords: stats.indexed_keywords,
                        cache_size: stats.cache_size
                    }
                };
                
                const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                
                const a = document.createElement('a');
                a.href = url;
                a.download = `memorag-memory-export-${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                this.logToConsole('📥 Память MemoRAG экспортирована в файл', 'success');
            } else {
                throw new Error(data.detail || 'Unknown error');
            }
        } catch (error) {
            this.logToConsole(`❌ Ошибка экспорта памяти MemoRAG: ${error.message}`, 'error');
        }
    }
    
    async testMemoRag() {
        const query = this.memoragTestQuery.value.trim();
        const topK = parseInt(this.memoragTestTopK.value) || 5;
        const contextLength = parseInt(this.memoragContextLength.value) || 200;
        
        if (!query) {
            this.logToConsole('❌ Введите тестовый запрос', 'error');
            return;
        }
        
        this.testMemoRagBtn.disabled = true;
        this.testMemoRagBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testing...';
        
        try {
            this.logToConsole(`🔍 MemoRAG test: "${query}" (context: ${contextLength} chars)`, 'info');
            
            const response = await this.fetchWithTimeout(`${this.apiBaseUrl}/memorag/search`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    query: query,
                    top_k: topK,
                    context_length: contextLength
                })
            });
            
            const data = await response.json();
            
            if (response.ok && data.status === 'success') {
                this.displayMemoRagTestResults(data);
                this.logToConsole(`✅ MemoRAG тест завершен: найдено ${data.count} результатов`, 'success');
            } else {
                throw new Error(data.detail || 'Unknown error');
            }
        } catch (error) {
            this.logToConsole(`❌ Ошибка тестирования MemoRAG: ${error.message}`, 'error');
        } finally {
            this.testMemoRagBtn.disabled = false;
            this.testMemoRagBtn.innerHTML = '<i class="fas fa-play"></i> Тестировать MemoRAG';
        }
    }
    
    displayMemoRagTestResults(data) {
        this.memoragTestResults.style.display = 'block';
        
        let output = `Запрос: "${data.query}"\n`;
        output += `Найдено результатов: ${data.count}\n`;
        output += `Использовано подсказок: ${data.total_clues}\n\n`;
        
        if (data.memory_context && data.memory_context.length > 0) {
            output += `Контекст из памяти:\n`;
            data.memory_context.forEach((ctx, index) => {
                output += `${index + 1}. ${ctx}\n`;
            });
            output += `\n`;
        }
        
        if (data.clues_used && data.clues_used.length > 0) {
            output += `Использованные подсказки:\n`;
            data.clues_used.forEach((clue, index) => {
                output += `${index + 1}. ${clue}\n`;
            });
            output += `\n`;
        }
        
        if (data.results && data.results.length > 0) {
            output += `Результаты поиска:\n`;
            data.results.forEach((result, index) => {
                output += `${index + 1}. Скор: ${result.score?.toFixed(3) || 'N/A'}\n`;
                if (result.clue) {
                    output += `   Подсказка: ${result.clue}\n`;
                }
                if (result.memory_context && result.memory_context.length > 0) {
                    output += `   Контекст: ${result.memory_context.join(', ')}\n`;
                }
                const contextLength = parseInt(this.memoragContextLength.value) || 200;
                output += `   Документ: ${result.document?.substring(0, contextLength)}...\n\n`;
            });
        }
        
        this.memoragTestOutput.textContent = output;
    }
    
    async migrateToMemoRag() {
        if (!confirm('🔄 Вы уверены, что хотите мигрировать все существующие документы из RAG в MemoRAG память?\n\nЭто добавит все ваши документы в систему памяти.')) {
            return;
        }
        
        this.migrateToMemoRagBtn.disabled = true;
        this.migrateToMemoRagBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Миграция...';
        
        try {
            this.logToConsole('🔄 Начало миграции данных в MemoRAG...', 'info');
            
            const response = await this.fetchWithTimeout(`${this.apiBaseUrl}/memorag/migrate-existing`, {
                method: 'POST'
            });
            
            const data = await response.json();
            
            if (response.ok && data.status === 'success') {
                this.logToConsole(`✅ Миграция завершена: ${data.migrated_count} документов добавлено в MemoRAG`, 'success');
                this.updateMemoRagStats();
            } else if (data.status === 'info') {
                this.logToConsole(`ℹ️ ${data.message}`, 'info');
            } else {
                throw new Error(data.detail || 'Unknown error');
            }
        } catch (error) {
            this.logToConsole(`❌ Ошибка миграции: ${error.message}`, 'error');
        } finally {
            this.migrateToMemoRagBtn.disabled = false;
            this.migrateToMemoRagBtn.innerHTML = '<i class="fas fa-arrow-right"></i> Мигрировать существующие данные';
        }
    }
    
    async checkMigrationStatus() {
        try {
            this.logToConsole('🔍 Проверка статуса миграции...', 'info');
            
            const response = await this.fetchWithTimeout(`${this.apiBaseUrl}/memorag/migrate-status`);
            const data = await response.json();
            
            if (response.ok && data.status === 'success') {
                if (data.migration_needed) {
                    this.logToConsole(`⚠️ Миграция необходима: ${data.rag_documents} документов в RAG, ${data.memo_rag_entries} записей в MemoRAG`, 'warning');
                    this.logToConsole('💡 Нажмите "Мигрировать существующие данные" для добавления документов в MemoRAG', 'info');
                } else if (data.migration_complete) {
                    this.logToConsole(`✅ Миграция завершена: ${data.rag_documents} документов в RAG, ${data.memo_rag_entries} записей в MemoRAG`, 'success');
                } else {
                    this.logToConsole(`ℹ️ Статус: ${data.rag_documents} документов в RAG, ${data.memo_rag_entries} записей в MemoRAG`, 'info');
                }
            } else {
                throw new Error(data.detail || 'Unknown error');
            }
        } catch (error) {
            this.logToConsole(`❌ Ошибка проверки статуса: ${error.message}`, 'error');
        }
    }
    
    async checkOCRStatus() {
        try {
            this.logToConsole('🔎 Проверка статуса OCR сервиса...', 'info');
            // Пробуем стандартный эндпоинт статуса OCR
            const response = await this.fetchWithTimeout(`${this.apiBaseUrl}/ocr/status`, {}, 7000);
            let data = null;
            try { data = await response.json(); } catch (_) {}
            
            if (response.ok) {
                const status = (data && (data.status || data.state)) || 'ok';
                this.logToConsole(`🧠 OCR сервис: ${status}`, 'success');
            } else {
                const detail = (data && (data.detail || data.message)) || `HTTP ${response.status}`;
                this.logToConsole(`⚠️ OCR статус: ${detail}`, 'warning');
            }
        } catch (error) {
            // Если эндпоинт отсутствует или сервис недоступен — не падаем, только предупреждаем
            this.logToConsole(`⚠️ OCR недоступен или не сконфигурирован: ${error.message}`, 'warning');
        }
    }
    
    async addDocumentsToMemoRag(chunks) {
        try {
            if (!chunks || chunks.length === 0) {
                return;
            }
            
            this.logToConsole('🧠 Добавление документов в MemoRAG память...', 'info');
            
            const response = await this.fetchWithTimeout(`${this.apiBaseUrl}/memorag/documents`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    documents: chunks
                })
            });
            
            const data = await response.json();
            
            if (response.ok && data.status === 'success') {
                this.logToConsole(`✅ Документы добавлены в MemoRAG память: ${chunks.length} чанков`, 'success');
                // Обновляем статистику MemoRAG
                this.updateMemoRagStats();
            } else {
                this.logToConsole(`⚠️ Предупреждение: не удалось добавить документы в MemoRAG: ${data.detail || 'Неизвестная ошибка'}`, 'warning');
            }
        } catch (error) {
            this.logToConsole(`⚠️ Предупреждение: ошибка добавления в MemoRAG: ${error.message}`, 'warning');
        }
    }

    // Методы для работы с пациентами
    async updatePatientsStats() {
        try {
            const response = await this.fetchWithTimeout(`${this.apiBaseUrl}/patients/stats`);
            const data = await response.json();
            
            if (response.ok) {
                if (this.patientsCount) this.patientsCount.textContent = data.patients_count;
                if (this.documentsCount) this.documentsCount.textContent = data.documents_count;
                if (this.patientsDbStatus) {
                    this.patientsDbStatus.textContent = data.database_exists ? 'Активна' : 'Не инициализирована';
                    this.patientsDbStatus.className = data.database_exists ? 'stat-value success' : 'stat-value error';
                }
            } else {
                throw new Error(data.detail || 'Ошибка получения статистики');
            }
        } catch (error) {
            this.logToConsole(`❌ Ошибка обновления статистики пациентов: ${error.message}`, 'error');
        }
    }
    
    async loadPatientsList() {
        try {
            const response = await this.fetchWithTimeout(`${this.apiBaseUrl}/patients`);
            const data = await response.json();
            
            if (response.ok) {
                this.displayPatientsList(data);
                this.updatePatientsSelect(data);
                this.updateChatPatientsSelect(data);
                // Сохраняем список всех пациентов для выборки
                this.allPatientsList = Array.isArray(data) ? data : [];
                // Обновляем информацию о количестве для анализа
                this.updatePatientAnalysisCount();
            } else {
                throw new Error(data.detail || 'Ошибка получения списка пациентов');
            }
        } catch (error) {
            this.logToConsole(`❌ Ошибка загрузки списка пациентов: ${error.message}`, 'error');
        }
    }
    
    updateChatPatientsSelect(patients) {
        if (!this.chatPatientSelect) {
            console.error('ERROR: chatPatientSelect не найден при обновлении списка');
            return;
        }
        
        // Сохраняем выбранного пациента перед обновлением
        const selectedPatientId = this.chatPatientSelect.value;
        console.log(`DEBUG: Обновление списка пациентов для чата: найдено ${patients.length} пациентов, текущий выбор: ${selectedPatientId}`);
        
        // Clear list, оставляя только первый элемент
        this.chatPatientSelect.innerHTML = '<option value="">Выберите пациента...</option>';
        
        if (patients.length === 0) {
            const noPatientsOption = document.createElement('option');
            noPatientsOption.value = '';
            noPatientsOption.textContent = 'No patients in database';
            noPatientsOption.disabled = true;
            this.chatPatientSelect.appendChild(noPatientsOption);
            console.warn('DEBUG: ⚠️ Нет пациентов в базе данных');
            return;
        }
        
        patients.forEach(patient => {
            const option = document.createElement('option');
            option.value = patient.id;
            option.textContent = `${patient.name} (ID: ${patient.id})`;
            this.chatPatientSelect.appendChild(option);
        });
        
        // Восстанавливаем выбор из сохраненного значения или localStorage
        let patientToRestore = selectedPatientId;
        if (!patientToRestore) {
            // Проверяем localStorage
            const savedPatientId = localStorage.getItem('lm-studio-selected-patient-id');
            if (savedPatientId) {
                patientToRestore = savedPatientId;
                console.log(`DEBUG: Найден сохраненный выбор пациента в localStorage: ${savedPatientId}`);
            }
        }
        
        // Восстанавливаем выбор, если пациент существует
        if (patientToRestore) {
            const patientExists = patients.some(p => String(p.id) === String(patientToRestore));
            if (patientExists) {
                this.chatPatientSelect.value = patientToRestore;
                console.log(`DEBUG: Восстановлен выбор пациента: ${patientToRestore}`);
                
                // Подтверждаем выбор пользователю
                const restoredOption = this.chatPatientSelect.options[this.chatPatientSelect.selectedIndex];
                if (restoredOption) {
                    console.log(`DEBUG: Выбранный пациент: ${restoredOption.textContent}`);
                }
            } else {
                console.warn(`DEBUG: Пациент ${patientToRestore} больше не существует в списке`);
                localStorage.removeItem('lm-studio-selected-patient-id');
            }
        }
        
        console.log(`DEBUG: Список пациентов обновлен: добавлено ${patients.length} опций, текущий выбор: "${this.chatPatientSelect.value}"`);
    }
    
    async loadPatientsForChat() {
        try {
            console.log('DEBUG: Загрузка списка пациентов для чата...');
            const response = await this.fetchWithTimeout(`${this.apiBaseUrl}/patients`, {}, 10000);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`DEBUG: Patient list load error: ${response.status} - ${errorText}`);
                this.logToConsole(`❌ Ошибка загрузки пациентов: HTTP ${response.status}`, 'error');
                return;
            }
            
            const data = await response.json();
            console.log(`DEBUG: Получено ${data.length} пациентов от сервера`);
            
            if (Array.isArray(data)) {
                this.updateChatPatientsSelect(data);
                if (data.length > 0) {
                    this.logToConsole(`✅ Загружено ${data.length} пациентов для чата`, 'success');
                } else {
                    this.logToConsole(`⚠️ В базе данных нет пациентов. Добавьте пациента через вкладку "Пациенты"`, 'warning');
                }
            } else {
                console.error('DEBUG: Сервер вернул не массив:', data);
                this.logToConsole(`❌ Неверный формат данных от сервера`, 'error');
            }
        } catch (error) {
            console.error('DEBUG: Исключение при загрузке пациентов:', error);
            this.logToConsole(`❌ Ошибка загрузки пациентов для чата: ${error.message}`, 'error');
        }
    }
    
    clearChatHistory() {
        // Очищаем историю сообщений
        this.chatHistory = [];
        
        // Очищаем ВСЕ визуальные сообщения в чате (включая системные)
        const messages = this.chatMessages.querySelectorAll('.chat-entry');
        messages.forEach(message => message.remove());
        
        // НЕ добавляем никаких системных сообщений - чат должен быть полностью пустым
        
        this.logToConsole('🗑️ История чата очищена', 'info');
    }
    
    async diagnosisSystem() {
        // Функция диагностики системы для отладки
        this.logToConsole('🔧 Запуск диагностики системы...', 'info');
        
        // Проверяем состояние модели
        this.logToConsole(`📋 Текущая модель: ${this.currentModel || 'не загружена'}`, 'info');
        this.logToConsole(`🔌 Статус подключения: ${this.isConnected ? 'подключен' : 'не подключен'}`, 'info');
        
        // Проверяем доступность сервера
        try {
            const response = await this.fetchWithTimeout(`${this.apiBaseUrl}/health`);
            this.logToConsole(`🏥 Сервер API: ${response.ok ? 'работает' : 'недоступен'}`, response.ok ? 'success' : 'error');
        } catch (error) {
            this.logToConsole(`🏥 Сервер API: недоступен (${error.message})`, 'error');
        }
        
        // Проверяем Ollama (если используется)
        if (this.currentModel && this.currentModel.startsWith('ollama:')) {
            try {
                const response = await this.fetchWithTimeout(`${this.ollamaUrl}/api/tags`);
                this.logToConsole(`🦙 Ollama сервер: ${response.ok ? 'работает' : 'недоступен'}`, response.ok ? 'success' : 'error');
            } catch (error) {
                this.logToConsole(`🦙 Ollama сервер: недоступен (${error.message})`, 'error');
            }
        }
        
        this.logToConsole('🔧 Диагностика завершена', 'info');
    }
    
    exportChatHistory() {
        console.log('Попытка экспорта истории чата...');
        console.log('Длина истории:', this.chatHistory.length);
        console.log('История:', this.chatHistory);
        
        if (this.chatHistory.length === 0) {
            this.logToConsole('❌ История чата пуста, нечего экспортировать', 'warning');
            return;
        }
        
        try {
            // Создаем объект экспорта с метаданными
            const exportData = {
                version: '1.0',
                exportDate: new Date().toISOString(),
                totalMessages: this.chatHistory.length,
                model: this.currentModel || 'unknown',
                patientId: this.chatPatientSelect ? this.chatPatientSelect.value : null,
                usePatientData: this.usePatientData ? this.usePatientData.checked : false,
                systemPrompt: this.systemPrompt ? this.systemPrompt.value : '',
                messages: this.chatHistory
            };
            
            // Создаем JSON строку
            const jsonString = JSON.stringify(exportData, null, 2);
            
            // Создаем blob и ссылку для скачивания
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            // Создаем временную ссылку для скачивания
            const a = document.createElement('a');
            a.href = url;
            a.download = `chat-history-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            // Освобождаем память
            URL.revokeObjectURL(url);
            
            this.logToConsole(`✅ История чата экспортирована (${this.chatHistory.length} сообщений)`, 'success');
            
        } catch (error) {
            this.logToConsole(`❌ Ошибка экспорта истории: ${error.message}`, 'error');
        }
    }
    
    importChatHistory() {
        // Триггерим выбор файла
        if (this.importChatHistoryInput) {
            this.importChatHistoryInput.click();
        }
    }
    
    handleImportFile(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        // Проверяем тип файла
        if (!file.name.toLowerCase().endsWith('.json')) {
            this.logToConsole('❌ Файл должен быть в формате JSON', 'error');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importData = JSON.parse(e.target.result);
                this.processImportedHistory(importData);
            } catch (error) {
                this.logToConsole(`❌ Ошибка чтения JSON файла: ${error.message}`, 'error');
            }
        };
        
        reader.onerror = () => {
            this.logToConsole('❌ Ошибка чтения файла', 'error');
        };
        
        reader.readAsText(file);
        
        // Очищаем input для возможности повторного выбора того же файла
        event.target.value = '';
    }
    processImportedHistory(importData) {
        try {
            // Валидация структуры данных
            if (!importData.messages || !Array.isArray(importData.messages)) {
                throw new Error('Неверный формат файла: отсутствует массив сообщений');
            }
            
            // Проверяем версию файла
            if (importData.version && importData.version !== '1.0') {
                this.logToConsole(`⚠️ Файл создан в версии ${importData.version}, возможны несовместимости`, 'warning');
            }
            
            // Валидируем каждое сообщение
            const validMessages = [];
            for (const msg of importData.messages) {
                if (msg.role && msg.content && (msg.role === 'user' || msg.role === 'assistant')) {
                    validMessages.push({
                        role: msg.role,
                        content: msg.content,
                        timestamp: msg.timestamp || new Date().toISOString()
                    });
                }
            }
            
            if (validMessages.length === 0) {
                throw new Error('В файле нет валидных сообщений');
            }
            
            // Подтверждение импорта
            const confirmMessage = `Импортировать ${validMessages.length} сообщений из файла?\n\n` +
                                 `Дата экспорта: ${importData.exportDate ? new Date(importData.exportDate).toLocaleString() : 'неизвестно'}\n` +
                                 `Модель: ${importData.model || 'неизвестно'}\n` +
                                 `Пациент: ${importData.patientId || 'не выбран'}`;
            
            if (!confirm(confirmMessage)) {
                this.logToConsole('❌ Импорт отменен пользователем', 'info');
                return;
            }
            
            // Очищаем текущую историю
            this.clearChatHistory();
            
            // Импортируем сообщения
            this.chatHistory = validMessages;
            
            // Восстанавливаем визуальные сообщения
            validMessages.forEach(msg => {
                this.addMessage(msg.content, msg.role);
            });
            
            // Восстанавливаем настройки, если они есть
            if (importData.patientId && this.chatPatientSelect) {
                this.chatPatientSelect.value = importData.patientId;
            }
            
            if (importData.usePatientData !== undefined && this.usePatientData) {
                this.usePatientData.checked = importData.usePatientData;
            }
            
            if (importData.systemPrompt && this.systemPrompt) {
                this.systemPrompt.value = importData.systemPrompt;
            }
            
            this.logToConsole(`✅ История чата импортирована (${validMessages.length} сообщений)`, 'success');
            
            // Добавляем информационное сообщение
            this.addMessage(`История беседы импортирована из файла. Загружено ${validMessages.length} сообщений.`, 'system');
            
        } catch (error) {
            this.logToConsole(`❌ Ошибка импорта истории: ${error.message}`, 'error');
        }
    }
    
    displayPatientsList(patients) {
        if (!this.patientsList) return;
        
        if (patients.length === 0) {
            this.patientsList.innerHTML = '<div class="no-patients">Пациенты не найдены</div>';
            return;
        }
        
        this.patientsList.innerHTML = patients.map(patient => `
            <div class="patient-item" data-patient-id="${patient.id}">
                <div class="patient-header">
                    <div class="patient-name">${patient.name}</div>
                    <div class="patient-actions">
                        <button class="btn btn-sm btn-danger" onclick="window.lmStudioClone.deletePatient(${patient.id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="patient-info">
                    ${patient.age ? `Age: ${patient.age} years` : ''}
                    ${patient.gender ? ` | Пол: ${this.getGenderText(patient.gender)}` : ''}
                    ${patient.created_at ? ` | Добавлен: ${new Date(patient.created_at).toLocaleDateString('ru-RU')}` : ''}
                </div>
                ${patient.notes ? `<div class="patient-notes">${patient.notes}</div>` : ''}
                <div class="patient-documents">
                    <button class="btn btn-sm btn-secondary" onclick="window.lmStudioClone.loadPatientDocuments(${patient.id})">
                        <i class="fas fa-file-medical"></i> Загрузить документы
                    </button>
                </div>
            </div>
        `).join('');
    }
    
    updatePatientsSelect(patients) {
        if (!this.selectedPatient) return;
        
        this.selectedPatient.innerHTML = '<option value="">Выберите пациента</option>' +
            patients.map(patient => `<option value="${patient.id}">${patient.name}</option>`).join('');
    }
    
    getGenderText(gender) {
        const genders = {
            'male': 'Мужской',
            'female': 'Женский',
            'other': 'Другой'
        };
        return genders[gender] || gender;
    }
    
    getDocumentTypeText(documentType) {
        const types = {
            'medical_record': 'Медицинская карта',
            'diagnosis': 'Диагноз',
            'prescription': 'Рецепт',
            'lab_result': 'Результат анализов',
            'scan_result': 'Результат сканирования',
            'other': 'Другое'
        };
        return types[documentType] || documentType;
    }
    
    async addPatient() {
        if (!this.patientName || !this.patientName.value.trim()) {
            this.logToConsole('❌ Введите имя пациента', 'error');
            return;
        }
        
        try {
            this.addPatientBtn.disabled = true;
            this.addPatientBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Добавление...';
            
            const response = await this.fetchWithTimeout(`${this.apiBaseUrl}/patients`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: this.patientName.value.trim(),
                    age: this.patientAge?.value ? parseInt(this.patientAge.value) : null,
                    gender: this.patientGender?.value || null,
                    notes: this.patientNotes?.value?.trim() || null
                })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.logToConsole(`✅ Пациент "${data.name}" добавлен (ID: ${data.id})`, 'success');
                
                // Очищаем форму
                this.patientName.value = '';
                if (this.patientAge) this.patientAge.value = '';
                if (this.patientGender) this.patientGender.value = '';
                if (this.patientNotes) this.patientNotes.value = '';
                
                // Обновляем списки
                await this.updatePatientsStats();
                await this.loadPatientsList();
            } else {
                throw new Error(data.detail || 'Ошибка добавления пациента');
            }
        } catch (error) {
            this.logToConsole(`❌ Ошибка добавления пациента: ${error.message}`, 'error');
        } finally {
            this.addPatientBtn.disabled = false;
            this.addPatientBtn.innerHTML = '<i class="fas fa-user-plus"></i> Добавить пациента';
        }
    }
    
    async exportDatabase() {
        if (!this.exportDbFormat || !this.exportDatabaseBtn) {
            this.logToConsole('❌ Элементы экспорта не найдены', 'error');
            return;
        }
        
        const format = this.exportDbFormat.value || 'sqlite';
        const formatNames = {
            'sqlite': 'SQLite',
            'sql': 'SQL Dump',
            'json': 'JSON',
            'zip': 'ZIP Archive'
        };
        
        try {
            this.exportDatabaseBtn.disabled = true;
            this.exportDatabaseBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Exporting...';
            
            this.logToConsole(`📥 Выгрузка базы данных в формате ${formatNames[format]}...`, 'info');
            
            // Создаем URL с параметром формата
            const url = `${this.apiBaseUrl}/patients-db/export?format=${format}`;
            
            // Выполняем запрос
            const response = await fetch(url);
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }
            
            // Получаем имя файла из заголовков
            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = `patients_db_backup_${new Date().toISOString().split('T')[0]}.${format === 'sqlite' ? 'db' : format === 'sql' ? 'sql' : format === 'json' ? 'json' : 'zip'}`;
            
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename="?(.+?)"?$/);
                if (filenameMatch) {
                    filename = filenameMatch[1];
                }
            }
            
            // Получаем данные
            const blob = await response.blob();
            const fileSize = blob.size;
            const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);
            const fileSizeKB = (fileSize / 1024).toFixed(2);
            const sizeText = fileSize > 1024 * 1024 ? `${fileSizeMB} MB` : `${fileSizeKB} KB`;
            
            // Создаем ссылку для скачивания
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(downloadUrl);
            
            // Показываем информативное уведомление
            const downloadPath = this.getDownloadPath();
            const successMessage = `База данных успешно выгружена!\n\n` +
                `Файл: ${filename}\n` +
                `Размер: ${sizeText}\n` +
                `Формат: ${formatNames[format]}\n` +
                `Сохранено в: ${downloadPath}`;
            
            this.logToConsole(`✅ База данных успешно выгружена: ${filename} (${sizeText})`, 'success');
            this.showNotification(
                `✅ База данных выгружена!<br>` +
                `<strong>${filename}</strong><br>` +
                `Размер: ${sizeText} | Формат: ${formatNames[format]}<br>` +
                `<small>Сохранено в: ${downloadPath}</small>`,
                'success'
            );
            
        } catch (error) {
            this.logToConsole(`❌ Ошибка выгрузки базы данных: ${error.message}`, 'error');
            this.showNotification(
                `❌ Ошибка выгрузки базы данных:<br>${error.message}`,
                'error'
            );
            console.error('Export database error:', error);
        } finally {
            this.exportDatabaseBtn.disabled = false;
            this.exportDatabaseBtn.innerHTML = '<i class="fas fa-download"></i> Export Database';
        }
    }
    
    getDownloadPath() {
        // Определяем путь к папке загрузок в зависимости от браузера и ОС
        // В большинстве случаев это папка "Загрузки" (Downloads)
        const userAgent = navigator.userAgent.toLowerCase();
        const platform = navigator.platform.toLowerCase();
        
        let path = 'папку "Загрузки" (Downloads)';
        
        // Пытаемся определить более точный путь
        if (platform.includes('win')) {
            path = 'папку "Загрузки" (Downloads) в вашем профиле пользователя';
        } else if (platform.includes('mac')) {
            path = 'папку "Загрузки" (Downloads) в вашем профиле пользователя';
        } else if (platform.includes('linux')) {
            path = 'папку "Загрузки" (Downloads) в вашем домашнем каталоге';
        }
        
        // Добавляем информацию о том, как найти файл
        return `${path}\n(Проверьте панель загрузок браузера или настройки браузера)`;
    }
    
    async handleDatabaseImport(event) {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }
        
        const mode = this.importDbMode?.value || 'merge';
        const filename = file.name.toLowerCase();
        
        // Проверяем формат файла
        if (!filename.endsWith('.db') && !filename.endsWith('.sql') && !filename.endsWith('.json')) {
            this.logToConsole('❌ Неподдерживаемый формат файла. Используйте .db, .sql или .json', 'error');
            this.showNotification('❌ Неподдерживаемый формат файла. Используйте .db, .sql или .json', 'error');
            event.target.value = '';
            return;
        }
        
        // Предупреждение для режима replace
        if (mode === 'replace') {
            const confirmMessage = filename.endsWith('.db') 
                ? `⚠️ ВНИМАНИЕ: Вы собираетесь ЗАМЕНИТЬ всю базу данных!\n\n` +
                  `Текущая БД будет сохранена в бэкап, но все данные будут заменены данными из файла.\n\n` +
                  `Файл: ${file.name}\n` +
                  `Продолжить?`
                : `⚠️ ВНИМАНИЕ: Вы собираетесь ЗАМЕНИТЬ все данные в базе!\n\n` +
                  `Все существующие пациенты и документы будут удалены и заменены данными из файла.\n\n` +
                  `Файл: ${file.name}\n` +
                  `Продолжить?`;
            
            if (!confirm(confirmMessage)) {
                this.logToConsole('❌ Импорт отменен пользователем', 'info');
                event.target.value = '';
                return;
            }
        }
        
        try {
            this.importDatabaseBtn.disabled = true;
            this.importDatabaseBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Importing...';
            
            this.logToConsole(`📥 Импорт базы данных из файла: ${file.name} (режим: ${mode})...`, 'info');
            
            // Создаем FormData
            const formData = new FormData();
            formData.append('file', file);
            formData.append('mode', mode);
            
            // Отправляем запрос
            const response = await fetch(`${this.apiBaseUrl}/patients-db/import`, {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }
            
            const result = await response.json();
            
            // Показываем результат
            const successMessage = result.message || 'База данных успешно импортирована';
            
            this.logToConsole(`✅ ${successMessage}`, 'success');
            this.showNotification(
                `✅ Импорт завершен!<br>` +
                `<strong>${successMessage}</strong><br>` +
                (result.imported_patients !== undefined 
                    ? `Импортировано: ${result.imported_patients} пациентов, ${result.imported_documents} документов<br>`
                    : '') +
                (result.total_patients !== undefined
                    ? `Всего в БД: ${result.total_patients} пациентов, ${result.total_documents} документов`
                    : ''),
                'success'
            );
            
            // Обновляем статистику и список пациентов
            await this.updatePatientsStats();
            await this.loadPatientsList();
            
        } catch (error) {
            this.logToConsole(`❌ Ошибка импорта базы данных: ${error.message}`, 'error');
            this.showNotification(
                `❌ Ошибка импорта базы данных:<br>${error.message}`,
                'error'
            );
            console.error('Import database error:', error);
        } finally {
            this.importDatabaseBtn.disabled = false;
            this.importDatabaseBtn.innerHTML = '<i class="fas fa-upload"></i> Select File and Import';
            // Очищаем input для возможности повторного выбора того же файла
            event.target.value = '';
        }
    }
    
    selectDocumentFile() {
        console.log('DEBUG: selectDocumentFile() вызвана');
        
        // Предотвращаем множественные вызовы
        if (this.addDocumentBtn.disabled) {
            console.log('DEBUG: Кнопка уже заблокирована, игнорируем вызов');
            return;
        }
        
        // Проверяем, что выбран пациент
        if (!this.selectedPatient || !this.selectedPatient.value) {
            this.logToConsole('❌ Выберите пациента из списка', 'error');
            console.log('DEBUG: Пациент не выбран');
            return;
        }
        
        // Проверяем, что выбран тип документа
        console.log('DEBUG: Проверяем documentType в selectDocumentFile:');
        console.log('DEBUG: this.documentType:', this.documentType);
        console.log('DEBUG: this.documentType.value:', this.documentType?.value);
        console.log('DEBUG: this.documentType.selectedIndex:', this.documentType?.selectedIndex);
        
        if (!this.documentType || !this.documentType.value) {
            this.logToConsole('❌ Выберите тип документа', 'error');
            console.log('DEBUG: Тип документа не выбран');
            return;
        }
        
        console.log(`DEBUG: Выбран пациент: ${this.selectedPatient.value}, тип документа: ${this.documentType.value}`);
        
        // Временно блокируем кнопку
        this.addDocumentBtn.disabled = true;
        this.addDocumentBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Выбор файла...';
        
        // Открываем диалог выбора файлов
        if (this.documentFileInput) {
            this.documentFileInput.click();
            console.log('DEBUG: Диалог выбора файлов открыт');
        } else {
            this.logToConsole('❌ Элемент выбора файлов не найден', 'error');
            console.log('DEBUG: documentFileInput не найден');
            // Восстанавливаем кнопку
            this.addDocumentBtn.disabled = false;
            this.addDocumentBtn.innerHTML = '<i class="fas fa-file-plus"></i> Добавить документ';
        }
    }
    
    async handleDocumentFileSelection(event) {
        console.log('DEBUG: handleDocumentFileSelection() вызвана');
        const files = event.target.files;
        
        if (!files || files.length === 0) {
            console.log('DEBUG: Файлы не выбраны');
            // Восстанавливаем кнопку
            this.addDocumentBtn.disabled = false;
            this.addDocumentBtn.innerHTML = '<i class="fas fa-file-plus"></i> Добавить документ';
            return;
        }
        
        console.log(`DEBUG: Выбрано файлов: ${files.length}`);
        
        // Обрабатываем каждый файл
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            console.log(`DEBUG: Обрабатываем файл ${i + 1}: ${file.name}`);
            
            try {
                await this.processDocumentFile(file);
            } catch (error) {
                console.error(`DEBUG: File processing error ${file.name}:`, error);
                this.logToConsole(`❌ Ошибка обработки файла ${file.name}: ${error.message}`, 'error');
            }
        }
        
        // Очищаем input для возможности повторного выбора того же файла
        event.target.value = '';
        
        // Восстанавливаем кнопку
        this.addDocumentBtn.disabled = false;
        this.addDocumentBtn.innerHTML = '<i class="fas fa-file-plus"></i> Добавить документ';
        console.log('DEBUG: Кнопка восстановлена');
    }
    
    async processDocumentFile(file) {
        console.log(`DEBUG: processDocumentFile() для файла: ${file.name}, тип: ${file.type || 'не определен'}`);
        
        // Проверяем тип файла
        const fileExtension = file.name.toLowerCase().split('.').pop();
        const supportedExtensions = ['pdf', 'txt', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'gif'];
        // Поддерживаемые MIME типы (для обратной совместимости)
        const supportedTypes = [
            'application/pdf', 
            'text/plain', 
            'application/msword', 
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'image/jpeg', 
            'image/jpg', 
            'image/png', 
            'image/gif'
        ];
        
        // Проверяем по расширению файла (более надежный способ)
        const isSupportedByExtension = supportedExtensions.includes(fileExtension);
        // Проверяем по MIME типу (может быть пустым в некоторых браузерах)
        const isSupportedByType = file.type && supportedTypes.includes(file.type);
        
        if (!isSupportedByExtension && !isSupportedByType) {
            console.log(`DEBUG: Файл ${file.name} - расширение: ${fileExtension}, тип: ${file.type}`);
            this.logToConsole(`❌ Неподдерживаемый тип файла: ${file.name}`, 'error');
            return;
        }
        
        // Используем выбранный пользователем тип документа
        let documentType = 'other';
        console.log('DEBUG: Проверяем documentType элемент:', this.documentType);
        console.log('DEBUG: documentType.value:', this.documentType?.value);
        console.log('DEBUG: documentType.selectedIndex:', this.documentType?.selectedIndex);
        
        if (this.documentType && this.documentType.value) {
            documentType = this.documentType.value;
            console.log(`DEBUG: Используется выбранный тип документа: ${documentType}`);
        } else {
            // Fallback: определяем тип документа на основе расширения
            console.log('DEBUG: documentType не найден или не имеет значения, используем fallback');
            // PDF теперь рассматривается как изображение (scan_result)
            if (fileExtension === 'pdf') {
                documentType = 'scan_result';
            } else if (['doc', 'docx'].includes(fileExtension)) {
                documentType = 'medical_record';
            } else if (fileExtension === 'txt') {
                documentType = 'diagnosis';
            } else if (['jpg', 'jpeg', 'png', 'gif'].includes(fileExtension)) {
                documentType = 'scan_result';
            }
            console.log(`DEBUG: Тип документа определен автоматически как: ${documentType}`);
        }
        
        // Читаем содержимое файла
        const content = await this.readFileContent(file);
        console.log(`DEBUG: Содержимое файла прочитано, длина: ${content.length}`);
        
        // Добавляем документ к пациенту
        await this.addDocumentToPatient(content, documentType, file.name);
    }
    
    async readFileContent(file) {
        const fileExtension = file.name.toLowerCase().split('.').pop();
        const fileType = file.type || '';
        let content;
        
        console.log(`DEBUG: readFileContent - файл: ${file.name}, расширение: ${fileExtension}, MIME тип: ${fileType}`);
        
        try {
            // Обработка PDF файлов как изображений (OCR)
            // Проверяем и по расширению, и по MIME типу
            if (fileExtension === 'pdf' || fileType === 'application/pdf' || fileType === 'application/x-pdf') {
                console.log('DEBUG: Обрабатываем PDF файл через OCR (как изображение)');
                content = await this.extractTextFromPDF(file);
                console.log('DEBUG: PDF файл обработан через OCR, длина текста:', content.length);
            }
            // Обработка файлов Word
            else if (fileExtension === 'docx') {
                console.log('DEBUG: Обрабатываем DOCX файл с помощью mammoth.js');
                
                // Проверяем наличие mammoth.js
                if (typeof mammoth === 'undefined') {
                    throw new Error('Mammoth.js библиотека не загружена. Пожалуйста, обновите страницу.');
                }
                
                const arrayBuffer = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target.result);
                    reader.onerror = () => reject(new Error('Ошибка чтения файла'));
                    reader.readAsArrayBuffer(file);
                });
                
                const result = await mammoth.extractRawText({arrayBuffer: arrayBuffer});
                content = result.value;
                console.log('DEBUG: DOCX файл обработан, длина текста:', content.length);
                console.log('DEBUG: Первые 200 символов текста:', content.substring(0, 200));
                
                // Проверяем, что текст не пустой
                if (!content.trim()) {
                    console.warn('DEBUG: Внимание! Извлеченный текст пустой');
                }
            }
            // Обработка старых файлов Word (.doc)
            else if (fileExtension === 'doc') {
                console.log('DEBUG: Файл .doc не поддерживается, используйте .docx');
                throw new Error('Файлы .doc не поддерживаются. Пожалуйста, сохраните файл в формате .docx');
            }
            // Обработка изображений через OCR
            else if (['jpg', 'jpeg', 'png', 'gif'].includes(fileExtension)) {
                console.log('DEBUG: Обрабатываем изображение через OCR');
                content = await this.extractTextFromImage(file);
                console.log('DEBUG: Изображение обработано через OCR, длина текста:', content.length);
            }
            // Для текстовых файлов читаем как текст
            else if ((file.type && file.type.startsWith('text/')) || fileExtension === 'txt') {
                content = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target.result);
                    reader.onerror = () => reject(new Error('Ошибка чтения файла'));
                    reader.readAsText(file);
                });
                console.log('DEBUG: Текстовый файл прочитан, длина:', content.length);
            }
            // Для остальных файлов читаем как base64 (fallback)
            else {
                content = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target.result);
                    reader.onerror = () => reject(new Error('Ошибка чтения файла'));
                    reader.readAsDataURL(file);
                });
                console.log('DEBUG: Файл прочитан как base64, длина:', content.length);
            }
            
            return content;
        } catch (error) {
            console.error('DEBUG: File processing error:', error);
            throw error;
        }
    }
    
    async addDocumentToPatient(content, documentType, fileName, manageButton = true) {
        console.log(`DEBUG: addDocumentToPatient() для файла: ${fileName}`);
        
        try {
            // Управляем кнопкой только если это не массовый импорт
            if (manageButton && this.addDocumentBtn) {
                this.addDocumentBtn.disabled = true;
                this.addDocumentBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Добавление...';
            }
            
            const requestData = {
                patient_id: parseInt(this.selectedPatient.value),
                document_type: documentType,
                content: content,
                filename: fileName
            };
            
            console.log('DEBUG: Отправляем запрос с данными:', {
                ...requestData,
                content: content.substring(0, 100) + '...' // Показываем только первые 100 символов
            });
            
            const response = await this.fetchWithTimeout(`${this.apiBaseUrl}/patients/${this.selectedPatient.value}/documents`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestData)
            });
            
            console.log('DEBUG: Получен ответ:', response.status, response.statusText);
            
            const data = await response.json();
            console.log('DEBUG: Данные ответа:', data);
            
            if (response.ok) {
                // Логируем только если это не массовый импорт (чтобы не засорять консоль)
                if (manageButton) {
                    const fileExtension = fileName.toLowerCase().split('.').pop();
                    const documentTypeText = this.getDocumentTypeText(documentType);
                    const message = fileExtension === 'docx' 
                        ? `✅ Документ "${fileName}" (${documentTypeText}, текст извлечен) добавлен к пациенту (ID документа: ${data.id})`
                        : `✅ Документ "${fileName}" (${documentTypeText}) добавлен к пациенту (ID документа: ${data.id})`;
                    this.logToConsole(message, 'success');
                    
                    // Обновляем статистику
                    await this.updatePatientsStats();
                }
            } else {
                throw new Error(data.detail || 'Ошибка добавления документа');
            }
        } catch (error) {
            console.log('DEBUG: Error:', error);
            // Логируем только если это не массовый импорт (ошибки массового импорта обрабатываются отдельно)
            if (manageButton) {
                this.logToConsole(`❌ Ошибка добавления документа "${fileName}": ${error.message}`, 'error');
            }
            throw error; // Пробрасываем ошибку дальше для обработки в массовом импорте
        } finally {
            // Восстанавливаем кнопку только если мы её управляем
            if (manageButton && this.addDocumentBtn) {
                this.addDocumentBtn.disabled = false;
                this.addDocumentBtn.innerHTML = '<i class="fas fa-file-plus"></i> Добавить документ';
            }
        }
    }

    async addDocument() {
        console.log('DEBUG: addDocument() вызвана');
        console.log('DEBUG: this:', this);
        console.log('DEBUG: selectedPatient:', this.selectedPatient);
        console.log('DEBUG: selectedPatient.value:', this.selectedPatient?.value);
        console.log('DEBUG: documentContent:', this.documentContent);
        console.log('DEBUG: documentContent.value:', this.documentContent?.value);
        console.log('DEBUG: documentType:', this.documentType);
        console.log('DEBUG: documentType.value:', this.documentType?.value);
        
        // Дополнительная проверка доступности элементов
        if (!this.selectedPatient) {
            this.logToConsole('❌ Элемент выбора пациента не найден', 'error');
            console.log('DEBUG: selectedPatient элемент не найден');
            return;
        }
        
        if (!this.documentContent) {
            this.logToConsole('❌ Элемент содержимого документа не найден', 'error');
            console.log('DEBUG: documentContent элемент не найден');
            return;
        }
        
        // Проверяем, что выбран пациент
        if (!this.selectedPatient.value) {
            this.logToConsole('❌ Выберите пациента из списка', 'error');
            console.log('DEBUG: Пациент не выбран');
            return;
        }
        
        // Проверяем, что введено содержимое документа
        if (!this.documentContent) {
            this.logToConsole('❌ Поле содержимого документа не найдено', 'error');
            console.log('DEBUG: documentContent элемент не найден');
            return;
        }
        
        if (!this.documentContent.value || !this.documentContent.value.trim()) {
            this.logToConsole('❌ Введите содержимое документа', 'error');
            console.log('DEBUG: Содержимое документа пустое или содержит только пробелы');
            console.log('DEBUG: documentContent.value:', JSON.stringify(this.documentContent.value));
            console.log('DEBUG: documentContent.value.length:', this.documentContent.value?.length);
            console.log('DEBUG: documentContent.value.trim():', JSON.stringify(this.documentContent.value?.trim()));
            console.log('DEBUG: documentContent.value.trim().length:', this.documentContent.value?.trim()?.length);
            
            // Попробуем получить значение напрямую из DOM
            const directElement = document.getElementById('documentContent');
            if (directElement) {
                console.log('DEBUG: Прямое обращение к элементу:');
                console.log('DEBUG: directElement.value:', JSON.stringify(directElement.value));
                console.log('DEBUG: directElement.value.length:', directElement.value?.length);
                console.log('DEBUG: directElement.value.trim():', JSON.stringify(directElement.value?.trim()));
            }
            return;
        }
        
        console.log('DEBUG: Все проверки пройдены, отправляем запрос');
        
        try {
            this.addDocumentBtn.disabled = true;
            this.addDocumentBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Добавление...';
            
            const requestData = {
                    patient_id: parseInt(this.selectedPatient.value),
                    document_type: this.documentType?.value || 'other',
                    content: this.documentContent.value.trim()
            };
            
            console.log('DEBUG: Отправляем запрос с данными:', requestData);
            console.log('DEBUG: URL:', `${this.apiBaseUrl}/patients/${this.selectedPatient.value}/documents`);
            
            const response = await this.fetchWithTimeout(`${this.apiBaseUrl}/patients/${this.selectedPatient.value}/documents`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestData)
            });
            
            console.log('DEBUG: Получен ответ:', response.status, response.statusText);
            
            const data = await response.json();
            console.log('DEBUG: Данные ответа:', data);
            
            if (response.ok) {
                this.logToConsole(`✅ Документ добавлен к пациенту (ID документа: ${data.id})`, 'success');
                
                // Очищаем содержимое документа
                if (this.documentContent) this.documentContent.value = '';
            } else {
                throw new Error(data.detail || 'Ошибка добавления документа');
            }
        } catch (error) {
            console.log('DEBUG: Error:', error);
            this.logToConsole(`❌ Ошибка добавления документа: ${error.message}`, 'error');
        } finally {
            // Восстанавливаем кнопку
            if (this.addDocumentBtn) {
                this.addDocumentBtn.disabled = false;
                this.addDocumentBtn.innerHTML = '<i class="fas fa-file-plus"></i> Добавить документ';
            }
        }
    }

    // Обновление информации о количестве пациентов для анализа
    updatePatientAnalysisCount() {
        if (!this.patientAnalysisPercent || !this.patientAnalysisCountValue) return;
        
        const percent = parseFloat(this.patientAnalysisPercent.value) || 100;
        const totalPatients = this.allPatientsList.length;
        
        if (totalPatients === 0) {
            // Если список еще не загружен, пытаемся загрузить
            this.loadPatientsList().then(() => {
                this.updatePatientAnalysisCount();
            });
            return;
        }
        
        if (percent >= 100) {
            this.patientAnalysisCountValue.textContent = `все (${totalPatients})`;
        } else {
            const count = Math.max(1, Math.round((totalPatients * percent) / 100));
            this.patientAnalysisCountValue.textContent = `${count} из ${totalPatients} (${percent}%)`;
        }
    }

    // Получение списка ID пациентов для анализа (с учетом процента)
    getSelectedPatientIds() {
        const percent = parseFloat(this.patientAnalysisPercent?.value) || 100;
        const totalPatients = this.allPatientsList.length;
        
        if (totalPatients === 0) {
            return null; // Вернет null, чтобы использовать всех пациентов
        }
        
        if (percent >= 100) {
            return null; // null означает "все пациенты"
        }
        
        // Выбираем случайные пациенты для тестирования
        const count = Math.max(1, Math.round((totalPatients * percent) / 100));
        const shuffled = [...this.allPatientsList].sort(() => Math.random() - 0.5);
        const selected = shuffled.slice(0, count);
        
        return selected.map(p => p.id);
    }

    // Автоматический анализ всех пациентов
    async runPatientAnalysis() {
        const query = this.patientAnalysisQuestions?.value?.trim();
        if (!query) {
            this.logToConsole('❌ Введите вопросы для анализа пациентов', 'error');
            return;
        }
        if (!this.currentModel) {
            this.logToConsole('❌ Модель не выбрана. Сначала загрузите модель', 'error');
            return;
        }

        // Используем системный промпт ТОЛЬКО из поля System Prompt (как в чате)
        const useSystemPrompt = !!(this.useSystemPrompt?.checked && this.systemPrompt?.value?.trim());
        const systemPrompt = useSystemPrompt ? this.systemPrompt.value.trim() : null;
        
        // Логируем для отладки
        console.log('DEBUG: runPatientAnalysis - системный промпт:', {
            useSystemPrompt: useSystemPrompt,
            systemPromptLength: systemPrompt ? systemPrompt.length : 0,
            systemPromptPreview: systemPrompt ? systemPrompt.substring(0, 200) : 'не используется'
        });
        const useMemoRag = !!this.patientAnalysisUseMemoRag?.checked;
        const topK = 5; // Используем стандартное значение
        const contextLength = 200; // Используем стандартное значение
        
        // Логируем значение чекбокса для отладки
        console.log('DEBUG: runPatientAnalysis - MemoRAG настройки:', {
            checkboxElement: this.patientAnalysisUseMemoRag,
            checkboxChecked: this.patientAnalysisUseMemoRag?.checked,
            useMemoRag: useMemoRag,
            topK: topK,
            contextLength: contextLength
        });

        // Удаляем префикс ollama: из имени модели, если он есть
        let modelName = this.currentModel;
        if (modelName && modelName.startsWith('ollama:')) {
            modelName = modelName.replace('ollama:', '');
        }
        
        if (!modelName) {
            this.logToConsole('❌ Модель не выбрана. Сначала выберите и загрузите модель', 'error');
            if (this.runPatientAnalysisBtn) this.runPatientAnalysisBtn.disabled = false;
            return;
        }
        
        // Загружаем список пациентов, если еще не загружен
        if (!this.allPatientsList || this.allPatientsList.length === 0) {
            try {
                const response = await this.fetchWithTimeout(`${this.apiBaseUrl}/patients`);
                const data = await response.json();
                if (response.ok && Array.isArray(data)) {
                    this.allPatientsList = data;
                    this.updatePatientAnalysisCount();
                }
            } catch (error) {
                console.warn('Не удалось загрузить список пациентов:', error);
            }
        }

        // Получаем список ID пациентов для анализа
        const patientIds = this.getSelectedPatientIds();
        const percent = parseFloat(this.patientAnalysisPercent?.value) || 100;
        const totalPatients = this.allPatientsList.length;
        const selectedCount = patientIds ? patientIds.length : totalPatients;
        
        if (patientIds && patientIds.length === 0) {
            this.logToConsole('❌ Не удалось выбрать пациентов для анализа', 'error');
            return;
        }
        
        if (percent < 100 && selectedCount > 0) {
            this.logToConsole(`📊 Будет проанализировано: ${selectedCount} из ${totalPatients} пациентов (${percent}%)`, 'info');
        }
        
        const payload = {
            query,
            model: modelName,
            system_prompt: systemPrompt,
            use_memorag: useMemoRag,
            memorag_top_k: topK,
            memorag_context_length: contextLength,
            max_tokens: parseInt(this.maxTokens?.value || '2000', 10),
            temperature: parseFloat(this.temperature?.value || '0.7'),
            top_p: parseFloat(this.topP?.value || '0.9'),
            top_k: parseInt(this.topK?.value || '40', 10),
            patient_ids: patientIds // Передаем список ID или null для всех
        };
        
        console.log('DEBUG: runPatientAnalysis: Payload:', {
            query: query.substring(0, 100) + '...',
            model: modelName,
            use_memorag: useMemoRag,
            system_prompt_length: systemPrompt ? systemPrompt.length : 0
        });

        if (this.runPatientAnalysisBtn) this.runPatientAnalysisBtn.disabled = true;
        if (this.downloadPatientAnalysisBtn) this.downloadPatientAnalysisBtn.disabled = true;
        if (this.patientAnalysisProgress) {
            this.patientAnalysisProgress.style.display = 'block';
        }
        if (this.patientAnalysisProgressText) {
            // Очищаем содержимое и добавляем иконку загрузки
            this.patientAnalysisProgressText.innerHTML = '';
            const spinner = document.createElement('i');
            spinner.className = 'fas fa-spinner fa-spin';
            spinner.style.marginRight = '5px';
            this.patientAnalysisProgressText.appendChild(spinner);
            this.patientAnalysisProgressText.appendChild(document.createTextNode('Запуск анализа всех пациентов...'));
        }
        if (this.patientAnalysisProgressFill) {
            this.patientAnalysisProgressFill.style.width = '0%';
            this.patientAnalysisProgressFill.style.backgroundColor = '#007acc'; // Возвращаем синий цвет
        }
        if (this.patientAnalysisProgressCounter) this.patientAnalysisProgressCounter.textContent = '0 / 0';
        if (this.patientAnalysisCurrentPatient) this.patientAnalysisCurrentPatient.textContent = '';
        if (this.patientAnalysisSummary) this.patientAnalysisSummary.style.display = 'none';
        
        // Сбрасываем счетчики
        this.patientAnalysisCurrent = 0;
        this.patientAnalysisTotal = 0;
        
        // Очищаем накопленные результаты и останавливаем автосохранение
        this.accumulatedResults = [];
        this.stopAutoSave();
        this.analysisStartTime = new Date(); // Сохраняем время начала анализа
        this.autoSaveFileName = null; // Сбрасываем имя файла
        this.autoSaveFileHandle = null; // Сбрасываем file handle
        this.savedPatientIds.clear(); // Clear list сохраненных ID

        try {
            this.logToConsole('🔄 Начинается автоматический анализ всех пациентов...', 'info');
            
            // Увеличиваем таймаут для больших наборов пациентов
            // Для 163 пациентов при ~10 секунд на пациента = ~27 минут минимум
            // Добавляем запас для надежности
            const timeoutMs = 3600000; // 60 минут (1 час) для очень больших наборов
            const response = await this.fetchWithTimeout(`${this.apiBaseUrl}/patients/batch-query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }, timeoutMs);

            const data = await response.json().catch(() => ({}));
            if (!response.ok || data.status !== 'success') {
                const detail = data.detail || data.message || `HTTP ${response.status}`;
                throw new Error(detail);
            }

            this.lastPatientAnalysisResults = Array.isArray(data.results) ? data.results : [];
            const total = data.total ?? this.lastPatientAnalysisResults.length;
            const success = data.success ?? 0;
            const failed = data.failed ?? 0;

            // Активируем кнопку загрузки сразу после получения результатов
            if (this.downloadPatientAnalysisBtn && this.lastPatientAnalysisResults && this.lastPatientAnalysisResults.length > 0) {
                this.downloadPatientAnalysisBtn.disabled = false;
                console.log(`DEBUG: Кнопка загрузки активирована после получения результатов (${this.lastPatientAnalysisResults.length} результатов)`);
            }

            // Если WebSocket сообщение о завершении не пришло, обрабатываем завершение здесь
            // (fallback на случай разрыва WebSocket соединения)
            if (this.patientAnalysisProgress && this.patientAnalysisProgress.style.display !== 'none') {
                this.handlePatientAnalysisComplete({
                    total: total,
                    success: success,
                    failed: failed,
                    message: 'Анализ всех пациентов завершен'
                });
            }
        } catch (e) {
            // Проверяем, есть ли накопленные результаты через WebSocket
            const hasAccumulatedResults = this.accumulatedResults && this.accumulatedResults.length > 0;
            const isTimeoutError = e.message && (e.message.includes('Таймаут') || e.message.includes('timeout') || e.message.includes('Timeout'));
            
            if (hasAccumulatedResults && isTimeoutError) {
                // Если есть результаты, но произошел таймаут - это частичный успех
                // Результаты уже сохранены через WebSocket и автосохранение
                this.logToConsole(`⚠️ Таймаут запроса, но получено ${this.accumulatedResults.length} результатов через WebSocket. Результаты сохранены.`, 'warning');
                
                // Активируем кнопку загрузки, если есть результаты
                if (this.downloadPatientAnalysisBtn && this.accumulatedResults.length > 0) {
                    this.downloadPatientAnalysisBtn.disabled = false;
                    console.log(`DEBUG: Кнопка загрузки активирована после таймаута (${this.accumulatedResults.length} результатов)`);
                }
                
                // Обновляем lastPatientAnalysisResults из накопленных
                this.lastPatientAnalysisResults = [...this.accumulatedResults];
                
                // Показываем предупреждение вместо ошибки
                if (this.patientAnalysisProgressText) {
                    const spinner = this.patientAnalysisProgressText.querySelector('i.fa-spinner');
                    if (spinner) {
                        spinner.remove();
                    }
                    this.patientAnalysisProgressText.innerHTML = `<i class="fas fa-exclamation-triangle" style="color: #ffc107; margin-right: 5px;"></i> Таймаут запроса, но получено ${this.accumulatedResults.length} результатов`;
                }
                
                if (this.patientAnalysisSummary) {
                    this.patientAnalysisSummary.innerHTML = `
                        <strong style="color: #ffc107;">⚠ Частичный успех</strong><br>
                        Таймаут основного запроса, но получено ${this.accumulatedResults.length} результатов через WebSocket.<br>
                        Результаты автоматически сохранены в Excel файл.
                    `;
                    this.patientAnalysisSummary.style.display = 'block';
                }
            } else {
                // Настоящая ошибка - нет результатов
                this.logToConsole(`❌ Ошибка анализа пациентов: ${e.message}`, 'error');
                
                // Показываем ошибку в прогресс-баре
                if (this.patientAnalysisProgressText) {
                    // Удаляем иконку загрузки
                    const spinner = this.patientAnalysisProgressText.querySelector('i.fa-spinner');
                    if (spinner) {
                        spinner.remove();
                    }
                    // Добавляем иконку ошибки
                    const errorIcon = document.createElement('i');
                    errorIcon.className = 'fas fa-exclamation-circle';
                    errorIcon.style.marginRight = '5px';
                    errorIcon.style.color = '#dc3545';
                    this.patientAnalysisProgressText.insertBefore(errorIcon, this.patientAnalysisProgressText.firstChild);
                    this.patientAnalysisProgressText.textContent = `❌ Ошибка анализа пациентов: ${e.message}`;
                    // Вставляем иконку в начало
                    this.patientAnalysisProgressText.insertBefore(errorIcon, this.patientAnalysisProgressText.firstChild);
                }
                
                // Устанавливаем красный цвет для прогресс-бара
                if (this.patientAnalysisProgressFill) {
                    this.patientAnalysisProgressFill.style.backgroundColor = '#dc3545';
                }
                
                // Показываем сводку с ошибкой
                if (this.patientAnalysisSummary) {
                    this.patientAnalysisSummary.innerHTML = `
                        <strong style="color: #dc3545;">✗ Ошибка анализа</strong><br>
                        ${e.message}
                    `;
                    this.patientAnalysisSummary.style.display = 'block';
                }
            }
        } finally {
            if (this.runPatientAnalysisBtn) this.runPatientAnalysisBtn.disabled = false;
            // Останавливаем автосохранение при завершении (включая ошибки)
            this.stopAutoSave();
            // Выполняем финальное сохранение, если есть накопленные результаты
            if (this.accumulatedResults && this.accumulatedResults.length > 0) {
                this.autoSaveToExcel();
            }
            // НЕ скрываем прогресс автоматически - оставляем видимым для пользователя
            // Пользователь может видеть результаты и сам решить, когда закрыть
            // Прогресс будет скрыт только при следующем запуске анализа
        }
    }

    downloadPatientAnalysisResults() {
        const results = Array.isArray(this.lastPatientAnalysisResults) ? this.lastPatientAnalysisResults : [];
        if (results.length === 0) {
            this.logToConsole('⚠️ Нет результатов для экспорта', 'warning');
            return;
        }
        if (typeof XLSX === 'undefined') {
            this.logToConsole('❌ SheetJS не загружен. Обновите страницу и попробуйте снова.', 'error');
            return;
        }

        // Excel ограничение: максимум 32767 символов в ячейке
        const MAX_CELL_LENGTH = 32767;
        
        // Функция для обрезки текста с добавлением сообщения
        // Сохраняем КОНЕЦ текста (где находится ответ), обрезаем НАЧАЛО (где могут быть повторяющиеся вопросы)
        const truncateText = (text, maxLength) => {
            if (!text || text.length <= maxLength) {
                return text || '';
            }
            
            // Размер сообщения об обрезке (примерно 150 символов)
            const messageSize = 150;
            const availableLength = maxLength - messageSize;
            
            // Сохраняем только конец текста (где находится ответ)
            const end = text.substring(text.length - availableLength);
            const removedLength = text.length - availableLength;
            
            return `[... TEXT TRUNCATED: ${removedLength} chars removed from start (was ${text.length}, kept ${availableLength}). Start may have repeated questions ...]\n\n` + end;
        };

        // Формируем данные с правильными названиями колонок
        const headers = ['Patient', 'final prompt', 'llm response'];
        const rows = results.map((row) => {
            const prompt = row.prompt || '';
            const response = row.response || (row.error ? `Error: ${row.error}` : '');
            
            return {
                'Patient': row.patient_name || `ID ${row.patient_id}`,
                'final prompt': truncateText(prompt, MAX_CELL_LENGTH),
                'llm response': truncateText(response, MAX_CELL_LENGTH)
            };
        });

        // Подсчитываем, сколько текстов было обрезано
        let truncatedCount = 0;
        results.forEach((row) => {
            const prompt = row.prompt || '';
            const response = row.response || '';
            if (prompt.length > MAX_CELL_LENGTH) truncatedCount++;
            if (response.length > MAX_CELL_LENGTH) truncatedCount++;
        });

        const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Patient Analysis');

        const filename = `patient-analysis-${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(workbook, filename);

        if (truncatedCount > 0) {
            this.logToConsole(`📥 Результаты анализа выгружены в Excel (${truncatedCount} полей были обрезаны из-за ограничения Excel)`, 'warning');
        } else {
            this.logToConsole('📥 Результаты анализа выгружены в Excel', 'success');
        }
    }
    
}

// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
    window.lmStudioClone = new LMStudioClone();
});