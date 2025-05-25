// Клас для роботи з інтерфейсом карти
class MapUI {
    constructor(mapCore) {
        this.mapCore = mapCore;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.initializeComponents();
    }

    setupEventListeners() {
        // Закриття контекстного меню при кліку поза ним
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#context-menu')) {
                this.hideContextMenu();
            }
        });

        // Закриття модального вікна по Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.mapCore.hideError();
                this.hideContextMenu();
            }
        });

        // Обробка кліку по карті для скидання виділення
        document.getElementById('svg-container').addEventListener('click', (e) => {
            if (e.target === e.currentTarget || e.target.tagName === 'svg') {
                this.clearSelection();
            }
        });
    }

    initializeComponents() {
        this.initializeTooltips();
        this.initializeKeyboardShortcuts();
    }

    // Ініціалізація підказок
    initializeTooltips() {
        const tooltipElements = document.querySelectorAll('[title]');
        tooltipElements.forEach(element => {
            element.addEventListener('mouseenter', (e) => {
                this.showTooltip(e.target, e.target.title);
            });

            element.addEventListener('mouseleave', () => {
                this.hideTooltip();
            });
        });
    }

    // Показати підказку
    showTooltip(element, text) {
        // Створюємо підказку якщо її немає
        let tooltip = document.getElementById('tooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'tooltip';
            tooltip.style.cssText = `
                position: absolute;
                background: rgba(0,0,0,0.8);
                color: white;
                padding: 0.5rem;
                border-radius: 4px;
                font-size: 0.8rem;
                z-index: 2000;
                pointer-events: none;
                white-space: nowrap;
            `;
            document.body.appendChild(tooltip);
        }

        tooltip.textContent = text;
        tooltip.style.display = 'block';

        // Позиціонуємо підказку
        const rect = element.getBoundingClientRect();
        tooltip.style.left = rect.left + (rect.width / 2) - (tooltip.offsetWidth / 2) + 'px';
        tooltip.style.top = rect.top - tooltip.offsetHeight - 5 + 'px';
    }

    // Сховати підказку
    hideTooltip() {
        const tooltip = document.getElementById('tooltip');
        if (tooltip) {
            tooltip.style.display = 'none';
        }
    }

    // Ініціалізація клавіатурних скорочень
    initializeKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + F - фокус на пошук
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                document.getElementById('search-input').focus();
            }

            // Escape - скидання виділення
            if (e.key === 'Escape') {
                this.clearSelection();
            }

            // Клавіші масштабування
            if (e.key === '+' || e.key === '=') {
                e.preventDefault();
                this.mapCore.zoomIn();
            }

            if (e.key === '-') {
                e.preventDefault();
                this.mapCore.zoomOut();
            }

            // R - скидання виду
            if (e.key === 'r' || e.key === 'R') {
                this.mapCore.resetView();
            }
        });
    }

    // Показати контекстне меню
    showContextMenu(event, room) {
        const contextMenu = document.getElementById('context-menu');
        const roomName = document.getElementById('context-room-name');

        roomName.textContent = room.label || room.id;

        contextMenu.style.display = 'block';

        // Позиціонуємо меню
        let left = event.pageX;
        let top = event.pageY;

        // Перевіряємо, чи меню не виходить за межі екрану
        const menuRect = contextMenu.getBoundingClientRect();
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;

        if (left + menuRect.width > windowWidth) {
            left = windowWidth - menuRect.width - 10;
        }

        if (top + menuRect.height > windowHeight) {
            top = windowHeight - menuRect.height - 10;
        }

        contextMenu.style.left = left + 'px';
        contextMenu.style.top = top + 'px';

        // Встановлюємо обробники
        this.setupContextMenuHandlers(room);
    }

    // Налаштування обробників контекстного меню
    setupContextMenuHandlers(room) {
        document.getElementById('context-route-to').onclick = () => {
            document.getElementById('to-select').value = room.id;
            this.hideContextMenu();
        };

        document.getElementById('context-route-from').onclick = () => {
            document.getElementById('from-select').value = room.id;
            this.hideContextMenu();
        };

        document.getElementById('context-room-info').onclick = () => {
            this.mapCore.selectRoom(room);
            this.hideContextMenu();
        };
    }

    // Сховати контекстне меню
    hideContextMenu() {
        document.getElementById('context-menu').style.display = 'none';
    }

    // Скидання виділення
    clearSelection() {
        document.querySelectorAll('.room.selected').forEach(room => {
            room.classList.remove('selected');
        });

        document.getElementById('room-details').style.display = 'none';
        this.mapCore.selectedRoom = null;
    }

    // Оновлення статусу з'єднання
    updateConnectionStatus(status) {
        const statusElement = document.getElementById('connection-status');
        statusElement.textContent = status;

        if (status === 'Підключено') {
            statusElement.style.color = '#28a745';
        } else if (status === 'Завантаження...') {
            statusElement.style.color = '#ffc107';
        } else {
            statusElement.style.color = '#dc3545';
        }
    }

    // Показати повідомлення
    showMessage(message, type = 'info') {
        const messageContainer = this.getOrCreateMessageContainer();

        const messageElement = document.createElement('div');
        messageElement.className = `alert alert-${type}`;
        messageElement.textContent = message;

        // Додаємо кнопку закриття
        const closeButton = document.createElement('button');
        closeButton.innerHTML = '×';
        closeButton.style.cssText = `
            float: right;
            background: none;
            border: none;
            font-size: 1.2rem;
            cursor: pointer;
            padding: 0;
            margin-left: 1rem;
        `;
        closeButton.onclick = () => messageElement.remove();

        messageElement.appendChild(closeButton);
        messageContainer.appendChild(messageElement);

        // Автоматично видаляємо через 5 секунд
        setTimeout(() => {
            if (messageElement.parentNode) {
                messageElement.remove();
            }
        }, 5000);
    }

    // Отримати або створити контейнер для повідомлень
    getOrCreateMessageContainer() {
        let container = document.getElementById('message-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'message-container';
            container.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 2000;
                max-width: 400px;
            `;
            document.body.appendChild(container);
        }
        return container;
    }

    // Анімація підсвічування кімнати
    highlightRoom(roomId, duration = 3000) {
        const roomElement = document.getElementById(roomId);
        if (roomElement) {
            roomElement.classList.add('pulse');
            setTimeout(() => {
                roomElement.classList.remove('pulse');
            }, duration);
        }
    }

    // Плавний перехід до кімнати
    panToRoom(roomId) {
        const roomElement = document.getElementById(roomId);
        if (roomElement) {
            const roomBounds = roomElement.getBBox();
            const centerX = roomBounds.x + roomBounds.width / 2;
            const centerY = roomBounds.y + roomBounds.height / 2;

            // Обчислюємо необхідне переміщення
            const svgContainer = document.getElementById('svg-container');
            const containerRect = svgContainer.getBoundingClientRect();

            const targetX = containerRect.width / 2 - centerX * this.mapCore.zoomLevel;
            const targetY = containerRect.height / 2 - centerY * this.mapCore.zoomLevel;

            // Анімуємо переміщення
            this.animatePan(this.mapCore.panX, this.mapCore.panY, targetX, targetY);
        }
    }

    // Анімація переміщення карти
    animatePan(fromX, fromY, toX, toY, duration = 800) {
        const startTime = performance.now();

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Easing функція для плавної анімації
            const easeProgress = this.easeInOutQuad(progress);

            this.mapCore.panX = fromX + (toX - fromX) * easeProgress;
            this.mapCore.panY = fromY + (toY - fromY) * easeProgress;

            this.mapCore.applyTransform();

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    }

    // Easing функція
    easeInOutQuad(t) {
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    }

    // Оновлення прогрес-бару завантаження
    updateLoadingProgress(progress, message = 'Завантаження...') {
        let progressBar = document.getElementById('loading-progress');

        if (!progressBar) {
            const loadingIndicator = document.getElementById('loading-indicator');
            if (loadingIndicator) {
                progressBar = document.createElement('div');
                progressBar.id = 'loading-progress';
                progressBar.innerHTML = `
                    <div style="margin-top: 1rem;">
                        <div style="background: #e9ecef; height: 4px; border-radius: 2px; overflow: hidden;">
                            <div id="progress-fill" style="background: #007bff; height: 100%; width: 0%; transition: width 0.3s ease;"></div>
                        </div>
                        <div id="progress-text" style="text-align: center; margin-top: 0.5rem; font-size: 0.9rem; color: #6c757d;"></div>
                    </div>
                `;
                loadingIndicator.appendChild(progressBar);
            }
        }

        if (progressBar) {
            const progressFill = document.getElementById('progress-fill');
            const progressText = document.getElementById('progress-text');

            if (progressFill) {
                progressFill.style.width = `${Math.min(Math.max(progress, 0), 100)}%`;
            }

            if (progressText) {
                progressText.textContent = message;
            }
        }
    }

    // Експорт карти як зображення
    exportMapAsImage() {
        const svg = document.getElementById('main-svg');
        if (!svg) return;

        // Створюємо canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        const svgData = new XMLSerializer().serializeToString(svg);
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const svgUrl = URL.createObjectURL(svgBlob);

        const img = new Image();
        img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);

            // Завантажуємо зображення
            const link = document.createElement('a');
            link.download = 'university-map.png';
            link.href = canvas.toDataURL('image/png');
            link.click();

            URL.revokeObjectURL(svgUrl);
        };

        img.src = svgUrl;
    }

    // Створення QR коду для поточної карти
    generateQRCode(roomId = null) {
        const currentUrl = window.location.origin + window.location.pathname;
        const qrUrl = roomId ? `${currentUrl}?room=${roomId}` : currentUrl;

        // Тут можна було б використати бібліотеку для генерації QR кодів
        // Наприклад, qrcode.js
        console.log('QR Code URL:', qrUrl);

        this.showMessage(`QR код створено для: ${qrUrl}`, 'success');
    }

    // Обробка параметрів URL при завантаженні
    handleUrlParameters() {
        const urlParams = new URLSearchParams(window.location.search);
        const roomId = urlParams.get('room');

        if (roomId) {
            // Затримка для завантаження карти
            setTimeout(() => {
                const room = this.mapCore.currentMapData?.rooms.find(r => r.id === roomId);
                if (room) {
                    this.mapCore.selectRoom(room);
                    this.panToRoom(roomId);
                    this.highlightRoom(roomId);
                }
            }, 1000);
        }
    }

    // Збереження стану карти в localStorage
    saveMapState() {
        try {
            const state = {
                zoomLevel: this.mapCore.zoomLevel,
                panX: this.mapCore.panX,
                panY: this.mapCore.panY,
                selectedRoomId: this.mapCore.selectedRoom?.id,
                currentMapId: document.getElementById('map-list').value
            };

            localStorage.setItem('mapState', JSON.stringify(state));
        } catch (error) {
            console.warn('Failed to save map state:', error);
        }
    }

    // Відновлення стану карти з localStorage
    restoreMapState() {
        try {
            const savedState = localStorage.getItem('mapState');
            if (savedState) {
                const state = JSON.parse(savedState);

                // Відновлюємо параметри карти
                if (state.zoomLevel) this.mapCore.zoomLevel = state.zoomLevel;
                if (state.panX) this.mapCore.panX = state.panX;
                if (state.panY) this.mapCore.panY = state.panY;

                this.mapCore.applyTransform();

                // Відновлюємо вибрану кімнату
                if (state.selectedRoomId) {
                    setTimeout(() => {
                        const room = this.mapCore.currentMapData?.rooms.find(r => r.id === state.selectedRoomId);
                        if (room) {
                            this.mapCore.selectRoom(room);
                        }
                    }, 500);
                }
            }
        } catch (error) {
            console.warn('Failed to restore map state:', error);
        }
    }

    // Створення режиму повноекранного перегляду
    toggleFullscreen() {
        const mapContainer = document.getElementById('map-container');

        if (!document.fullscreenElement) {
            mapContainer.requestFullscreen().catch(err => {
                console.error('Error attempting to enable fullscreen:', err);
            });
        } else {
            document.exitFullscreen();
        }
    }

    // Створення статистичної панели
    updateStats(mapData) {
        const statsContent = document.getElementById('stats-content');
        if (!statsContent || !mapData) return;

        const totalRooms = mapData.rooms.length;
        const accessibleRooms = mapData.rooms.filter(room => room.access).length;
        const categories = [...new Set(mapData.rooms.map(room => room.category))];

        const categoryStats = {};
        categories.forEach(category => {
            categoryStats[category] = mapData.rooms.filter(room => room.category === category).length;
        });

        let statsHtml = `
            <div style="margin-bottom: 0.5rem;">
                <strong>Загальна кількість кімнат:</strong> ${totalRooms}
            </div>
            <div style="margin-bottom: 0.5rem;">
                <strong>Доступних кімнат:</strong> ${accessibleRooms}
            </div>
            <div style="margin-bottom: 1rem;">
                <strong>Навігаційних вузлів:</strong> ${mapData.nodes.length}
            </div>
            <div style="margin-bottom: 0.5rem;">
                <strong>За категоріями:</strong>
            </div>
        `;

        Object.entries(categoryStats).forEach(([category, count]) => {
            const categoryName = this.mapCore.getCategoryName(category);
            statsHtml += `
                <div style="margin-left: 1rem; font-size: 0.9rem;">
                    ${categoryName}: ${count}
                </div>
            `;
        });

        statsContent.innerHTML = statsHtml;
    }
}

// Ініціалізуємо UI після завантаження DOM
document.addEventListener('DOMContentLoaded', () => {
    // Чекаємо ініціалізації MapCore
    const initUI = () => {
        if (window.mapCore) {
            window.mapUI = new MapUI(window.mapCore);
            window.mapUI.handleUrlParameters();
            window.mapUI.restoreMapState();

            // Зберігаємо стан при закритті сторінки
            window.addEventListener('beforeunload', () => {
                window.mapUI.saveMapState();
            });
        } else {
            setTimeout(initUI, 100);
        }
    };

    initUI();
});