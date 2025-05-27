// Class for search functionality across all floors
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
        // Search on text input
        const searchInput = document.getElementById('search-input');
        searchInput.addEventListener('input', (e) => {
            this.handleSearchInput(e.target.value);
        });

        // Search on button click
        document.getElementById('search-button').addEventListener('click', () => {
            this.performSearch(searchInput.value);
        });

        // Search on Enter
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.performSearch(e.target.value);
            }
        });

        // Filter by category
        document.getElementById('category-select').addEventListener('change', (e) => {
            this.filterByCategory(e.target.value);
        });

        // Clear search
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.clearSearch();
            }
        });

        // Show history on focus with empty field
        searchInput.addEventListener('focus', (e) => {
            if (!e.target.value.trim()) {
                this.showSearchHistory();
            }
        });
    }

    // Setup autocomplete
    setupAutoComplete() {
        const searchInput = document.getElementById('search-input');
        let autocompleteContainer = document.getElementById('search-autocomplete');

        if (!autocompleteContainer) {
            autocompleteContainer = document.createElement('div');
            autocompleteContainer.id = 'search-autocomplete';
            autocompleteContainer.className = 'autocomplete-container';
            autocompleteContainer.setAttribute('role', 'listbox');
            autocompleteContainer.setAttribute('aria-label', 'Search suggestions');

            const searchContainer = document.getElementById('search-input-container');
            searchContainer.style.position = 'relative';
            searchContainer.appendChild(autocompleteContainer);
        }

        // Handle autocomplete selection
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
                    // Select from history
                    const query = item.dataset.historyQuery;
                    searchInput.value = query;
                    this.performSearch(query);
                    this.hideAutocomplete();
                }
            }
        });

        // Hide autocomplete on outside click
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#search-input-container')) {
                this.hideAutocomplete();
            }
        });

        // Keyboard navigation for autocomplete
        searchInput.addEventListener('keydown', (e) => {
            this.handleAutocompleteNavigation(e, autocompleteContainer);
        });
    }

    // Keyboard navigation for autocomplete
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

    // Handle search input
    handleSearchInput(query) {
        this.currentQuery = query.trim();

        // Clear previous timer
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }

        // Set new timer for delayed search
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

    // Perform search across all floors
    performSearch(query) {
        if (!query.trim()) {
            this.clearSearch();
            return;
        }

        try {
            const category = document.getElementById('category-select').value;

            // Get all rooms from all floors
            let allRooms = this.mapCore.getAllRooms();

            // Filter by category
            if (category && category !== 'all') {
                allRooms = allRooms.filter(room => room.category === category);
            }

            // Search by query
            const results = this.fuzzySearch(query, allRooms);

            this.displaySearchResults(results);
            this.hideAutocomplete();

            // Save to history
            this.saveSearchHistory(query, results);

            // Announce result for screen reader
            const floorCount = [...new Set(results.map(r => r.floor))].length;
            this.mapCore.announceToScreenReader(`Found ${results.length} results on ${floorCount} floors`);

        } catch (error) {
            console.error('Search error:', error);
            this.mapCore.showError('Search error: ' + error.message);
        }
    }

    // Show autocomplete
    showAutocomplete(query) {
        const allRooms = this.mapCore.getAllRooms();
        if (!allRooms || allRooms.length === 0) {
            return;
        }

        const matches = this.fuzzySearch(query, allRooms, 8); // Maximum 8 results

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

                // Highlight matches in text
                const highlightedName = this.highlightSearchTerm(displayName, query);

                item.innerHTML = `
                    <div class="autocomplete-main">${highlightedName}</div>
                    <div class="autocomplete-secondary">${this.mapCore.getCategoryName(room.category)}</div>
                `;

                item.addEventListener('mouseenter', () => {
                    // Remove active state from other elements
                    autocompleteContainer.querySelectorAll('.autocomplete-item.active')
                        .forEach(el => el.classList.remove('active'));
                    item.classList.add('active');
                });

                autocompleteContainer.appendChild(item);
            });

            autocompleteContainer.style.display = 'block';
        } else {
            // Show no results message
            const noResults = document.createElement('div');
            noResults.className = 'autocomplete-no-results';
            noResults.textContent = 'No results found';
            autocompleteContainer.appendChild(noResults);
            autocompleteContainer.style.display = 'block';
        }
    }

    // Hide autocomplete
    hideAutocomplete() {
        const autocompleteContainer = document.getElementById('search-autocomplete');
        if (autocompleteContainer) {
            autocompleteContainer.style.display = 'none';
            autocompleteContainer.innerHTML = '';
        }
    }

    // Fuzzy search across all floors
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

            // Exact match in name - highest priority
            if (label === query) {
                score += 200;
            } else if (label.includes(query)) {
                score += 100;
                if (label.startsWith(query)) {
                    score += 50;
                }
            }

            // Match in category
            if (category.includes(query) || categoryName.includes(query)) {
                score += 40;
            }

            // Match in keywords
            if (keywords.includes(query)) {
                score += 30;
            }

            // Match in floor info
            if (floorLabel.includes(query)) {
                score += 25;
            }

            // Match individual words
            const queryWords = query.split(' ').filter(word => word.length >= 2);
            queryWords.forEach(word => {
                if (label.includes(word)) score += 15;
                if (categoryName.includes(word)) score += 10;
                if (keywords.includes(word)) score += 8;
                if (floorLabel.includes(word)) score += 5;
            });

            // Bonus for accessibility
            if (room.access) {
                score += 5;
            }

            if (score > 0) {
                results.push({ ...room, searchScore: score });
            }
        });

        // Sort by score and return limited number
        return results
            .sort((a, b) => b.searchScore - a.searchScore)
            .slice(0, maxResults);
    }

    // Display search results
    displaySearchResults(results) {
        this.searchResults = results;
        const resultsContainer = document.getElementById('search-results');
        resultsContainer.innerHTML = '';

        if (results.length === 0) {
            resultsContainer.innerHTML = `
                <div class="search-no-results">
                    <div class="search-no-results-icon">🔍</div>
                    <div class="search-no-results-text">No results found</div>
                    <div class="search-no-results-suggestion">
                        Try changing your search or select a different category
                    </div>
                </div>
            `;
            return;
        }

        // Create header with result count and buttons
        const header = document.createElement('div');
        header.className = 'search-results-header';

        // Group results by floor for better visualization
        const groupedResults = this.groupResultsByFloor(results);
        const floorCount = Object.keys(groupedResults).length;

        header.innerHTML = `
            <div class="search-results-count">
                Found: <strong>${results.length}</strong> on ${floorCount} floors
            </div>
            <div class="search-results-actions">
                <button id="export-search-results" class="md-button md-button-text" style="font-size: 0.75rem;">
                    Export
                </button>
                <button id="clear-search-results" class="md-button md-button-text" style="font-size: 0.75rem;">
                    Clear
                </button>
            </div>
        `;
        resultsContainer.appendChild(header);

        // Add handlers for buttons
        document.getElementById('export-search-results').addEventListener('click', () => {
            this.exportSearchResults();
        });

        document.getElementById('clear-search-results').addEventListener('click', () => {
            this.clearSearch();
        });

        // Display results grouped by floor
        Object.keys(groupedResults).sort((a, b) => parseInt(a) - parseInt(b)).forEach(floor => {
            const floorGroup = document.createElement('div');
            floorGroup.className = 'search-floor-group';

            const floorHeader = document.createElement('div');
            floorHeader.className = 'search-floor-header';
            floorHeader.innerHTML = `
                <span class="search-floor-title">Floor ${floor}</span>
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

        // Automatically highlight and select first result if few results
        if (results.length === 1) {
            this.selectRoom(results[0]);
        } else if (results.length <= 3) {
            // Highlight all results on current floor
            results.forEach(room => {
                if (room.floor === this.mapCore.currentFloor) {
                    this.highlightRoomOnFloor(room.id, room.floor, true);
                }
            });
        }
    }

    // Group results by floor
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

    // Create search result element
    createSearchResultElement(room, index) {
        const element = document.createElement('div');
        element.className = 'search-result';
        element.dataset.roomId = room.id;
        element.dataset.roomFloor = room.floor;
        element.setAttribute('role', 'button');
        element.setAttribute('tabindex', '0');

        // Check if room is on current floor
        const isCurrentFloor = room.floor === this.mapCore.currentFloor;
        const floorIndicator = isCurrentFloor ? '' : ' 🔄';

        // Highlight query text in results
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

        // Add accessibility indicator
        if (!room.access) {
            element.classList.add('search-result-restricted');
            const restrictedIcon = document.createElement('div');
            restrictedIcon.className = 'search-result-restricted-icon';
            restrictedIcon.textContent = '🔒';
            restrictedIcon.title = 'Restricted access';
            element.appendChild(restrictedIcon);
        }

        // Style for rooms on other floors
        if (!isCurrentFloor) {
            element.classList.add('search-result-other-floor');
        }

        // Add event handlers
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

            // Show additional info in tooltip
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

    // Highlight room on specific floor
    highlightRoomOnFloor(roomId, floor, highlight) {
        // If room is on current floor, highlight it
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

    // Show room tooltip
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
            'Current floor' : 'Different floor (click to navigate)';

        tooltip.innerHTML = `
            <div class="room-tooltip-title">${room.label || room.id}</div>
            <div class="room-tooltip-info">
                <div>Category: ${this.mapCore.getCategoryName(room.category)}</div>
                <div>Floor: ${room.floor} (${floorStatus})</div>
                <div>Access: ${room.access ? 'Allowed' : 'Restricted'}</div>
            </div>
        `;

        tooltip.style.left = (rect.right + 10) + 'px';
        tooltip.style.top = rect.top + 'px';
        tooltip.style.display = 'block';

        // Check if tooltip goes off screen
        const tooltipRect = tooltip.getBoundingClientRect();
        if (tooltipRect.right > window.innerWidth) {
            tooltip.style.left = (rect.left - tooltipRect.width - 10) + 'px';
        }
        if (tooltipRect.bottom > window.innerHeight) {
            tooltip.style.top = (rect.bottom - tooltipRect.height) + 'px';
        }
    }

    // Hide room tooltip
    hideRoomTooltip() {
        const tooltip = document.getElementById('room-tooltip');
        if (tooltip) {
            tooltip.style.display = 'none';
        }
    }

    // Filter by category across all floors
    filterByCategory(category) {
        try {
            // Clear search input
            document.getElementById('search-input').value = '';
            this.currentQuery = '';

            // Get all rooms from all floors
            let allRooms = this.mapCore.getAllRooms();

            // Filter by category
            if (category && category !== 'all') {
                allRooms = allRooms.filter(room => room.category === category);
            }

            this.displaySearchResults(allRooms);

            // Announce filter result
            const categoryName = category === 'all' ? 'all categories' : this.mapCore.getCategoryName(category);
            const floorCount = [...new Set(allRooms.map(r => r.floor))].length;
            this.mapCore.announceToScreenReader(`Filtered: ${categoryName}, found ${allRooms.length} rooms on ${floorCount} floors`);

        } catch (error) {
            console.error('Filter error:', error);
            this.mapCore.showError('Filter error: ' + error.message);
        }
    }

    // Select room from search results
    async selectRoom(room) {
        // Select room on map with fromSearch option
        await this.mapCore.selectRoom(room, { fromSearch: true });

        // Highlight result in list
        document.querySelectorAll('.search-result').forEach(el => {
            el.classList.remove('selected');
        });

        const resultElement = document.querySelector(`[data-room-id="${room.id}"]`);
        if (resultElement) {
            resultElement.classList.add('selected');
            resultElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        // Pan map to room
        if (window.mapUI) {
            setTimeout(() => {
                window.mapUI.panToRoom(room.id);
                window.mapUI.highlightRoom(room.id, 2000);
            }, 500);
        }

        // Announce selection
        const roomDescription = room.floorLabel ?
            `${room.label || room.id} on ${room.floorLabel}` :
            `${room.label || room.id}`;
        this.mapCore.announceToScreenReader(`Selected room ${roomDescription}`);
    }

    // Clear search
    clearSearch() {
        document.getElementById('search-input').value = '';
        document.getElementById('category-select').value = 'all';
        document.getElementById('search-results').innerHTML = '';

        this.hideAutocomplete();
        this.hideRoomTooltip();
        this.searchResults = [];
        this.currentQuery = '';

        // Clear room highlights on all floors
        document.querySelectorAll('.room.highlighted').forEach(room => {
            room.classList.remove('highlighted');
        });

        this.mapCore.announceToScreenReader('Search cleared');
    }

    // Export search results
    exportSearchResults() {
        if (this.searchResults.length === 0) {
            this.mapCore.showError('No results to export');
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
        this.mapCore.announceToScreenReader('Search results exported');
    }

    // Convert to CSV
    convertToCSV(data) {
        const headers = ['ID', 'Name', 'Floor', 'Category', 'Keywords', 'Access', 'Search Score'];
        const rows = data.map(room => [
            room.id,
            room.label || '',
            room.floorLabel || `Floor ${room.floor}`,
            this.mapCore.getCategoryName(room.category),
            room.keywords.join('; '),
            room.access ? 'Yes' : 'No',
            room.searchScore || 0
        ]);

        const csvContent = [headers, ...rows]
            .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
            .join('\n');

        // Add BOM for proper Unicode display
        return '\ufeff' + csvContent;
    }

    // Save search history
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

            // Check if query already exists
            const existingIndex = history.findIndex(entry => entry.query.toLowerCase() === query.toLowerCase());
            if (existingIndex !== -1) {
                // Update existing entry
                history[existingIndex] = searchEntry;
                // Move to beginning
                history.unshift(history.splice(existingIndex, 1)[0]);
            } else {
                // Add new entry at beginning
                history.unshift(searchEntry);
            }

            // Limit history size
            history = history.slice(0, 15);

            localStorage.setItem('searchHistory', JSON.stringify(history));
        } catch (error) {
            console.warn('Failed to save search history:', error);
        }
    }

    // Get search history
    getSearchHistory() {
        try {
            return JSON.parse(localStorage.getItem('searchHistory') || '[]');
        } catch (error) {
            console.warn('Failed to load search history:', error);
            return [];
        }
    }

    // Show search history
    showSearchHistory() {
        const history = this.getSearchHistory();
        const autocompleteContainer = document.getElementById('search-autocomplete');

        if (history.length === 0) {
            return;
        }

        autocompleteContainer.innerHTML = '';

        // History header
        const historyHeader = document.createElement('div');
        historyHeader.className = 'autocomplete-history-header';
        historyHeader.innerHTML = `
            <span>Search history</span>
            <button id="clear-history-btn" class="autocomplete-clear-history" title="Clear history">×</button>
        `;
        autocompleteContainer.appendChild(historyHeader);

        // Add handler for clearing history
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
            const floorsText = entry.floorsFound > 1 ? ` on ${entry.floorsFound} floors` : '';

            item.innerHTML = `
                <div class="autocomplete-main">
                    <span class="autocomplete-history-icon">🕒</span>
                    ${entry.query}
                </div>
                <div class="autocomplete-secondary">
                    ${entry.resultsCount} results${floorsText} • ${timeAgo}
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

    // Format time ago
    formatTimeAgo(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffMinutes = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMinutes < 1) return 'just now';
        if (diffMinutes < 60) return `${diffMinutes} min ago`;
        if (diffHours < 24) return `${diffHours} hr ago`;
        if (diffDays < 7) return `${diffDays} days ago`;

        return date.toLocaleDateString('en-US');
    }

    // Clear search history
    clearSearchHistory() {
        try {
            localStorage.removeItem('searchHistory');
            this.hideAutocomplete();
            this.mapCore.announceToScreenReader('Search history cleared');
        } catch (error) {
            console.warn('Failed to clear search history:', error);
        }
    }

    // Highlight search term in results
    highlightSearchTerm(text, searchTerm) {
        if (!searchTerm.trim()) return text;

        const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return text.replace(regex, '<mark class="search-highlight">$1</mark>');
    }

    // Find nearest rooms to given point (within floor)
    findNearestRooms(targetRoom, maxResults = 5) {
        if (!targetRoom) {
            return [];
        }

        // Search rooms on same floor
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
                floorLabel: `Floor ${targetRoom.floor}`,
                distance: distance
            };
        });

        return roomsWithDistance
            .sort((a, b) => a.distance - b.distance)
            .slice(0, maxResults);
    }

    // Calculate room center
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

    // Calculate distance between two points
    calculateDistance(point1, point2) {
        return Math.sqrt(
            Math.pow(point2.x - point1.x, 2) +
            Math.pow(point2.y - point1.y, 2)
        );
    }

    // Advanced search with filters
    advancedSearch(options = {}) {
        const {
            query = '',
            category = 'all',
            floor = 'all',
            accessibleOnly = false,
            sortBy = 'relevance' // relevance, name, category, floor
        } = options;

        let results = this.mapCore.getAllRooms();

        // Filter by accessibility
        if (accessibleOnly) {
            results = results.filter(room => room.access);
        }

        // Filter by category
        if (category !== 'all') {
            results = results.filter(room => room.category === category);
        }

        // Filter by floor
        if (floor !== 'all') {
            results = results.filter(room => room.floor === floor);
        }

        // Search by query
        if (query.trim()) {
            results = this.fuzzySearch(query, results, results.length);
        }

        // Sort
        switch (sortBy) {
            case 'name':
                results.sort((a, b) => (a.label || a.id).localeCompare(b.label || b.id, 'en'));
                break;
            case 'category':
                results.sort((a, b) => {
                    const catA = this.mapCore.getCategoryName(a.category);
                    const catB = this.mapCore.getCategoryName(b.category);
                    return catA.localeCompare(catB, 'en');
                });
                break;
            case 'floor':
                results.sort((a, b) => parseInt(a.floor) - parseInt(b.floor));
                break;
            case 'relevance':
            default:
                // Already sorted by search score
                break;
        }

        return results;
    }

    // Search statistics
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

        // Count room statistics
        allRooms.forEach(room => {
            // By category
            const category = room.category;
            stats.roomsByCategory[category] = (stats.roomsByCategory[category] || 0) + 1;

            // By floor
            const floor = room.floor;
            stats.roomsByFloor[floor] = (stats.roomsByFloor[floor] || 0) + 1;
        });

        // Count most frequent queries and floors
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

        // Average results count
        if (history.length > 0) {
            const totalResults = history.reduce((sum, entry) => sum + entry.resultsCount, 0);
            stats.averageResults = Math.round(totalResults / history.length);
        }

        return stats;
    }

    // Search by QR code or ID
    searchByQR(qrData) {
        try {
            // Try to parse QR data
            let roomId = qrData;

            // If it's a URL, extract room ID
            if (qrData.includes('room=')) {
                const urlParams = new URLSearchParams(qrData.split('?')[1]);
                roomId = urlParams.get('room');
            }

            if (roomId) {
                const room = this.mapCore.findRoomById(roomId);
                if (room) {
                    this.selectRoom(room);
                    this.mapCore.announceToScreenReader(`Found room by QR code: ${room.label || room.id}`);
                    return true;
                } else {
                    this.mapCore.showError('Room from QR code not found');
                    return false;
                }
            }
        } catch (error) {
            console.error('QR search error:', error);
            this.mapCore.showError('Error processing QR code');
            return false;
        }
    }

    // Voice search (if supported by browser)
    initVoiceSearch() {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            return false;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();

        recognition.lang = 'en-US';
        recognition.continuous = false;
        recognition.interimResults = false;

        // Create voice search button
        const voiceButton = document.createElement('button');
        voiceButton.id = 'voice-search-btn';
        voiceButton.className = 'md-button md-button-outlined';
        voiceButton.innerHTML = '🎤';
        voiceButton.title = 'Voice search';
        voiceButton.style.marginLeft = '8px';

        const searchButton = document.getElementById('search-button');
        searchButton.parentNode.insertBefore(voiceButton, searchButton.nextSibling);

        voiceButton.addEventListener('click', () => {
            recognition.start();
            voiceButton.textContent = '🔴';
            voiceButton.disabled = true;
            this.mapCore.announceToScreenReader('Voice search started');
        });

        recognition.onresult = (event) => {
            const query = event.results[0][0].transcript;
            document.getElementById('search-input').value = query;
            this.performSearch(query);
            this.mapCore.announceToScreenReader(`Voice search: ${query}`);
        };

        recognition.onend = () => {
            voiceButton.textContent = '🎤';
            voiceButton.disabled = false;
        };

        recognition.onerror = (event) => {
            console.error('Voice recognition error:', event.error);
            voiceButton.textContent = '🎤';
            voiceButton.disabled = false;
            this.mapCore.showError('Voice search error');
        };

        return true;
    }

    // Intelligent search suggestions
    getSuggestions(query) {
        const suggestions = [];
        const allRooms = this.mapCore.getAllRooms();

        // Suggestions based on popular categories
        const categories = [...new Set(allRooms.map(room => room.category))];
        categories.forEach(category => {
            const categoryName = this.mapCore.getCategoryName(category);
            if (categoryName.toLowerCase().includes(query.toLowerCase())) {
                suggestions.push({
                    type: 'category',
                    text: `All ${categoryName.toLowerCase()}`,
                    query: categoryName,
                    count: allRooms.filter(room => room.category === category).length
                });
            }
        });

        // Suggestions based on floors
        const floors = [...new Set(allRooms.map(room => room.floor))].sort();
        floors.forEach(floor => {
            const floorQuery = `floor ${floor}`;
            if (floorQuery.includes(query.toLowerCase())) {
                suggestions.push({
                    type: 'floor',
                    text: `Floor ${floor}`,
                    query: floorQuery,
                    count: allRooms.filter(room => room.floor === floor).length
                });
            }
        });

        return suggestions.slice(0, 5);
    }

    // Context search (search near selected room)
    searchNearby(room, category = 'all', maxDistance = 100) {
        if (!room) {
            return [];
        }

        const mapData = this.mapCore.allMapsData.get(room.floor);
        if (!mapData || !mapData.rooms) {
            return [];
        }

        let nearbyRooms = mapData.rooms.filter(r => r.id !== room.id);

        // Filter by category
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
                floorLabel: `Floor ${room.floor}`,
                distance: distance
            };
        }).filter(r => r.distance <= maxDistance);

        return roomsWithDistance.sort((a, b) => a.distance - b.distance);
    }
}

// Initialize search after DOM loads
document.addEventListener('DOMContentLoaded', () => {
    // Wait for MapCore initialization
    const initSearch = () => {
        if (window.mapCore && window.mapCore.allMapsData.size > 0) {
            window.mapSearch = new MapSearch(window.mapCore);

            // Initialize voice search if possible
            if (window.mapSearch.initVoiceSearch()) {
                console.log('Voice search initialized');
            }
        } else {
            setTimeout(initSearch, 200);
        }
    };

    initSearch();
});