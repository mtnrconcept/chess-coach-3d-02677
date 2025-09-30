import { useMemo } from 'react';

type GroupProps = JSX.IntrinsicElements['group'];

function filterThreeProps(props: GroupProps): GroupProps {
  const filteredEntries = Object.entries(props).filter(([key]) => {
    return !key.startsWith('data-') && !key.startsWith('aria-');
  });

  return Object.fromEntries(filteredEntries) as GroupProps;
}

export function FbxChessSet({ children, ...rest }: GroupProps) {
  // Create a simple decorative table/platform for the chess board
  const platform = useMemo(() => {
    return (
      <group>
        {/* Main platform */}
        <mesh position={[0, -1, 0]} castShadow receiveShadow>
          <boxGeometry args={[12, 0.8, 12]} />
          <meshLambertMaterial color="#4a3c2a" />
        </mesh>
        
        {/* Decorative legs */}
        <mesh position={[-4, -2, -4]} castShadow receiveShadow>
          <boxGeometry args={[0.8, 2, 0.8]} />
          <meshLambertMaterial color="#3a2c1a" />
        </mesh>
        <mesh position={[4, -2, -4]} castShadow receiveShadow>
          <boxGeometry args={[0.8, 2, 0.8]} />
          <meshLambertMaterial color="#3a2c1a" />
        </mesh>
        <mesh position={[-4, -2, 4]} castShadow receiveShadow>
          <boxGeometry args={[0.8, 2, 0.8]} />
          <meshLambertMaterial color="#3a2c1a" />
        </mesh>
        <mesh position={[4, -2, 4]} castShadow receiveShadow>
          <boxGeometry args={[0.8, 2, 0.8]} />
          <meshLambertMaterial color="#3a2c1a" />
        </mesh>
        
        {/* Decorative border */}
        <mesh position={[0, -0.4, 0]} castShadow receiveShadow>
          <boxGeometry args={[10.5, 0.2, 10.5]} />
          <meshLambertMaterial color="#6b5b3f" />
        </mesh>
      </group>
    );
  }, []);

  const groupProps = useMemo(() => filterThreeProps(rest), [rest]);

  return (
    <group {...groupProps}>
      {platform}
      {children}
    </group>
  );
}
