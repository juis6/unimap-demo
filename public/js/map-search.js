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

        // Показати історію при фокусі на пустому полі
        searchInput.addEventListener('focus', (e) => {
            if (!e.target.value.trim()) {
                this.showSearchHistory();
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
            autocompleteContainer.className = 'autocomplete-container';
            autocompleteContainer.setAttribute('role', 'listbox');
            autocompleteContainer.setAttribute('aria-label', 'Пропозиції пошуку');

            const searchContainer = document.getElementById('search-input-container');
            searchContainer.style.position = 'relative';
            searchContainer.appendChild(autocompleteContainer);
        }

        // Обробка вибору з автодоповнення
        autocompleteContainer.addEventListener('click', (e) => {
            const item = e.target.closest('.autocomplete-item');
            if (item) {
                const roomId = item.dataset.roomId;
                if (roomId) {
                    const room = this.mapCore.findRoomById(roomId);
                    if (room) {
                        searchInput.value = room.label || room.id;
                        this.selectRoom(room);
                        this.hideAutocomplete();
                    }
                } else if (item.dataset.historyQuery) {
                    // Вибір з історії
                    const query = item.dataset.historyQuery;
                    searchInput.value = query;
                    this.performSearch(query);
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

        // Клавіатурна навігація по автодоповненню
        searchInput.addEventListener('keydown', (e) => {
            this.handleAutocompleteNavigation(e, autocompleteContainer);
        });
    }

    // Клавіатурна навігація по автодоповненню
    handleAutocompleteNavigation(e, container) {
        const items = container.querySelectorAll('.autocomplete-item');
        if (items.length === 0) return;

        const activeItem = container.querySelector('.autocomplete-item.active');
        let activeIndex = activeItem ? Array.from(items).indexOf(activeItem) : -1;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                if (activeItem) activeItem.classList.remove('active');
                activeIndex = (activeIndex + 1) % items.length;
                items[activeIndex].classList.add('active');
                items[activeIndex].scrollIntoView({ block: 'nearest' });
                break;

            case 'ArrowUp':
                e.preventDefault();
                if (activeItem) activeItem.classList.remove('active');
                activeIndex = activeIndex <= 0 ? items.length - 1 : activeIndex - 1;
                items[activeIndex].classList.add('active');
                items[activeIndex].scrollIntoView({ block: 'nearest' });
                break;

            case 'Enter':
                if (activeItem) {
                    e.preventDefault();
                    activeItem.click();
                }
                break;

            case 'Escape':
                this.hideAutocomplete();
                break;
        }
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
            } else if (this.currentQuery.length === 0) {
                this.showSearchHistory();
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

            // Оголошуємо результат для screen reader
            const floorCount = [...new Set(results.map(r => r.floor))].length;
            this.mapCore.announceToScreenReader(`Знайдено ${results.length} результатів на ${floorCount} поверхах`);

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

        const matches = this.fuzzySearch(query, allRooms, 8); // Максимум 8 результатів

        const autocompleteContainer = document.getElementById('search-autocomplete');
        autocompleteContainer.innerHTML = '';

        if (matches.length > 0) {
            matches.forEach((room, index) => {
                const item = document.createElement('div');
                item.className = 'autocomplete-item';
                item.dataset.roomId = room.id;
                item.setAttribute('role', 'option');
                item.setAttribute('tabindex', '-1');

                const displayName = room.floorLabel ?
                    `${room.label || room.id} (${room.floorLabel})` :
                    (room.label || room.id);

                // Підсвічуємо співпадіння в тексті
                const highlightedName = this.highlightSearchTerm(displayName, query);

                item.innerHTML = `
                    <div class="autocomplete-main">${highlightedName}</div>
                    <div class="autocomplete-secondary">${this.mapCore.getCategoryName(room.category)}</div>
                `;

                item.addEventListener('mouseenter', () => {
                    // Знімаємо активний стан з інших елементів
                    autocompleteContainer.querySelectorAll('.autocomplete-item.active')
                        .forEach(el => el.classList.remove('active'));
                    item.classList.add('active');
                });

                autocompleteContainer.appendChild(item);
            });

            autocompleteContainer.style.display = 'block';
        } else {
            // Показуємо повідомлення про відсутність результатів
            const noResults = document.createElement('div');
            noResults.className = 'autocomplete-no-results';
            noResults.textContent = 'Нічого не знайдено';
            autocompleteContainer.appendChild(noResults);
            autocompleteContainer.style.display = 'block';
        }
    }

    // Сховати автодоповнення
    hideAutocomplete() {
        const autocompleteContainer = document.getElementById('search-autocomplete');
        if (autocompleteContainer) {
            autocompleteContainer.style.display = 'none';
            autocompleteContainer.innerHTML = '';
        }
    }

    // Нечіткий пошук по всіх поверхах
    fuzzySearch(query, rooms, maxResults = 20) {
        query = query.toLowerCase();
        const results = [];

        rooms.forEach(room => {
            let score = 0;
            const label = (room.label || room.id).toLowerCase();
            const category = room.category.toLowerCase();
            const categoryName = this.mapCore.getCategoryName(room.category).toLowerCase();
            const keywords = room.keywords.join(' ').toLowerCase();
            const floorLabel = room.floorLabel ? room.floorLabel.toLowerCase() : '';

            // Точний збіг в назві - найвищий пріоритет
            if (label === query) {
                score += 200;
            } else if (label.includes(query)) {
                score += 100;
                if (label.startsWith(query)) {
                    score += 50;
                }
            }

            // Збіг в категорії
            if (category.includes(query) || categoryName.includes(query)) {
                score += 40;
            }

            // Збіг в ключових словах
            if (keywords.includes(query)) {
                score += 30;
            }

            // Збіг в інформації про поверх
            if (floorLabel.includes(query)) {
                score += 25;
            }

            // Збіг окремих слів
            const queryWords = query.split(' ').filter(word => word.length >= 2);
            queryWords.forEach(word => {
                if (label.includes(word)) score += 15;
                if (categoryName.includes(word)) score += 10;
                if (keywords.includes(word)) score += 8;
                if (floorLabel.includes(word)) score += 5;
            });

            // Бонус за доступність
            if (room.access) {
                score += 5;
            }

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
                <div class="search-no-results">
                    <div class="search-no-results-icon">🔍</div>
                    <div class="search-no-results-text">Нічого не знайдено</div>
                    <div class="search-no-results-suggestion">
                        Спробуйте змінити запит або оберіть іншу категорію
                    </div>
                </div>
            `;
            return;
        }

        // Створюємо заголовок з кількістю результатів та кнопками
        const header = document.createElement('div');
        header.className = 'search-results-header';

        // Групуємо результати за поверхами для кращої візуалізації
        const groupedResults = this.groupResultsByFloor(results);
        const floorCount = Object.keys(groupedResults).length;

        header.innerHTML = `
            <div class="search-results-count">
                Знайдено: <strong>${results.length}</strong> на ${floorCount} поверхах
            </div>
            <div class="search-results-actions">
                <button id="export-search-results" class="md-button md-button-text" style="font-size: 0.75rem;">
                    Експорт
                </button>
                <button id="clear-search-results" class="md-button md-button-text" style="font-size: 0.75rem;">
                    Очистити
                </button>
            </div>
        `;
        resultsContainer.appendChild(header);

        // Додаємо обробники для кнопок
        document.getElementById('export-search-results').addEventListener('click', () => {
            this.exportSearchResults();
        });

        document.getElementById('clear-search-results').addEventListener('click', () => {
            this.clearSearch();
        });

        // Відображаємо результати по групах поверхів
        Object.keys(groupedResults).sort((a, b) => parseInt(a) - parseInt(b)).forEach(floor => {
            const floorGroup = document.createElement('div');
            floorGroup.className = 'search-floor-group';

            const floorHeader = document.createElement('div');
            floorHeader.className = 'search-floor-header';
            floorHeader.innerHTML = `
                <span class="search-floor-title">Поверх ${floor}</span>
                <span class="search-floor-count">${groupedResults[floor].length}</span>
            `;
            floorGroup.appendChild(floorHeader);

            const floorResults = document.createElement('div');
            floorResults.className = 'search-floor-results';

            groupedResults[floor].forEach((room, index) => {
                const resultElement = this.createSearchResultElement(room, index);
                floorResults.appendChild(resultElement);
            });

            floorGroup.appendChild(floorResults);
            resultsContainer.appendChild(floorGroup);
        });

        // Автоматично підсвічуємо і вибираємо перший результат якщо їх мало
        if (results.length === 1) {
            this.selectRoom(results[0]);
        } else if (results.length <= 3) {
            // Підсвічуємо всі результати на поточному поверсі
            results.forEach(room => {
                if (room.floor === this.mapCore.currentFloor) {
                    this.highlightRoomOnFloor(room.id, room.floor, true);
                }
            });
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
        element.dataset.roomFloor = room.floor;
        element.setAttribute('role', 'button');
        element.setAttribute('tabindex', '0');

        // Визначаємо чи кімната на поточному поверсі
        const isCurrentFloor = room.floor === this.mapCore.currentFloor;
        const floorIndicator = isCurrentFloor ? '' : ' 🔄';

        // Підсвічуємо текст запиту в результатах
        const highlightedLabel = this.highlightSearchTerm(room.label || room.id, this.currentQuery);
        const keywordsText = room.keywords.slice(0, 3).join(', ') + (room.keywords.length > 3 ? '...' : '');

        element.innerHTML = `
            <div class="search-result-main">
                <div class="search-result-title">${highlightedLabel}${floorIndicator}</div>
                <div class="search-result-category">${this.mapCore.getCategoryName(room.category)}</div>
            </div>
            <div class="search-result-meta">
                <div class="search-result-floor">${room.floorLabel}</div>
                <div class="search-result-keywords">${keywordsText}</div>
            </div>
        `;

        // Додаємо індикатор доступності
        if (!room.access) {
            element.classList.add('search-result-restricted');
            const restrictedIcon = document.createElement('div');
            restrictedIcon.className = 'search-result-restricted-icon';
            restrictedIcon.textContent = '🔒';
            restrictedIcon.title = 'Обмежений доступ';
            element.appendChild(restrictedIcon);
        }

        // Стилізація для кімнат на інших поверхах
        if (!isCurrentFloor) {
            element.classList.add('search-result-other-floor');
        }

        // Додаємо обробники подій
        element.addEventListener('click', () => {
            this.selectRoom(room);
        });

        element.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.selectRoom(room);
            }
        });

        element.addEventListener('mouseenter', () => {
            this.highlightRoomOnFloor(room.id, room.floor, true);

            // Показуємо додаткову інформацію в tooltip
            this.showRoomTooltip(element, room);
        });

        element.addEventListener('mouseleave', () => {
            this.highlightRoomOnFloor(room.id, room.floor, false);
            this.hideRoomTooltip();
        });

        element.addEventListener('focus', () => {
            this.highlightRoomOnFloor(room.id, room.floor, true);
        });

        element.addEventListener('blur', () => {
            this.highlightRoomOnFloor(room.id, room.floor, false);
        });

        return element;
    }

    // Підсвічування кімнати на певному поверсі
    highlightRoomOnFloor(roomId, floor, highlight) {
        // Якщо кімната на поточному поверсі, підсвічуємо її
        if (floor === this.mapCore.currentFloor) {
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

    // Показати tooltip з інформацією про кімнату
    showRoomTooltip(element, room) {
        let tooltip = document.getElementById('room-tooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'room-tooltip';
            tooltip.className = 'room-tooltip';
            document.body.appendChild(tooltip);
        }

        const rect = element.getBoundingClientRect();
        const floorStatus = room.floor === this.mapCore.currentFloor ?
            'Поточний поверх' : 'Інший поверх (клікніть для переходу)';

        tooltip.innerHTML = `
            <div class="room-tooltip-title">${room.label || room.id}</div>
            <div class="room-tooltip-info">
                <div>Категорія: ${this.mapCore.getCategoryName(room.category)}</div>
                <div>Поверх: ${room.floor} (${floorStatus})</div>
                <div>Доступ: ${room.access ? 'Дозволено' : 'Обмежено'}</div>
            </div>
        `;

        tooltip.style.left = (rect.right + 10) + 'px';
        tooltip.style.top = rect.top + 'px';
        tooltip.style.display = 'block';

        // Перевіряємо, чи tooltip не виходить за межі екрану
        const tooltipRect = tooltip.getBoundingClientRect();
        if (tooltipRect.right > window.innerWidth) {
            tooltip.style.left = (rect.left - tooltipRect.width - 10) + 'px';
        }
        if (tooltipRect.bottom > window.innerHeight) {
            tooltip.style.top = (rect.bottom - tooltipRect.height) + 'px';
        }
    }

    // Сховати tooltip
    hideRoomTooltip() {
        const tooltip = document.getElementById('room-tooltip');
        if (tooltip) {
            tooltip.style.display = 'none';
        }
    }

    // Фільтрація за категорією по всіх поверхах
    filterByCategory(category) {
        try {
            // Очищуємо поле пошуку
            document.getElementById('search-input').value = '';
            this.currentQuery = '';

            // Отримуємо всі кімнати зі всіх поверхів
            let allRooms = this.mapCore.getAllRooms();

            // Фільтрація за категорією
            if (category && category !== 'all') {
                allRooms = allRooms.filter(room => room.category === category);
            }

            this.displaySearchResults(allRooms);

            // Оголошуємо результат фільтрації
            const categoryName = category === 'all' ? 'всі категорії' : this.mapCore.getCategoryName(category);
            const floorCount = [...new Set(allRooms.map(r => r.floor))].length;
            this.mapCore.announceToScreenReader(`Відфільтровано: ${categoryName}, знайдено ${allRooms.length} кімнат на ${floorCount} поверхах`);

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
            resultElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        // Переміщуємо карту до кімнати (тепер завжди, оскільки автоматично переключаємо поверх)
        if (window.mapUI) {
            setTimeout(() => {
                window.mapUI.panToRoom(room.id);
                window.mapUI.highlightRoom(room.id, 2000);
            }, 500);
        }

        // Оголошуємо вибір
        const roomDescription = room.floorLabel ?
            `${room.label || room.id} на ${room.floorLabel}` :
            `${room.label || room.id}`;
        this.mapCore.announceToScreenReader(`Обрано кімнату ${roomDescription}`);
    }

    // Очищення пошуку
    clearSearch() {
        document.getElementById('search-input').value = '';
        document.getElementById('category-select').value = 'all';
        document.getElementById('search-results').innerHTML = '';

        this.hideAutocomplete();
        this.hideRoomTooltip();
        this.searchResults = [];
        this.currentQuery = '';

        // Скидаємо виділення кімнат на всіх поверхах
        document.querySelectorAll('.room.highlighted').forEach(room => {
            room.classList.remove('highlighted');
        });

        this.mapCore.announceToScreenReader('Пошук очищено');
    }

    // Експорт результатів пошуку
    exportSearchResults() {
        if (this.searchResults.length === 0) {
            this.mapCore.showError('Немає результатів для експорту');
            return;
        }

        const csvContent = this.convertToCSV(this.searchResults);
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        const timestamp = new Date().toISOString().slice(0, 10);
        const query = this.currentQuery ? `-${this.currentQuery.replace(/[^a-zA-Z0-9]/g, '_')}` : '';
        link.download = `search-results${query}-${timestamp}.csv`;
        link.click();

        URL.revokeObjectURL(url);
        this.mapCore.announceToScreenReader('Результати пошуку експортовано');
    }

    // Конвертація в CSV
    convertToCSV(data) {
        const headers = ['ID', 'Назва', 'Поверх', 'Категорія', 'Ключові слова', 'Доступ', 'Рейтинг пошуку'];
        const rows = data.map(room => [
            room.id,
            room.label || '',
            room.floorLabel || `Поверх ${room.floor}`,
            this.mapCore.getCategoryName(room.category),
            room.keywords.join('; '),
            room.access ? 'Так' : 'Ні',
            room.searchScore || 0
        ]);

        const csvContent = [headers, ...rows]
            .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
            .join('\n');

        // Додаємо BOM для правильного відображення українських символів
        return '\ufeff' + csvContent;
    }

    // Збереження історії пошуків
    saveSearchHistory(query, results) {
        try {
            let history = JSON.parse(localStorage.getItem('searchHistory') || '[]');

            const searchEntry = {
                query: query.trim(),
                timestamp: new Date().toISOString(),
                resultsCount: results.length,
                floorsFound: [...new Set(results.map(r => r.floor))].length,
                topResults: results.slice(0, 3).map(r => ({
                    id: r.id,
                    label: r.label,
                    floor: r.floor,
                    category: r.category
                }))
            };

            // Перевіряємо, чи такий запит вже не існує
            const existingIndex = history.findIndex(entry => entry.query.toLowerCase() === query.toLowerCase());
            if (existingIndex !== -1) {
                // Оновлюємо існуючий запис
                history[existingIndex] = searchEntry;
                // Переміщуємо на початок
                history.unshift(history.splice(existingIndex, 1)[0]);
            } else {
                // Додаємо новий запис на початок
                history.unshift(searchEntry);
            }

            // Обмежуємо розмір історії
            history = history.slice(0, 15);

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

        autocompleteContainer.innerHTML = '';

        // Заголовок історії
        const historyHeader = document.createElement('div');
        historyHeader.className = 'autocomplete-history-header';
        historyHeader.innerHTML = `
            <span>Історія пошуків</span>
            <button id="clear-history-btn" class="autocomplete-clear-history" title="Очистити історію">×</button>
        `;
        autocompleteContainer.appendChild(historyHeader);

        // Додаємо обробник для очищення історії
        document.getElementById('clear-history-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.clearSearchHistory();
        });

        history.slice(0, 8).forEach(entry => {
            const item = document.createElement('div');
            item.className = 'autocomplete-item autocomplete-history-item';
            item.dataset.historyQuery = entry.query;
            item.setAttribute('role', 'option');
            item.setAttribute('tabindex', '-1');

            const timeAgo = this.formatTimeAgo(new Date(entry.timestamp));
            const floorsText = entry.floorsFound > 1 ? ` на ${entry.floorsFound} поверхах` : '';

            item.innerHTML = `
                <div class="autocomplete-main">
                    <span class="autocomplete-history-icon">🕒</span>
                    ${entry.query}
                </div>
                <div class="autocomplete-secondary">
                    ${entry.resultsCount} результатів${floorsText} • ${timeAgo}
                </div>
            `;

            item.addEventListener('mouseenter', () => {
                autocompleteContainer.querySelectorAll('.autocomplete-item.active')
                    .forEach(el => el.classList.remove('active'));
                item.classList.add('active');
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
            this.mapCore.announceToScreenReader('Історію пошуків очищено');
        } catch (error) {
            console.warn('Failed to clear search history:', error);
        }
    }

    // Знайдіть рядок 828 і замініть його на:

    // Підсвічування тексту в результатах пошуку
    highlightSearchTerm(text, searchTerm) {
        if (!searchTerm.trim()) return text;

        const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return text.replace(regex, '<mark class="search-highlight">$1</mark>');
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

        if (shape.type === 'rect' && shape.coordinates) {
            return {
                x: shape.coordinates.x + shape.coordinates.width / 2,
                y: shape.coordinates.y + shape.coordinates.height / 2
            };
        }

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
                results.sort((a, b) => (a.label || a.id).localeCompare(b.label || b.id, 'uk'));
                break;
            case 'category':
                results.sort((a, b) => {
                    const catA = this.mapCore.getCategoryName(a.category);
                    const catB = this.mapCore.getCategoryName(b.category);
                    return catA.localeCompare(catB, 'uk');
                });
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

    // Статистика пошуку
    getSearchStats() {
        const history = this.getSearchHistory();
        const allRooms = this.mapCore.getAllRooms();
        const stats = {
            totalSearches: history.length,
            mostSearchedTerms: {},
            averageResults: 0,
            floorsSearched: new Set(),
            recentActivity: history.slice(0, 5),
            totalRooms: allRooms.length,
            roomsByCategory: {},
            roomsByFloor: {}
        };

        // Підрахунок статистики кімнат
        allRooms.forEach(room => {
            // За категоріями
            const category = room.category;
            stats.roomsByCategory[category] = (stats.roomsByCategory[category] || 0) + 1;

            // За поверхами
            const floor = room.floor;
            stats.roomsByFloor[floor] = (stats.roomsByFloor[floor] || 0) + 1;
        });

        // Підрахунок найчастіших запитів та поверхів
        history.forEach(entry => {
            const term = entry.query.toLowerCase();
            stats.mostSearchedTerms[term] = (stats.mostSearchedTerms[term] || 0) + 1;

            if (entry.topResults) {
                entry.topResults.forEach(result => {
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

    // Пошук за QR кодом або ID
    searchByQR(qrData) {
        try {
            // Спробуємо розпарсити QR дані
            let roomId = qrData;

            // Якщо це URL, витягуємо ID кімнати
            if (qrData.includes('room=')) {
                const urlParams = new URLSearchParams(qrData.split('?')[1]);
                roomId = urlParams.get('room');
            }

            if (roomId) {
                const room = this.mapCore.findRoomById(roomId);
                if (room) {
                    this.selectRoom(room);
                    this.mapCore.announceToScreenReader(`Знайдено кімнату за QR кодом: ${room.label || room.id}`);
                    return true;
                } else {
                    this.mapCore.showError('Кімнату з QR коду не знайдено');
                    return false;
                }
            }
        } catch (error) {
            console.error('QR search error:', error);
            this.mapCore.showError('Помилка обробки QR коду');
            return false;
        }
    }

    // Голосовий пошук (якщо підтримується браузером)
    initVoiceSearch() {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            return false;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();

        recognition.lang = 'uk-UA';
        recognition.continuous = false;
        recognition.interimResults = false;

        // Створюємо кнопку голосового пошуку
        const voiceButton = document.createElement('button');
        voiceButton.id = 'voice-search-btn';
        voiceButton.className = 'md-button md-button-outlined';
        voiceButton.innerHTML = '🎤';
        voiceButton.title = 'Голосовий пошук';
        voiceButton.style.marginLeft = '8px';

        const searchButton = document.getElementById('search-button');
        searchButton.parentNode.insertBefore(voiceButton, searchButton.nextSibling);

        voiceButton.addEventListener('click', () => {
            recognition.start();
            voiceButton.textContent = '🔴';
            voiceButton.disabled = true;
            this.mapCore.announceToScreenReader('Почався голосовий пошук');
        });

        recognition.onresult = (event) => {
            const query = event.results[0][0].transcript;
            document.getElementById('search-input').value = query;
            this.performSearch(query);
            this.mapCore.announceToScreenReader(`Голосовий пошук: ${query}`);
        };

        recognition.onend = () => {
            voiceButton.textContent = '🎤';
            voiceButton.disabled = false;
        };

        recognition.onerror = (event) => {
            console.error('Voice recognition error:', event.error);
            voiceButton.textContent = '🎤';
            voiceButton.disabled = false;
            this.mapCore.showError('Помилка голосового пошуку');
        };

        return true;
    }

    // Інтелектуальні пропозиції пошуку
    getSuggestions(query) {
        const suggestions = [];
        const allRooms = this.mapCore.getAllRooms();

        // Пропозиції на основі популярних категорій
        const categories = [...new Set(allRooms.map(room => room.category))];
        categories.forEach(category => {
            const categoryName = this.mapCore.getCategoryName(category);
            if (categoryName.toLowerCase().includes(query.toLowerCase())) {
                suggestions.push({
                    type: 'category',
                    text: `Усі ${categoryName.toLowerCase()}`,
                    query: categoryName,
                    count: allRooms.filter(room => room.category === category).length
                });
            }
        });

        // Пропозиції на основі поверхів
        const floors = [...new Set(allRooms.map(room => room.floor))].sort();
        floors.forEach(floor => {
            const floorQuery = `поверх ${floor}`;
            if (floorQuery.includes(query.toLowerCase())) {
                suggestions.push({
                    type: 'floor',
                    text: `Поверх ${floor}`,
                    query: floorQuery,
                    count: allRooms.filter(room => room.floor === floor).length
                });
            }
        });

        return suggestions.slice(0, 5);
    }

    // Контекстний пошук (пошук поблизу обраної кімнати)
    searchNearby(room, category = 'all', maxDistance = 100) {
        if (!room) {
            return [];
        }

        const mapData = this.mapCore.allMapsData.get(room.floor);
        if (!mapData || !mapData.rooms) {
            return [];
        }

        let nearbyRooms = mapData.rooms.filter(r => r.id !== room.id);

        // Фільтр за категорією
        if (category !== 'all') {
            nearbyRooms = nearbyRooms.filter(r => r.category === category);
        }

        const roomCenter = this.calculateRoomCenter(room);

        const roomsWithDistance = nearbyRooms.map(r => {
            const center = this.calculateRoomCenter(r);
            const distance = this.calculateDistance(roomCenter, center);

            return {
                ...r,
                floor: room.floor,
                floorLabel: `Поверх ${room.floor}`,
                distance: distance
            };
        }).filter(r => r.distance <= maxDistance);

        return roomsWithDistance.sort((a, b) => a.distance - b.distance);
    }
}

// Ініціалізуємо пошук після завантаження DOM
document.addEventListener('DOMContentLoaded', () => {
    // Чекаємо ініціалізації MapCore
    const initSearch = () => {
        if (window.mapCore && window.mapCore.allMapsData.size > 0) {
            window.mapSearch = new MapSearch(window.mapCore);

            // Ініціалізуємо голосовий пошук якщо можливо
            if (window.mapSearch.initVoiceSearch()) {
                console.log('Voice search initialized');
            }
        } else {
            setTimeout(initSearch, 200);
        }
    };

    initSearch();
});