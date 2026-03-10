// Методы RAG/MemoRAG вынесены сюда
// Подключение: после script.js, не как ES6-модуль

if (typeof window !== 'undefined' && window.LMStudioClone) {
    // === RAG ===
    LMStudioClone.prototype.loadRagConfig = async function() {/*... код того же метода ...*/}
    LMStudioClone.prototype.loadOllamaEmbeddingModels = async function() {/*...*/}
    LMStudioClone.prototype.configureRag = async function() {/*...*/}
    LMStudioClone.prototype.splitFileIntoChunks = async function(file, chunkSizeMB = 5) {/*...*/}
    LMStudioClone.prototype.uploadFiles = async function() {/*...*/}
    LMStudioClone.prototype.showEmbeddingProgress = async function(totalChunks) {/*...*/}
    LMStudioClone.prototype.stopEmbeddingProcess = function() {/*...*/}
    LMStudioClone.prototype.toggleChunkingSettings = function() {/*...*/}
    LMStudioClone.prototype.updateRagStats = async function() {/*...*/}
    LMStudioClone.prototype.addDocuments = async function() {/*...*/}
    LMStudioClone.prototype.searchDocuments = async function() {/*...*/}
    LMStudioClone.prototype.displaySearchResults = function(results) {/*...*/}
    LMStudioClone.prototype.clearRag = async function() {/*...*/}
    LMStudioClone.prototype.clearRagIndex = async function() {/*...*/}
    LMStudioClone.prototype.resetRag = async function() {/*...*/}
    // === Логи ===
    LMStudioClone.prototype.refreshLogs = async function() {/*...*/}
    LMStudioClone.prototype.updateLogStats = async function() {/*...*/}
    LMStudioClone.prototype.displayLogs = function(logs) {/*...*/}
    LMStudioClone.prototype.clearLogs = async function() {/*...*/}
    // === MemoRAG ===
    LMStudioClone.prototype.updateMemoRagStats = async function() {/*...*/}
    // ... другие по аналогии ...
}

// Реальные реализации подставить из script.js
