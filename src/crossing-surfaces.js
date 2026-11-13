import * as THREE from '../vendor/three/three.module.min.js';

// All door/window veils share a draw, with per-instance tint, opacity and pick ID.
// Flat transparent planes need only one pass even when visible from either side.
export function flushCrossingSurfaces(world, groundTexture) {
  const portals=world.portalSurfaces;
  if(portals.length){
    const geometry=new THREE.PlaneGeometry(2.8,3);
    geometry.setAttribute('veilOpacity',new THREE.InstancedBufferAttribute(new Float32Array(portals.map(p=>p.opacity)),1));
    const material=new THREE.ShaderMaterial({
      transparent:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,
      uniforms:{time:{value:0}},
      vertexShader:`attribute float veilOpacity; varying vec2 vUv; varying vec3 vTint; varying float vOpacity;
        void main(){vUv=uv;vTint=instanceColor;vOpacity=veilOpacity;
        gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
      fragmentShader:`varying vec2 vUv; varying vec3 vTint; varying float vOpacity; uniform float time;
        void main(){float rim=pow(abs(vUv.x-.5)*2.,9.);
        float line=pow(.5+.5*sin(vUv.y*36.-time*.65),18.);float center=(1.-vUv.y)*.13;
        gl_FragColor=vec4(vTint*(.22+rim*2.8+line*.12),vOpacity+rim*.4+center);}`
    });
    const mesh=new THREE.InstancedMesh(geometry,material,portals.length),pose=new THREE.Object3D();
    mesh.name='Shared crossing veils';mesh.userData.ids=portals.map(p=>'edge:'+p.id);
    portals.forEach((p,i)=>{pose.position.set(p.x,1.55,p.z);pose.rotation.set(0,p.rotation,0);pose.updateMatrix();mesh.setMatrixAt(i,pose.matrix);mesh.setColorAt(i,new THREE.Color(p.tint));});
    mesh.computeBoundingSphere();world.scene.add(mesh);world.pickables.push(mesh);
    world.dynamicResources.push(geometry,material);world.animated.push({type:'portal',object:mesh});
  }
  // Preserve the authored gradients and stone texture, merging their static vertices.
  if(world.groundBands.length){
    const geometry=new THREE.BufferGeometry();
    for(const [name,size] of [['position',3],['normal',3],['uv',2],['color',3]]){
      const arrays=world.groundBands.map(g=>g.attributes[name].array);
      const data=new Float32Array(arrays.reduce((n,a)=>n+a.length,0));let offset=0;
      for(const array of arrays){data.set(array,offset);offset+=array.length;}
      geometry.setAttribute(name,new THREE.BufferAttribute(data,size));
    }
    const material=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.96,map:groundTexture});
    const mesh=new THREE.Mesh(geometry,material);mesh.name='Shared seamless ground';mesh.receiveShadow=true;
    world.scene.add(mesh);world.dynamicResources.push(geometry,material);
    for(const band of world.groundBands)band.dispose();
  }
  world.portalSurfaces=[];world.groundBands=[];
}
