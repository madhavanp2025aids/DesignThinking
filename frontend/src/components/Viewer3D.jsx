import React, { Suspense, useRef, useEffect, useMemo, useState } from 'react';
import { Canvas, useLoader, useThree } from '@react-three/fiber';
import { OrbitControls, Center, Environment, ContactShadows } from '@react-three/drei';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import * as THREE from 'three';

const THEMES = {
  industrial: {
    type: 'standard',
    color: '#0066cc',
    metalness: 0.6,
    roughness: 0.2,
    envMapIntensity: 1.5,
  },
  metal: {
    type: 'standard',
    color: '#b0b5b9',
    metalness: 1.0,
    roughness: 0.15,
    envMapIntensity: 2.0,
  },
  plastic: {
    type: 'standard',
    color: '#e05e1f',
    metalness: 0.1,
    roughness: 0.6,
    envMapIntensity: 0.8,
  },
  glass: {
    type: 'physical',
    color: '#ffffff',
    metalness: 0.1,
    roughness: 0.05,
    transmission: 0.95,
    transparent: true,
    opacity: 1,
    thickness: 2,
    ior: 1.5,
    envMapIntensity: 2.0,
  }
};

function STLModel({ url, theme, wireframe }) {
  const geometry = useLoader(STLLoader, url);
  const meshRef = useRef();

  const materialProps = THEMES[theme] || THEMES.industrial;

  const material = useMemo(() => {
    const props = { ...materialProps, wireframe };
    if (props.type === 'physical') {
      return new THREE.MeshPhysicalMaterial(props);
    }
    return new THREE.MeshStandardMaterial(props);
  }, [materialProps, wireframe]);

  useEffect(() => {
    if (geometry) {
      geometry.computeVertexNormals();
      geometry.center();
    }
  }, [geometry]);

  return (
    <mesh ref={meshRef} geometry={geometry} material={material} castShadow receiveShadow />
  );
}

function AutoCamera({ children, onSizeCalculated }) {
  const { camera } = useThree();
  const groupRef = useRef();

  useEffect(() => {
    if (!groupRef.current) return;
    
    // Only measure the bounding box of the actual model, not the whole scene
    const box = new THREE.Box3().setFromObject(groupRef.current);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    
    // Don't update if empty or infinite
    if (maxDim === 0 || maxDim === -Infinity || maxDim === Infinity) return;

    if (onSizeCalculated) {
      onSizeCalculated({ maxDim, size, minY: box.min.y });
    }

    const fov = camera.fov * (Math.PI / 180);
    const distance = maxDim / (2 * Math.tan(fov / 2)) * 1.8;

    camera.position.set(distance * 0.7, distance * 0.5, distance * 0.7);
    camera.lookAt(0, 0, 0);
    camera.near = 0.1;
    camera.far = distance * 10;
    camera.updateProjectionMatrix();
  }, [camera, children, onSizeCalculated]);

  return <group ref={groupRef}>{children}</group>;
}

function LoadingFallback() {
  return (
    <mesh>
      <boxGeometry args={[50, 50, 50]} />
      <meshStandardMaterial color="#334455" wireframe />
    </mesh>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  
  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <mesh>
          <boxGeometry args={[50, 50, 50]} />
          <meshStandardMaterial color="red" wireframe />
        </mesh>
      );
    }
    return this.props.children;
  }
}

export default function Viewer3D({ meshUrl, onResetView }) {
  const controlsRef = useRef();
  
  const [theme, setTheme] = useState('industrial');
  const [wireframe, setWireframe] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [modelStats, setModelStats] = useState(null);

  const handleReset = () => {
    if (controlsRef.current) {
      controlsRef.current.reset();
      if (modelStats && modelStats.maxDim) {
        const distance = modelStats.maxDim * 1.6;
        controlsRef.current.object.position.set(distance * 0.7, distance * 0.5, distance * 0.7);
        controlsRef.current.target.set(0, 0, 0);
        controlsRef.current.update();
      }
    }
    if (onResetView) onResetView();
  };

  if (!meshUrl) {
    return (
      <div className="viewer-empty">
        <p>No model loaded. Generate a model to view it here.</p>
      </div>
    );
  }

  const floorY = modelStats ? modelStats.minY - (modelStats.maxDim * 0.05) : -50;
  const scale = modelStats ? modelStats.maxDim * 3 : 100;
  const minZoomDist = modelStats ? Math.max(modelStats.maxDim * 0.35, 1.0) : 5.0;
  const maxZoomDist = modelStats ? Math.max(modelStats.maxDim * 8.0, 50.0) : 5000.0;

  return (
    <div className="viewer-container" style={{ position: 'relative' }}>
      <Canvas
        shadows
        camera={{ position: [100, 80, 100], fov: 45 }}
        style={{ background: 'radial-gradient(circle at center, #2a2d38 0%, #1a1d23 100%)' }}
      >
        <ambientLight intensity={0.5} />
        <directionalLight
          position={[50, 80, 50]}
          intensity={1.5}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-bias={-0.0001}
        />
        <directionalLight position={[-30, 40, -30]} intensity={0.8} />
        <pointLight position={[0, 100, 0]} intensity={0.5} />

        <ErrorBoundary>
          <Suspense fallback={<LoadingFallback />}>
            <Center>
              <AutoCamera onSizeCalculated={setModelStats}>
                <STLModel url={meshUrl} theme={theme} wireframe={wireframe} />
              </AutoCamera>
            </Center>
          </Suspense>
        </ErrorBoundary>

        <OrbitControls
          ref={controlsRef}
          enableRotate={true}
          enableZoom={true}
          enablePan={true}
          enableDamping={true}
          dampingFactor={0.08}
          autoRotate={autoRotate}
          autoRotateSpeed={1.5}
          minDistance={minZoomDist}
          maxDistance={maxZoomDist}
          touches={{
            ONE: THREE.TOUCH.ROTATE,
            TWO: THREE.TOUCH.DOLLY_PAN,
          }}
          makeDefault
        />

        {showGrid && (
          <gridHelper 
            args={[scale * 2, 50, '#3a3d43', '#2a2d33']} 
            position={[0, floorY, 0]} 
          />
        )}
      </Canvas>

      {/* Floating Control Panel */}
      <div className="viewer-toolbar">
        <div className="toolbar-section">
          <label className="toolbar-label">Material</label>
          <select 
            className="toolbar-select" 
            value={theme} 
            onChange={e => setTheme(e.target.value)}
          >
            <option value="industrial">Industrial Blue</option>
            <option value="metal">Brushed Metal</option>
            <option value="plastic">Matte Plastic</option>
            <option value="glass">Glass</option>
          </select>
        </div>
        
        <div className="toolbar-divider" />
        
        <div className="toolbar-section toolbar-toggles">
          <label className="toolbar-checkbox">
            <input 
              type="checkbox" 
              checked={wireframe} 
              onChange={e => setWireframe(e.target.checked)} 
            />
            Wireframe
          </label>
          <label className="toolbar-checkbox">
            <input 
              type="checkbox" 
              checked={autoRotate} 
              onChange={e => setAutoRotate(e.target.checked)} 
            />
            Auto-Rotate
          </label>
          <label className="toolbar-checkbox">
            <input 
              type="checkbox" 
              checked={showGrid} 
              onChange={e => setShowGrid(e.target.checked)} 
            />
            Show Grid
          </label>
        </div>
        
        <div className="toolbar-divider" />

        <button className="btn-viewer toolbar-btn" onClick={handleReset} title="Reset camera view">
          ↺ Reset View
        </button>
      </div>
    </div>
  );
}

