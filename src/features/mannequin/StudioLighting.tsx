import { Environment, Lightformer } from '@react-three/drei'

/** Soft studio light baked into a small environment map; no HDR download needed. */
export function StudioLighting() {
  return (
    <>
      <hemisphereLight args={['#ffffff', '#d8d0c3', 0.55]} />
      <directionalLight position={[-2.5, 4, 3]} intensity={1.5} />
      <directionalLight position={[3, 2.5, -3]} intensity={0.7} color="#fff6ea" />
      <Environment frames={1} resolution={128}>
        <Lightformer form="rect" intensity={2} position={[0, 4, 1]} rotation-x={Math.PI / 2} scale={[6, 3, 1]} />
        <Lightformer form="rect" intensity={1.2} position={[-4, 1.5, 2]} rotation-y={Math.PI / 2.5} scale={[3, 4, 1]} />
        <Lightformer form="rect" intensity={0.8} position={[4, 1.5, -2]} rotation-y={-Math.PI / 1.6} scale={[3, 4, 1]} />
      </Environment>
    </>
  )
}
