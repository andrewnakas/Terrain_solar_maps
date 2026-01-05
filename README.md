# 🏔️☀️ 3D Solar Terrain Map

An interactive 3D terrain visualization combined with comprehensive solar exposure analysis. Click anywhere on the map to analyze sun exposure, slope, aspect, and terrain data for that location.

## ✨ Features

### 3D Terrain Visualization
- **Full 3D Terrain** - Realistic terrain rendering with MapLibre GL JS
- **Interactive Controls** - Adjust terrain exaggeration and camera angle
- **Satellite Imagery** - High-resolution satellite base layer
- **Location Presets** - Quick navigation to Grand Canyon, Mt. Everest, Swiss Alps, and Yosemite

### Solar Analysis
- **Real-time Sun Position** - Accurate solar calculations based on date, time, and location
- **Slope & Aspect Analysis** - Calculate slope angle and direction from terrain data
- **Shadow Ray-Casting** - Detect terrain shadows using 3D ray-tracing
- **Hourly Exposure Chart** - Visualize sun exposure throughout the day
- **Comprehensive Data Display** - Detailed sidebar with all terrain and solar metrics

### Point Selection
- **Click Analysis** - Click anywhere on the 3D map to analyze that point
- **Instant Feedback** - Real-time calculation of solar and terrain data
- **Visual Marker** - Orange marker shows selected location

## 🎮 How to Use

1. **Navigate the Map**
   - Left click + drag to pan
   - Right click + drag (or Ctrl + drag) to rotate and tilt
   - Scroll to zoom in/out
   - Use the pitch and terrain height sliders to adjust the view

2. **Analyze a Location**
   - Click anywhere on the map
   - The sidebar will populate with detailed information:
     - Coordinates
     - Elevation
     - Slope angle
     - Slope aspect (direction the slope faces)
     - Sunrise and sunset times
     - Current sun exposure percentage
     - Hourly sun exposure chart

3. **Quick Locations**
   - Use the preset buttons at the bottom to fly to famous landmarks

## 🛠️ Technology Stack

### Mapping & Visualization
- **MapLibre GL JS** - Open-source 3D mapping engine
- **Terrarium RGB Tiles** - Global elevation data for 3D terrain
- **ESRI Satellite Imagery** - High-quality satellite base layer

### Solar Calculations
- **SunCalc** - Astronomical algorithms for sun position
- **Mapterhorn Terrain Tiles** - Terrarium-RGB elevation data for slope analysis
- **Custom Ray-Casting** - 3D shadow detection algorithm

### Deployment
- **GitHub Actions** - Automated CI/CD pipeline
- **GitHub Pages** - Static site hosting

## 🌍 Use Cases

### Backcountry Planning
- **Avalanche Safety** - Identify sun-exposed vs. shaded slopes
- **Route Selection** - Choose optimal routes based on sun exposure
- **Timing Decisions** - See when specific slopes receive direct sunlight

### Mountaineering
- **Route Planning** - Find shaded routes for hot days, sunny routes for cold conditions
- **Camp Placement** - Identify locations with optimal sun exposure

### Solar Energy
- **Site Selection** - Evaluate locations for solar panel installations
- **Energy Estimation** - Understand sun exposure patterns throughout the day

### Photography & Recreation
- **Lighting Planning** - Plan shoots for optimal lighting conditions
- **Trail Selection** - Find shaded trails for summer hikes

## 📊 Data Sources

- **Elevation Data**: Terrarium RGB tiles (global coverage)
- **Terrain Tiles**: Mapterhorn terrain tiles (Terrarium format, zoom 0-12)
- **Satellite Imagery**: ESRI World Imagery
- **Base Map**: OpenStreetMap contributors

## 🚀 Deployment

This project automatically deploys to GitHub Pages when pushed to the following branches:
- `main` or `master` (production)
- `claude/**` (preview deployments)

### Setup GitHub Pages
1. Go to repository Settings → Pages
2. Under "Source", select "GitHub Actions"
3. Push to trigger deployment

## 🔧 Local Development

To run locally:

```bash
# Clone the repository
git clone https://github.com/andrewnakas/Terrain_solar_maps.git
cd Terrain_solar_maps

# Serve with any HTTP server
python -m http.server 8000
# or
npx serve

# Open http://localhost:8000
```

## 📖 How It Works

### Terrain Analysis
1. When you click on the map, the coordinates are captured
2. Elevation data is fetched from Mapterhorn terrain tiles (Terrarium RGB format)
3. Slope and aspect are calculated using elevation gradients from neighboring points
4. Results are cached for performance

### Solar Calculations
1. **Sun Position**: SunCalc computes azimuth and altitude for current date/time
2. **Slope Exposure**: Dot product between slope normal vector and sun direction
3. **Shadow Detection**: 3D ray-casting toward the sun checks for terrain occlusions
4. **Hourly Analysis**: Repeats calculations for each hour of the day

### Ray-Casting Algorithm
```
For each point on ray from location toward sun:
  - Calculate expected ray height at distance
  - Get actual terrain height at that point
  - If terrain > ray height, location is in shadow
```

## 🎨 Color Coding

### Slope Aspect
- 🔵 **North** (315-45°) - Cold, shaded slopes
- 🟡 **East** (45-135°) - Morning sun
- 🔴 **South** (135-225°) - Maximum sun exposure
- 🟠 **West** (225-315°) - Afternoon sun

### Sun Status
- ☀️ **Full Sun** - Exposure > 70%
- ⛅ **Partial** - Exposure 30-70%
- 🌤️ **Low** - Exposure < 30%
- 🌑 **Shadow** - In terrain shadow
- 🌙 **Night** - Sun below horizon

## 🤝 Credits

This project combines two separate applications:
- **3D Terrain Maps** - MapLibre GL JS 3D visualization
- **Sun Exposure Map Layer** - Solar analysis and terrain calculations

### Original Projects
- [Leaflet_3d_terrain_maps](https://github.com/andrewnakas/Leaflet_3d_terrain_maps)
- [Sun_exposure_map_layer](https://github.com/andrewnakas/Sun_exposure_map_layer)

### Data Attribution
- Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors
- Terrain data from Mapterhorn and AWS Terrarium tiles
- Satellite imagery © Esri, Maxar, Earthstar Geographics
- Built with [MapLibre GL JS](https://maplibre.org/)
- Solar calculations by [SunCalc](https://github.com/mourner/suncalc)

## ⚠️ Disclaimer

This tool is for educational and planning purposes only. **Do not use this as your sole source for safety decisions.** Always:
- Check official forecasts and warnings
- Carry proper safety equipment
- Travel with experienced partners
- Make conservative decisions in the backcountry

## 📄 License

MIT License - feel free to use and modify for your projects

## 🙏 Acknowledgments

Created by combining two amazing projects to provide comprehensive 3D terrain solar analysis. Special thanks to:
- MapLibre for the excellent 3D mapping engine
- SunCalc for accurate solar position calculations
- Mapterhorn for global terrain tile coverage

---

**Happy exploring!** 🎿⛰️🌞
