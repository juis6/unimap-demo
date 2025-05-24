// Клас для роботи з пошуком по карті
class MapSearch {
    constructor(mapCore) {
        this.mapCore = mapCore;
        this.searchResults = [];
        this.currentQuery = '';
        this.searchTimeout = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupAutoComplete();
    }

    setupEventListeners() {
        // Пошук по введенню тексту
        const searchInput = document.getElementById('search-input');
        searchInput.addEventListener('input', (e) => {
            this.handleSearchInput(e.target.value);
        });

        // Пошук по натисканню кнопки
        document.getElementById('search-button').addEventListener('click', () => {
            this.performSearch(searchInput.value);
        });

        // Пошук по Enter
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.performSearch(e.target.value);
            }
        });

        // Фільтр по категорії
        document.getElementById('category-select').addEventListener('change', (e) => {
            this.filterByCategory(e.target.value);
        });

        // Очищення пошуку
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.clearSearch();
            }
        });
    }

    // Налаштування автодоповнення
    setupAutoComplete() {
        const searchInput = document.getElementById('search-input');
        let autocompleteContainer = document.getElementById('search-autocomplete');
        
        if (!autocompleteContainer) {
            autocompleteContainer = document.createElement('div');
            autocompleteContainer.id = 'search-autocomplete';
            autocompleteContainer.style.cssText = `
                position: absolute;
                top: 100%;
                left: 0;
                right: 0;
                background: white;
                border: 1px solid #dee2e6;
                border-top: none;
                border-radius: 0 0 4px 4px;
                max-height: 200px;
                overflow-y: auto;
                z-index: 1000;
                display: none;
            `;
            
            const searchContainer = document.getElementById('search-input-container');
            searchContainer.style.position = 'relative';
            searchContainer.appendChild(autocompleteContainer);
        }

        // Обробка вибору з автодоповнення
        autocompleteContainer.addEventListener('click', (e) => {
            const item = e.target.closest('.autocomplete-item');
            if (item) {
                const roomId = item.dataset.roomId;
                const room = this.mapCore.currentMapData?.rooms.find(r => r.id === roomId);
                if (room) {
                    searchInput.value = room.label || room.id;
                    this.selectRoom(room);
                    this.hideAutocomplete();
                }
            }
        });

        // Сховати автодоповнення при кліку поза ним
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#search-input-container')) {
                this.hideAutocomplete();
            }
        });
    }

    // Обробка введення в поле пошуку
    handleSearchInput(query) {
        this.currentQuery = query.trim();

        // Очищуємо попередній таймер
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }

        // Встановлюємо новий таймер для відкладеного пошуку
        this.searchTimeout = setTimeout(() => {
            if (this.currentQuery.length >= 2) {
                this.showAutocomplete(this.currentQuery);
            } else {
                this.hideAutocomplete();
            }
        }, 300);
    }

    // Виконання пошуку
    async performSearch(query) {
        if (!query.trim()) {
            this.clearSearch();
            return;
        }

        try {
            const mapSelect = document.getElementById('map-list');
            const currentMapId = mapSelect.value;
            const category = document.getElementById('category-select').value;

            const url = new URL(`/map/search/${currentMapId}`, window.location.origin);
            url.searchParams.set('query', query);
            if (category && category !== 'all') {
                url.searchParams.set('category', category);
            }

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            this.displaySearchResults(result.results);
            this.hideAutocomplete();
            
            // Зберігаємо в історію
            this.saveSearchHistory(query, result.results);

        } catch (error) {
            console.error('Search error:', error);
            this.mapCore.showError('Помилка пошуку: ' + error.message);
        }
    }

    // Показати автодоповнення
    showAutocomplete(query) {
        if (!this.mapCore.currentMapData || !this.mapCore.currentMapData.rooms) {
            return;
        }

        const rooms = this.mapCore.currentMapData.rooms;
        const matches = this.fuzzySearch(query, rooms, 5); // Максимум 5 результатів

        const autocompleteContainer = document.getElementById('search-autocomplete');
        autocompleteContainer.innerHTML = '';

        if (matches.length > 0) {
            matches.forEach(room => {
                const item = document.createElement('div');
                item.className = 'autocomplete-item';
                item.dataset.roomId = room.id;
                item.style.cssText = `
                    padding: 0.75rem;
                    cursor: pointer;
                    border-bottom: 1px solid #f1f1f1;
                `;

                item.innerHTML = `
                    <div style="font-weight: 500; color: #2c3e50;">${room.label || room.id}</div>
                    <div style="font-size: 0.8rem; color: #6c757d;">${this.mapCore.getCategoryName(room.category)}</div>
                `;

                item.addEventListener('mouseenter', () => {
                    item.style.background = '#f8f9fa';
                });

                item.addEventListener('mouseleave', () => {
                    item.style.background = 'white';
                });

                autocompleteContainer.appendChild(item);
            });

            autocompleteContainer.style.display = 'block';
        } else {
            this.hideAutocomplete();
        }
    }

    // Сховати автодоповнення
    hideAutocomplete() {
        const autocompleteContainer = document.getElementById('search-autocomplete');
        if (autocompleteContainer) {
            autocompleteContainer.style.display = 'none';
        }
    }

    // Нечіткий пошук
    fuzzySearch(query, rooms, maxResults = 10) {
        query = query.toLowerCase();
        const results = [];

        rooms.forEach(room => {
            let score = 0;
            const label = (room.label || room.id).toLowerCase();
            const category = room.category.toLowerCase();
            const keywords = room.keywords.join(' ').toLowerCase();

            // Точний збіг в назві - найвищий пріоритет
            if (label.includes(query)) {
                score += 100;
                if (label.startsWith(query)) {
                    score += 50;
                }
            }

            // Збіг в категорії
            if (category.includes(query)) {
                score += 30;
            }

            // Збіг в ключових словах
            if (keywords.includes(query)) {
                score += 20;
            }

            // Збіг окремих слів
            const queryWords = query.split(' ');
            queryWords.forEach(word => {
                if (word.length >= 2) {
                    if (label.includes(word)) score += 10;
                    if (keywords.includes(word)) score += 5;
                }
            });

            if (score > 0) {
                results.push({ ...room, searchScore: score });
            }
        });

        // Сортуємо за рейтингом та повертаємо обмежену кількість
        return results
            .sort((a, b) => b.searchScore - a.searchScore)
            .slice(0, maxResults);
    }

    // Відображення результатів пошуку
    displaySearchResults(results) {
        this.searchResults = results;
        const resultsContainer = document.getElementById('search-results');
        resultsContainer.innerHTML = '';

        if (results.length === 0) {
            resultsContainer.innerHTML = `
                <div style="padding: 1rem; text-align: center; color: #6c757d;">
                    Нічого не знайдено
                </div>
            `;
            return;
        }

        // Створюємо заголовок з кількістю результатів
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 0.5rem 0;
            font-weight: 600;
            color: #495057;
            border-bottom: 1px solid #e9ecef;
            margin-bottom: 0.5rem;
        `;
        header.textContent = `Знайдено: ${results.length}`;
        resultsContainer.appendChild(header);

        // Відображаємо результати
        results.forEach((room, index) => {
            const resultElement = this.createSearchResultElement(room, index);
            resultsContainer.appendChild(resultElement);
        });

        // Автоматично підсвічуємо перший результат
        if (results.length === 1) {
            this.selectRoom(results[0]);
        }
    }

    // Створення елемента результату пошуку
    createSearchResultElement(room, index) {
        const element = document.createElement('div');
        element.className = 'search-result';
        element.dataset.roomId = room.id;

        // Підсвічуємо текст запиту в результатах
        const highlightedLabel = this.highlightSearchTerm(room.label || room.id, this.currentQuery);
        const keywordsText = room.keywords.slice(0, 3).join(', ') + (room.keywords.length > 3 ? '...' : '');

        element.innerHTML = `
            <h4>${highlightedLabel}</h4>
            <p>Категорія: ${this.mapCore.getCategoryName(room.category)}</p>
            <p style="font-size: 0.8rem; color: #868e96;">
                ${keywordsText}
            </p>
        `;

        // Додаємо обробники подій
        element.addEventListener('click', () => {
            this.selectRoom(room);
        });

        element.addEventListener('mouseenter', () => {
            this.mapCore.highlightRoom(room.id, true);
        });

        element.addEventListener('mouseleave', () => {
            this.mapCore.highlightRoom(room.id, false);
        });

        return element;
    }

    // Фільтрація за категорією
    async filterByCategory(category) {
        try {
            const mapSelect = document.getElementById('map-list');
            const currentMapId = mapSelect.value;

            const url = new URL(`/map/search/${currentMapId}`, window.location.origin);
            if (category && category !== 'all') {
                url.searchParams.set('category', category);
            }

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            this.displaySearchResults(result.results);

            // Очищуємо поле пошуку якщо фільтруємо тільки за категорією
            if (!this.currentQuery) {
                document.getElementById('search-input').value = '';
            }

        } catch (error) {
            console.error('Filter error:', error);
            this.mapCore.showError('Помилка фільтрації: ' + error.message);
        }
    }

    // Вибір кімнати з результатів пошуку
    selectRoom(room) {
        // Виділяємо кімнату на карті
        this.mapCore.selectRoom(room);

        // Підсвічуємо результат в списку
        document.querySelectorAll('.search-result').forEach(el => {
            el.classList.remove('selected');
        });

        const resultElement = document.querySelector(`[data-room-id="${room.id}"]`);
        if (resultElement) {
            resultElement.classList.add('selected');
        }

        // Переміщуємо карту до кімнати
        if (window.mapUI) {
            window.mapUI.panToRoom(room.id);
        }
    }

    // Очищення пошуку
    clearSearch() {
        document.getElementById('search-input').value = '';
        document.getElementById('category-select').value = 'all';
        document.getElementById('search-results').innerHTML = '';
        
        this.hideAutocomplete();
        this.searchResults = [];
        this.currentQuery = '';

        // Скидаємо виділення кімнат
        document.querySelectorAll('.room.highlighted').forEach(room => {
            room.classList.remove('highlighted');
        });
    }

    // Експорт результатів пошуку
    exportSearchResults() {
        if (this.searchResults.length === 0) {
            this.mapCore.showError('Немає результатів для експорту');
            return;
        }

        const csvContent = this.convertToCSV(this.searchResults);
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `search-results-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();

        URL.revokeObjectURL(url);
    }

    // Конвертація в CSV
    convertToCSV(data) {
        const headers = ['ID', 'Назва', 'Категорія', 'Ключові слова', 'Доступ'];
        const rows = data.map(room => [
            room.id,
            room.label || '',
            this.mapCore.getCategoryName(room.category),
            room.keywords.join('; '),
            room.access ? 'Так' : 'Ні'
        ]);

        const csvContent = [headers, ...rows]
            .map(row => row.map(field => `"${field}"`).join(','))
            .join('\n');

        return csvContent;
    }

    // Пошук найближчих кімнат до заданої точки
    findNearestRooms(targetRoom, maxResults = 5) {
        if (!this.mapCore.currentMapData || !targetRoom) {
            return [];
        }

        const rooms = this.mapCore.currentMapData.rooms.filter(room => 
            room.id !== targetRoom.id && room.access
        );

        const targetCenter = this.calculateRoomCenter(targetRoom);
        
        const roomsWithDistance = rooms.map(room => {
            const roomCenter = this.calculateRoomCenter(room);
            const distance = this.calculateDistance(targetCenter, roomCenter);
            
            return {
                ...room,
                distance: distance
            };
        });

        return roomsWithDistance
            .sort((a, b) => a.distance - b.distance)
            .slice(0, maxResults);
    }

    // Обчислення центру кімнати
    calculateRoomCenter(room) {
        if (!room.geometry || !room.geometry.children || room.geometry.children.length === 0) {
            return { x: 0, y: 0 };
        }

        const shape = room.geometry.children[0];

        if (shape.type === 'polygon' || shape.type === 'polyline') {
            const points = shape.coordinates;
            if (points.length > 0) {
                const centerX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
                const centerY = points.reduce((sum, p) => sum + p.y, 0) / points.length;
                return { x: centerX, y: centerY };
            }
        }

        return { x: 0, y: 0 };
    }

    // Обчислення відстані між двома точками
    calculateDistance(point1, point2) {
        return Math.sqrt(
            Math.pow(point2.x - point1.x, 2) + 
            Math.pow(point2.y - point1.y, 2)
        );
    }

    // Розширений пошук з фільтрами
    advancedSearch(options = {}) {
        const {
            query = '',
            category = 'all',
            accessibleOnly = false,
            sortBy = 'relevance' // relevance, name, category
        } = options;

        if (!this.mapCore.currentMapData) {
            return [];
        }

        let results = this.mapCore.currentMapData.rooms;

        // Фільтр за доступністю
        if (accessibleOnly) {
            results = results.filter(room => room.access);
        }

        // Фільтр за категорією
        if (category !== 'all') {
            results = results.filter(room => room.category === category);
        }

        // Пошук за запитом
        if (query.trim()) {
            results = this.fuzzySearch(query, results, results.length);
        }

        // Сортування
        switch (sortBy) {
            case 'name':
                results.sort((a, b) => (a.label || a.id).localeCompare(b.label || b.id));
                break;
            case 'category':
                results.sort((a, b) => a.category.localeCompare(b.category));
                break;
            case 'relevance':
            default:
                // Вже відсортовано за рейтингом пошуку
                break;
        }

        return results;
    }

    // Збереження історії пошуків
    saveSearchHistory(query, results) {
        try {
            let history = JSON.parse(localStorage.getItem('searchHistory') || '[]');
            
            const searchEntry = {
                query: query,
                timestamp: new Date().toISOString(),
                resultsCount: results.length,
                results: results.slice(0, 3).map(r => ({ id: r.id, label: r.label }))
            };

            // Додаємо на початок масиву
            history.unshift(searchEntry);
            
            // Обмежуємо розмір історії
            history = history.slice(0, 10);
            
            localStorage.setItem('searchHistory', JSON.stringify(history));
        } catch (error) {
            console.warn('Failed to save search history:', error);
        }
    }

    // Отримання історії пошуків
    getSearchHistory() {
        try {
            return JSON.parse(localStorage.getItem('searchHistory') || '[]');
        } catch (error) {
            console.warn('Failed to load search history:', error);
            return [];
        }
    }

    // Показати історію пошуків
    showSearchHistory() {
        const history = this.getSearchHistory();
        const autocompleteContainer = document.getElementById('search-autocomplete');
        
        if (history.length === 0) {
            return;
        }

        autocompleteContainer.innerHTML = `
            <div style="padding: 0.5rem; font-weight: 600; color: #495057; border-bottom: 1px solid #e9ecef;">
                Історія пошуків
            </div>
        `;

        history.forEach(entry => {
            const item = document.createElement('div');
            item.className = 'autocomplete-item';
            item.style.cssText = `
                padding: 0.75rem;
                cursor: pointer;
                border-bottom: 1px solid #f1f1f1;
            `;

            const timeAgo = this.formatTimeAgo(new Date(entry.timestamp));
            
            item.innerHTML = `
                <div style="font-weight: 500; color: #2c3e50;">${entry.query}</div>
                <div style="font-size: 0.8rem; color: #6c757d;">
                    ${entry.resultsCount} результатів • ${timeAgo}
                </div>
            `;

            item.addEventListener('click', () => {
                document.getElementById('search-input').value = entry.query;
                this.performSearch(entry.query);
                this.hideAutocomplete();
            });

            item.addEventListener('mouseenter', () => {
                item.style.background = '#f8f9fa';
            });

            item.addEventListener('mouseleave', () => {
                item.style.background = 'white';
            });

            autocompleteContainer.appendChild(item);
        });

        autocompleteContainer.style.display = 'block';
    }

    // Форматування часу "назад"
    formatTimeAgo(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffMinutes = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMinutes < 1) return 'щойно';
        if (diffMinutes < 60) return `${diffMinutes} хв тому`;
        if (diffHours < 24) return `${diffHours} год тому`;
        if (diffDays < 7) return `${diffDays} дн тому`;
        
        return date.toLocaleDateString('uk-UA');
    }

    // Очищення історії пошуків
    clearSearchHistory() {
        try {
            localStorage.removeItem('searchHistory');
            this.hideAutocomplete();
        } catch (error) {
            console.warn('Failed to clear search history:', error);
        }
    }

    // Створення швидких фільтрів
    createQuickFilters() {
        const quickFiltersContainer = document.createElement('div');
        quickFiltersContainer.id = 'quick-filters';
        quickFiltersContainer.innerHTML = `
            <div style="margin-bottom: 0.5rem; font-weight: 600; color: #495057;">
                Швидкі фільтри:
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 0.25rem;">
                <button class="quick-filter-btn" data-category="laboratory">Лабораторії</button>
                <button class="quick-filter-btn" data-category="restroom">Туалети</button>
                <button class="quick-filter-btn" data-category="food-service">Їдальня</button>
                <button class="quick-filter-btn" data-category="accessible">Доступні</button>
            </div>
        `;

        // Стилі для кнопок швидких фільтрів
        const style = document.createElement('style');
        style.textContent = `
            .quick-filter-btn {
                padding: 0.25rem 0.5rem;
                font-size: 0.8rem;
                background: #f8f9fa;
                border: 1px solid #dee2e6;
                border-radius: 12px;
                cursor: pointer;
                transition: all 0.2s ease;
            }
            
            .quick-filter-btn:hover {
                background: #e9ecef;
            }
            
            .quick-filter-btn.active {
                background: #007bff;
                color: white;
                border-color: #007bff;
            }
        `;
        document.head.appendChild(style);

        // Додаємо обробники подій
        quickFiltersContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('quick-filter-btn')) {
                const category = e.target.dataset.category;
                
                // Переключаємо активний стан
                document.querySelectorAll('.quick-filter-btn').forEach(btn => {
                    btn.classList.remove('active');
                });
                e.target.classList.add('active');

                // Виконуємо фільтрацію
                if (category === 'accessible') {
                    const accessibleRooms = this.mapCore.currentMapData?.rooms.filter(room => room.access) || [];
                    this.displaySearchResults(accessibleRooms);
                } else {
                    this.filterByCategory(category);
                }
            }
        });

        return quickFiltersContainer;
    }

    // Підсвічування тексту в результатах пошуку
    highlightSearchTerm(text, searchTerm) {
        if (!searchTerm.trim()) return text;
        
        const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return text.replace(regex, '<mark style="background: #fff3cd; padding: 0 2px;">$1</mark>');
    }

    // Статистика пошуку
    getSearchStats() {
        const history = this.getSearchHistory();
        const stats = {
            totalSearches: history.length,
            mostSearchedTerms: {},
            averageResults: 0,
            recentActivity: history.slice(0, 5)
        };

        // Підрахунок найчастіших запитів
        history.forEach(entry => {
            const term = entry.query.toLowerCase();
            stats.mostSearchedTerms[term] = (stats.mostSearchedTerms[term] || 0) + 1;
        });

        // Середня кількість результатів
        if (history.length > 0) {
            const totalResults = history.reduce((sum, entry) => sum + entry.resultsCount, 0);
            stats.averageResults = Math.round(totalResults / history.length);
        }

        return stats;
    }
}

// Ініціалізуємо пошук після завантаження DOM
document.addEventListener('DOMContentLoaded', () => {
    // Чекаємо ініціалізації MapCore
    const initSearch = () => {
        if (window.mapCore) {
            window.mapSearch = new MapSearch(window.mapCore);
        } else {
            setTimeout(initSearch, 100);
        }
    };
    
    initSearch();
});