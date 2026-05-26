import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import {
  Bloom,
  EffectComposer,
  ToneMapping,
} from "@react-three/postprocessing";
import { Floor } from "./Floor";
import { Lights } from "./Lights";
import { Rain } from "./Rain";
import { useMakeRain } from "./useMakeRain";

console.log("test")

export default function App() {
  const [rainProgressRef, onRainStart, rainStarted] = useMakeRain();

  return (
    <>
      <Canvas
        shadows={false}
        gl={{
          antialias: false,
        }}
        style={{
          filter: "contrast(1.2) saturate(1.1) brightness(1.1)",
        }}
        raycaster={null}
      >
        <OrbitControls
          makeDefault
          autoRotate={rainStarted}
          autoRotateSpeed={-0.25}
        />
        <PerspectiveCamera
          position={[
            0.713725247365501, 0.3394033648663526, 0.32126638003592926,
          ]}
          makeDefault
        />

        <Lights rainEnabled={rainStarted} />
        <Rain rainProgressRef={rainProgressRef}>
          <Floor rainProgressRef={rainProgressRef} />
        </Rain>

        <EffectComposer multisampling={0}>
          <Bloom
            luminanceThreshold={1}
            mipmapBlur
            luminanceSmoothing={0.0}
            intensity={0.05}
          />
          <ToneMapping />
        </EffectComposer>
      </Canvas>

      {/* Grading */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          zIndex: 1,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          background:
            "radial-gradient(circle at center, rgba(0, 0, 0, 0) 50%,  rgba(0, 0, 0, 1) 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          zIndex: 1,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          background:
            "linear-gradient(to bottom, rgba(0, 0, 0, 0) 50%, rgba(0, 0, 255, 0.2) 100%)",
          mixBlendMode: "overlay",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          zIndex: 1,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          background:
            "linear-gradient(to top, rgba(0, 0, 0, 0) 40%, rgba(255, 222, 165, 0.2) 100%)",
        }}
      />

      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          zIndex: 1000,
          transform: "translate(-50%, -50%)",
          color: "white",
          fontSize: "1rem",
          textAlign: "center",
          pointerEvents: "none",
        }}
      >
        {!rainStarted && (
          <>
            <button
              style={{
                padding: "0.5rem 1rem",
                fontSize: "1rem",
                backgroundColor: "white",
                color: "#121212",
                border: "none",
                borderRadius: "0.25rem",
                cursor: "pointer",
                pointerEvents: "auto",
              }}
              onClick={onRainStart}
            >
              Click to Start!
            </button>
            <p
              style={{
                marginTop: "0.5rem",
                fontSize: "0.8rem",
                color: "rgba(255, 255, 255, 0.7)",
              }}
            >
              Best with sound
            </p>
          </>
        )}
      </div>
    </>
  );
}
