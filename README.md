
# MeshVision

MeshVision is a browser-based 3D mesh tool for uploading 3D models, computing triangle areas, and providing heatmap visualizations.

Live Build: https://andrewsink.github.io/MeshVision/

![MeshVision](https://github.com/user-attachments/assets/939521e8-5bfd-4018-89a4-cd7a08e5013f)

## Project Description

MeshVision is a web-based tool designed to visualize and analyze 3D mesh structures, specifically in STL file format. The tool provides a heatmap visualization that represents the area of each triangle in the mesh. It aims to offer insightful data to engineers, designers, and anyone working with 3D models.

## Features

- Upload and visualize 3D STL files
- Compute the area of all triangles in the mesh
- Heatmap visualization to represent the size of each triangle
- Interactive 3D viewer
- Chart representation for area distribution

## Usage

1. **Upload STL File**: Use the file upload button to select an STL file from your computer.
2. **View Mesh**: The mesh will be rendered in the 3D viewer.
3. **Heatmap**: The heatmap will automatically update to represent the size of each triangle.
4. **Chart View**: Scroll down to see the chart that represents the area distribution.

## Development

MeshVision is a buildless static site — no `npm` or build step is required. Open `index.html` in any modern browser (or serve the repo root with any static file server). Dependencies (three.js, chart.js, Tailwind) are loaded directly from CDNs via an ES module importmap.

## Acknowledgements

- [THREE.js](https://threejs.org/)
- [Chart.js](https://www.chartjs.org/)
