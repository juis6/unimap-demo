// Клас для роботи з пошуком по всіх поверхах
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
                const room = this.mapCore.findRoomById(roomId);
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

    // Виконання пошуку по всіх поверхах
    performSearch(query) {
        if (!query.trim()) {
            this.clearSearch();
            return;
        }

        try {
            const category = document.getElementById('category-select').value;
            
            // Отримуємо всі кімнати зі всіх поверхів
            let allRooms = this.mapCore.getAllRooms();

            // Фільтрація за категорією
            if (category && category !== 'all') {
                allRooms = allRooms.filter(room => room.category === category);
            }

            // Пошук за запитом
            const results = this.fuzzySearch(query, allRooms);
            
            this.displaySearchResults(results);
            this.hideAutocomplete();
            
            // Зберігаємо в історію
            this.saveSearchHistory(query, results);

        } catch (error) {
            console.error('Search error:', error);
            this.mapCore.showError('Помилка пошуку: ' + error.message);
        }
    }

    // Показати автодоповнення
    showAutocomplete(query) {
        const allRooms = this.mapCore.getAllRooms();
        if (!allRooms || allRooms.length === 0) {
            return;
        }

        const matches = this.fuzzySearch(query, allRooms, 5); // Максимум 5 результатів

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

                const displayName = room.floorLabel ? 
                    `${room.label || room.id} (${room.floorLabel})` : 
                    (room.label || room.id);

                item.innerHTML = `
                    <div style="font-weight: 500; color: #2c3e50;">${displayName}</div>
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

    // Нечіткий пошук по всіх поверхах
    fuzzySearch(query, rooms, maxResults = 10) {
        query = query.toLowerCase();
        const results = [];

        rooms.forEach(room => {
            let score = 0;
            const label = (room.label || room.id).toLowerCase();
            const category = room.category.toLowerCase();
            const keywords = room.keywords.join(' ').toLowerCase();
            const floorLabel = room.floorLabel ? room.floorLabel.toLowerCase() : '';

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

            // Збіг в інформації про поверх
            if (floorLabel.includes(query)) {
                score += 15;
            }

            // Збіг окремих слів
            const queryWords = query.split(' ');
            queryWords.forEach(word => {
                if (word.length >= 2) {
                    if (label.includes(word)) score += 10;
                    if (keywords.includes(word)) score += 5;
                    if (floorLabel.includes(word)) score += 5;
                }
            });

            if (score > 0) {
                results.push({ ...room, searchScore: score });
            }
        });

        // Сортуемо за рейтингом та повертаємо обмежену кількість
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
        
        // Групуємо результати за поверхами для кращої візуалізації
        const groupedResults = this.groupResultsByFloor(results);
        const floorCount = Object.keys(groupedResults).length;
        
        header.textContent = `Знайдено: ${results.length} (на ${floorCount} поверхах)`;
        resultsContainer.appendChild(header);

        // Відображаємо результати по групах поверхів
        Object.keys(groupedResults).sort().forEach(floor => {
            const floorGroup = document.createElement('div');
            floorGroup.style.marginBottom = '1rem';

            const floorHeader = document.createElement('div');
            floorHeader.style.cssText = `
                font-weight: 500;
                color: #6c757d;
                font-size: 0.75rem;
                text-transform: uppercase;
                margin-bottom: 0.5rem;
                padding-left: 0.5rem;
                border-left: 3px solid #dee2e6;
            `;
            floorHeader.textContent = `Поверх ${floor}`;
            floorGroup.appendChild(floorHeader);

            groupedResults[floor].forEach((room, index) => {
                const resultElement = this.createSearchResultElement(room, index);
                floorGroup.appendChild(resultElement);
            });

            resultsContainer.appendChild(floorGroup);
        });

        // Автоматично підсвічуємо перший результат
        if (results.length === 1) {
            this.selectRoom(results[0]);
        }
    }

    // Групування результатів за поверхами
    groupResultsByFloor(results) {
        const grouped = {};
        results.forEach(room => {
            const floor = room.floor || '1';
            if (!grouped[floor]) {
                grouped[floor] = [];
            }
            grouped[floor].push(room);
        });
        return grouped;
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
            // При наведенні показуємо кімнату, навіть якщо вона на іншому поверсі
            if (room.floor !== this.mapCore.currentFloor) {
                element.style.backgroundColor = 'rgba(255, 193, 7, 0.1)';
                element.style.borderColor = '#ffc107';
            } else {
                this.highlightRoomOnCurrentFloor(room.id, true);
            }
        });

        element.addEventListener('mouseleave', () => {
            if (room.floor !== this.mapCore.currentFloor) {
                element.style.backgroundColor = '';
                element.style.borderColor = '';
            } else {
                this.highlightRoomOnCurrentFloor(room.id, false);
            }
        });

        return element;
    }

    // Підсвічування кімнати на поточному поверсі
    highlightRoomOnCurrentFloor(roomId, highlight) {
        if (this.mapCore.currentFloor) {
            const roomElement = document.getElementById(roomId);
            if (roomElement) {
                if (highlight) {
                    roomElement.classList.add('highlighted');
                } else {
                    roomElement.classList.remove('highlighted');
                }
            }
        }
    }

    // Фільтрація за категорією по всіх поверхах
    filterByCategory(category) {
        try {
            // Отримуємо всі кімнати зі всіх поверхів
            let allRooms = this.mapCore.getAllRooms();

            // Фільтрація за категорією
            if (category && category !== 'all') {
                allRooms = allRooms.filter(room => room.category === category);
            }

            this.displaySearchResults(allRooms);

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
    async selectRoom(room) {
        // Виділяємо кімнату на карті (може потребувати переключення поверху)
        await this.mapCore.selectRoom(room);

        // Підсвічуємо результат в списку
        document.querySelectorAll('.search-result').forEach(el => {
            el.classList.remove('selected');
        });

        const resultElement = document.querySelector(`[data-room-id="${room.id}"]`);
        if (resultElement) {
            resultElement.classList.add('selected');
        }

        // Переміщуємо карту до кімнати (якщо вона на поточному поверсі)
        if (room.floor === this.mapCore.currentFloor && window.mapUI) {
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

        // Скидаємо виділення кімнат на поточному поверсі
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
        const headers = ['ID', 'Назва', 'Поверх', 'Категорія', 'Ключові слова', 'Доступ'];
        const rows = data.map(room => [
            room.id,
            room.label || '',
            room.floorLabel || `Поверх ${room.floor}`,
            this.mapCore.getCategoryName(room.category),
            room.keywords.join('; '),
            room.access ? 'Так' : 'Ні'
        ]);

        const csvContent = [headers, ...rows]
            .map(row => row.map(field => `"${field}"`).join(','))
            .join('\n');

        return csvContent;
    }

    // Пошук найближчих кімнат до заданої точки (у межах поверху)
    findNearestRooms(targetRoom, maxResults = 5) {
        if (!targetRoom) {
            return [];
        }

        // Шукаємо кімнати на тому ж поверсі
        const mapData = this.mapCore.allMapsData.get(targetRoom.floor);
        if (!mapData || !mapData.rooms) {
            return [];
        }

        const rooms = mapData.rooms.filter(room => 
            room.id !== targetRoom.id && room.access
        );

        const targetCenter = this.calculateRoomCenter(targetRoom);
        
        const roomsWithDistance = rooms.map(room => {
            const roomCenter = this.calculateRoomCenter(room);
            const distance = this.calculateDistance(targetCenter, roomCenter);
            
            return {
                ...room,
                floor: targetRoom.floor,
                floorLabel: `Поверх ${targetRoom.floor}`,
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
            floor = 'all',
            accessibleOnly = false,
            sortBy = 'relevance' // relevance, name, category, floor
        } = options;

        let results = this.mapCore.getAllRooms();

        // Фільтр за доступністю
        if (accessibleOnly) {
            results = results.filter(room => room.access);
        }

        // Фільтр за категорією
        if (category !== 'all') {
            results = results.filter(room => room.category === category);
        }

        // Фільтр за поверхом
        if (floor !== 'all') {
            results = results.filter(room => room.floor === floor);
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
            case 'floor':
                results.sort((a, b) => parseInt(a.floor) - parseInt(b.floor));
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
                floorsFound: [...new Set(results.map(r => r.floor))].length,
                results: results.slice(0, 3).map(r => ({ 
                    id: r.id, 
                    label: r.label, 
                    floor: r.floor 
                }))
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
            const floorsText = entry.floorsFound > 1 ? ` на ${entry.floorsFound} поверхах` : '';
            
            item.innerHTML = `
                <div style="font-weight: 500; color: #2c3e50;">${entry.query}</div>
                <div style="font-size: 0.8rem; color: #6c757d;">
                    ${entry.resultsCount} результатів${floorsText} • ${timeAgo}
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

    // Підсвічування тексту в результатах пошуку
    highlightSearchTerm(text, searchTerm) {
        if (!searchTerm.trim()) return text;
        
        const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\// Клас для роботи з пошуком по всіх поверхах
class MapSearch {
    constructor(mapCore) {
        this.mapCore = mapCore;
        this.')})`, 'gi');
        return text.replace(regex, '<mark style="background: #fff3cd; padding: 0 2px;">$1</mark>');
    }

    // Статистика пошуку
    getSearchStats() {
        const history = this.getSearchHistory();
        const stats = {
            totalSearches: history.length,
            mostSearchedTerms: {},
            averageResults: 0,
            floorsSearched: new Set(),
            recentActivity: history.slice(0, 5)
        };

        // Підрахунок найчастіших запитів та поверхів
        history.forEach(entry => {
            const term = entry.query.toLowerCase();
            stats.mostSearchedTerms[term] = (stats.mostSearchedTerms[term] || 0) + 1;
            
            if (entry.results) {
                entry.results.forEach(result => {
                    if (result.floor) {
                        stats.floorsSearched.add(result.floor);
                    }
                });
            }
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