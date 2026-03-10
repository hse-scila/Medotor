// Пациенты: вспомогательные действия и массовый импорт (минимальная реализация)
/* global LMStudioClone */

(function(){
    try { console.log('DEBUG: patients.js loaded'); } catch(e) {}
    if (typeof LMStudioClone === 'undefined') { console.error('patients.js: LMStudioClone not found'); return; }

    LMStudioClone.prototype.refreshPatients = async function() {
        try {
            await this.updatePatientsStats();
            await this.loadPatientsList();
            this.logToConsole('✅ Patient list and stats updated', 'success');
        } catch (e) {
            this.logToConsole(`❌ Ошибка обновления списка пациентов: ${e.message}`, 'error');
        }
    };

    LMStudioClone.prototype.clearPatientsDatabase = async function() {
        if (!confirm('Are you sure you want to clear the patients DB? This action is irreversible.')) return;
        try {
            // Сразу переходим к поштучному удалению, чтобы избежать 405 в консоли
            this.logToConsole('ℹ️ Deleting all patients one by one...', 'info');

            // Получаем список пациентов
            const listResp = await this.fetchWithTimeout(`${this.apiBaseUrl}/patients`, {}, 20000);
            if (!listResp.ok) throw new Error(`Не удалось получить список пациентов (HTTP ${listResp.status})`);
            const patients = await listResp.json();
            if (!Array.isArray(patients) || patients.length === 0) {
                this.logToConsole('✅ No patients in the DB', 'success');
                await this.updatePatientsStats();
                await this.loadPatientsList();
                return;
            }

            let deleted = 0; let failed = 0;
            for (const p of patients) {
                try {
                    const delResp = await this.fetchWithTimeout(`${this.apiBaseUrl}/patients/${p.id}`, { method: 'DELETE' }, 15000);
                    if (delResp.ok) {
                        deleted += 1;
                    } else {
                        failed += 1;
                        const t = await delResp.text().catch(()=> '');
                        this.logToConsole(`⚠️ Не удалось удалить пациента ID ${p.id}: HTTP ${delResp.status} ${t || ''}`,'warning');
                    }
                } catch (err) {
                    failed += 1;
                    this.logToConsole(`⚠️ Ошибка удаления пациента ID ${p.id}: ${err.message}`, 'warning');
                }
            }
            this.logToConsole(`✅ Удалено пациентов: ${deleted}${failed?`, ошибок: ${failed}`:''}`, 'success');
            await this.updatePatientsStats();
            await this.loadPatientsList();
        } catch (e) {
            this.logToConsole(`❌ Ошибка очистки БД пациентов: ${e.message}`, 'error');
        }
    };

    LMStudioClone.prototype.selectMassImportFolder = function() {
        if (this.massImportFolder) {
            this.massImportFolder.click();
        } else {
            this.logToConsole('❌ Folder picker element not found', 'error');
        }
    };

    LMStudioClone.prototype.handleMassImportFolderSelection = function(event) {
        const files = Array.from(event.target.files || []);
        if (files.length === 0) {
            this.selectedFolderPath.textContent = 'No folder selected';
            this.startMassImportBtn.disabled = true;
            return;
        }
        // Отображаем псевдо-путь (у webkitdirectory нет одного пути)
        const firstPath = files[0].webkitRelativePath || files[0].name;
        const root = firstPath.split('/')[0] || 'Selected folder';
        this.selectedFolderPath.textContent = root + ` (files: ${files.length})`;
        this.startMassImportBtn.disabled = false;
    };

    LMStudioClone.prototype.startMassImport = async function() {
        try {
            const files = Array.from(this.massImportFolder?.files || []);
            if (files.length === 0) {
                this.logToConsole('❌ Folder not selected or empty', 'error');
                return;
            }

            // Группируем по имени каталога пациента: PatientName/.../filename
            const groups = {};
            for (const f of files) {
                const rel = f.webkitRelativePath || f.name;
                const parts = rel.split('/');
                // Если выбрана папка одного пациента (PatientName/file.docx), то parts[0] = PatientName, parts[1] = file
                // Если выбрана общая папка (Root/PatientName/file.docx), браузер обычно обрезает Root и отдаёт PatientName/file.docx
                // Поэтому корректно группировать по parts[0]
                const patientFolder = parts.length > 1 ? parts[0] : null;
                const key = patientFolder || '__flat__';
                if (!groups[key]) groups[key] = [];
                groups[key].push(f);
            }

            this.startMassImportBtn.disabled = true;
            this.stopMassImportBtn.disabled = false;
            if (this.massImportProgress) {
                this.massImportProgress.style.display = 'block';
                if (this.progressStatus) {
                    this.progressStatus.textContent = 'Preparing import...';
                }
                if (this.progressDetails) {
                    this.progressDetails.innerHTML = '';
                }
                if (this.progressBarFill) {
                    this.progressBarFill.style.width = '0%';
                }
                if (this.progressCounter) {
                    this.progressCounter.textContent = '0 / 0';
                }
            }

            // Получаем текущий список пациентов для предотвращения дублей по имени
            let existing = [];
            try {
                const r = await this.fetchWithTimeout(`${this.apiBaseUrl}/patients`, {}, 15000);
                if (r.ok) existing = await r.json();
            } catch (_) {}
            const nameToId = new Map(existing.map(p => [p.name, p.id]));

            const totalGroups = Object.keys(groups).length;
            // Подсчитываем общее количество файлов для более точного прогресса
            const totalFiles = files.length;
            let groupIndex = 0;
            let totalProcessedFiles = 0;

            // Обновляем начальный статус с информацией о количестве файлов
            if (this.progressStatus && this.massImportProgress) {
                this.progressStatus.textContent = `Найдено ${totalFiles} файлов, ${totalGroups} пациентов. Начинаем импорт...`;
            }

            // Функция для обновления прогресса
            const updateMassImportProgress = () => {
                if (this.massImportProgress && this.progressCounter && this.progressBarFill) {
                    // Показываем прогресс по пациентам и файлам
                    this.progressCounter.textContent = `${groupIndex} / ${totalGroups} пациентов • ${totalProcessedFiles} / ${totalFiles} файлов`;
                    // Используем прогресс по файлам для более точного отображения
                    const percent = totalFiles > 0 ? Math.round((totalProcessedFiles / totalFiles) * 100) : 0;
                    this.progressBarFill.style.width = percent + '%';
                    // Обновляем статус
                    if (this.progressStatus) {
                        this.progressStatus.textContent = `Обработка... ${percent}%`;
                    }
                    // Прокручиваем детали к последнему элементу
                    if (this.progressDetails) {
                        this.progressDetails.scrollTop = this.progressDetails.scrollHeight;
                    }
                }
            };

            for (const [patientKey, fileList] of Object.entries(groups)) {
                if (this._stopMassImport) break;
                groupIndex += 1;
                const isFlat = patientKey === '__flat__';
                let patientId = null;
                let patientName = null;

                if (isFlat) {
                    // Если нет подкаталогов: либо выбран patient в UI, либо ошибка
                    if (this.selectedPatient && this.selectedPatient.value) {
                        patientId = parseInt(this.selectedPatient.value);
                        patientName = (existing.find(p => p.id === patientId)?.name) || `ID ${patientId}`;
                    } else {
                        this.logToConsole('❌ For flat structure, select a patient to import into', 'error');
                        continue;
                    }
                } else {
                    patientName = patientKey;
                    if (nameToId.has(patientName)) {
                        patientId = nameToId.get(patientName);
                    } else {
                        // Создаём пациента
                        const resp = await this.fetchWithTimeout(`${this.apiBaseUrl}/patients`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                name: patientName,
                                notes: this.massImportPatientInfo?.value?.trim() || null
                            })
                        }, 20000);
                        const data = await resp.json().catch(()=>({}));
                        if (!resp.ok) {
                            this.logToConsole(`❌ Не удалось создать пациента ${patientName}: ${data.detail || resp.status}`, 'error');
                            continue;
                        }
                        patientId = data.id;
                        nameToId.set(patientName, patientId);
                        this.logToConsole(`👤 Пациент создан: ${patientName} (ID: ${patientId})`, 'success');
                    }
                }

                // Импортируем файлы для текущего пациента
                let processed = 0;
                for (const file of fileList) {
                    if (this._stopMassImport) break;
                    try {
                        // Проверяем, является ли файл изображением, чтобы показать специальное сообщение
                        const ext = file.name.toLowerCase().split('.').pop();
                        const fileType = file.type || '';
                        const isImage = fileType.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'tif'].includes(ext);
                        
                        if (isImage) {
                            const line = document.createElement('div');
                            line.textContent = `[${patientName}] Обработка изображения через OCR: ${file.name}...`;
                            line.style.color = '#17a2b8'; // Информационный цвет
                            if (this.progressDetails) {
                                this.progressDetails.appendChild(line);
                            }
                            updateMassImportProgress();
                        }
                        
                        await this._uploadFileToPatient(patientId, file);
                        processed += 1;
                        totalProcessedFiles += 1;
                        
                        const line = document.createElement('div');
                        if (isImage) {
                            line.textContent = `[${patientName}] ✅ Изображение обработано OCR: ${file.name}`;
                            line.style.color = '#28a745'; // Зеленый цвет для успеха
                        } else {
                            line.textContent = `[${patientName}] Импортирован: ${file.name}`;
                        }
                        if (this.progressDetails) {
                            // Удаляем предыдущее сообщение о обработке, если есть
                            const prevLine = Array.from(this.progressDetails.children).find(child => 
                                child.textContent.includes(file.name) && child.textContent.includes('Processing')
                            );
                            if (prevLine) prevLine.remove();
                            this.progressDetails.appendChild(line);
                        }
                        
                        // Обновляем прогресс после каждого файла
                        updateMassImportProgress();
                    } catch (err) {
                        totalProcessedFiles += 1; // Считаем и ошибки в общий прогресс
                        const line = document.createElement('div');
                        line.textContent = `[${patientName}] ❌ Ошибка: ${file.name} — ${err.message}`;
                        line.style.color = '#dc3545';
                        if (this.progressDetails) {
                            this.progressDetails.appendChild(line);
                        }
                        
                        // Обновляем прогресс даже при ошибке
                        updateMassImportProgress();
                    }
                }

                this.logToConsole(`📦 ${patientName}: ${processed}/${fileList.length} файлов`, 'info');
            }

            // Финальное обновление прогресса
            updateMassImportProgress();

            // Обновляем финальный статус
            if (this.progressStatus) {
                this.progressStatus.textContent = '✅ Import completed';
            }
            
            this.logToConsole('✅ Bulk import completed', 'success');
            await this.updatePatientsStats();
            await this.loadPatientsList();
        } catch (error) {
            // Обработка ошибок
            if (this.progressStatus) {
                this.progressStatus.textContent = '❌ Import error';
            }
            this.logToConsole(`❌ Ошибка массового импорта: ${error.message}`, 'error');
        } finally {
            this._stopMassImport = false;
            this.startMassImportBtn.disabled = false;
            this.stopMassImportBtn.disabled = true;
            // Задержка перед скрытием прогресса, чтобы пользователь увидел финальное состояние
            setTimeout(() => { 
                if (this.massImportProgress) {
                    this.massImportProgress.style.display = 'none';
                    // Сбрасываем прогресс-бар
                    if (this.progressBarFill) {
                        this.progressBarFill.style.width = '0%';
                    }
                }
            }, 2000);
        }
    };

    // Вспомогательная: загрузка одного файла конкретному пациенту
    LMStudioClone.prototype._uploadFileToPatient = async function(patientId, file) {
        const ext = file.name.toLowerCase().split('.').pop();
        const fileType = file.type || '';
        let content;
        let documentType = 'other';
        
        // Проверяем, является ли файл изображением (по расширению или MIME типу)
        const isImage = fileType.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'tif'].includes(ext);
        const isPDF = ext === 'pdf' || fileType === 'application/pdf' || fileType === 'application/x-pdf';
        
        // Для изображений обязательно используем OCR
        if (isImage) {
            documentType = 'scan_result';
            try {
                // Используем OCR API для извлечения текста из изображения
                const formData = new FormData();
                formData.append('file', file);
                
                const ocrResponse = await this.fetchWithTimeout(`${this.apiBaseUrl}/ocr/extract-text`, {
                    method: 'POST',
                    body: formData
                }, 30000); // Увеличенный таймаут для OCR
                
                const ocrData = await ocrResponse.json().catch(()=>({}));
                
                if (ocrResponse.ok && ocrData.status === 'success') {
                    const extractedText = ocrData.text || '';
                    const confidence = ocrData.confidence || 0;
                    
                    if (extractedText && extractedText.trim()) {
                        // Форматируем результат как OCR документ (с метаданными)
                        content = this.formatOCRDocument ? 
                            this.formatOCRDocument(file.name, extractedText, confidence) :
                            `=== ДОКУМЕНТ ИЗ ОБРАЗА ===\nФайл: ${file.name}\nДата обработки: ${new Date().toLocaleString('ru-RU')}\nУровень уверенности OCR: ${confidence.toFixed(1)}%\n=== СОДЕРЖИМОЕ ===\n${extractedText}\n\n=== КОНЕЦ ДОКУМЕНТА ===`;
                        
                        this.logToConsole(`📸 Изображение обработано OCR: ${file.name} (уверенность: ${confidence.toFixed(1)}%)`, 'info');
                    } else {
                        // Если OCR не извлек текст, сохраняем предупреждение
                        content = `=== ИЗОБРАЖЕНИЕ ===\nФайл: ${file.name}\nДата обработки: ${new Date().toLocaleString('ru-RU')}\n⚠️ OCR не смог извлечь текст из изображения\n=== КОНЕЦ ДОКУМЕНТА ===`;
                        this.logToConsole(`⚠️ OCR не смог извлечь текст из изображения: ${file.name}`, 'warning');
                    }
                } else {
                    // Если OCR API вернул ошибку, но файл всё равно нужно сохранить
                    const errorMsg = ocrData.detail || ocrData.message || `HTTP ${ocrResponse.status}`;
                    content = `=== ИЗОБРАЖЕНИЕ ===\nФайл: ${file.name}\nДата обработки: ${new Date().toLocaleString('ru-RU')}\n⚠️ Ошибка OCR: ${errorMsg}\n=== КОНЕЦ ДОКУМЕНТА ===`;
                    this.logToConsole(`⚠️ Ошибка OCR для ${file.name}: ${errorMsg}`, 'warning');
                }
            } catch (ocrError) {
                // Если OCR полностью недоступен, сохраняем информацию об ошибке
                content = `=== ИЗОБРАЖЕНИЕ ===\nФайл: ${file.name}\nДата обработки: ${new Date().toLocaleString('ru-RU')}\n❌ Ошибка обработки OCR: ${ocrError.message}\n=== КОНЕЦ ДОКУМЕНТА ===`;
                this.logToConsole(`❌ Ошибка OCR для ${file.name}: ${ocrError.message}`, 'error');
            }
        } else {
            // Для остальных файлов используем стандартную обработку
            content = await this.readFileContent(file);
            
            // Определяем тип документа по расширению
            if (isPDF) {
                documentType = 'scan_result';
            } else if (ext === 'txt') {
                documentType = 'diagnosis';
            } else if (['doc', 'docx'].includes(ext)) {
                documentType = 'medical_record';
            }
        }

        const resp = await this.fetchWithTimeout(`${this.apiBaseUrl}/patients/${patientId}/documents`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                patient_id: patientId,
                document_type: documentType,
                content: content,
                filename: file.name
            })
        }, 20000);
        const data = await resp.json().catch(()=>({}));
        if (!resp.ok) throw new Error(data.detail || `HTTP ${resp.status}`);
    };

    LMStudioClone.prototype.stopMassImport = function() {
        this._stopMassImport = true;
        this.logToConsole('🛑 Bulk import stopped by user', 'warning');
    };

    // Загрузка документов пациента и отображение под карточкой
    LMStudioClone.prototype.loadPatientDocuments = async function(patientId) {
        try {
            const container = document.querySelector(`.patient-item[data-patient-id="${patientId}"] .patient-documents`);
            if (!container) {
                this.logToConsole(`❌ Контейнер документов для пациента ${patientId} не найден`, 'error');
                return;
            }
            // Создаем/находим блок списка
            let list = container.querySelector('.patient-documents-list');
            if (!list) {
                list = document.createElement('div');
                list.className = 'patient-documents-list';
                list.style.marginTop = '8px';
                container.appendChild(list);
            }
            list.innerHTML = '<div class="info-message">Loading documents...</div>';

            const resp = await this.fetchWithTimeout(`${this.apiBaseUrl}/patients/${patientId}/documents`, {}, 15000);
            const data = await resp.json().catch(()=>([]));
            if (!resp.ok || !Array.isArray(data)) {
                throw new Error(data?.detail || `HTTP ${resp.status}`);
            }

            if (data.length === 0) {
                list.innerHTML = '<div class="info-message">No documents</div>';
                return;
            }

            // Используем более безопасный способ создания элементов для избежания проблем с экранированием
            list.innerHTML = '';
            data.forEach(doc => {
                const docItem = document.createElement('div');
                docItem.className = 'patient-document-item';
                docItem.setAttribute('data-doc-id', doc.id);
                
                const docRow = document.createElement('div');
                docRow.className = 'doc-row';
                
                // Тип документа
                const docType = document.createElement('span');
                docType.className = 'doc-type';
                docType.textContent = this.getDocumentTypeText(doc.document_type || 'other');
                docRow.appendChild(docType);
                
                // Имя файла (если есть)
                if (doc.filename) {
                    const docFilename = document.createElement('span');
                    docFilename.className = 'doc-filename';
                    docFilename.style.marginLeft = '8px';
                    docFilename.style.color = '#888';
                    docFilename.style.fontSize = '0.9em';
                    docFilename.textContent = doc.filename;
                    docRow.appendChild(docFilename);
                }
                
                // Дата создания
                if (doc.created_at) {
                    const docCreated = document.createElement('span');
                    docCreated.className = 'doc-created';
                    docCreated.style.marginLeft = '8px';
                    docCreated.style.color = '#666';
                    docCreated.textContent = new Date(doc.created_at).toLocaleString('ru-RU');
                    docRow.appendChild(docCreated);
                }
                
                // Кнопка "Показать"
                const showBtn = document.createElement('button');
                showBtn.className = 'btn btn-sm btn-secondary';
                showBtn.style.marginLeft = '8px';
                showBtn.innerHTML = '<i class="fas fa-eye"></i> Show';
                showBtn.onclick = () => this.togglePatientDocumentContent(patientId, doc.id, showBtn);
                docRow.appendChild(showBtn);
                
                // Кнопка "Удалить"
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'btn btn-sm btn-danger';
                deleteBtn.style.marginLeft = '4px';
                deleteBtn.innerHTML = '<i class="fas fa-trash"></i> Delete';
                deleteBtn.title = 'Delete document';
                deleteBtn.onclick = () => this.deletePatientDocument(patientId, doc.id, deleteBtn, doc.filename || '');
                docRow.appendChild(deleteBtn);
                
                docItem.appendChild(docRow);
                
                // Контейнер для содержимого документа
                const docContent = document.createElement('div');
                docContent.className = 'doc-content';
                docContent.style.display = 'none';
                docContent.style.whiteSpace = 'pre-wrap';
                docContent.style.marginTop = '6px';
                docContent.style.borderLeft = '3px solid #ddd';
                docContent.style.paddingLeft = '8px';
                docItem.appendChild(docContent);
                
                list.appendChild(docItem);
            });
        } catch (e) {
            this.logToConsole(`❌ Ошибка загрузки документов пациента ${patientId}: ${e.message}`, 'error');
        }
    };

    // Удаление документа пациента
    LMStudioClone.prototype.deletePatientDocument = async function(patientId, documentId, btnEl, filename) {
        const docName = filename || `document ID ${documentId}`;
        if (!confirm(`Are you sure you want to delete "${docName}" from the database?\n\nThis action is irreversible.`)) {
            return;
        }
        
        try {
            // Блокируем кнопку на время удаления
            if (btnEl) {
                btnEl.disabled = true;
                btnEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
            }
            
            const resp = await this.fetchWithTimeout(`${this.apiBaseUrl}/patients/documents/${documentId}`, { 
                method: 'DELETE' 
            }, 15000);
            
            if (!resp.ok) {
                const txt = await resp.text().catch(()=> '');
                throw new Error(`HTTP ${resp.status} ${txt}`);
            }
            
            const data = await resp.json().catch(()=>({}));
            this.logToConsole(`🗑️ Document "${docName}" deleted from the database`, 'success');
            
            // Удаляем элемент из DOM
            const docItem = document.querySelector(`.patient-document-item[data-doc-id="${documentId}"]`);
            if (docItem) {
                docItem.style.opacity = '0.5';
                docItem.style.transition = 'opacity 0.3s';
                setTimeout(() => {
                    docItem.remove();
                    // Проверяем, не осталось ли документов
                    const container = document.querySelector(`.patient-item[data-patient-id="${patientId}"] .patient-documents`);
                    const list = container?.querySelector('.patient-documents-list');
                    if (list && list.children.length === 0) {
                        list.innerHTML = '<div class="info-message">No documents</div>';
                    }
                }, 300);
            }
            
            // Обновляем статистику пациента
            await this.updatePatientsStats();
        } catch (e) {
            if (btnEl) {
                btnEl.disabled = false;
                btnEl.innerHTML = '<i class="fas fa-trash"></i> Delete';
            }
            this.logToConsole(`❌ Failed to delete document "${docName}": ${e.message}`, 'error');
        }
    };

    // Удаление пациента
    LMStudioClone.prototype.deletePatient = async function(patientId) {
        if (!confirm('Delete the patient and all documents?')) return;
        try {
            const resp = await this.fetchWithTimeout(`${this.apiBaseUrl}/patients/${patientId}`, { method: 'DELETE' }, 15000);
            if (!resp.ok) {
                const txt = await resp.text().catch(()=> '');
                throw new Error(`HTTP ${resp.status} ${txt}`);
            }
            this.logToConsole(`🗑️ Пациент ${patientId} удалён`, 'success');
            await this.updatePatientsStats();
            await this.loadPatientsList();
        } catch (e) {
            this.logToConsole(`❌ Ошибка удаления пациента ${patientId}: ${e.message}`, 'error');
        }
    };

    LMStudioClone.prototype.ensureVisionLlmBindings = function() {
        if (!this.visionLlmBtn) {
            this.visionLlmBtn = document.getElementById('visionLlmBtn');
        }
        if (!this.visionLlmFileInput) {
            this.visionLlmFileInput = document.getElementById('visionLlmFileInput');
        }
        if (this.visionLlmBtn && !this._visionLlmBound) {
            this.visionLlmBtn.addEventListener('click', () => this.selectVisionLlmFile());
            this._visionLlmBound = true;
        }
        if (this.visionLlmFileInput && !this._visionLlmFileBound) {
            this.visionLlmFileInput.addEventListener('change', (event) => this.handleVisionLlmFileSelection(event));
            this._visionLlmFileBound = true;
        }
    };

    // Выбор PDF для Vision-LLM
    LMStudioClone.prototype.selectVisionLlmFile = function() {
        if (!this.selectedPatient || !this.selectedPatient.value) {
            this.logToConsole('❌ Select a patient for Vision-LLM', 'error');
            return;
        }
        if (!this.visionLlmFileInput) {
            this.logToConsole('❌ Vision-LLM PDF picker not found', 'error');
            return;
        }
        if (this._visionLlmSelecting) {
            return;
        }
        this._visionLlmSelecting = true;
        this.visionLlmFileInput.value = '';
        this.visionLlmFileInput.click();
        setTimeout(() => {
            this._visionLlmSelecting = false;
        }, 500);
    };

    // Обработчик выбора файла Vision-LLM
    LMStudioClone.prototype.handleVisionLlmFileSelection = async function(event) {
        try {
            const file = event.target.files?.[0];
            if (!file) return;
            if (!this.selectedPatient || !this.selectedPatient.value) {
                this.logToConsole('❌ Select a patient for Vision-LLM', 'error');
                return;
            }

            const pagesInput = prompt('Enter page numbers to extract (e.g., 1,4 or 2-5). Leave empty for all pages.', '1');
            if (pagesInput === null) {
                this.logToConsole('⚠️ Vision-LLM import cancelled', 'warning');
                return;
            }

            const filenameOverride = prompt('Filename to save in the patient record (default: original):', file.name);
            if (filenameOverride === null) {
                this.logToConsole('⚠️ Vision-LLM import cancelled', 'warning');
                return;
            }

            await this.uploadVisionLlmFile(file, pagesInput, filenameOverride);
        } catch (e) {
            this.logToConsole(`❌ Ошибка Vision-LLM: ${e.message}`, 'error');
        } finally {
            if (this.visionLlmFileInput) {
                this.visionLlmFileInput.value = '';
            }
        }
    };

    // Загрузка PDF в Vision-LLM и добавление документа пациенту
    LMStudioClone.prototype.uploadVisionLlmFile = async function(file, pagesInput, filenameOverride) {
        if (!this.selectedPatient || !this.selectedPatient.value) {
            this.logToConsole('❌ Select a patient for Vision-LLM', 'error');
            return;
        }

        if (this.visionLlmBtn) {
            this.visionLlmBtn.disabled = true;
            this.visionLlmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Vision-LLM...';
        }
        if (this.visionLlmProgress) {
            this.visionLlmProgress.style.display = 'block';
        }
        if (this.visionLlmProgressText) {
            this.visionLlmProgressText.textContent = 'Vision-LLM: uploading PDF...';
        }

        try {
            const formData = new FormData();
            formData.append('file', file);
            const pagesValue = (pagesInput || '').trim();
            if (pagesValue) {
                formData.append('pages', pagesValue);
            }
            const filenameValue = (filenameOverride || '').trim();
            if (filenameValue) {
                formData.append('filename', filenameValue);
            }
            if (this.visionLlmProgressText) {
                this.visionLlmProgressText.textContent = 'Vision-LLM: extracting pages...';
            }

            const resp = await this.fetchWithTimeout(
                `${this.apiBaseUrl}/patients/${this.selectedPatient.value}/vision-llm`,
                { method: 'POST', body: formData },
                120000
            );

            const data = await resp.json().catch(() => ({}));
            if (!resp.ok) {
                throw new Error(data.detail || `HTTP ${resp.status}`);
            }

            const totalScore = data?.result?.total_score;
            if (this.visionLlmProgressText) {
                this.visionLlmProgressText.textContent = 'Vision-LLM: document saved';
            }
            this.logToConsole(`✅ Vision-LLM: документ добавлен (итоговый балл: ${totalScore ?? 'n/a'})`, 'success');
            await this.updatePatientsStats();
            await this.loadPatientsList();
            // Обновляем список документов выбранного пациента, если открыт
            if (this.selectedPatient && this.selectedPatient.value) {
                await this.loadPatientDocuments(this.selectedPatient.value);
            }
        } catch (e) {
            if (this.visionLlmProgressText) {
                this.visionLlmProgressText.textContent = `Vision-LLM: ошибка - ${e.message}`;
            }
            this.logToConsole(`❌ Ошибка Vision-LLM: ${e.message}`, 'error');
        } finally {
            if (this.visionLlmBtn) {
                this.visionLlmBtn.disabled = false;
                this.visionLlmBtn.innerHTML = '<i class="fas fa-eye"></i> Vision-LLM';
            }
            if (this.visionLlmProgress) {
                setTimeout(() => {
                    this.visionLlmProgress.style.display = 'none';
                }, 2000);
            }
        }
    };

    // Показ/скрытие содержимого документа с догрузкой по требованию
    LMStudioClone.prototype.togglePatientDocumentContent = async function(patientId, docId, btnEl) {
        try {
            const item = btnEl.closest('.patient-document-item');
            const contentEl = item?.querySelector('.doc-content');
            if (!contentEl) return;

            const isHidden = contentEl.style.display === 'none' || !contentEl.style.display;
            if (!isHidden) {
                contentEl.style.display = 'none';
                btnEl.innerHTML = '<i class="fas fa-eye"></i> Show';
                return;
            }

            // Если контент уже загружен, просто показать
            if (contentEl.getAttribute('data-loaded') === 'true') {
                contentEl.style.display = 'block';
                btnEl.innerHTML = '<i class="fas fa-eye-slash"></i> Hide';
                return;
            }

            // Загружаем содержимое: запрашиваем общий список документов и ищем content нужного id
            btnEl.disabled = true;
            const loader = document.createElement('div');
            loader.className = 'info-message';
            loader.textContent = 'Loading content...';
            contentEl.innerHTML = '';
            contentEl.appendChild(loader);

            let text = '';
            try {
                const resp = await this.fetchWithTimeout(`${this.apiBaseUrl}/patients/${patientId}/documents`, {}, 15000);
                const list = await resp.json().catch(()=>([]));
                if (resp.ok && Array.isArray(list)) {
                    const found = list.find(d => String(d.id) === String(docId));
                    text = found?.content || '';
                }
            } catch (_) {}

            loader.remove();
            if (text) {
                contentEl.textContent = text;
            } else {
                const warn = document.createElement('div');
                warn.className = 'info-message';
                warn.textContent = 'Content is not available for viewing.';
                contentEl.appendChild(warn);
            }
            contentEl.setAttribute('data-loaded', 'true');
            contentEl.style.display = 'block';
            btnEl.innerHTML = '<i class="fas fa-eye-slash"></i> Hide';
        } catch (e) {
            this.logToConsole(`❌ Ошибка загрузки содержимого документа: ${e.message}`, 'error');
        } finally {
            btnEl.disabled = false;
        }
    };

    LMStudioClone.prototype.runBatchQuery = async function() {
        const query = this.batchPatientQuery?.value?.trim();
        if (!query) {
            this.logToConsole('❌ Введите запрос для пакетной обработки', 'error');
            return;
        }
        if (!this.currentModel) {
            this.logToConsole('❌ Модель не выбрана. Сначала загрузите модель', 'error');
            return;
        }

        const useSystemPrompt = !!(this.useSystemPrompt?.checked && this.systemPrompt?.value?.trim());
        const systemPrompt = useSystemPrompt ? this.systemPrompt.value.trim() : null;
        const useMemoRag = !!this.batchUseMemoRag?.checked;
        const topK = parseInt(this.batchMemoRagTopK?.value || '5', 10);
        const contextLength = parseInt(this.batchMemoRagContextLength?.value || '200', 10);

        const payload = {
            query,
            model: this.currentModel,
            system_prompt: systemPrompt,
            use_memorag: useMemoRag,
            memorag_top_k: Number.isFinite(topK) ? topK : 5,
            memorag_context_length: Number.isFinite(contextLength) ? contextLength : 200,
            max_tokens: parseInt(this.maxTokens?.value || '2000', 10),
            temperature: parseFloat(this.temperature?.value || '0.7'),
            top_p: parseFloat(this.topP?.value || '0.9'),
            top_k: parseInt(this.topK?.value || '40', 10)
        };

        if (this.runBatchQueryBtn) this.runBatchQueryBtn.disabled = true;
        if (this.downloadBatchResultsBtn) this.downloadBatchResultsBtn.disabled = true;
        if (this.batchQueryProgress) this.batchQueryProgress.style.display = 'block';
        if (this.batchQueryProgressText) this.batchQueryProgressText.textContent = 'Запуск пакетного запроса...';
        if (this.batchQuerySummary) this.batchQuerySummary.style.display = 'none';

        try {
            const response = await this.fetchWithTimeout(`${this.apiBaseUrl}/patients/batch-query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }, 900000);

            const data = await response.json().catch(() => ({}));
            if (!response.ok || data.status !== 'success') {
                const detail = data.detail || data.message || `HTTP ${response.status}`;
                throw new Error(detail);
            }

            this.lastBatchQueryResults = Array.isArray(data.results) ? data.results : [];
            const total = data.total ?? this.lastBatchQueryResults.length;
            const success = data.success ?? 0;
            const failed = data.failed ?? 0;

            if (this.batchQuerySummary) {
                this.batchQuerySummary.textContent = `Готово. Всего: ${total}, успешно: ${success}, ошибок: ${failed}.`;
                this.batchQuerySummary.style.display = 'block';
            }
            if (this.batchQueryProgressText) {
                this.batchQueryProgressText.textContent = 'Пакетная обработка завершена';
            }
            if (this.downloadBatchResultsBtn && this.lastBatchQueryResults.length > 0) {
                this.downloadBatchResultsBtn.disabled = false;
            }

            this.logToConsole(`✅ Пакетная обработка завершена: ${success} успешно, ${failed} ошибок`, 'success');
        } catch (e) {
            this.logToConsole(`❌ Ошибка пакетной обработки: ${e.message}`, 'error');
            if (this.batchQueryProgressText) {
                this.batchQueryProgressText.textContent = 'Ошибка пакетной обработки';
            }
        } finally {
            if (this.runBatchQueryBtn) this.runBatchQueryBtn.disabled = false;
            if (this.batchQueryProgress) {
                setTimeout(() => {
                    this.batchQueryProgress.style.display = 'none';
                }, 1500);
            }
        }
    };

    LMStudioClone.prototype.downloadBatchResults = function() {
        const results = Array.isArray(this.lastBatchQueryResults) ? this.lastBatchQueryResults : [];
        if (results.length === 0) {
            this.logToConsole('⚠️ Нет результатов для экспорта', 'warning');
            return;
        }
        if (typeof XLSX === 'undefined') {
            this.logToConsole('❌ SheetJS не загружен. Обновите страницу и попробуйте снова.', 'error');
            return;
        }

        const headers = ['patient_id', 'patient_name', 'prompt', 'response', 'error'];
        const rows = results.map((row) => ({
            patient_id: row.patient_id,
            patient_name: row.patient_name,
            prompt: row.prompt || '',
            response: row.response || '',
            error: row.error || ''
        }));

        const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Results');

        const filename = `patients-batch-results-${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(workbook, filename);

        this.logToConsole('📥 Результаты выгружены в XLSX', 'success');
    };

    // Страховка: навешиваем обработчики после инициализации приложения
    const bindVisionLlm = () => {
        if (window.lmStudioClone && typeof window.lmStudioClone.ensureVisionLlmBindings === 'function') {
            window.lmStudioClone.ensureVisionLlmBindings();
        }
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindVisionLlm);
    } else {
        setTimeout(bindVisionLlm, 0);
    }
})();


