/**
 * 3D Solar Terrain Map
 * Combines MapLibre GL JS 3D terrain with comprehensive solar exposure analysis
 * Version: 4.1 - Real-time sun visualization with debug logging and mobile optimization
 */

// Debug logging system
function debugLog(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const colors = {
        info: '#0f0',
        warn: '#ff0',
        error: '#f00',
        success: '#0ff'
    };
    const color = colors[type] || colors.info;

    console.log(`[${timestamp}] ${message}`);

    const logContent = document.getElementById('debug-log-content');
    if (logContent) {
        const logEntry = document.createElement('div');
        logEntry.style.color = color;
        logEntry.style.marginBottom = '4px';
        logEntry.textContent = `[${timestamp}] ${message}`;
        logContent.appendChild(logEntry);
        logContent.scrollTop = logContent.scrollHeight;

        // Limit log entries to 100
        while (logContent.children.length > 100) {
            logContent.removeChild(logContent.firstChild);
        }
    }
}

function toggleDebugPanel() {
    const panel = document.getElementById('debug-panel');
    const btn = document.getElementById('debug-toggle-btn');
    if (panel.style.display === 'none' || !panel.style.display) {
        panel.style.display = 'flex';
        btn.style.display = 'none';
    } else {
        panel.style.display = 'none';
        btn.style.display = 'block';
    }
}

function copyDebugLog() {
    const logContent = document.getElementById('debug-log-content');
    const text = Array.from(logContent.children).map(el => el.textContent).join('\n');

    // For mobile compatibility
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            debugLog('✓ Log copied to clipboard!', 'success');
        }).catch(() => {
            // Fallback for mobile
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            debugLog('✓ Log copied (fallback method)', 'success');
        });
    }
}

function clearDebugLog() {
    const logContent = document.getElementById('debug-log-content');
    logContent.innerHTML = '<div style="color: #0f0;">Debug log cleared...</div>';
}

let map;
let currentExaggeration = 1;
let clickMarker = null;
let analysisGrid = null; // Grid showing analysis area
let terrainCache = new Map();
let tileCache = new Map();

// Terrain tile settings (same as original solar calculator)
const tileSize = 512;
const terrainTileUrl = 'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp';

// Sun position
let sunAzimuth = 0;
let sunAltitude = 0;
let currentDate = new Date();

// Custom hillshade rendering
let customHillshadeCanvas = null;
let customHillshadeLayer = null;
let hillshadeGridResolution = 0.003; // ~333 meters at equator (optimized for mobile)
let hillshadeRenderInProgress = false;

// Initialize the map
map = new maplibregl.Map({
    container: 'map',
    zoom: 12,
    center: [-111.5, 36.1], // Grand Canyon
    pitch: 75,
    bearing: -30,
    maxPitch: 85,
    antialias: true,
    style: {
        version: 8,
        sources: {
            'osm': {
                type: 'raster',
                tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
                tileSize: 256,
                attribution: '&copy; OpenStreetMap contributors'
            },
            'satellite': {
                type: 'raster',
                tiles: [
                    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
                ],
                tileSize: 256,
                attribution: '&copy; Esri, Maxar, Earthstar Geographics'
            },
            'terrarium-terrain': {
                type: 'raster-dem',
                tiles: [
                    'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
                ],
                minzoom: 0,
                maxzoom: 15,
                tileSize: 256,
                encoding: 'terrarium'
            }
        },
        layers: [
            {
                id: 'satellite',
                type: 'raster',
                source: 'satellite',
                layout: {
                    visibility: 'visible'
                },
                paint: {
                    'raster-brightness-min': 0,
                    'raster-brightness-max': 1,
                    'raster-contrast': 0.4,
                    'raster-saturation': 0.3
                }
            }
        ],
        terrain: {
            source: 'terrarium-terrain',
            exaggeration: 1
        },
        light: {
            anchor: 'viewport',
            color: '#ffffff',
            intensity: 0.5,
            position: [1.5, 210, 80]
        }
    }
});

// Add navigation controls
const nav = new maplibregl.NavigationControl({
    visualizePitch: true,
    showZoom: true,
    showCompass: true
});
map.addControl(nav, 'top-right');

// Add geolocate control
map.addControl(new maplibregl.GeolocateControl({
    positionOptions: {
        enableHighAccuracy: true
    },
    trackUserLocation: true,
    showUserHeading: true
}), 'top-right');

// Add scale
map.addControl(new maplibregl.ScaleControl({
    maxWidth: 100,
    unit: 'metric'
}));

// Add fullscreen control
map.addControl(new maplibregl.FullscreenControl(), 'top-right');

// Map load handler
map.on('load', () => {
    debugLog('✅ Map loaded successfully', 'success');
    updateSunPosition();

    // Set satellite layer opacity to show terrain context
    debugLog('Setting satellite opacity to 0.8', 'info');
    map.setPaintProperty('satellite', 'raster-opacity', 0.8);

    // Add custom hillshade canvas layer for accurate sun/shadow calculations
    debugLog('Adding custom hillshade layer', 'info');
    addCustomHillshadeLayer();

    // Initialize time slider
    initializeTimeSlider();

    setTimeout(() => {
        map.easeTo({
            pitch: 80,
            bearing: -20,
            duration: 2000
        });
    }, 1000);

    // Enter fullscreen mode automatically
    setTimeout(() => {
        enterFullscreen();
    }, 500);
});

// Update compass on map rotation
map.on('rotate', () => {
    const bearing = map.getBearing();
    if (typeof updateCompass === 'function') {
        updateCompass(bearing);
    }
});

// Initialize compass on load
map.on('load', () => {
    const bearing = map.getBearing();
    if (typeof updateCompass === 'function') {
        updateCompass(bearing);
    }
});

// Fullscreen functions
function enterFullscreen() {
    const mapElement = document.getElementById('map');
    if (mapElement) {
        if (mapElement.requestFullscreen) {
            mapElement.requestFullscreen().catch(err => {
                console.log('Fullscreen request failed:', err);
            });
        } else if (mapElement.webkitRequestFullscreen) {
            mapElement.webkitRequestFullscreen();
        } else if (mapElement.mozRequestFullScreen) {
            mapElement.mozRequestFullScreen();
        } else if (mapElement.msRequestFullscreen) {
            mapElement.msRequestFullscreen();
        }
    }
}

// Prevent exiting fullscreen - automatically re-enter if user exits
document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
        // User exited fullscreen, re-enter it
        setTimeout(() => {
            enterFullscreen();
        }, 100);
    }
});

// Handle webkit browsers
document.addEventListener('webkitfullscreenchange', () => {
    if (!document.webkitFullscreenElement) {
        setTimeout(() => {
            enterFullscreen();
        }, 100);
    }
});

// Handle Firefox
document.addEventListener('mozfullscreenchange', () => {
    if (!document.mozFullScreenElement) {
        setTimeout(() => {
            enterFullscreen();
        }, 100);
    }
});

// Handle IE/Edge
document.addEventListener('MSFullscreenChange', () => {
    if (!document.msFullscreenElement) {
        setTimeout(() => {
            enterFullscreen();
        }, 100);
    }
});

// Time slider functionality for sun visualization
let simulationTime = new Date();  // Current simulated time
let sunRaysVisible = true;

function initializeTimeSlider() {
    const slider = document.getElementById('time-slider');
    const display = document.getElementById('time-display');

    // Set initial time to current time
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    slider.value = minutes;
    updateTimeDisplay(minutes);

    // Handle slider input
    slider.addEventListener('input', (e) => {
        const minutes = parseInt(e.target.value);
        updateTimeDisplay(minutes);
        updateSunVisualization(minutes);
    });
}

function updateTimeDisplay(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const display = document.getElementById('time-display');
    display.textContent = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;

    // Update simulation time
    simulationTime = new Date();
    simulationTime.setHours(hours, mins, 0, 0);
}

function setTimeOfDay(preset) {
    const center = map.getCenter();
    const lat = center.lat;
    const lng = center.lng;
    const sunTimes = SunCalc.getTimes(new Date(), lat, lng);

    let targetTime;
    let minutes;

    // Remove active class from all buttons
    document.querySelectorAll('.time-btn').forEach(btn => btn.classList.remove('active'));

    switch(preset) {
        case 'sunrise':
            targetTime = sunTimes.sunrise;
            event.target.classList.add('active');
            break;
        case 'noon':
            targetTime = sunTimes.solarNoon;
            event.target.classList.add('active');
            break;
        case 'sunset':
            targetTime = sunTimes.sunset;
            event.target.classList.add('active');
            break;
        case 'current':
            targetTime = new Date();
            event.target.classList.add('active');
            break;
    }

    if (targetTime) {
        minutes = targetTime.getHours() * 60 + targetTime.getMinutes();
        document.getElementById('time-slider').value = minutes;
        updateTimeDisplay(minutes);
        updateSunVisualization(minutes);
    }
}

// Add custom hillshade layer using canvas
function addCustomHillshadeLayer() {
    // Create canvas source for custom hillshade
    customHillshadeCanvas = document.createElement('canvas');

    map.addSource('custom-hillshade', {
        type: 'canvas',
        canvas: customHillshadeCanvas,
        coordinates: [[0, 0], [0, 0], [0, 0], [0, 0]], // Will be updated
        animate: false
    });

    map.addLayer({
        id: 'custom-hillshade-layer',
        type: 'raster',
        source: 'custom-hillshade',
        paint: {
            'raster-opacity': 0.7  // Increased opacity for better visibility
        }
    });  // Add on top of satellite layer for proper blending

    debugLog('Hillshade layer added with 0.7 opacity', 'success');

    // Trigger initial render
    setTimeout(() => updateCustomHillshade(), 1000);

    // Update on map move/zoom (debounced)
    let hillshadeTimeout;
    map.on('moveend', () => {
        clearTimeout(hillshadeTimeout);
        hillshadeTimeout = setTimeout(() => updateCustomHillshade(), 500);
    });
    map.on('zoomend', () => {
        clearTimeout(hillshadeTimeout);
        hillshadeTimeout = setTimeout(() => updateCustomHillshade(), 500);
    });
}

// Update custom hillshade based on actual sun calculations
async function updateCustomHillshade() {
    if (!map || sunAltitude === undefined) {
        debugLog('⚠ Hillshade update skipped: map or sun position not ready', 'warn');
        return;
    }

    if (hillshadeRenderInProgress) {
        debugLog('⚠ Hillshade render already in progress, skipping', 'warn');
        return;
    }

    hillshadeRenderInProgress = true;
    const startTime = performance.now();

    debugLog('🎨 Starting hillshade render...', 'info');

    // Add timeout protection
    const timeout = setTimeout(() => {
        debugLog('❌ Hillshade render timeout (30s) - resetting', 'error');
        hillshadeRenderInProgress = false;
    }, 30000);

    try {
        const bounds = map.getBounds();
        const ne = bounds.getNorthEast();
        const sw = bounds.getSouthWest();

        debugLog(`📍 Bounds: ${sw.lat.toFixed(2)},${sw.lng.toFixed(2)} to ${ne.lat.toFixed(2)},${ne.lng.toFixed(2)}`, 'info');

        // Calculate grid dimensions
        const latRange = ne.lat - sw.lat;
        const lngRange = ne.lng - sw.lng;

        const gridCols = Math.ceil(lngRange / hillshadeGridResolution);
        const gridRows = Math.ceil(latRange / hillshadeGridResolution);

        // Limit grid size for performance - more aggressive for mobile
        const maxDim = window.innerWidth < 768 ? 50 : 80; // Even smaller for testing
        const scaleFactor = Math.max(gridCols / maxDim, gridRows / maxDim, 1);
        const finalCols = Math.max(10, Math.floor(gridCols / scaleFactor));
        const finalRows = Math.max(10, Math.floor(gridRows / scaleFactor));

        debugLog(`📊 Hillshade grid: ${finalCols}x${finalRows} (${finalCols * finalRows} points)`, 'info');
        debugLog(`☀ Sun: alt=${sunAltitude.toFixed(1)}° az=${sunAzimuth.toFixed(1)}°`, 'info');

        // Set canvas size
        customHillshadeCanvas.width = finalCols;
        customHillshadeCanvas.height = finalRows;
        const ctx = customHillshadeCanvas.getContext('2d');

        debugLog('🖼 Canvas created: ' + finalCols + 'x' + finalRows, 'info');

        const imageData = ctx.createImageData(finalCols, finalRows);
        const data = imageData.data;

        const zoom = Math.min(map.getZoom(), 11);
        const actualGridRes = hillshadeGridResolution * scaleFactor;

        let processedPoints = 0;
        let skippedPoints = 0;
        let errorCount = 0;

        debugLog('⏳ Processing grid points...', 'info');

        // Process each grid point WITHOUT shadow checking for performance
        for (let row = 0; row < finalRows; row++) {
            for (let col = 0; col < finalCols; col++) {
                const lat = sw.lat + (row + 0.5) * actualGridRes;
                const lng = sw.lng + (col + 0.5) * actualGridRes;

                const idx = (row * finalCols + col) * 4;

                try {
                    // Get cached terrain data or calculate WITH TIMEOUT
                    const terrainData = await Promise.race([
                        getTerrainDataCached(lat, lng, zoom),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Terrain load timeout')), 5000))
                    ]);

                    if (!terrainData) {
                        // No data - set to neutral gray
                        data[idx] = 128;
                        data[idx + 1] = 128;
                        data[idx + 2] = 128;
                        data[idx + 3] = 255;
                        skippedPoints++;
                        continue;
                    }

                    // Calculate hillshade WITHOUT shadow check for speed
                    const hillshade = calculateHillshadeFast(
                        terrainData.aspect,
                        terrainData.slope
                    );

                    data[idx] = hillshade;       // Red
                    data[idx + 1] = hillshade;   // Green
                    data[idx + 2] = hillshade;   // Blue
                    data[idx + 3] = 255;         // Full opacity

                    processedPoints++;
                } catch (err) {
                    // Error loading terrain - use neutral gray
                    data[idx] = 128;
                    data[idx + 1] = 128;
                    data[idx + 2] = 128;
                    data[idx + 3] = 255;
                    errorCount++;
                }
            }

            // Update progressively for responsiveness
            if (row % 5 === 0 && row > 0) {
                ctx.putImageData(imageData, 0, 0);
                debugLog(`⏳ Progress: ${Math.floor(row / finalRows * 100)}%`, 'info');
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }

        debugLog('✏️ Writing final image data...', 'info');
        ctx.putImageData(imageData, 0, 0);

        // Update canvas source coordinates
        debugLog('📍 Updating canvas coordinates...', 'info');
        map.getSource('custom-hillshade').setCoordinates([
            [sw.lng, ne.lat],
            [ne.lng, ne.lat],
            [ne.lng, sw.lat],
            [sw.lng, sw.lat]
        ]);

        const elapsed = (performance.now() - startTime).toFixed(0);
        debugLog(`✓ Hillshade rendered in ${elapsed}ms`, 'success');
        debugLog(`  ${processedPoints} processed, ${skippedPoints} skipped, ${errorCount} errors`, 'info');

    } catch (error) {
        debugLog(`❌ Hillshade error: ${error.message}`, 'error');
        debugLog(`   Stack: ${error.stack}`, 'error');
        console.error('Hillshade rendering error:', error);
    } finally {
        clearTimeout(timeout);
        hillshadeRenderInProgress = false;
        debugLog('🏁 Render complete, flag reset', 'info');
    }
}

// Fast hillshade calculation without shadow checking (for grid rendering)
function calculateHillshadeFast(aspect, slope) {
    if (sunAltitude < 0) {
        return 50; // Dark at night
    }

    // Convert sun altitude to zenith angle (zenith = 90° - altitude)
    const zenith = 90.0 - sunAltitude;
    const zenithRad = zenith * Math.PI / 180;

    // Convert geographic azimuth to mathematical azimuth
    let azimuthMath = 360.0 - sunAzimuth + 90.0;
    if (azimuthMath >= 360.0) azimuthMath -= 360.0;
    const azimuthRad = azimuthMath * Math.PI / 180;

    // Convert slope and aspect to radians
    const slopeRad = slope * Math.PI / 180;
    const aspectRad = aspect * Math.PI / 180;

    // Standard GIS hillshade formula
    const hillshadeValue = 255.0 * (
        (Math.cos(zenithRad) * Math.cos(slopeRad)) +
        (Math.sin(zenithRad) * Math.sin(slopeRad) * Math.cos(azimuthRad - aspectRad))
    );

    // Clamp to 0-255 range
    return Math.max(0, Math.min(255, hillshadeValue));
}

// Calculate hillshade value using standard GIS formula (with shadow checking)
// Based on ArcGIS/GDAL hillshade algorithm
async function calculateHillshade(aspect, slope, elevation, lat, lng) {
    if (sunAltitude < 0) {
        return { hillshade: 0, inShadow: true };
    }

    // Convert sun altitude to zenith angle (zenith = 90° - altitude)
    const zenith = 90.0 - sunAltitude;
    const zenithRad = zenith * Math.PI / 180;

    // Convert geographic azimuth to mathematical azimuth
    // Geographic: 0°=N, 90°=E, 180°=S, 270°=W
    // Mathematical: measured counter-clockwise from east
    // Formula from ArcGIS: Azimuth_math = 360.0 - Azimuth + 90.0
    let azimuthMath = 360.0 - sunAzimuth + 90.0;
    if (azimuthMath >= 360.0) azimuthMath -= 360.0;
    const azimuthRad = azimuthMath * Math.PI / 180;

    // Convert slope and aspect to radians
    const slopeRad = slope * Math.PI / 180;
    const aspectRad = aspect * Math.PI / 180;

    // Standard GIS hillshade formula:
    // Hillshade = 255.0 * ((cos(Zenith) * cos(Slope)) + (sin(Zenith) * sin(Slope) * cos(Azimuth - Aspect)))
    const hillshadeValue = 255.0 * (
        (Math.cos(zenithRad) * Math.cos(slopeRad)) +
        (Math.sin(zenithRad) * Math.sin(slopeRad) * Math.cos(azimuthRad - aspectRad))
    );

    // Clamp to 0-255 range
    let hillshade = Math.max(0, Math.min(255, hillshadeValue));

    // Check for terrain shadow blocking
    const shadowFactor = await quickShadowCheck(lat, lng, elevation);

    if (shadowFactor === 0) {
        // In shadow - darken significantly
        hillshade = hillshade * 0.3; // Shadows are very dark
    }

    return { hillshade, inShadow: shadowFactor === 0 };
}

// Quick shadow check (simplified version for hillshade grid performance)
async function quickShadowCheck(lat, lng, elevation) {
    if (sunAltitude < 0) return 0;

    const maxDistance = 5000; // 5km max
    const stepSize = 200; // 200m steps

    const sunAzRad = sunAzimuth * Math.PI / 180;
    const sunAltRad = sunAltitude * Math.PI / 180;

    const dLat = (Math.cos(sunAzRad) * stepSize) / 111320;
    const dLng = (Math.sin(sunAzRad) * stepSize) / (111320 * Math.cos(lat * Math.PI / 180));

    const steps = Math.floor(maxDistance / stepSize);
    const zoom = 10; // Lower resolution for speed

    for (let i = 1; i <= steps; i++) {
        const currentLat = lat + dLat * i;
        const currentLng = lng + dLng * i;
        const distance = i * stepSize;
        const rayHeight = elevation + distance * Math.tan(sunAltRad);

        const terrainHeight = await getRealElevationCached(currentLat, currentLng, zoom);

        if (terrainHeight !== null && terrainHeight > rayHeight) {
            return 0; // In shadow
        }
    }

    return 1; // In sun
}

// Cached version of getTerrainData for hillshade grid
async function getTerrainDataCached(lat, lng, zoom) {
    const key = `${lat.toFixed(4)},${lng.toFixed(4)},${zoom}`;

    if (terrainCache.has(key)) {
        return terrainCache.get(key);
    }

    return await getTerrainData(lat, lng, zoom);
}

// Cached version of getRealElevation for quick shadow checks
async function getRealElevationCached(lat, lng, zoom) {
    const key = `elev_${lat.toFixed(4)},${lng.toFixed(4)},${zoom}`;

    if (terrainCache.has(key)) {
        return terrainCache.get(key);
    }

    const elevation = await getRealElevation(lat, lng, zoom);
    terrainCache.set(key, elevation);

    return elevation;
}

function updateSunVisualization(minutes) {
    const center = map.getCenter();
    const lat = center.lat;
    const lng = center.lng;

    // Get sun position for the simulated time
    const sunPos = SunCalc.getPosition(simulationTime, lat, lng);
    const altitude = sunPos.altitude * 180 / Math.PI;
    const azimuth = ((sunPos.azimuth * 180 / Math.PI) + 180) % 360;

    console.log(`Sun at ${simulationTime.toTimeString().slice(0, 5)}: altitude=${altitude.toFixed(1)}°, azimuth=${azimuth.toFixed(1)}°`);

    // Calculate brightness factor based on sun altitude
    // Sun below horizon = dark (0), sun at zenith = bright (1)
    const brightnessFactor = altitude > 0
        ? Math.min(1, (altitude + 10) / 50)  // Gradual brightening
        : Math.max(0, (altitude + 20) / 30);  // Twilight effect

    // Update custom hillshade with actual sun calculations
    updateCustomHillshade();

    // Update sun rays visualization
    updateSunRays(azimuth, altitude);

    // Update sun badge
    const badge = document.getElementById('sun-badge');
    if (altitude > 0) {
        badge.textContent = `☀ ${altitude.toFixed(1)}° @ ${azimuth.toFixed(0)}°`;
        badge.style.color = '#ffa500';
    } else {
        badge.textContent = `🌙 Below Horizon`;
        badge.style.color = '#6b7280';
    }
}

function updateSunRays(azimuth, altitude) {
    // Remove existing sun rays
    const existingRays = document.querySelectorAll('.sun-ray');
    existingRays.forEach(ray => ray.remove());

    if (altitude <= 0) return;  // No rays when sun is below horizon

    // Create 5 sun rays emanating from the sun direction
    const mapContainer = document.getElementById('map');
    const numRays = 5;
    const rayLength = 200;  // pixels

    // Calculate screen position based on sun azimuth and altitude
    // Higher altitude = closer to center, lower = toward edges
    const altitudeNorm = Math.max(0, Math.min(1, altitude / 90));

    for (let i = 0; i < numRays; i++) {
        const ray = document.createElement('div');
        ray.className = 'sun-ray';

        // Position rays coming from sun direction
        const angleOffset = (i - numRays/2) * 15;  // Spread rays out
        const rayAngle = azimuth + angleOffset;

        // Calculate ray position (opposite of sun direction, so rays come toward viewer)
        const oppositeAzimuth = (rayAngle + 180) % 360;
        const x = 50 + Math.sin(oppositeAzimuth * Math.PI / 180) * 30 * (1 - altitudeNorm);
        const y = 50 - Math.cos(oppositeAzimuth * Math.PI / 180) * 30 * (1 - altitudeNorm);

        ray.style.left = x + '%';
        ray.style.top = y + '%';
        ray.style.height = rayLength + 'px';
        ray.style.transform = `translateX(-50%) rotate(${oppositeAzimuth}deg)`;
        ray.style.opacity = altitudeNorm * 0.6;

        mapContainer.appendChild(ray);
    }
}

// Terrain exaggeration control
document.getElementById('exaggeration').addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    currentExaggeration = value;
    document.getElementById('exag-value').textContent = value.toFixed(1) + 'x';

    map.setTerrain({
        source: 'terrarium-terrain',
        exaggeration: value
    });
});

// Pitch control
document.getElementById('pitch').addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    document.getElementById('pitch-value').textContent = value + '°';
    map.setPitch(value);
});

// Location presets
// Montana locations
function flyToBridgerBowl() {
    map.flyTo({
        center: [-110.903, 45.817],
        zoom: 13,
        pitch: 80,
        bearing: 45,
        duration: 3000,
        essential: true
    });
}

function flyToBigSky() {
    map.flyTo({
        center: [-111.403, 45.285],
        zoom: 12.5,
        pitch: 82,
        bearing: -20,
        duration: 3000,
        essential: true
    });
}

function flyToCookeCity() {
    map.flyTo({
        center: [-109.934, 45.020],
        zoom: 13,
        pitch: 78,
        bearing: 90,
        duration: 3000,
        essential: true
    });
}

// Other locations
function flyToGrandCanyon() {
    map.flyTo({
        center: [-111.5, 36.1],
        zoom: 12.5,
        pitch: 80,
        bearing: -30,
        duration: 3000,
        essential: true
    });
}

function flyToEverest() {
    map.flyTo({
        center: [86.925, 27.988],
        zoom: 13,
        pitch: 82,
        bearing: 135,
        duration: 3000,
        essential: true
    });
}

function flyToAlps() {
    map.flyTo({
        center: [7.658, 46.021],
        zoom: 12,
        pitch: 78,
        bearing: 90,
        duration: 3000,
        essential: true
    });
}

function flyToYosemite() {
    map.flyTo({
        center: [-119.538, 37.748],
        zoom: 12.5,
        pitch: 75,
        bearing: -45,
        duration: 3000,
        essential: true
    });
}

// Click handler for point analysis
map.on('click', async (e) => {
    const latlng = e.lngLat;

    // Wait a bit for terrain to be fully loaded
    await new Promise(resolve => setTimeout(resolve, 100));

    await showPointInfo(latlng.lat, latlng.lng);
});

// Update sun position
function updateSunPosition() {
    const center = map.getCenter();
    const sunPos = SunCalc.getPosition(currentDate, center.lat, center.lng);

    const azimuth = ((sunPos.azimuth * 180 / Math.PI) + 180) % 360;
    const altitude = sunPos.altitude * 180 / Math.PI;

    sunAzimuth = azimuth;
    sunAltitude = altitude;

    const sunBadge = document.getElementById('sun-badge');
    if (altitude < 0) {
        sunBadge.textContent = '🌙 Night';
    } else if (altitude < 10) {
        sunBadge.textContent = '🌅 ' + azimuth.toFixed(0) + '°';
    } else {
        sunBadge.textContent = '☀ ' + azimuth.toFixed(0) + '° / ' + altitude.toFixed(0) + '°';
    }
}

// Show point info with solar analysis
async function showPointInfo(lat, lng) {
    document.getElementById('loading').classList.add('active');

    // Add or update marker
    if (clickMarker) {
        clickMarker.remove();
    }

    const el = document.createElement('div');
    el.className = 'click-marker';

    clickMarker = new maplibregl.Marker({ element: el })
        .setLngLat([lng, lat])
        .addTo(map);

    // Add analysis grid showing the sampled area
    if (analysisGrid) {
        map.removeLayer('analysis-grid-fill');
        map.removeLayer('analysis-grid-line');
        map.removeSource('analysis-grid');
    }

    const gridSize = 0.0002; // ~22 meters
    const bounds = [
        [lng - gridSize, lat - gridSize],
        [lng + gridSize, lat - gridSize],
        [lng + gridSize, lat + gridSize],
        [lng - gridSize, lat + gridSize],
        [lng - gridSize, lat - gridSize]
    ];

    map.addSource('analysis-grid', {
        'type': 'geojson',
        'data': {
            'type': 'Feature',
            'geometry': {
                'type': 'Polygon',
                'coordinates': [bounds]
            }
        }
    });

    map.addLayer({
        'id': 'analysis-grid-fill',
        'type': 'fill',
        'source': 'analysis-grid',
        'paint': {
            'fill-color': '#ff6b00',
            'fill-opacity': 0.1
        }
    });

    map.addLayer({
        'id': 'analysis-grid-line',
        'type': 'line',
        'source': 'analysis-grid',
        'paint': {
            'line-color': '#ff6b00',
            'line-width': 2,
            'line-dasharray': [2, 2]
        }
    });

    analysisGrid = true;

    try {
        const zoom = Math.min(map.getZoom(), 12);
        console.log('Analyzing point:', lat, lng, 'Zoom:', zoom);

        const terrainData = await getTerrainData(lat, lng, zoom);

        if (!terrainData) {
            console.error('No terrain data available for this location');
            document.getElementById('loading').classList.remove('active');
            alert('No terrain data available for this location. Try a different area or check the browser console (F12) for details.');
            return;
        }

        // Open solar data modal
        if (typeof openSolarModal === 'function') {
            openSolarModal();
        }

        // Update location
        document.getElementById('location-coords').textContent =
            `${lat.toFixed(6)}°, ${lng.toFixed(6)}°`;

        // Update terrain stats
        document.getElementById('elevation-value').textContent = Math.round(terrainData.elevation);
        document.getElementById('slope-value').textContent = terrainData.slope.toFixed(1);
        document.getElementById('aspect-value').textContent =
            `${getAspectDirection(terrainData.aspect)} (${terrainData.aspect.toFixed(0)}°) - ${getSlopeFacing(terrainData.aspect)}`;

        // Calculate current exposure and sun-slope angle
        const exposureData = await calculateExposure(
            terrainData.aspect,
            terrainData.slope,
            terrainData.elevation,
            lat,
            lng
        );
        const exposure = exposureData.exposure;
        const sunSlopeAngle = exposureData.incidenceAngle;

        // Get sun times
        const sunTimes = SunCalc.getTimes(currentDate, lat, lng);
        const formatTime = (date) => date ? date.toTimeString().slice(0, 5) : '--:--';

        // Astronomical times (textbook horizon)
        document.getElementById('astronomical-sunrise').textContent = formatTime(sunTimes.sunrise);
        document.getElementById('astronomical-sunset').textContent = formatTime(sunTimes.sunset);

        // Calculate terrain-aware sun times
        console.log('Calculating terrain-aware sun times...');
        const terrainSunTimes = await calculateTerrainSunTimes(lat, lng, terrainData.elevation);
        document.getElementById('terrain-sunrise').textContent = formatTime(terrainSunTimes.sunrise);
        document.getElementById('terrain-sunset').textContent = formatTime(terrainSunTimes.sunset);

        // Calculate slope sun times
        console.log('Calculating slope sun times...');
        const slopeTimes = await calculateSlopeSunTimes(lat, lng, terrainData);
        document.getElementById('slope-sun-start').textContent = formatTime(slopeTimes.slopeStart);
        document.getElementById('slope-sun-end').textContent = formatTime(slopeTimes.slopeEnd);

        // Update current exposure
        document.getElementById('current-exposure').textContent = Math.round(exposure * 100);

        // Update sun-slope angle
        if (sunAltitude > 0) {
            document.getElementById('sun-slope-angle').textContent = sunSlopeAngle.toFixed(1);
        } else {
            document.getElementById('sun-slope-angle').textContent = '--';
        }

        const inShadow = exposure === 0 && sunAltitude > 0;
        const status = sunAltitude < 0 ? '🌙 Night' :
                      inShadow ? '🌑 Shadow' :
                      exposure > 0.7 ? '☀️ Full Sun' :
                      exposure > 0.3 ? '⛅ Partial' : '🌤️ Low';
        document.getElementById('sun-status').textContent = status;

        // Calculate hourly exposure
        const hourlyData = await calculateHourlyExposure(lat, lng, terrainData);
        updateHourlyChart(hourlyData);

        const totalSunHours = hourlyData.filter(h => h.exposure > 0).length;
        document.getElementById('total-sun-hours').textContent = `${totalSunHours}h`;

    } catch (error) {
        console.error('Error:', error);
        alert('Error calculating solar data: ' + error.message);
    }

    document.getElementById('loading').classList.remove('active');
}

// Get terrain data using manual tile loading (same as original solar calculator)
async function getTerrainData(lat, lng, zoom) {
    const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;

    if (terrainCache.has(key)) {
        return terrainCache.get(key);
    }

    // Cap zoom at 12 for global Mapterhorn coverage (same as original)
    const terrainZoom = Math.min(zoom, 12);

    // Get real elevation from terrain tiles (same method as original solar calculator)
    const elevation = await getRealElevation(lat, lng, terrainZoom);

    if (elevation === null) {
        console.error('Failed to get elevation');
        return null;
    }

    console.log(`Elevation: ${elevation.toFixed(2)}m`);

    // Calculate slope and aspect from real terrain (same as original)
    const { aspect, slope } = await calculateRealSlopeAspect(lat, lng, terrainZoom);

    console.log(`Slope: ${slope.toFixed(1)}°, Aspect: ${aspect.toFixed(0)}°`);

    const data = { elevation, aspect, slope };
    terrainCache.set(key, data);

    // Limit cache size
    if (terrainCache.size > 10000) {
        const firstKey = terrainCache.keys().next().value;
        terrainCache.delete(firstKey);
    }

    return data;
}

// Convert lat/lng to tile coordinates (same as original)
function latLngToTile(lat, lng, zoom) {
    const x = Math.floor((lng + 180) / 360 * Math.pow(2, zoom));
    const y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
    return { x, y, z: zoom };
}

// Load terrain tile (same as original)
async function loadTerrainTile(tileX, tileY, zoom) {
    const tileKey = `${zoom}/${tileX}/${tileY}`;

    if (tileCache.has(tileKey)) {
        return tileCache.get(tileKey);
    }

    try {
        const url = terrainTileUrl
            .replace('{z}', zoom)
            .replace('{x}', tileX)
            .replace('{y}', tileY);

        const img = await loadImage(url);

        const canvas = document.createElement('canvas');
        canvas.width = tileSize;
        canvas.height = tileSize;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, tileSize, tileSize);

        tileCache.set(tileKey, imageData);

        // Limit tile cache size
        if (tileCache.size > 50) {
            const firstKey = tileCache.keys().next().value;
            tileCache.delete(firstKey);
        }

        return imageData;
    } catch (error) {
        console.error('Error loading terrain tile:', error);
        return null;
    }
}

// Load image (same as original)
function loadImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
    });
}

// Decode Terrarium RGB (same as original)
function decodeTerrainRGB(r, g, b) {
    return (r * 256 + g + b / 256) - 32768;
}

// Get real elevation (same as original)
async function getRealElevation(lat, lng, zoom) {
    const tile = latLngToTile(lat, lng, zoom);
    const tileData = await loadTerrainTile(tile.x, tile.y, zoom);

    if (!tileData) {
        return null;
    }

    const scale = Math.pow(2, zoom);
    const worldX = (lng + 180) / 360 * scale;
    const worldY = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * scale;

    const pixelX = Math.floor((worldX - tile.x) * tileSize);
    const pixelY = Math.floor((worldY - tile.y) * tileSize);

    if (pixelX < 0 || pixelX >= tileSize || pixelY < 0 || pixelY >= tileSize) {
        return null;
    }

    const idx = (pixelY * tileSize + pixelX) * 4;
    const r = tileData.data[idx];
    const g = tileData.data[idx + 1];
    const b = tileData.data[idx + 2];

    if (r === 0 && g === 0 && b === 0) {
        return null;
    }

    return decodeTerrainRGB(r, g, b);
}

// Calculate slope and aspect (same as original)
async function calculateRealSlopeAspect(lat, lng, zoom) {
    const delta = 0.0001; // ~11 meters

    const elevCenter = await getRealElevation(lat, lng, zoom);
    const elevNorth = await getRealElevation(lat + delta, lng, zoom);
    const elevSouth = await getRealElevation(lat - delta, lng, zoom);
    const elevEast = await getRealElevation(lat, lng + delta, zoom);
    const elevWest = await getRealElevation(lat, lng - delta, zoom);

    if (elevCenter === null || elevNorth === null || elevSouth === null ||
        elevEast === null || elevWest === null) {
        return { aspect: 0, slope: 0 };
    }

    // Calculate gradients in meters (same as original)
    const metersPerDegree = 111320 * Math.cos(lat * Math.PI / 180);
    const dzdx = (elevEast - elevWest) / (2 * delta * metersPerDegree);
    const dzdy = (elevSouth - elevNorth) / (2 * delta * 111320);

    // Calculate slope (in degrees)
    const slopeRad = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy));
    const slope = slopeRad * 180 / Math.PI;

    // Calculate aspect using standard GIS formula (same as original)
    let mathAspect = Math.atan2(dzdy, -dzdx) * 180 / Math.PI;
    let aspect = 90 - mathAspect;

    // Normalize to 0-360 range
    if (aspect < 0) aspect += 360;
    if (aspect >= 360) aspect -= 360;

    return { aspect, slope };
}

// Calculate exposure
async function calculateExposure(aspect, slope, elevation, lat, lng) {
    if (sunAltitude < 0) {
        return 0;
    }

    const slopeRad = slope * Math.PI / 180;
    const aspectRad = aspect * Math.PI / 180;
    const sunAltRad = sunAltitude * Math.PI / 180;
    const sunAzRad = sunAzimuth * Math.PI / 180;

    const slopeNx = Math.sin(slopeRad) * Math.sin(aspectRad);
    const slopeNy = Math.sin(slopeRad) * Math.cos(aspectRad);
    const slopeNz = Math.cos(slopeRad);

    const sunDx = Math.cos(sunAltRad) * Math.sin(sunAzRad);
    const sunDy = Math.cos(sunAltRad) * Math.cos(sunAzRad);
    const sunDz = Math.sin(sunAltRad);

    // Dot product gives cosine of angle between slope normal and sun direction
    let dotProduct = slopeNx * sunDx + slopeNy * sunDy + slopeNz * sunDz;

    // Calculate the actual angle in degrees (angle between sun ray and slope normal)
    // The angle of incidence is 0° when sun is perpendicular to slope, 90° when parallel
    const incidenceAngle = Math.acos(Math.max(-1, Math.min(1, dotProduct))) * 180 / Math.PI;

    let exposure = Math.max(0, Math.min(1, dotProduct));

    // Apply shadow check (simplified for performance)
    if (exposure > 0) {
        const shadowFactor = await calculateShadow(lat, lng, elevation);
        exposure *= shadowFactor;
    }

    return { exposure, incidenceAngle };
}

// Calculate shadow (same as original solar calculator)
async function calculateShadow(lat, lng, elevation) {
    if (sunAltitude < 0) {
        return 0;
    }

    const maxDistance = 5000; // 5km max distance
    const stepSize = 100; // Check every 100m
    const zoom = Math.min(map.getZoom(), 12);

    const sunAzRad = sunAzimuth * Math.PI / 180;
    const sunAltRad = sunAltitude * Math.PI / 180;

    const metersPerDegreeLat = 111320;
    const metersPerDegreeLng = 111320 * Math.cos(lat * Math.PI / 180);

    const latStep = (Math.cos(sunAzRad) * stepSize) / metersPerDegreeLat;
    const lngStep = (Math.sin(sunAzRad) * stepSize) / metersPerDegreeLng;

    let currentLat = lat;
    let currentLng = lng;
    let distance = 0;

    while (distance < maxDistance) {
        distance += stepSize;
        currentLat += latStep;
        currentLng += lngStep;

        const rayHeight = elevation + distance * Math.tan(sunAltRad);
        const terrainHeight = await getRealElevation(currentLat, currentLng, zoom);

        if (terrainHeight === null) break;
        if (terrainHeight > rayHeight) return 0; // Shadow detected
        if (rayHeight - terrainHeight > 500) break; // Ray is far above terrain
    }

    return 1; // No shadow
}

// Calculate terrain-aware sun times (when sun clears terrain obstacles)
async function calculateTerrainSunTimes(lat, lng, elevation) {
    const date = currentDate;
    const sunTimes = SunCalc.getTimes(date, lat, lng);

    let terrainSunrise = sunTimes.sunrise;
    let terrainSunset = sunTimes.sunset;

    console.log(`Calculating terrain-aware sun times for elevation ${elevation.toFixed(1)}m`);

    // Check if terrain blocks sunrise (eastern mountains)
    if (sunTimes.sunrise && !isNaN(sunTimes.sunrise.getTime())) {
        // Walk forward from astronomical sunrise, checking every 2 minutes for accuracy
        for (let i = 0; i < 240; i += 2) {
            const testDate = new Date(sunTimes.sunrise.getTime() + i * 60 * 1000);
            const testPos = SunCalc.getPosition(testDate, lat, lng);
            const testAlt = testPos.altitude * 180 / Math.PI;
            const testAz = ((testPos.azimuth * 180 / Math.PI) + 180) % 360;

            if (testAlt > 0) {
                // Check if sun is blocked by terrain
                const isBlocked = await checkTerrainBlocking(lat, lng, elevation, testAz, testAlt);
                if (!isBlocked) {
                    terrainSunrise = testDate;
                    console.log(`Terrain sunrise: ${terrainSunrise.toTimeString().slice(0, 5)} (${i} min after astronomical)`);
                    break;
                }
            }
        }
    }

    // Check if terrain blocks sunset (western mountains)
    if (sunTimes.sunset && !isNaN(sunTimes.sunset.getTime())) {
        // Walk backward from astronomical sunset, checking every 2 minutes
        for (let i = 0; i < 240; i += 2) {
            const testDate = new Date(sunTimes.sunset.getTime() - i * 60 * 1000);
            const testPos = SunCalc.getPosition(testDate, lat, lng);
            const testAlt = testPos.altitude * 180 / Math.PI;
            const testAz = ((testPos.azimuth * 180 / Math.PI) + 180) % 360;

            if (testAlt > 0) {
                const isBlocked = await checkTerrainBlocking(lat, lng, elevation, testAz, testAlt);
                if (!isBlocked) {
                    terrainSunset = testDate;
                    console.log(`Terrain sunset: ${terrainSunset.toTimeString().slice(0, 5)} (${i} min before astronomical)`);
                } else {
                    break;
                }
            }
        }
    }

    return {
        sunrise: terrainSunrise,
        sunset: terrainSunset
    };
}

// Check if terrain blocks sun at given azimuth and altitude (same as original)
async function checkTerrainBlocking(lat, lng, elevation, azimuth, altitude) {
    const maxDistance = 10000; // Increased to 10km for distant mountains
    const stepSize = 100; // Reduced from 200m to 100m for better accuracy
    const zoom = Math.min(map.getZoom(), 12);

    const azRad = azimuth * Math.PI / 180;
    const altRad = altitude * Math.PI / 180;

    const metersPerDegreeLat = 111320;
    const metersPerDegreeLng = 111320 * Math.cos(lat * Math.PI / 180);

    const latStep = (Math.cos(azRad) * stepSize) / metersPerDegreeLat;
    const lngStep = (Math.sin(azRad) * stepSize) / metersPerDegreeLng;

    let currentLat = lat;
    let currentLng = lng;
    let distance = 0;

    while (distance < maxDistance) {
        distance += stepSize;
        currentLat += latStep;
        currentLng += lngStep;

        const rayHeight = elevation + distance * Math.tan(altRad);
        const terrainHeight = await getRealElevation(currentLat, currentLng, zoom);

        // If we can't get elevation data, assume not blocked and continue
        if (terrainHeight === null) {
            console.warn(`No elevation data at ${currentLat.toFixed(4)}, ${currentLng.toFixed(4)}`);
            continue;
        }

        if (terrainHeight > rayHeight) {
            console.log(`Terrain blocking detected at ${distance}m: terrain=${terrainHeight.toFixed(1)}m, ray=${rayHeight.toFixed(1)}m`);
            return true; // Blocked
        }

        if (rayHeight - terrainHeight > 1000) break; // Ray far above terrain
    }

    return false; // Not blocked
}

// Calculate when sun hits and leaves this specific slope
async function calculateSlopeSunTimes(lat, lng, terrainData) {
    const date = currentDate;
    let slopeStartTime = null;
    let slopeEndTime = null;
    let lastExposedTime = null;

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    let wasExposed = false;
    let hasAnyExposure = false;

    console.log(`Calculating slope sun times for lat=${lat.toFixed(4)}, lng=${lng.toFixed(4)}, aspect=${terrainData.aspect.toFixed(1)}°, slope=${terrainData.slope.toFixed(1)}°`);

    // Check every 5 minutes throughout the day for more accuracy
    for (let minutes = 0; minutes < 1440; minutes += 5) {
        const testTime = new Date(startOfDay);
        testTime.setMinutes(minutes);

        const sunPos = SunCalc.getPosition(testTime, lat, lng);
        const sunAltitude = sunPos.altitude * 180 / Math.PI;
        const sunAzimuth = ((sunPos.azimuth * 180 / Math.PI) + 180) % 360;

        // Check if sun is above horizon
        if (sunAltitude <= 0) {
            if (wasExposed) {
                slopeEndTime = lastExposedTime;
                wasExposed = false;
            }
            continue;
        }

        // Check if sun is blocked by terrain
        const sunBlocked = await checkTerrainBlocking(lat, lng, terrainData.elevation, sunAzimuth, sunAltitude);

        // Check if sun is facing the slope (dot product test)
        const slopeFacing = isSlopeFacingSun(
            terrainData.aspect,
            terrainData.slope,
            sunAzimuth,
            sunAltitude
        );

        // Slope is exposed if: sun above horizon, not blocked, and facing slope
        const isExposed = !sunBlocked && slopeFacing;

        if (isExposed) {
            hasAnyExposure = true;
            lastExposedTime = new Date(testTime);

            if (!wasExposed) {
                slopeStartTime = new Date(testTime);
                wasExposed = true;
                console.log(`Slope sun starts at ${slopeStartTime.toTimeString().slice(0, 5)}`);
            }
        } else if (wasExposed) {
            slopeEndTime = new Date(testTime);
            wasExposed = false;
            console.log(`Slope sun ends at ${slopeEndTime.toTimeString().slice(0, 5)}`);
        }
    }

    // If still exposed at end of day, use last exposure time
    if (wasExposed && lastExposedTime) {
        slopeEndTime = lastExposedTime;
        console.log(`Slope sun ends at EOD: ${slopeEndTime.toTimeString().slice(0, 5)}`);
    }

    // Log if slope never gets sun
    if (!hasAnyExposure) {
        console.warn(`Slope at ${lat.toFixed(4)}, ${lng.toFixed(4)} receives no direct sun today (aspect=${terrainData.aspect.toFixed(1)}°, slope=${terrainData.slope.toFixed(1)}°)`);
    }

    return {
        slopeStart: slopeStartTime,
        slopeEnd: slopeEndTime
    };
}

// Check if sun is facing the slope
function isSlopeFacingSun(aspect, slope, sunAzimuth, sunAltitude) {
    const slopeRad = slope * Math.PI / 180;
    const aspectRad = aspect * Math.PI / 180;
    const sunAltRad = sunAltitude * Math.PI / 180;
    const sunAzRad = sunAzimuth * Math.PI / 180;

    // Slope normal vector (pointing outward from slope surface)
    const slopeNx = Math.sin(slopeRad) * Math.sin(aspectRad);
    const slopeNy = Math.sin(slopeRad) * Math.cos(aspectRad);
    const slopeNz = Math.cos(slopeRad);

    // Sun direction vector (pointing toward sun)
    const sunDx = Math.cos(sunAltRad) * Math.sin(sunAzRad);
    const sunDy = Math.cos(sunAltRad) * Math.cos(sunAzRad);
    const sunDz = Math.sin(sunAltRad);

    // Dot product - positive means sun is facing the slope
    const dotProduct = slopeNx * sunDx + slopeNy * sunDy + slopeNz * sunDz;

    return dotProduct > 0;
}

// Calculate hourly exposure
async function calculateHourlyExposure(lat, lng, terrainData) {
    const hourlyData = [];
    const date = currentDate;
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    for (let hour = 0; hour < 24; hour++) {
        const testTime = new Date(startOfDay);
        testTime.setHours(hour);

        const sunPos = SunCalc.getPosition(testTime, lat, lng);
        const altitude = sunPos.altitude * 180 / Math.PI;
        const azimuth = ((sunPos.azimuth * 180 / Math.PI) + 180) % 360;

        let exposure = 0;

        if (altitude > 0) {
            const oldAlt = sunAltitude;
            const oldAz = sunAzimuth;
            sunAltitude = altitude;
            sunAzimuth = azimuth;

            exposure = await calculateExposure(
                terrainData.aspect,
                terrainData.slope,
                terrainData.elevation,
                lat,
                lng
            );

            sunAltitude = oldAlt;
            sunAzimuth = oldAz;
        }

        hourlyData.push({
            hour,
            exposure,
            altitude,
            azimuth
        });
    }

    return hourlyData;
}

// Update hourly chart
function updateHourlyChart(hourlyData) {
    const chartBars = document.getElementById('exposure-bars');
    chartBars.innerHTML = '';

    const currentHour = currentDate.getHours();

    hourlyData.forEach(data => {
        const bar = document.createElement('div');
        bar.className = 'chart-bar';

        const height = data.exposure * 100;
        bar.style.height = `${height}%`;

        if (data.exposure > 0) {
            bar.classList.add('exposed');
        } else if (data.altitude > 0) {
            bar.classList.add('shadow');
        }

        if (data.hour === currentHour) {
            bar.classList.add('current');
        }

        chartBars.appendChild(bar);
    });
}

// Get aspect direction
function getAspectDirection(aspect) {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(aspect / 45) % 8;
    return directions[index];
}

// Get slope facing
function getSlopeFacing(aspect) {
    if (aspect >= 315 || aspect < 45) {
        return '❄️ North facing';
    } else if (aspect >= 45 && aspect < 135) {
        return '🌅 East facing';
    } else if (aspect >= 135 && aspect < 225) {
        return '☀️ South facing';
    } else {
        return '🌇 West facing';
    }
}

// Handle window resize
window.addEventListener('resize', () => {
    map.resize();
});

console.log('🏔️ 3D Solar Terrain Map Initialized');
console.log('Click anywhere on the map to analyze sun exposure!');
