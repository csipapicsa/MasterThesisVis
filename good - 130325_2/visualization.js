// Configuration
const dataPath = "data"; // Path to your data directory

// State variables
let currentYear = 2020;
let nodeSpacing = 50;
let curvature = 40;
let stickiness = 30;
let topNodesCount = 30;
let nodesData = [];
let linksData = [];
let filteredNodes = [];
let processedLinks = [];
let selectedStyle = "";
let simulation;
let isLoading = true;
let svg, zoom;

// Elements
const svgElement = document.getElementById("network-svg");
const zoomContainer = d3.select("#zoom-container");
const nodeContainer = d3.select("#node-container");
const linkContainer = d3.select("#link-container");
const tooltip = d3.select("#tooltip");
const yearSelect = document.getElementById("year-select");
const yearDisplay = document.getElementById("year-display");
const styleSelect = document.getElementById("style-select");
const spacingSlider = document.getElementById("spacing-slider");
const nodeSpacingValue = document.getElementById("node-spacing-value");
const topNodesSlider = document.getElementById("top-nodes-slider");
const topNodesValue = document.getElementById("top-nodes-value");
const curveSlider = document.getElementById("curve-slider");
const curveValue = document.getElementById("curve-value");
const stickinessSlider = document.getElementById("stickiness-slider");
const stickinessValue = document.getElementById("stickiness-value");
const updateButton = document.getElementById("update-button");
const resetZoomButton = document.getElementById("reset-zoom-button");
const fitButton = document.getElementById("fit-button");
const errorMessage = document.getElementById("error-message");

// Initialize the visualization
initializeVisualization();

/**
 * Initialize the visualization and event listeners
 */
function initializeVisualization() {
    // Set up zoom behavior
    zoom = d3.zoom()
        .scaleExtent([0.1, 10])
        .on("zoom", function(event) {
            zoomContainer.attr("transform", event.transform);
        });
    
    svg = d3.select("#network-svg").call(zoom);
    
    // Populate year dropdown (2000-2024)
    for (let year = 2000; year <= 2024; year++) {
        const option = document.createElement("option");
        option.value = year;
        option.textContent = year;
        if (year === currentYear) {
            option.selected = true;
        }
        yearSelect.appendChild(option);
    }
    
    // Set up year dropdown event listener with automatic update
    yearSelect.addEventListener("change", function() {
        currentYear = parseInt(this.value);
        yearDisplay.textContent = currentYear;
        fetchDataAndRender(); // Automatically update when year changes
    });
    
    spacingSlider.addEventListener("input", function() {
        nodeSpacing = parseInt(this.value);
        nodeSpacingValue.textContent = nodeSpacing;
        if (simulation) {
            simulation
                .force("charge", d3.forceManyBody().strength(-300 * (nodeSpacing / 50)))
                .force("collision", d3.forceCollide().radius(d => d.size * 1.2 * (nodeSpacing / 50)))
                .alpha(0.3)
                .restart();
        }
    });
    
    topNodesSlider.addEventListener("input", function() {
        topNodesCount = parseInt(this.value);
        topNodesValue.textContent = topNodesCount;
    });
    
    // Add event listener for when slider is released to trigger update
    topNodesSlider.addEventListener("change", function() {
        fetchDataAndRender(); // Automatically update when number of nodes changes
    });
    
    curveSlider.addEventListener("input", function() {
        curvature = parseInt(this.value);
        curveValue.textContent = curvature;
        // Update curve paths when slider changes
        updateLinkPaths();
    });
    
    stickinessSlider.addEventListener("input", function() {
        stickiness = parseInt(this.value);
        stickinessValue.textContent = stickiness;
        if (simulation) {
            simulation.alphaDecay(0.01 * (stickiness / 50));
            simulation.alpha(0.3).restart();
        }
    });
    
    // Style selector event listener
    styleSelect.addEventListener("change", function() {
        selectedStyle = this.value;
        applyStyleFilter();
    });
    
    updateButton.addEventListener("click", fetchDataAndRender);
    
    resetZoomButton.addEventListener("click", resetZoom);
    
    fitButton.addEventListener("click", fitAllNodes);
    
    // Initial data fetch and render
    fetchDataAndRender();
}

/**
 * Apply style filter to highlight selected nodes and connections
 */
function applyStyleFilter() {
    if (!nodesData.length) return;
    
    // Clear existing classes
    d3.selectAll(".node").classed("dimmed", false).classed("highlighted", false);
    d3.selectAll(".link").classed("dimmed", false).classed("connected-link", false);
    
    if (!selectedStyle) {
        // No style selected, show all nodes and links normally
        return;
    }
    
    // Find the node with the selected style name
    const selectedNode = filteredNodes.find(node => node.name === selectedStyle);
    if (!selectedNode) return;
    
    // Find all connections to/from this node
    const connectedNodeIds = new Set();
    connectedNodeIds.add(selectedNode.id);
    
    // Add all nodes that have links with the selected node
    processedLinks.forEach(link => {
        if (link.source.id === selectedNode.id) {
            connectedNodeIds.add(link.target.id);
        } else if (link.target.id === selectedNode.id) {
            connectedNodeIds.add(link.source.id);
        }
    });
    
    // Dim all nodes that are not connected
    d3.selectAll(".node").classed("dimmed", d => !connectedNodeIds.has(d.id));
    
    // Highlight the selected node
    d3.selectAll(".node").classed("highlighted", d => d.id === selectedNode.id);
    
    // Dim all links that are not connected to the selected node
    d3.selectAll(".link").classed("dimmed", d => 
        d.source.id !== selectedNode.id && d.target.id !== selectedNode.id
    );
    
    // Highlight links connected to the selected node
    d3.selectAll(".link").classed("connected-link", d => 
        d.source.id === selectedNode.id || d.target.id === selectedNode.id
    );
}

/**
 * Update the paths for links based on current curvature setting
 */
function updateLinkPaths() {
    // Update curved link paths based on current curvature value
    d3.selectAll(".link").attr("d", function(d) {
        const curveFactor = curvature / 200; // Scale down to reasonable values
        const dx = d.target.x - d.source.x;
        const dy = d.target.y - d.source.y;
        const dr = Math.sqrt(dx * dx + dy * dy) / (curveFactor || 0.001);
        return `M${d.source.x},${d.source.y}A${dr},${dr} 0 0,1 ${d.target.x},${d.target.y}`;
    });
}

/**
 * Reset zoom to initial state
 */
function resetZoom() {
    svg.transition().duration(750).call(
        zoom.transform,
        d3.zoomIdentity
    );
}

/**
 * Fit all nodes in the viewport
 */
function fitAllNodes() {
    if (!nodesData.length) return;
    
    const width = svgElement.clientWidth;
    const height = svgElement.clientHeight;
    
    // Get current node positions from simulation
    const positions = nodesData.map(d => [d.x || 0, d.y || 0]);
    
    // Calculate bounds
    const bounds = getBounds(positions);
    const dx = bounds.xMax - bounds.xMin;
    const dy = bounds.yMax - bounds.yMin;
    const x = (bounds.xMin + bounds.xMax) / 2;
    const y = (bounds.yMin + bounds.yMax) / 2;
    
    // Calculate scale to fit all nodes with padding
    const scale = 0.85 / Math.max(dx / width, dy / height); // Reduced for more padding
    const translate = [width / 2 - scale * x, (height / 2 - scale * y) - (height * 0.05)]; // Shift slightly upward
    
    // Apply transformation
    svg.transition().duration(750).call(
        zoom.transform,
        d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
    );
}

/**
 * Get boundaries of node positions
 */
function getBounds(positions) {
    return {
        xMin: d3.min(positions, d => d[0]),
        xMax: d3.max(positions, d => d[0]),
        yMin: d3.min(positions, d => d[1]),
        yMax: d3.max(positions, d => d[1])
    };
}

/**
 * Populate the style dropdown with options
 */
function populateStyleDropdown(nodes) {
    // Clear existing options (except the first one)
    while (styleSelect.options.length > 1) {
        styleSelect.remove(1);
    }
    
    // First add major styles
    const majorStyleOptions = basicMajorStyles.filter(style => 
        nodes.some(node => node.name === style)
    ).sort();
    
    majorStyleOptions.forEach(styleName => {
        const option = document.createElement("option");
        option.value = styleName;
        option.textContent = styleName + " ★"; // Add star to indicate major style
        styleSelect.appendChild(option);
    });
    
    // Add separator
    const separatorOption = document.createElement("option");
    separatorOption.disabled = true;
    separatorOption.className = "dropdown-separator";
    separatorOption.textContent = "------------------------";
    styleSelect.appendChild(separatorOption);
    
    // Add other styles (not in major styles list)
    const otherStyles = nodes
        .filter(node => !basicMajorStyles.includes(node.name))
        .map(node => node.name)
        .sort();
    
    otherStyles.forEach(styleName => {
        const option = document.createElement("option");
        option.value = styleName;
        option.textContent = styleName;
        styleSelect.appendChild(option);
    });
}

/**
 * Fetch data for the current year and render the visualization
 */
function fetchDataAndRender() {
    isLoading = true;
    errorMessage.style.display = "none";
    d3.select(".loading").style("display", "block");
    linkContainer.selectAll("*").remove();
    nodeContainer.selectAll("*").remove();
    
    // Reset style filter
    selectedStyle = "";
    styleSelect.value = "";
    
    // Load nodes and edges data from CSV files
    Promise.all([
        d3.csv(`${dataPath}/nodes_${currentYear}.csv`),
        d3.csv(`${dataPath}/edges_${currentYear}.csv`)
    ])
    .then(([nodes, links]) => {
        // Process nodes data
        nodesData = nodes.map(d => ({
            id: +d.id,
            name: d.name,
            total_weight: +d.total_weight,
            size: +d.size || Math.sqrt(+d.total_weight) * 0.3,
            isMajorStyle: basicMajorStyles.includes(d.name)
        }));
        
        // Process links data
        linksData = links.map(d => ({
            source: +d.source_id,
            target: +d.target_id,
            weight: +d.weight,
            width: +d.width || Math.sqrt(+d.weight) * 0.2
        }));
        
        renderVisualization();
        isLoading = false;
        d3.select(".loading").style("display", "none");
    })
    .catch(error => {
        console.error("Error loading data:", error);
        isLoading = false;
        d3.select(".loading").style("display", "none");
        errorMessage.textContent = `Error loading data for year ${currentYear}. Make sure the files nodes_${currentYear}.csv and edges_${currentYear}.csv exist in the "data" directory.`;
        errorMessage.style.display = "block";
    });
}

/**
 * Render the visualization with the loaded data
 */
function renderVisualization() {
    if (!nodesData.length || !linksData.length) {
        errorMessage.textContent = "No data available for the selected year.";
        errorMessage.style.display = "block";
        return;
    }
    
    const width = svgElement.clientWidth;
    const height = svgElement.clientHeight;
    
    // Filter to top nodes if specified
    filteredNodes = [...nodesData];
    if (topNodesCount < filteredNodes.length) {
        filteredNodes.sort((a, b) => b.total_weight - a.total_weight);
        filteredNodes = filteredNodes.slice(0, topNodesCount);
        const nodeIds = new Set(filteredNodes.map(d => d.id));
        
        // Filter links to only include connections between top nodes
        linksData = linksData.filter(d => 
            nodeIds.has(d.source) && nodeIds.has(d.target)
        );
    }
    
    // Populate style dropdown
    populateStyleDropdown(filteredNodes);
    
    // Create a map of node IDs to nodes
    const nodeMap = {};
    filteredNodes.forEach(node => {
        nodeMap[node.id] = node;
    });
    
    // Update link sources and targets to reference actual node objects
    processedLinks = linksData.map(link => {
        return {
            source: nodeMap[link.source],
            target: nodeMap[link.target],
            weight: link.weight,
            width: link.width
        };
    }).filter(link => link.source && link.target); // Filter out any links with missing nodes
    
    // Create simulation with collision detection to prevent overlap
    simulation = d3.forceSimulation(filteredNodes)
        .force("link", d3.forceLink(processedLinks).id(d => d.id).distance(100))
        .force("charge", d3.forceManyBody().strength(-300 * (nodeSpacing / 50)))
        .force("center", d3.forceCenter(width / 2, height / 2.5)) // Move higher in the container
        .force("collision", d3.forceCollide().radius(d => d.size * 1.2 * (nodeSpacing / 50)))
        .alphaDecay(0.01 * (stickiness / 50));
    
    // Create a color scale for nodes
    const colorScale = d3.scaleSequential(d3.interpolateBlues)
        .domain([
            d3.min(filteredNodes, d => d.total_weight), 
            d3.max(filteredNodes, d => d.total_weight)
        ]);
    
    // Create a marker for the arrow head
    const defs = svg.select("defs");
    if (defs.empty()) {
        svg.append("defs").selectAll("marker")
            .data(["arrow"])
            .enter().append("marker")
            .attr("id", d => d)
            .attr("viewBox", "0 -5 10 10")
            .attr("refX", 25)
            .attr("refY", 0)
            .attr("markerWidth", 6)
            .attr("markerHeight", 6)
            .attr("orient", "auto")
            .append("path")
            .attr("class", "arrow")
            .attr("d", "M0,-5L10,0L0,5");
    }
    
    // Draw links as curved paths
    const link = linkContainer.selectAll(".link")
        .data(processedLinks)
        .enter().append("path")
        .attr("class", "link")
        .attr("marker-end", "url(#arrow)")
        .style("stroke", "#5b92e5")
        .style("stroke-width", d => d.width)
        .on("mouseover", function(event, d) {
            tooltip.style("display", "block")
                .html(`
                    <strong>From:</strong> ${d.source.name}<br>
                    <strong>To:</strong> ${d.target.name}<br>
                    <strong>Strength:</strong> ${d.weight}
                `)
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 20) + "px");
        })
        .on("mouseout", function() {
            tooltip.style("display", "none");
        });
    
    // Draw nodes
    const node = nodeContainer.selectAll(".node")
        .data(filteredNodes)
        .enter().append("g")
        .attr("class", d => "node" + (d.isMajorStyle ? " major-style" : ""))
        .call(d3.drag()
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended))
        .on("click", function(event, d) {
            // When a node is clicked, update the style filter to that node
            styleSelect.value = d.name;
            selectedStyle = d.name;
            applyStyleFilter();
        });
            
    // Add circles to nodes
    node.append("circle")
        .attr("r", d => d.size)
        .style("fill", d => colorScale(d.total_weight))
        .on("mouseover", function(event, d) {
            const isMajor = d.isMajorStyle ? " (Major Style)" : "";
            tooltip.style("display", "block")
                .html(`
                    <strong>${d.name}</strong>${isMajor}<br>
                    Weight: ${d.total_weight}
                `)
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 20) + "px");
        })
        .on("mouseout", function() {
            tooltip.style("display", "none");
        });
            
    // Add labels to nodes
    node.append("text")
        .attr("dy", d => -d.size - 5)
        .text(d => d.name)
        .style("font-size", d => Math.min(2 * d.size / 3, 16) + "px");
    
    // Update positions on each simulation tick
    simulation.on("tick", () => {
        // Update link paths
        link.attr("d", function(d) {
            const curveFactor = curvature / 200; // Scale down to reasonable values
            const dx = d.target.x - d.source.x;
            const dy = d.target.y - d.source.y;
            const dr = Math.sqrt(dx * dx + dy * dy) / (curveFactor || 0.001);
            return `M${d.source.x},${d.source.y}A${dr},${dr} 0 0,1 ${d.target.x},${d.target.y}`;
        });
        
        // Update node positions
        node.attr("transform", d => `translate(${d.x},${d.y})`);
        
        // Keep nodes within bounds
        filteredNodes.forEach(d => {
            const r = d.size || 10;
            d.x = Math.max(r, Math.min(width - r, d.x));
            d.y = Math.max(r, Math.min(height - r, d.y));
        });
    });
    
    // Fit all nodes after initial layout
    setTimeout(fitAllNodes, 100);
    
    // Drag event handlers
    function dragstarted(event, d) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
    }
    
    function dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
    }
    
    function dragended(event, d) {
        if (!event.active) simulation.alphaTarget(0);
        // Keep node position fixed for a bit
        setTimeout(() => {
            if (d.fx === event.x && d.fy === event.y) {
                d.fx = null;
                d.fy = null;
            }
        }, 2000);
    }
}