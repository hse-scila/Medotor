// OCR-related methods split from LMStudioClone into prototype extensions
// This file must be loaded after the main class definition in script.js

/* global LMStudioClone */

if (typeof LMStudioClone !== 'undefined') {
    // ocrDocument
    LMStudioClone.prototype.ocrDocument = async function() {
        try {
            if (!this.selectedPatient || !this.selectedPatient.value) {
                this.logToConsole('❌ Please select a patient first', 'error');
                return;
            }

            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'image/*,.pdf,application/pdf';
            fileInput.multiple = true;
            fileInput.style.display = 'none';

            fileInput.addEventListener('change', async (event) => {
                const files = Array.from(event.target.files);
                if (files.length === 0) {
                    this.ocrDocumentBtn.disabled = false;
                    this.ocrDocumentBtn.innerHTML = '<i class="fas fa-camera"></i> OCR extraction';
                    return;
                }

                this.ocrDocumentBtn.disabled = true;
                this.ocrDocumentBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

                try {
                    for (const file of files) {
                        if (file.size > 10 * 1024 * 1024) {
                            this.logToConsole(`❌ Файл ${file.name} слишком большой (максимум 10MB)`, 'error');
                            continue;
                        }

                        const fileExtension = file.name.toLowerCase().split('.').pop();
                        const isImage = file.type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif'].includes(fileExtension);
                        const isPDF = fileExtension === 'pdf' || file.type === 'application/pdf' || file.type === 'application/x-pdf';

                        if (!isImage && !isPDF) {
                            this.logToConsole(`❌ Файл ${file.name} не является изображением или PDF`, 'error');
                            continue;
                        }

                        await this.processOCRFile(file, false);
                    }
                } finally {
                    this.ocrDocumentBtn.disabled = false;
                    this.ocrDocumentBtn.innerHTML = '<i class="fas fa-camera"></i> OCR extraction';
                }
            });

            document.body.appendChild(fileInput);
            fileInput.click();
            setTimeout(() => { document.body.removeChild(fileInput); }, 100);
        } catch (error) {
            this.logToConsole(`❌ Ошибка OCR: ${error.message}`, 'error');
        }
    };

    // processOCRFile
    LMStudioClone.prototype.processOCRFile = async function(file, manageButton = true) {
        try {
            if (!this.selectedPatient || !this.selectedPatient.value) {
                this.logToConsole('❌ Please select a patient first', 'error');
                return;
            }

            if (manageButton) {
                this.ocrDocumentBtn.disabled = true;
                this.ocrDocumentBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
            }

            const fileExtension = file.name.toLowerCase().split('.').pop();
            const isPDF = fileExtension === 'pdf' || file.type === 'application/pdf' || file.type === 'application/x-pdf';

            let extractedText = '';
            let confidence = 0;

            if (isPDF) {
                console.log(`DEBUG: Обрабатываем PDF через OCR: ${file.name}`);
                extractedText = await this.extractTextFromPDF(file);
                confidence = 85.0;
            } else {
                const formData = new FormData();
                formData.append('file', file);

                const response = await this.fetchWithTimeout(`${this.apiBaseUrl}/ocr/extract-text`, {
                    method: 'POST',
                    body: formData
                });

                const data = await response.json();
                if (response.ok && data.status === 'success') {
                    extractedText = data.text || '';
                    confidence = data.confidence || 0;
                } else {
                    throw new Error(data.detail || 'OCR processing error');
                }
            }

            if (extractedText && extractedText.trim()) {
                await this.createDocumentFromOCR(
                    parseInt(this.selectedPatient.value),
                    file.name,
                    extractedText,
                    confidence
                );
            } else {
                this.logToConsole(`⚠️ No text found in ${isPDF ? 'the PDF file' : 'the image'}`, 'warning');
            }
        } catch (error) {
            console.error(`DEBUG: Ошибка OCR: ${error}`);
            this.logToConsole(`❌ Ошибка OCR: ${error.message}`, 'error');
        } finally {
            if (manageButton) {
                this.ocrDocumentBtn.disabled = false;
                this.ocrDocumentBtn.innerHTML = '<i class="fas fa-camera"></i> OCR extraction';
            }
        }
    };

    // createDocumentFromOCR
    LMStudioClone.prototype.createDocumentFromOCR = async function(patientId, filename, text, confidence) {
        try {
            const documentType = this.getDocumentTypeFromFilename(filename);
            const documentContent = this.formatOCRDocument(filename, text, confidence);

            const response = await this.fetchWithTimeout(`${this.apiBaseUrl}/patients/${patientId}/documents`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    patient_id: patientId,
                    document_type: documentType,
                    content: documentContent
                })
            });

            const data = await response.json();

            if (response.ok) {
                this.logToConsole(`✅ Документ создан из ${filename}`, 'success');
                this.logToConsole(`📄 Уровень уверенности OCR: ${confidence.toFixed(1)}%`, 'info');
                await this.updatePatientsStats();
                await this.loadPatientDocuments(patientId);
                if (this.documentContent) {
                    this.documentContent.value = '';
                }
            } else {
                throw new Error(data.detail || 'Document creation error');
            }
        } catch (error) {
            this.logToConsole(`❌ Ошибка создания документа: ${error.message}`, 'error');
        }
    };

    // getDocumentTypeFromFilename
    LMStudioClone.prototype.getDocumentTypeFromFilename = function(filename) {
        const filename_lower = filename.toLowerCase();
        if (filename_lower.includes('диагноз') || filename_lower.includes('diagnosis')) {
            return 'diagnosis';
        } else if (filename_lower.includes('рецепт') || filename_lower.includes('prescription')) {
            return 'prescription';
        } else if (filename_lower.includes('анализ') || filename_lower.includes('lab') || filename_lower.includes('result')) {
            return 'lab_result';
        } else if (filename_lower.includes('сканирование') || filename_lower.includes('scan') || filename_lower.includes('мрт') || filename_lower.includes('кт')) {
            return 'scan_result';
        } else if (filename_lower.includes('карта') || filename_lower.includes('медицинская') || filename_lower.includes('medical')) {
            return 'medical_record';
        } else {
            return 'other';
        }
    };

    // formatOCRDocument
    LMStudioClone.prototype.formatOCRDocument = function(filename, text, confidence) {
        const timestamp = new Date().toLocaleString('ru-RU');
        return `=== ДОКУМЕНТ ИЗ ОБРАЗА ===\nФайл: ${filename}\nДата обработки: ${timestamp}\nУровень уверенности OCR: ${confidence.toFixed(1)}%\n=== СОДЕРЖИМОЕ ===\n${text}\n\n=== КОНЕЦ ДОКУМЕНТА ===`;
    };

    // extractTextFromImage
    LMStudioClone.prototype.extractTextFromImage = async function(imageBlob) {
        try {
            console.log(`DEBUG: Начинаем OCR обработку изображения`);
            const formData = new FormData();
            formData.append('file', imageBlob);
            const response = await this.fetchWithTimeout(`${this.apiBaseUrl}/ocr/extract-text`, {
                method: 'POST',
                body: formData
            });
            let data = null;
            try { data = await response.json(); } catch (_) {}
            console.log(`DEBUG: OCR ответ получен:`, data);
            if (response.ok && data && data.status === 'success') {
                const extractedText = data.text || '';
                console.log(`DEBUG: OCR извлек текст, длина: ${extractedText.length} символов`);
                return extractedText.trim() ? extractedText : '';
            } else {
                const detail = (data && (data.detail || data.message)) || `HTTP ${response.status}`;
                this.logToConsole(`⚠️ OCR неуспешен: ${detail}`, 'warning');
                return '';
            }
        } catch (error) {
            this.logToConsole(`❌ Ошибка OCR: ${error.message}`, 'error');
            return '';
        }
    };
}


