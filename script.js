// Application Configuration
const CONFIG = {
    ITEMS_PER_PAGE: 50,
    MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
    CHUNK_SIZE: 1000, // Process items in chunks
    DEBOUNCE_DELAY: 300
};

// Currency and Status databases
const currencyDatabase = {
    'EGP': 'الجنيه المصري',
    'AED': 'الدرهم الإماراتي', 
    'SAR': 'الريال السعودي',
    'USD': 'الدولار الأمريكي',
    'EUR': 'اليورو',
    'GBP': 'الجنيه الإسترليني',
    'JPY': 'الين الياباني',
    'KWD': 'الدينار الكويتي',
    'QAR': 'الريال القطري',
    'BHD': 'الدينار البحريني'
};

const statusDatabase = {
    'G': 'جيد',
    'V': 'جيد جداً',
    'A': 'مقبول',
    'E': 'ممتاز',
    'P': 'ضعيف',
    'F': 'نظيف',
    'U': 'غير متداول'
};

// Application State
let state = {
    originalData: [],
    filteredData: [],
    currentPage: 1,
    totalPages: 1,
    isProcessing: false
};

// DOM Elements
const elements = {
    fileInput: document.getElementById('fileInput'),
    uploadArea: document.getElementById('uploadArea'),
    message: document.getElementById('message'),
    loading: document.getElementById('loading'),
    loadingText: document.getElementById('loadingText'),
    uploadSection: document.getElementById('uploadSection'),
    tableContainer: document.getElementById('tableContainer'),
    fileInfo: document.getElementById('fileInfo'),
    fileName: document.getElementById('fileName'),
    fileSize: document.getElementById('fileSize'),
    progressBar: document.getElementById('progressBar'),
    progressText: document.getElementById('progressText'),
    searchInput: document.getElementById('searchInput'),
    currencyFilter: document.getElementById('currencyFilter'),
    statusFilter: document.getElementById('statusFilter'),
    resetFilters: document.getElementById('resetFilters'),
    exportBtn: document.getElementById('exportBtn'),
    tableBody: document.getElementById('tableBody'),
    stats: document.getElementById('stats'),
    noResults: document.getElementById('noResults'),
    prevBtn: document.getElementById('prevBtn'),
    nextBtn: document.getElementById('nextBtn'),
    pageInfo: document.getElementById('pageInfo')
};

// Utility Functions
const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};

const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Message Display Functions
const showMessage = (text, type, duration = 5000) => {
    elements.message.innerHTML = `<div class="${type}-message">${text}</div>`;
    if (duration > 0) {
        setTimeout(() => {
            elements.message.innerHTML = '';
        }, duration);
    }
};

const updateProgress = (percentage) => {
    elements.progressBar.style.width = `${percentage}%`;
    elements.progressText.textContent = `${Math.round(percentage)}%`;
};

// File Handling Functions
const validateFile = (file) => {
    if (!file.name.toLowerCase().endsWith('.json')) {
        throw new Error('يرجى اختيار ملف JSON صحيح');
    }
    
    if (file.size > CONFIG.MAX_FILE_SIZE) {
        throw new Error(`حجم الملف كبير جداً. الحد الأقصى ${formatFileSize(CONFIG.MAX_FILE_SIZE)}`);
    }
    
    if (file.size === 0) {
        throw new Error('الملف فارغ');
    }
};

const showFileInfo = (file) => {
    elements.fileName.textContent = file.name;
    elements.fileSize.textContent = formatFileSize(file.size);
    elements.fileInfo.style.display = 'block';
    updateProgress(0);
};

const readFileWithProgress = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onprogress = (e) => {
            if (e.lengthComputable) {
                const percentage = (e.loaded / e.total) * 50; // First 50% for reading
                updateProgress(percentage);
            }
        };
        
        reader.onload = (e) => {
            updateProgress(50);
            resolve(e.target.result);
        };
        
        reader.onerror = () => {
            reject(new Error('خطأ في قراءة الملف'));
        };
        
        reader.readAsText(file);
    });
};

// Data Processing Functions
const decodeItem = (code) => {
    if (!code || typeof code !== 'string' || code.length < 16) {
        return null;
    }

    try {
        const currencyCode = code.substring(0, 3).toUpperCase();
        const value = parseInt(code.substring(11, 15));
        const month = parseInt(code.substring(7, 9));
        const day = parseInt(code.substring(9, 11));
        const year = parseInt(code.substring(3, 7));
        const statusCode = code.substring(15, 16).toUpperCase();

        // Validate extracted data
        if (isNaN(value) || isNaN(month) || isNaN(day) || isNaN(year)) {
            return null;
        }

        if (month < 1 || month > 12 || day < 1 || day > 31 || year < 100 || year > 2100) {
            return null;
        }

        const currency = currencyDatabase[currencyCode] || currencyCode;
        const status = statusDatabase[statusCode] || statusCode;

        return {
            currency,
            value,
            year,
            month,
            day,
            status,
            currencyCode,
            statusCode
        };
    } catch (error) {
        return null;
    }
};

const processDataInChunks = async (data) => {
    const processedData = [];
    const currencies = new Set();
    const statuses = new Set();
    let processedCount = 0;

    // Process data in chunks to avoid blocking the UI
    for (let i = 0; i < data.length; i += CONFIG.CHUNK_SIZE) {
        const chunk = data.slice(i, i + CONFIG.CHUNK_SIZE);
        
        chunk.forEach((item, index) => {
            if (!item || typeof item !== 'object' || !item.code) {
                return;
            }
            item.number *=1;
            const decoded = decodeItem(item.code);
            if (decoded) {
                processedData.push({
                    id: i + index,
                    code: item.code,
                    number: item.number || '',
                    currency: decoded.currency,
                    value: decoded.value,
                    year: decoded.year,
                    month: decoded.month,
                    day: decoded.day,
                    status: decoded.status,
                    distinctiveMark: item.distinctiveMark || item.distinctive_mark || '',
                    currencyCode: decoded.currencyCode,
                    statusCode: decoded.statusCode
                });

                currencies.add(decoded.currency);
                statuses.add(decoded.status);
            }
        });

        processedCount += chunk.length;
        const percentage = 50 + (processedCount / data.length) * 50;
        updateProgress(percentage);
        elements.loadingText.textContent = `جاري معالجة البيانات... ${processedCount}/${data.length}`;
        
        // Allow UI to update
        await sleep(1);
    }

    return { processedData, currencies, statuses };
};

// Display Functions
const populateFilters = (currencies, statuses) => {
    // Clear existing options
    elements.currencyFilter.innerHTML = '<option value="">جميع العملات</option>';
    elements.statusFilter.innerHTML = '<option value="">جميع الحالات</option>';

    // Add currency options
    [...currencies].sort().forEach(currency => {
        const option = document.createElement('option');
        option.value = currency;
        option.textContent = currency;
        elements.currencyFilter.appendChild(option);
    });

    // Add status options
    [...statuses].sort().forEach(status => {
        const option = document.createElement('option');
        option.value = status;
        option.textContent = status;
        elements.statusFilter.appendChild(option);
    });
};

const displayData = (data) => {
    const startIndex = (state.currentPage - 1) * CONFIG.ITEMS_PER_PAGE;
    const endIndex = startIndex + CONFIG.ITEMS_PER_PAGE;
    const pageData = data.slice(startIndex, endIndex);

    elements.tableBody.innerHTML = '';

    if (pageData.length === 0) {
        elements.noResults.style.display = 'block';
        return;
    }

    elements.noResults.style.display = 'none';

    // Use DocumentFragment for better performance
    const fragment = document.createDocumentFragment();

    pageData.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="code-cell">${item.code}</td>
            <td>${item.number}</td>
            <td class="currency-cell">${item.currency}</td>
            <td>${item.value.toLocaleString()}</td>
            <td>${item.year}</td>
            <td>${item.month}</td>
            <td>${item.day}</td>
            <td class="status-cell">${item.status}</td>
            <td>${item.distinctiveMark}</td>
        `;
        fragment.appendChild(row);
    });

    elements.tableBody.appendChild(fragment);
    updatePagination(data.length);
};

const displayStats = (data) => {
    const currencyCount = new Set(data.map(item => item.currencyCode)).size;
    const totalValue = data.reduce((sum, item) => sum + item.value, 0);
    const avgValue = data.length > 0 ? Math.round(totalValue / data.length) : 0;
    
    elements.stats.innerHTML = `
        <div class="stat-card">
            <div class="stat-number">${data.length.toLocaleString()}</div>
            <div>إجمالي القطع</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${currencyCount}</div>
            <div>أنواع العملات</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${totalValue.toLocaleString()}</div>
            <div>إجمالي القيمة</div>
        </div>
    `;
};

const updatePagination = (totalItems) => {
    state.totalPages = Math.ceil(totalItems / CONFIG.ITEMS_PER_PAGE);
    
    elements.prevBtn.disabled = state.currentPage <= 1;
    elements.nextBtn.disabled = state.currentPage >= state.totalPages;
    
    elements.pageInfo.textContent = `الصفحة ${state.currentPage} من ${state.totalPages}`;
};

// Filter Functions
const applyFilters = () => {
    if (state.isProcessing) return;
    
    const searchTerm = elements.searchInput.value.toLowerCase().trim();
    const currencyFilter = elements.currencyFilter.value;
    const statusFilter = elements.statusFilter.value;

    state.filteredData = state.originalData.filter(item => {
        const matchesSearch = !searchTerm || 
            item.code.toLowerCase().includes(searchTerm) ||
            item.currency.toLowerCase().includes(searchTerm) ||
            item.distinctiveMark.toLowerCase().includes(searchTerm) ||
            item.number.toString().toLowerCase().includes(searchTerm) ||
            item.value.toString().includes(searchTerm) ||
            item.year.toString().includes(searchTerm);

        const matchesCurrency = !currencyFilter || item.currency === currencyFilter;
        const matchesStatus = !statusFilter || item.status === statusFilter;

        return matchesSearch && matchesCurrency && matchesStatus;
    });

    state.currentPage = 1;
    displayData(state.filteredData);
    displayStats(state.filteredData);
};

const resetFilters = () => {
    elements.searchInput.value = '';
    elements.currencyFilter.value = '';
    elements.statusFilter.value = '';
    state.filteredData = [...state.originalData];
    state.currentPage = 1;
    displayData(state.filteredData);
    displayStats(state.filteredData);
};

// Export Functions
const exportToCSV = () => {
    if (state.filteredData.length === 0) {
        showMessage('لا توجد بيانات للتصدير', 'error');
        return;
    }

    const headers = ['الكود', 'العدد', 'نوع العملة', 'القيمة', 'سنة الإصدار', 'شهر الإصدار', 'يوم الإصدار', 'الحالة', 'العلامة المميزة'];
    
    const csvContent = [
        headers.join(','),
        ...state.filteredData.map(item => [
            `"${item.code}"`,
            `"${item.number}"`,
            `"${item.currency}"`,
            item.value,
            item.year,
            item.month,
            item.day,
            `"${item.status}"`,
            `"${item.distinctiveMark}"`
        ].join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `عملات_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showMessage('تم تصدير البيانات بنجاح', 'success');
};

// Main File Processing Function
const handleFile = async (file) => {
    if (state.isProcessing) return;
    
    try {
        state.isProcessing = true;
        validateFile(file);
        showFileInfo(file);
        
        elements.uploadArea.classList.add('processing');
        elements.loading.style.display = 'block';
        elements.uploadSection.style.display = 'none';
        
        elements.loadingText.textContent = 'جاري قراءة الملف...';
        
        // Read file with progress
        const fileContent = await readFileWithProgress(file);
        
        elements.loadingText.textContent = 'جاري تحليل البيانات...';
        
        // Parse JSON
        let jsonData;
        try {
            jsonData = JSON.parse(fileContent);
        } catch (parseError) {
            throw new Error('خطأ في تنسيق ملف JSON. تأكد من صحة البيانات');
        }
        
        if (!Array.isArray(jsonData)) {
            throw new Error('البيانات يجب أن تكون في صيغة مصفوفة');
        }
        
        if (jsonData.length === 0) {
            throw new Error('الملف لا يحتوي على بيانات');
        }
        
        // Process data in chunks
        const { processedData, currencies, statuses } = await processDataInChunks(jsonData);
        
        if (processedData.length === 0) {
            throw new Error('لم يتم العثور على بيانات صحيحة في الملف');
        }
        
        // Update state
        state.originalData = processedData;
        state.filteredData = [...processedData];
        state.currentPage = 1;
        
        // Update UI
        populateFilters(currencies, statuses);
        displayData(state.filteredData);
        displayStats(state.filteredData);
        
        // Show results
        elements.loading.style.display = 'none';
        elements.tableContainer.style.display = 'block';
        
        showMessage(`تم تحميل ${processedData.length.toLocaleString()} عنصر بنجاح!`, 'success');
        
    } catch (error) {
        console.error('File processing error:', error);
        showMessage(error.message, 'error');
        elements.loading.style.display = 'none';
        elements.uploadSection.style.display = 'block';
        elements.uploadArea.classList.remove('processing');
    } finally {
        state.isProcessing = false;
    }
};

// Event Listeners Setup
const setupEventListeners = () => {
    // File upload events
    elements.uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!state.isProcessing) {
            elements.uploadArea.classList.add('dragover');
        }
    });

    elements.uploadArea.addEventListener('dragleave', () => {
        elements.uploadArea.classList.remove('dragover');
    });

    elements.uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        elements.uploadArea.classList.remove('dragover');
        if (!state.isProcessing && e.dataTransfer.files.length > 0) {
            handleFile(e.dataTransfer.files[0]);
        }
    });

    elements.uploadArea.addEventListener('click', () => {
        if (!state.isProcessing) {
            elements.fileInput.click();
        }
    });

    elements.fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    });

    // Filter events with debouncing
    const debouncedApplyFilters = debounce(applyFilters, CONFIG.DEBOUNCE_DELAY);
    elements.searchInput.addEventListener('input', debouncedApplyFilters);
    elements.currencyFilter.addEventListener('change', applyFilters);
    elements.statusFilter.addEventListener('change', applyFilters);
    elements.resetFilters.addEventListener('click', resetFilters);

    // Export event
    elements.exportBtn.addEventListener('click', exportToCSV);

    // Pagination events
    elements.prevBtn.addEventListener('click', () => {
        if (state.currentPage > 1) {
            state.currentPage--;
            displayData(state.filteredData);
        }
    });

    elements.nextBtn.addEventListener('click', () => {
        if (state.currentPage < state.totalPages) {
            state.currentPage++;
            displayData(state.filteredData);
        }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) {
            switch(e.key) {
                case 'o':
                case 'O':
                    e.preventDefault();
                    if (!state.isProcessing) {
                        elements.fileInput.click();
                    }
                    break;
                case 's':
                case 'S':
                    e.preventDefault();
                    if (state.filteredData.length > 0) {
                        exportToCSV();
                    }
                    break;
            }
        }
        
        // Arrow keys for pagination
        if (elements.tableContainer.style.display !== 'none') {
            if (e.key === 'ArrowLeft' && !elements.nextBtn.disabled) {
                state.currentPage++;
                displayData(state.filteredData);
            } else if (e.key === 'ArrowRight' && !elements.prevBtn.disabled) {
                state.currentPage--;
                displayData(state.filteredData);
            }
        }
    });
};

// Initialize Application
const init = () => {
    try {
        setupEventListeners();
        console.log('🪙 عبقرينو للعملات القديمة - تم التحميل بنجاح');
    } catch (error) {
        console.error('Error initializing application:', error);
        showMessage('خطأ في تحميل التطبيق', 'error');
    }
};

// Start the application when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}