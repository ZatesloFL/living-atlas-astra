import * as THREE from '../vendor/three/three.module.min.js';

// Static luminous fixtures keep their individual surface and emission colors.
// Animated helpers, lab nodes and the waypoint retain their separate instance batches.
export function flushGlowBatch(world,batches,geometries,materials){
  if(!batches.length)return;
  const positions=[],normals=[],colors=[],emission=[],roughness=[],ids=[];
  const pose=new THREE.Object3D(),color=new THREE.Color();
  for(const batch of batches){
    const source=geometries[batch.shape],base=source.index?source.toNonIndexed():source;
    const material=materials[batch.mat],glow=material.emissive.clone().multiplyScalar(material.emissiveIntensity);
    for(const item of batch.items){
      pose.position.set(item.x,item.y,item.z);pose.rotation.set(...item.rotation);pose.scale.set(item.sx,item.sy,item.sz);pose.updateMatrix();
      const geometry=base.clone().applyMatrix4(pose.matrix),p=geometry.attributes.position,n=geometry.attributes.normal;
      color.set(item.color).multiply(material.color);
      for(let i=0;i<p.count;i++){
        positions.push(p.getX(i),p.getY(i),p.getZ(i));normals.push(n.getX(i),n.getY(i),n.getZ(i));
        colors.push(color.r,color.g,color.b);emission.push(glow.r,glow.g,glow.b);roughness.push(material.roughness);
        if(i%3===0)ids.push(item.id);
      }
      geometry.dispose();
    }
    if(base!==source)base.dispose();
  }
  const geometry=new THREE.BufferGeometry();
  for(const [name,data,size] of [['position',positions,3],['normal',normals,3],['color',colors,3],['emission',emission,3],['surfaceRoughness',roughness,1]])geometry.setAttribute(name,new THREE.Float32BufferAttribute(data,size));
  const material=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,emissive:0xffffff,roughness:.4});
  material.onBeforeCompile=shader=>{
    shader.vertexShader='attribute vec3 emission; attribute float surfaceRoughness; varying vec3 vEmission; varying float vSurfaceRoughness;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvEmission=emission;vSurfaceRoughness=surfaceRoughness;');
    shader.fragmentShader='varying vec3 vEmission; varying float vSurfaceRoughness;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance=vEmission;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=vSurfaceRoughness;');
  };
  material.customProgramCacheKey=()=> 'atlas-static-glow-v1';
  const mesh=new THREE.Mesh(geometry,material);mesh.name='Shared luminous fixtures';mesh.userData.faceIds=ids;
  world.scene.add(mesh);world.pickables.push(mesh);world.dynamicResources.push(geometry,material);
}
