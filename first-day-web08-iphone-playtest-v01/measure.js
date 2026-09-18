// Opt-in read-only renderer observation. It never changes rendering, game state or saves.
export function measureCanvas(canvas,active) {
  const get=canvas.getContext.bind(canvas);let calls=0,triangles=0,last=0,samples=[];
  canvas.getContext=function(...args){
    const gl=get(...args);if(!gl||!args[0].startsWith('webgl')||gl.__coveObserved)return gl;
    gl.__coveObserved=true;
    for(const method of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']){
      if(!gl[method])continue;const original=gl[method].bind(gl);
      gl[method]=function(...a){calls++;const count=method.startsWith('drawArrays')?a[2]:a[1],instances=method.endsWith('Instanced')?a[a.length-1]:1;if(a[0]===gl.TRIANGLES)triangles+=count/3*instances;return original(...a);};
    }return gl;
  };
  function frame(t){
    if(last&&active()&&calls)samples.push({ms:t-last,calls,triangles});
    if(samples.length===240){const q=(key,p)=>samples.map(s=>s[key]).sort((a,b)=>a-b)[Math.floor((samples.length-1)*p)];const result={n:samples.length,frameMedianMs:q('ms',.5),frameP95Ms:q('ms',.95),drawMedian:q('calls',.5),trianglesMedian:q('triangles',.5),canvas:[canvas.width,canvas.height],browserOnly:true};document.body.dataset.renderCost=JSON.stringify(result);console.log('[COVE-WEB-COST]',JSON.stringify(result));samples=[];}
    calls=0;triangles=0;last=t;requestAnimationFrame(frame);
  }requestAnimationFrame(frame);
}
