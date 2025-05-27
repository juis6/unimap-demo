// Main class for working with the map - updated version for working with floors
class MapCore {
    constructor() {
        this.allMapsData = new Map(); // Store data for all floors
        this.currentFloor = '1';
        this.buildingId = null;
        this.selectedRoom = null;
        this.currentRoute = null;
        this.zoomLevel = 1;
        this.panX = 0;
        this.panY = 0;
        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;

        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.setupAccessibility();
        await this.loadAllFloors();
    }

    setupEventListeners() {
        // Zoom controls
        document.getElementById('zoom-in').addEventListener('click', () => {
            this.zoomIn();
        });

        document.getElementById('zoom-out').addEventListener('click', () => {
            this.zoomOut();
        });

        document.getElementById('reset-view').addEventListener('click', () => {
            this.resetView();
        });

        // Drag map handling
        const svgContainer = document.getElementById('svg-container');
        svgContainer.addEventListener('mousedown', (e) => this.startDrag(e));
        svgContainer.addEventListener('mousemove', (e) => this.drag(e));
        svgContainer.addEventListener('mouseup', () => this.endDrag());
        svgContainer.addEventListener('mouseleave', () => this.endDrag());

        // Touch events for mobile devices
        svgContainer.addEventListener('touchstart', (e) => this.handleTouchStart(e));
        svgContainer.addEventListener('touchmove', (e) => this.handleTouchMove(e));
        svgContainer.addEventListener('touchend', () => this.endDrag());

        // Mouse wheel zoom
        svgContainer.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (e.deltaY < 0) {
                this.zoomIn();
            } else {
                this.zoomOut();
            }
        });

        // Close error modal
        document.getElementById('close-error').addEventListener('click', () => {
            this.hideError();
        });

        // Keyboard navigation for SVG container
        svgContainer.addEventListener('keydown', (e) => {
            this.handleKeyNavigation(e);
        });
    }

    // Accessibility setup
    setupAccessibility() {
        const mapContainer = document.getElementById('map-container');
        mapContainer.setAttribute('role', 'application');
        mapContainer.setAttribute('aria-label', 'Interactive university map');

        const loadingIndicator = document.getElementById('loading-indicator');
        loadingIndicator.setAttribute('aria-live', 'assertive');

        this.createScreenReaderDescription();
    }

    createScreenReaderDescription() {
        const description = document.createElement('div');
        description.id = 'map-description';
        description.className = 'sr-only';
        description.textContent = 'Interactive university map with floor navigation. Use the toolbar to search for rooms and build routes.';
        document.body.appendChild(description);

        const svgContainer = document.getElementById('svg-container');
        svgContainer.setAttribute('aria-describedby', 'map-description');
    }

    // Load all building floors
    async loadAllFloors() {
        this.showLoading();
        this.updateConnectionStatus('Loading...');

        try {
            // Get list of available maps
            const availableMaps = window.mapConfig.availableMaps;
            const buildingMaps = availableMaps.filter(map => map.id.startsWith('map-10-'));

            if (buildingMaps.length === 0) {
                throw new Error('Building maps not found');
            }

            // Load data for all floors
            for (const mapInfo of buildingMaps) {
                const mapData = await this.loadMapData(mapInfo.id);
                if (mapData) {
                    const floorNumber = this.extractFloorNumber(mapInfo.id);
                    this.allMapsData.set(floorNumber, mapData);

                    // Set buildingId from first map
                    if (!this.buildingId && mapData.building) {
                        this.buildingId = mapData.building.id;
                    }
                }
            }

            if (this.allMapsData.size === 0) {
                throw new Error('Failed to load floor data');
            }

            // Load first floor by default
            const floors = Array.from(this.allMapsData.keys()).sort();
            this.currentFloor = floors[0];

            await this.displayCurrentFloor();
            this.setupFloorButtons();
            this.updateSystemInfo();
            this.updateConnectionStatus('Connected');
            this.hideLoading();

            this.announceToScreenReader(`Loaded ${this.allMapsData.size} building floors`);

        } catch (error) {
            console.error('Error loading floors:', error);
            this.showError('Error loading floors: ' + error.message);
            this.updateConnectionStatus('Error');
            this.hideLoading();
        }
    }

    // Extract floor number from map ID
    extractFloorNumber(mapId) {
        const match = mapId.match(/map-\d+-(\d+)/);
        return match ? match[1] : '1';
    }

    // Load individual map data
    async loadMapData(mapId) {
        try {
            const response = await fetch(`/map/data/${mapId}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error(`Error loading map ${mapId}:`, error);
            return null;
        }
    }

    // Display current floor
    async displayCurrentFloor() {
        const mapData = this.allMapsData.get(this.currentFloor);
        if (!mapData) {
            console.error('Map data not found for floor:', this.currentFloor);
            return;
        }

        try {
            // Load SVG for current floor
            const mapId = `map-10-${this.currentFloor.padStart(2, '0')}`;
            await this.loadOriginalSVG(mapId, mapData);

            this.updateBuildingInfo();
            this.updateFloorInfo();

        } catch (error) {
            console.error('Error displaying floor:', error);
            this.showError('Error displaying floor: ' + error.message);
        }
    }

    // Load original SVG
    async loadOriginalSVG(mapId, mapData) {
        try {
            const svgResponse = await fetch(`/map/svg/${mapId}`);
            if (!svgResponse.ok) {
                throw new Error('SVG file not found');
            }

            const svgContent = await svgResponse.text();
            const svgContainer = document.getElementById('map-svg');
            svgContainer.innerHTML = svgContent;

            const svgElement = svgContainer.querySelector('svg');
            if (svgElement) {
                svgElement.setAttribute('id', 'main-svg');
                svgElement.style.width = '100%';
                svgElement.style.height = '100%';

                svgElement.setAttribute('role', 'img');
                svgElement.setAttribute('aria-label', `Floor ${this.currentFloor} map`);

                this.setupRoomInteractions(svgElement, mapData);
                this.injectSVGStyles(svgElement);
            }
        } catch (error) {
            console.warn('Could not load original SVG:', error);
            await this.renderMap(mapData);
        }
    }

    // Setup floor buttons
    setupFloorButtons() {
        const floorButtons = document.getElementById('floor-buttons');
        floorButtons.innerHTML = '';

        const floors = Array.from(this.allMapsData.keys()).sort();

        floors.forEach(floorNumber => {
            const button = document.createElement('button');
            button.textContent = `Floor ${floorNumber}`;
            button.setAttribute('data-floor', floorNumber);
            button.classList.add('md-chip');
            button.setAttribute('role', 'radio');
            button.setAttribute('aria-checked', floorNumber === this.currentFloor ? 'true' : 'false');

            if (floorNumber === this.currentFloor) {
                button.classList.add('active');
            }

            button.addEventListener('click', () => {
                this.selectFloor(floorNumber);
            });

            floorButtons.appendChild(button);
        });
    }

    // Select floor
    async selectFloor(floorNumber) {
        if (floorNumber === this.currentFloor) return;

        this.currentFloor = floorNumber;
        await this.displayCurrentFloor();

        // Update floor button states
        document.querySelectorAll('#floor-buttons .md-chip').forEach(btn => {
            btn.classList.remove('active');
            btn.setAttribute('aria-checked', 'false');
        });

        const selectedButton = document.querySelector(`[data-floor="${floorNumber}"]`);
        if (selectedButton) {
            selectedButton.classList.add('active');
            selectedButton.setAttribute('aria-checked', 'true');
        }

        this.updateFloorInfo();
        this.announceToScreenReader(`Selected floor ${floorNumber}`);
    }

    // Get all rooms from all floors
    getAllRooms() {
        const allRooms = [];
        for (const [floorNumber, mapData] of this.allMapsData) {
            if (mapData.rooms) {
                mapData.rooms.forEach(room => {
                    allRooms.push({
                        ...room,
                        floor: floorNumber,
                        floorLabel: `Floor ${floorNumber}`
                    });
                });
            }
        }
        return allRooms;
    }

    // Get all nodes from all floors
    getAllNodes() {
        const allNodes = [];
        for (const [floorNumber, mapData] of this.allMapsData) {
            if (mapData.nodes) {
                mapData.nodes.forEach(node => {
                    allNodes.push({
                        ...node,
                        floor: floorNumber
                    });
                });
            }
        }
        return allNodes;
    }

    // Get all edges from all floors
    getAllEdges() {
        const allEdges = [];
        for (const [floorNumber, mapData] of this.allMapsData) {
            if (mapData.edges) {
                mapData.edges.forEach(edge => {
                    allEdges.push({
                        ...edge,
                        floor: floorNumber
                    });
                });
            }
        }
        return allEdges;
    }

    // Find room by ID across all floors
    findRoomById(roomId) {
        for (const [floorNumber, mapData] of this.allMapsData) {
            if (mapData.rooms) {
                const room = mapData.rooms.find(r => r.id === roomId);
                if (room) {
                    return {
                        ...room,
                        floor: floorNumber,
                        floorLabel: `Floor ${floorNumber}`
                    };
                }
            }
        }
        return null;
    }

    // Select room (may be on another floor)
    async selectRoom(room, fromSearch = false) {
        // Check if room is already selected to avoid circular calls
        if (this.selectedRoom && this.selectedRoom.id === room.id &&
            this.selectedRoom.floor === room.floor) {
            return;
        }

        this.selectedRoom = room;

        // If room is on another floor, switch
        if (room.floor && room.floor !== this.currentFloor) {
            await this.selectFloor(room.floor);
        }

        // Reset previous selection
        document.querySelectorAll('.room.selected').forEach(r => {
            r.classList.remove('selected');
            r.setAttribute('aria-selected', 'false');
        });

        // Highlight new room
        const roomElement = document.getElementById(room.id);
        if (roomElement) {
            roomElement.classList.add('selected');
            roomElement.setAttribute('aria-selected', 'true');
            roomElement.focus();
        }

        this.updateRoomDetails(room);
        document.getElementById('room-details').style.display = 'block';

        const roomDescription = room.floorLabel ?
            `${room.label || room.id} on ${room.floorLabel}` :
            `${room.label || room.id}`;
        this.announceToScreenReader(`Selected room ${roomDescription}`);
    }

    // Update room information
    updateRoomDetails(room) {
        const roomName = room.floorLabel ?
            `${room.label || room.id} (${room.floorLabel})` :
            (room.label || room.id);

        document.getElementById('room-name').textContent = roomName;
        document.getElementById('room-category').textContent = `Category: ${this.getCategoryName(room.category)}`;
        document.getElementById('room-keywords').textContent = `Keywords: ${room.keywords.join(', ')}`;
        document.getElementById('room-access').textContent = `Access: ${room.access ? 'Allowed' : 'Restricted'}`;
    }

    // Setup room interactions
    setupRoomInteractions(svgElement, mapData) {
        if (!mapData || !mapData.rooms) return;

        const roomElements = svgElement.querySelectorAll('[data-name="room"]');

        roomElements.forEach(roomElement => {
            const roomId = roomElement.id;
            const roomData = mapData.rooms.find(r => r.id === roomId);

            if (roomData) {
                // Add floor info
                const roomWithFloor = {
                    ...roomData,
                    floor: this.currentFloor,
                    floorLabel: `Floor ${this.currentFloor}`
                };

                roomElement.classList.add('room');
                roomElement.classList.add(`category-${roomData.category}`);
                roomElement.setAttribute('role', 'button');
                roomElement.setAttribute('aria-label', `Room ${roomData.label || roomId} on floor ${this.currentFloor}`);
                roomElement.setAttribute('tabindex', '0');

                roomElement.addEventListener('click', (e