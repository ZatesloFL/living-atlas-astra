import * as THREE from '../vendor/three/three.module.min.js';
export const RENDER_MODES=['hdr','ldr','direct','unshadowed'];
export class Renderer {
  constructor(canvas,{diagnostics,safe=false}={}) {
    this.diagnostics=diagnostics;this.safe=safe;this.mode=safe?'unshadowed':'hdr';this.post=[];this.calls=0;this.validateNext=true;
    const attrs={antialias:false,alpha:false,powerPreference:'high-performance'};
    let context;
    try{context=canvas.getContext('webgl2',attrs);}catch(error){if(diagnostics)diagnostics.contextFailed=true;throw error;}
    if(!context){if(diagnostics)diagnostics.contextFailed=true;throw new Error('canvas.getContext("webgl2") returned null; the 3D context could not be created.');}
    this.renderer=new THREE.WebGLRenderer({canvas,context,...attrs});
    this.renderer.info.autoReset=false;this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.debug.onShaderError=(gl,program,vertex,fragment)=>{throw new Error(`Shader compile/link failed:\n${gl.getProgramInfoLog(program)||''}\nVERTEX: ${gl.getShaderInfoLog(vertex)||''}\nFRAGMENT: ${gl.getShaderInfoLog(fragment)||''}`);};
    this.ratio=Math.min(devicePixelRatio||1,safe?1:1.65,2);this.maxRatio=this.ratio;
    const debug=context.getExtension('WEBGL_debug_renderer_info');
    if(diagnostics)diagnostics.gpu={renderer:debug?context.getParameter(debug.UNMASKED_RENDERER_WEBGL):context.getParameter(context.RENDERER),version:context.getParameter(context.VERSION),maxTextureSize:context.getParameter(context.MAX_TEXTURE_SIZE)};
    this.renderer.setPixelRatio(this.ratio);this.renderer.setSize(innerWidth,innerHeight,false);
  }
  setupShadows(enabled=!this.safe){
    this.renderer.shadowMap.enabled=enabled;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.shadowMap.autoUpdate=false;this.renderer.shadowMap.needsUpdate=enabled;
  }
  disposePost(){
    this.renderer.setRenderTarget(null);for(const item of this.post)item.dispose();this.post=[];this.target=null;this.bloomA=null;this.bloomB=null;this.quad=null;
  }
  configure(mode){
    this.disposePost();this.mode=mode;this.validateNext=true;
    if(mode==='direct'||mode==='unshadowed'){
      this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
      if(mode==='unshadowed')this.setupShadows(false);
      this.resize();return;
    }
    this.renderer.toneMapping=THREE.NoToneMapping;
    const type=mode==='hdr'?THREE.HalfFloatType:THREE.UnsignedByteType;
    if(mode==='ldr')this.ratio=Math.min(this.ratio,1.25);
    this.target=new THREE.WebGLRenderTarget(1,1,{type,depthBuffer:true});
    this.bloomA=new THREE.WebGLRenderTarget(1,1,{type,depthBuffer:false});
    this.post.push(this.target,this.bloomA);
    if(mode==='hdr'){this.bloomB=this.bloomA.clone();this.post.push(this.bloomB);}
    this.scene=new THREE.Scene();this.camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    const vertexShader='varying vec2 uv0; void main(){uv0=uv;gl_Position=vec4(position.xy,0.,1.);}';
    const make=(uniforms,fragmentShader)=>{const m=new THREE.ShaderMaterial({uniforms,vertexShader,fragmentShader,depthTest:false,depthWrite:false,toneMapped:false});this.post.push(m);return m;};
    this.bright=make({inputTex:{value:this.target.texture},threshold:{value:mode==='hdr'?1.35:.68},upper:{value:mode==='hdr'?3.8:1}},`
      varying vec2 uv0;uniform sampler2D inputTex;uniform float threshold,upper;
      void main(){vec3 c=texture2D(inputTex,uv0).rgb;float l=max(max(c.r,c.g),c.b);gl_FragColor=vec4(c*smoothstep(threshold,upper,l),1.);}`);
    this.blur=make({inputTex:{value:null},direction:{value:new THREE.Vector2()}},`
      varying vec2 uv0;uniform sampler2D inputTex;uniform vec2 direction;
      void main(){vec3 c=texture2D(inputTex,uv0).rgb*.227027;
      c+=texture2D(inputTex,uv0+direction*1.384615).rgb*.316216;
      c+=texture2D(inputTex,uv0-direction*1.384615).rgb*.316216;
      c+=texture2D(inputTex,uv0+direction*3.230769).rgb*.070270;
      c+=texture2D(inputTex,uv0-direction*3.230769).rgb*.070270;gl_FragColor=vec4(c,1.);}`);
    this.final=make({sceneTex:{value:this.target.texture},bloomTex:{value:this.bloomA.texture},fade:{value:0},low:{value:mode==='ldr'?1:0},texel:{value:new THREE.Vector2()}},`
      varying vec2 uv0;uniform sampler2D sceneTex,bloomTex;uniform float fade,low;uniform vec2 texel;
      void main(){vec3 glow=texture2D(bloomTex,uv0).rgb;
      if(low>.5){glow*=.4;glow+=(texture2D(bloomTex,uv0+texel).rgb+texture2D(bloomTex,uv0-texel).rgb+texture2D(bloomTex,uv0+vec2(texel.x,-texel.y)).rgb+texture2D(bloomTex,uv0+vec2(-texel.x,texel.y)).rgb)*.15;}
      vec3 c=texture2D(sceneTex,uv0).rgb+glow*.38;c=clamp((c*(2.51*c+.03))/(c*(2.43*c+.59)+.14),0.,1.);
      c*=1.-.22*pow(length((uv0-.5)*1.35),2.);c=pow(c,vec3(1./2.2));c=mix(c,vec3(.034,.055,.078),fade);
      gl_FragColor=vec4(c,1.);}`);
    const quadGeometry=new THREE.PlaneGeometry(2,2);this.post.push(quadGeometry);this.quad=new THREE.Mesh(quadGeometry,this.final);this.scene.add(this.quad);
    this.resize();
    // Validate the actual phone-sized allocations, not just a 4×4 capability probe.
    for(const target of [this.target,this.bloomA,this.bloomB].filter(Boolean)){
      this.renderer.setRenderTarget(target);const gl=this.renderer.getContext(),status=gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      if(status!==gl.FRAMEBUFFER_COMPLETE)throw new Error(`${mode} framebuffer ${target.width}×${target.height} incomplete: 0x${status.toString(16)}`);
    }
    this.renderer.setRenderTarget(null);
  }
  initPost(){
    const modes=this.safe?['unshadowed']:RENDER_MODES;
    for(const mode of modes){try{if(this.diagnostics)this.diagnostics.run(`post-processing:${mode}`,()=>this.configure(mode));else this.configure(mode);return;}catch(error){this.diagnostics?.record(`post-processing:${mode}`,error,`Trying ${RENDER_MODES[RENDER_MODES.indexOf(mode)+1]??'Page form'}`);}}
    throw new Error('All rendering configurations failed to initialize.');
  }
  resize(){
    this.renderer.setPixelRatio(this.ratio);this.renderer.setSize(innerWidth,innerHeight,false);
    if(this.target){this.target.setSize(Math.round(innerWidth*this.ratio),Math.round(innerHeight*this.ratio));const divisor=this.mode==='ldr'?8:4;this.bloomA.setSize(Math.max(1,Math.round(innerWidth*this.ratio/divisor)),Math.max(1,Math.round(innerHeight*this.ratio/divisor)));this.bloomB?.setSize(this.bloomA.width,this.bloomA.height);this.final.uniforms.texel.value.set(1.5/this.bloomA.width,1.5/this.bloomA.height);}
    this.validateNext=true;
  }
  draw(scene,camera,fade){
    const r=this.renderer;r.info.reset();
    if(!this.target){r.setRenderTarget(null);r.render(scene,camera);}
    else{
      r.setRenderTarget(this.target);r.render(scene,camera);
      this.quad.material=this.bright;r.setRenderTarget(this.bloomA);r.render(this.scene,this.camera);
      if(this.mode==='hdr'){
        this.quad.material=this.blur;this.blur.uniforms.inputTex.value=this.bloomA.texture;this.blur.uniforms.direction.value.set(1.5/this.bloomA.width,0);r.setRenderTarget(this.bloomB);r.render(this.scene,this.camera);
        this.blur.uniforms.inputTex.value=this.bloomB.texture;this.blur.uniforms.direction.value.set(0,1.5/this.bloomA.height);r.setRenderTarget(this.bloomA);r.render(this.scene,this.camera);
      }
      this.quad.material=this.final;this.final.uniforms.fade.value=fade;r.setRenderTarget(null);r.render(this.scene,this.camera);
    }
    if(this.validateNext){const gl=r.getContext(),error=gl.getError();this.validateNext=false;if(error!==gl.NO_ERROR)throw new Error(`WebGL error after ${this.mode} render: 0x${error.toString(16)}`);}
    this.calls=r.info.render.calls;
  }
  render(scene,camera,fade=0){
    while(true){
      try{this.diagnostics?.check(`render:${this.mode}`);this.draw(scene,camera,fade);if(this.pendingRecovery){this.diagnostics?.recovered(this.pendingRecovery,`Recovered with ${this.mode}; shadows ${this.renderer.shadowMap.enabled?'on':'off'}.`);this.diagnostics?.setMode(`3D · ${this.mode} · shadows ${this.renderer.shadowMap.enabled?'on':'off'}`);this.pendingRecovery=null;}return;}
      catch(error){
        const failed=this.mode,next=RENDER_MODES[RENDER_MODES.indexOf(failed)+1];this.diagnostics?.record(`render:${failed}`,error,next?`Retrying with ${next}`:'Using Page form');
        if(!next)throw error;this.pendingRecovery=`render:${failed}`;
        let configured=false;
        for(const mode of RENDER_MODES.slice(RENDER_MODES.indexOf(next))){try{this.configure(mode);configured=true;break;}catch(e){this.diagnostics?.record(`post-processing:${mode}`,e,'Trying a simpler rendering mode');}}
        if(!configured)throw error;
      }
    }
  }
  adjust(fps){if(fps<48&&this.ratio>.85){this.ratio=Math.max(.85,this.ratio-.15);this.resize();}}
}
