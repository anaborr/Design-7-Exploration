const { useState, useEffect, useRef } = React;

const TYPOLOGIES = [
    { id: 'type1', name: 'Fluid Shell', image: 'typology_1.jpg' },
    { id: 'type2', name: 'Skeletal Branch', image: 'typology_2.jpg' },
    { id: 'type3', name: 'Continuous Layers', image: 'typology_3.jpg' }
];

const INITIAL_METRICS = {
    porosity: 45,
    rhythm: 60,
    connectivity: 55,
    layered: 40,
    focalization: 70,
    intimacy: 50
};

function App() {
    const [domainA, setDomainA] = useState({ whiplash: 30, continuity: 40 });
    const [domainB, setDomainB] = useState('type1');
    const [isGenerating, setIsGenerating] = useState(false);
    const [metrics, setMetrics] = useState(INITIAL_METRICS);
    const [generatedImage, setGeneratedImage] = useState(TYPOLOGIES[0].image);

    const canvasRef = useRef(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [activeTool, setActiveTool] = useState('pen'); // pen, eraser

    // Handle Generation
    const handleFineTune = () => {
        setIsGenerating(true);
        // Simulate network processing
        setTimeout(() => {
            const selectedTypology = TYPOLOGIES.find(t => t.id === domainB);
            setGeneratedImage(selectedTypology.image);
            
            // Calculate new metrics based on Domain A sliders
            setMetrics({
                porosity: Math.min(100, Math.max(10, domainA.continuity * 1.2)),
                rhythm: Math.min(100, Math.max(10, domainA.whiplash * 1.1 + 20)),
                connectivity: Math.min(100, Math.max(10, domainA.continuity * 1.3)),
                layered: Math.min(100, Math.max(10, domainA.continuity * 0.8 + domainA.whiplash * 0.5)),
                focalization: Math.min(100, Math.max(10, domainA.whiplash * 1.5)),
                intimacy: Math.min(100, Math.max(10, 100 - domainA.porosity * 0.5)) // Inverse relation example
            });

            // Clear Canvas
            if (canvasRef.current) {
                const ctx = canvasRef.current.getContext('2d');
                ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            }

            setIsGenerating(false);
        }, 2500);
    };

    // Canvas Sketching Logic
    const startDrawing = (e) => {
        const { offsetX, offsetY } = e.nativeEvent;
        const ctx = canvasRef.current.getContext('2d');
        ctx.beginPath();
        ctx.moveTo(offsetX, offsetY);
        setIsDrawing(true);
    };

    const draw = (e) => {
        if (!isDrawing) return;
        const { offsetX, offsetY } = e.nativeEvent;
        const ctx = canvasRef.current.getContext('2d');
        
        ctx.lineWidth = activeTool === 'eraser' ? 20 : 2;
        ctx.lineCap = 'round';
        ctx.strokeStyle = activeTool === 'eraser' ? 'rgba(0,0,0,1)' : '#00f0ff'; // Note: true erase requires globalCompositeOperation
        
        if (activeTool === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
        } else {
            ctx.globalCompositeOperation = 'source-over';
        }

        ctx.lineTo(offsetX, offsetY);
        ctx.stroke();
    };

    const stopDrawing = () => {
        setIsDrawing(false);
    };

    return (
        <div className="app-container">
            {/* Left Panel: Neural Controls */}
            <div className="glass-panel">
                <h1>Neural Setup</h1>
                
                <h2>Domain A: Art Nouveau</h2>
                <div className="slider-group">
                    <div className="slider-header">
                        <span>Whiplash Curve</span>
                        <span className="value">{domainA.whiplash}%</span>
                    </div>
                    <input 
                        type="range" min="0" max="100" value={domainA.whiplash}
                        onChange={(e) => setDomainA({...domainA, whiplash: parseInt(e.target.value)})} 
                    />
                </div>

                <div className="slider-group">
                    <div className="slider-header">
                        <span>Continuity</span>
                        <span className="value">{domainA.continuity}%</span>
                    </div>
                    <input 
                        type="range" min="0" max="100" value={domainA.continuity}
                        onChange={(e) => setDomainA({...domainA, continuity: parseInt(e.target.value)})} 
                    />
                </div>

                <h2 style={{marginTop: '32px'}}>Domain B: Typologies</h2>
                <div className="typologies-grid">
                    {TYPOLOGIES.map(type => (
                        <div 
                            key={type.id} 
                            className={`typology-card ${domainB === type.id ? 'active' : ''}`}
                            onClick={() => setDomainB(type.id)}
                        >
                            <img src={type.image} alt={type.name} />
                            <div className="typology-label">{type.name}</div>
                        </div>
                    ))}
                </div>

                <button 
                    className={`btn-primary ${isGenerating ? 'animating' : ''}`} 
                    onClick={handleFineTune}
                    disabled={isGenerating}
                    style={{marginTop: '24px'}}
                >
                    {isGenerating ? 'Finetuning...' : 'Finetune & Generate'}
                </button>
            </div>

            {/* Center Panel: Viewport */}
            <div className="viewport-container">
                <div className="glass-panel" style={{height: '100%', display: 'flex', flexDirection: 'column'}}>
                    <div className="canvas-wrapper">
                        {/* Overlay Simulation Loading */}
                        <div className={`network-overlay ${isGenerating ? 'active' : ''}`}>
                            <div className="spinner"></div>
                            <div className="network-text">Optimizing Spatial Weights...</div>
                            <div className="network-text" style={{opacity: 0.5, marginTop: '8px', fontSize: '0.75rem'}}>Confining to 8000 ft³ volume</div>
                        </div>
                        
                        <img src={generatedImage} className="canvas-bg" alt="Generated Variation" />
                        <canvas 
                            id="sketch-canvas" 
                            ref={canvasRef}
                            width={800} 
                            height={600}
                            onMouseDown={startDrawing}
                            onMouseMove={draw}
                            onMouseUp={stopDrawing}
                            onMouseLeave={stopDrawing}
                        />
                    </div>
                    
                    <div className="toolbar">
                        <button 
                            className={`tool-btn ${activeTool === 'pen' ? 'active' : ''}`}
                            onClick={() => setActiveTool('pen')}
                        >
                            <span style={{marginRight: '6px'}}>✏️</span> Pen
                        </button>
                        <button 
                            className={`tool-btn ${activeTool === 'eraser' ? 'active' : ''}`}
                            onClick={() => setActiveTool('eraser')}
                        >
                            <span style={{marginRight: '6px'}}>🧼</span> Eraser
                        </button>
                        <button 
                            className="tool-btn"
                            onClick={() => {
                                const ctx = canvasRef.current.getContext('2d');
                                ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                            }}
                        >
                            🗑️ Clear Sketch
                        </button>
                    </div>
                </div>
            </div>

            {/* Right Panel: Evaluation */}
            <div className="glass-panel">
                <h2>Spatial Evaluation</h2>
                <div className="volume-check">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>
                    Volume Confined: 8000 ft³
                </div>

                <div className="eval-grid">
                    {Object.entries(metrics).map(([key, value]) => (
                        <div className="eval-item" key={key}>
                            <div className="eval-header">
                                <span style={{textTransform: 'capitalize', color: '#a0aec0'}}>{key}</span>
                                <span style={{color: '#00f0ff', fontFamily: 'monospace'}}>{Math.round(value)}</span>
                            </div>
                            <div className="eval-bar-bg">
                                <div className="eval-bar-fill" style={{width: `${value}%`}}></div>
                            </div>
                        </div>
                    ))}
                </div>
                
                <div style={{marginTop: '32px'}}>
                    <h3 style={{fontSize: '0.9rem', color: '#8892b0', marginBottom: '12px'}}>Target Adherence</h3>
                    <RadarChart metrics={metrics} />
                </div>
            </div>
        </div>
    );
}

// Separate component for Radar Chart to isolate DOM manipulation (Chart.js)
function RadarChart({ metrics }) {
    const canvasRef = useRef(null);
    const chartRef = useRef(null);

    useEffect(() => {
        if (!canvasRef.current) return;

        const ctx = canvasRef.current.getContext('2d');
        
        if (chartRef.current) {
            chartRef.current.destroy();
        }

        const data = {
            labels: ['Porosity', 'Rhythm', 'Connectivity', 'Layered', 'Focalization', 'Intimacy'],
            datasets: [{
                label: 'Variation DNA',
                data: [metrics.porosity, metrics.rhythm, metrics.connectivity, metrics.layered, metrics.focalization, metrics.intimacy],
                backgroundColor: 'rgba(0, 240, 255, 0.2)',
                borderColor: 'rgba(0, 240, 255, 1)',
                pointBackgroundColor: 'rgba(255, 0, 85, 1)',
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: 'rgba(255, 0, 85, 1)'
            }]
        };

        const config = {
            type: 'radar',
            data: data,
            options: {
                responsive: true,
                scales: {
                    r: {
                        angleLines: { color: 'rgba(255, 255, 255, 0.1)' },
                        grid: { color: 'rgba(255, 255, 255, 0.1)' },
                        pointLabels: { color: '#8892b0', font: { family: 'Inter', size: 10 } },
                        ticks: { display: false, max: 100, min: 0 }
                    }
                },
                plugins: { legend: { display: false } }
            }
        };

        chartRef.current = new Chart(ctx, config);

        return () => {
            if (chartRef.current) {
                chartRef.current.destroy();
            }
        }
    }, [metrics]);

    return (
        <div style={{width: '100%', aspectRatio: '1/1'}}>
            <canvas ref={canvasRef}></canvas>
        </div>
    );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
