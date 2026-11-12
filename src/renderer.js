import * as THREE from '../vendor/three/three.module.min.js';
// Four inexpensive full-screen draws: bright extraction, two blur directions, composite.
// Bloom works in linear HDR and is tone mapped once, after composition.
export class Renderer {
  constructor(canvas) {
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:false,alpha:false,powerPreference:'high-performance'});
    this.renderer.shadowMap.enabled=true;
    this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate=false;
    this.renderer.info.autoReset=false;
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.ratio=Math.min(window.devicePixelRatio||1,1.65,2);
    this.maxRatio=this.ratio;
    this.target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:true});
    this.bloomA=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:false});
    this.bloomB=this.bloomA.clone();
    this.scene=new THREE.Scene();
    this.camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    const vertexShader='varying vec2 uv0; void main(){ uv0=uv; gl_Position=vec4(position.xy,0.,1.); }';
    const make=(uniforms,fragmentShader)=>new THREE.ShaderMaterial({uniforms,vertexShader,fragmentShader,depthTest:false,depthWrite:false});
    this.bright=make({inputTex:{value:this.target.texture}},`
      varying vec2 uv0; uniform sampler2D inputTex;
      void main(){ vec3 c=texture2D(inputTex,uv0).rgb; float l=max(max(c.r,c.g),c.b); gl_FragColor=vec4(c*smoothstep(1.35,3.8,l),1.); }`);
    this.blur=make({inputTex:{value:null},direction:{value:new THREE.Vector2()}},`
      varying vec2 uv0; uniform sampler2D inputTex; uniform vec2 direction;
      void main(){ vec3 c=texture2D(inputTex,uv0).rgb*.227027;
        c+=texture2D(inputTex,uv0+direction*1.384615).rgb*.316216;
        c+=texture2D(inputTex,uv0-direction*1.384615).rgb*.316216;
        c+=texture2D(inputTex,uv0+direction*3.230769).rgb*.070270;
        c+=texture2D(inputTex,uv0-direction*3.230769).rgb*.070270;
        gl_FragColor=vec4(c,1.); }`);
    this.final=make({sceneTex:{value:this.target.texture},bloomTex:{value:this.bloomA.texture},fade:{value:0}},`
      varying vec2 uv0; uniform sampler2D sceneTex,bloomTex; uniform float fade;
      void main(){ vec3 c=texture2D(sceneTex,uv0).rgb+texture2D(bloomTex,uv0).rgb*.38;
        c=clamp((c*(2.51*c+.03))/(c*(2.43*c+.59)+.14),0.,1.);
        float v=1.-.22*pow(length((uv0-.5)*1.35),2.); c*=v;
        c=pow(c,vec3(1./2.2)); c=mix(c,vec3(.034,.055,.078),fade);
        c+=(fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-.5)/255.;
        gl_FragColor=vec4(c,1.); }`);
    this.quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.final);this.scene.add(this.quad);
    this.resize();
  }
  resize(){
    const w=window.innerWidth,h=window.innerHeight;
    this.renderer.setPixelRatio(this.ratio); this.renderer.setSize(w,h,false);
    this.target.setSize(Math.round(w*this.ratio),Math.round(h*this.ratio));
    this.bloomA.setSize(Math.max(1,Math.round(w*this.ratio/4)),Math.max(1,Math.round(h*this.ratio/4)));
    this.bloomB.setSize(this.bloomA.width,this.bloomA.height);
  }
  render(scene,camera,fade=0){
    const r=this.renderer;r.info.reset();
    r.setRenderTarget(this.target);r.render(scene,camera);
    this.quad.material=this.bright;r.setRenderTarget(this.bloomA);r.render(this.scene,this.camera);
    this.quad.material=this.blur;this.blur.uniforms.inputTex.value=this.bloomA.texture;
    this.blur.uniforms.direction.value.set(1.5/this.bloomA.width,0);r.setRenderTarget(this.bloomB);r.render(this.scene,this.camera);
    this.blur.uniforms.inputTex.value=this.bloomB.texture;this.blur.uniforms.direction.value.set(0,1.5/this.bloomA.height);
    r.setRenderTarget(this.bloomA);r.render(this.scene,this.camera);
    this.quad.material=this.final;this.final.uniforms.fade.value=fade;r.setRenderTarget(null);r.render(this.scene,this.camera);
    this.calls=r.info.render.calls;
  }
  adjust(fps){
    // Change only after a sustained low-FPS window. Never change resolution every frame.
    if(fps<48&&this.ratio>0.85){this.ratio=Math.max(.85,this.ratio-.15);this.resize();}
  }
}
