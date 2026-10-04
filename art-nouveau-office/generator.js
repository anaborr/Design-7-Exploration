window.pxPerFoot = 24;
window.modelUnit = "ft";
window.unitToFeet = {ft:1, in:1/12, m:3.28084, mm:0.00328084};

function bounds(raw) {
  let a=[];
  raw.forEach(s=>a.push(s[0],s[1]));
  if(!a.length) return null;
  let xs=a.map(p=>p[0]), ys=a.map(p=>p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
window.bounds = bounds;

function fitSegments(raw, w, h) {
  let b = bounds(raw);
  if(!b) return [];
  let [x0,y0,x1,y1] = b, bw=Math.max(1,x1-x0), bh=Math.max(1,y1-y0);
  let sc = Math.min((w-100)/bw, (h-100)/bh);
  let ox = (w-bw*sc)/2, oy = (h-bh*sc)/2;
  window.pxPerFoot = sc / (window.unitToFeet[window.modelUnit] || 1);
  return raw.map(s => s.map(p => [ox + (p[0]-x0)*sc, h - (oy + (p[1]-y0)*sc)]));
}
window.fitSegments = fitSegments;

function baseSegs(){if(segments.length)return segments;if(pts.length<2)return [];return pts.slice(1).map((p,i)=>[pts[i],p])}
function transformSegs(raw, profile='balanced'){
  // TYPOLOGY-REFERENCE ENGINE. The 15 uploaded sketches define what a valid variation is allowed to become.
  const bb=bounds(raw); if(!bb) return raw;
  const [left,top,right,bottom]=bb, Wd=Math.max(1,right-left), Ht=Math.max(1,bottom-top);
  const P=val('porosity')/100,R=val('rhythm')/100,K=val('connectivity')/100,L=val('layered')/100,F=val('focal')/100,I=val('intimacy')/100;
  const WH=val('whip')/100,CO=val('cont')/100,BR=val('branch')/100,S=val('seed'),T=typeIndex();
  const phase={balanced:0,carve:13,grow:31,interlock:53}[profile]||0;
  const rnd=n=>{let x=Math.sin((n+1)*12.9898+(S+phase)*78.233)*43758.5453;return x-Math.floor(x)};
  const ft=n=>n*pxPerFoot, clamp=(v,a,z)=>Math.max(a,Math.min(z,v));
  const len=s=>Math.hypot(s[1][0]-s[0][0],s[1][1]-s[0][1]);
  const horiz=s=>Math.abs(s[1][1]-s[0][1])<=Math.max(ft(.35),Math.abs(s[1][0]-s[0][0])*.06);
  const vert=s=>Math.abs(s[1][0]-s[0][0])<=Math.max(ft(.35),Math.abs(s[1][1]-s[0][1])*.06);
  const mid=s=>[(s[0][0]+s[1][0])/2,(s[0][1]+s[1][1])/2];
  let result=raw.map(s=>[[...s[0]],[...s[1]]]), added=[];

  // Read the imported section as architecture: long horizontal pairs are plates/levels.
  let floorEdges=result.filter(s=>horiz(s)&&len(s)>=Math.max(ft(7),Wd*.09));
  let levels=[];
  floorEdges.forEach(s=>{let y=mid(s)[1],x0=Math.min(s[0][0],s[1][0]),x1=Math.max(s[0][0],s[1][0]);let q=levels.find(v=>Math.abs(v.y-y)<ft(1.6));if(q){q.x0=Math.min(q.x0,x0);q.x1=Math.max(q.x1,x1);q.n++}else levels.push({y,x0,x1,n:1})});
  levels.sort((a,b)=>b.y-a.y);
  if(!levels.length) levels=[{y:bottom-ft(1),x0:left,x1:right,n:1}];
  const base=levels[0];
  const slab=clamp(ft(.8),ft(.55),ft(1.25)), wall=clamp(ft(.5),ft(.35),ft(.75));
  const story=clamp(ft(12.5),Math.max(ft(10),Ht*.14),Math.max(ft(13),Ht*.28));
  const clear=clamp(ft(9.5),ft(8.5),story-slab-ft(.5));
  const typicalSpan=clamp(levels.reduce((a,v)=>a+(v.x1-v.x0),0)/levels.length,ft(12),Math.max(ft(18),Wd*.55));
  const cx=(left+right)/2;

  function addSeg(a,b){ if(Math.hypot(b[0]-a[0],b[1]-a[1])>ft(.4)) added.push([a,b]); }
  function slabBox(x0,x1,y){x0=clamp(x0,left-ft(4),right+ft(4));x1=clamp(x1,left-ft(4),right+ft(4));if(x1<x0)[x0,x1]=[x1,x0];if(x1-x0<ft(7))return;addSeg([x0,y],[x1,y]);addSeg([x0,y+slab],[x1,y+slab]);addSeg([x0,y],[x0,y+slab]);addSeg([x1,y],[x1,y+slab]);}
  function wallBox(x,yFloor,h=clear){h=clamp(h,ft(7.5),story*1.8);let y0=yFloor-h,y1=yFloor;addSeg([x,y0],[x,y1]);addSeg([x+wall,y0],[x+wall,y1]);addSeg([x,y0],[x+wall,y0]);addSeg([x,y1],[x+wall,y1]);}
  function roofLine(x0,x1,y,depth=slab){slabBox(x0,x1,y);}
  function nearestLevel(y){return levels.slice().sort((a,b)=>Math.abs(a.y-y)-Math.abs(b.y-y))[0]||base;}
  function cutSegment(target,gapFrac=.22,where=.5){let idx=result.indexOf(target);if(idx<0)return;let A=target[0],B=target[1],g=clamp(gapFrac,.08,.55),a=clamp(where-g/2,.05,.88),z=clamp(where+g/2,.12,.95);let p1=[A[0]+(B[0]-A[0])*a,A[1]+(B[1]-A[1])*a],p2=[A[0]+(B[0]-A[0])*z,A[1]+(B[1]-A[1])*z];result.splice(idx,1,[A,p1],[p2,B]);}
  function terraceFrom(parent,dir,yOffset,spanScale=.55){let anchor=dir>0?parent.x1:parent.x0,span=clamp(typicalSpan*spanScale,ft(10),ft(30)),y=parent.y-yOffset;slabBox(dir>0?anchor:anchor-span,dir>0?anchor+span:anchor,y);return {y,x0:dir>0?anchor:anchor-span,x1:dir>0?anchor+span:anchor};}
  function roomOn(parent,widthScale=.32,side=0){let rw=clamp(typicalSpan*widthScale,ft(8),ft(18)),x0=side?parent.x1-rw:parent.x0+ft(1);x0=clamp(x0,parent.x0,parent.x1-rw);let h=clamp(clear*(.95-.15*I),ft(8),ft(10));wallBox(x0,parent.y,h);wallBox(x0+rw-wall,parent.y,h);roofLine(x0,x0+rw,parent.y-h);}
  function steppedConnection(A,B){ // only used when connectivity actually needs vertical circulation
    let useRight=Math.abs(A.x1-B.x0)<=Math.abs(A.x0-B.x1),x0=useRight?A.x1:A.x0,x1=useRight?B.x0:B.x1,dy=B.y-A.y;
    if(Math.abs(dy)<ft(4)||Math.abs(x1-x0)<ft(5))return;
    let steps=clamp(Math.round(Math.abs(dy)/ft(.58)),7,20),dx=(x1-x0)/steps,yy=A.y,xx=x0;
    for(let q=0;q<steps;q++){let ny=A.y+dy*(q+1)/steps,nx=x0+(x1-x0)*(q+1)/steps;addSeg([xx,yy],[nx,yy]);addSeg([nx,yy],[nx,ny]);xx=nx;yy=ny;}
  }
  function bridge(A,B){let y=(A.y+B.y)/2,x0=Math.min(A.x1,B.x1),x1=Math.max(A.x0,B.x0);if(x1-x0>ft(7))slabBox(x0,x1,y);else{let a=Math.abs(A.x1-B.x0)<Math.abs(A.x0-B.x1)?A.x1:A.x0,b=Math.abs(A.x1-B.x0)<Math.abs(A.x0-B.x1)?B.x0:B.x1;slabBox(Math.min(a,b),Math.max(a,b),y);}}
  function curveReplace(s,strength){let idx=result.indexOf(s);if(idx<0||horiz(s)||len(s)<ft(6))return;let A=s[0],B=s[1],dx=B[0]-A[0],dy=B[1]-A[1],ll=len(s),nx=-dy/ll,ny=dx/ll,amp=Math.min(ft(1+4*strength),ll*.16),parts=[],prev=A;for(let q=1;q<=8;q++){let t=q/8,shape=16*t*(1-t)*(t-.5)*.55,cur=q===8?B:[A[0]+dx*t+nx*amp*shape,A[1]+dy*t+ny*amp*shape];parts.push([prev,cur]);prev=cur}result.splice(idx,1,...parts);}

  // TYPOLOGY DNA FROM THE 15 REFERENCE SKETCHES.
  // Each descriptor has a different spatial operation depending on the selected sketch family.
  if(space==='Workspace'){
    if(T===0){ // OPEN HALL: one large clear room, low subdivision, broad roof/floor field.
      if(L>.55) slabBox(base.x0+typicalSpan*.18,base.x1-typicalSpan*.18,base.y-story*.92);
      if(P>.25){let walls=result.filter(s=>vert(s)&&len(s)>ft(7));walls.slice(0,Math.ceil(P*2)).forEach((s,i)=>cutSegment(s,.18+.18*P,.42+.15*rnd(i)));}
      if(R>.3){let n=Math.floor(R*4);for(let j=1;j<=n;j++){let x=base.x0+(base.x1-base.x0)*j/(n+1);wallBox(x,base.y,clear*.25);}}
      if(I>.55) roomOn(base,.25,Math.round(rnd(4))%2);
      if(F>.45){let w=clamp(typicalSpan*.28,ft(10),ft(20));slabBox(cx-w/2,cx+w/2,base.y-ft(.15));}
    } else if(T===1){ // CASCADE / TERRACED: offset horizontal plates + short transitions + overlooks.
      if(L>.15){let n=1+Math.floor(L*2.8),parent=levels[Math.floor(rnd(1)*levels.length)]||base;for(let j=0;j<n;j++){let dir=((j+S)%2)?1:-1,plate=terraceFrom(parent,dir,story*(.72+.12*j),.42+.18*L);levels.push(plate);parent=plate;}}
      if(R>.3){let parent=base,n=Math.floor(1+R*3);for(let j=0;j<n;j++){let dir=((j+S)%2)?1:-1;terraceFrom(parent,dir,story*(.45+j*.38),.34);}}
      if(P>.3){let candidates=result.filter(s=>horiz(s)&&len(s)>ft(12));candidates.slice(0,Math.ceil(P*2)).forEach((s,i)=>cutSegment(s,.12+.16*P,.5+.12*(rnd(i)-.5)));}
      if(K>.5&&levels.length>1){let A=levels[0],B=levels[Math.min(1,levels.length-1)]; if(Math.abs(A.y-B.y)>ft(4)) steppedConnection(A,B); else bridge(A,B);}
      if(I>.62) roomOn(levels[Math.min(1,levels.length-1)]||base,.28,Math.round(rnd(9))%2);
      if(F>.48){let upper=levels.find(v=>v.y<base.y-ft(7));if(upper){let edge=rnd(12)>.5?upper.x0:upper.x1;wallBox(edge-(edge===upper.x1?wall:0),upper.y,clear*.8);}}
    } else if(T===2){ // FLAT DEEP-PLAN: repeated horizontal plates and regular bays, keep floors flat.
      if(L>.28){let n=Math.floor(1+L*3);for(let j=1;j<=n;j++)slabBox(base.x0,base.x1,base.y-story*j);}
      if(R>.18){let n=Math.floor(2+R*5),bay=(base.x1-base.x0)/(n+1);for(let j=1;j<=n;j++)wallBox(base.x0+bay*j,base.y,clear*.75);}
      if(P>.3){result.filter(s=>vert(s)&&len(s)>ft(7)).slice(0,Math.ceil(P*3)).forEach((s,i)=>cutSegment(s,.22,.35+.25*rnd(i)));}
      if(I>.5) roomOn(base,.22,Math.round(rnd(2))%2);
      if(F>.55){let w=clamp(typicalSpan*.22,ft(9),ft(16));let topLevel=levels[levels.length-1]||base;slabBox(cx-w/2,cx+w/2,topLevel.y-story*.75);}
    } else if(T===3){ // VOID-EDGE: plates frame a central carved vertical opening.
      let vw=clamp(Wd*(.14+.18*F+.12*P),ft(10),Wd*.34),vl=cx-vw/2,vr=cx+vw/2;
      if(L>.2){let n=Math.floor(1+L*3);for(let j=0;j<n;j++){let y=base.y-story*(j+1);slabBox(left,vl-ft(1),y);slabBox(vr+ft(1),right,y);}}
      if(P>.2){result.filter(s=>horiz(s)&&len(s)>vw).slice(0,Math.ceil(P*2)).forEach(s=>cutSegment(s,Math.min(.45,vw/len(s)),.5));}
      if(K>.55&&levels.length>1){let A=levels[0],B=levels[1];let side=rnd(5)>.5?vl:vr;wallBox(side-wall/2,A.y,Math.min(story*1.4,Math.abs(A.y-B.y)+clear*.3));}
      if(I>.65) roomOn(base,.22,rnd(6)>.5?1:0);
    } else { // FOLDED / UNDULATED: one continuous stepped/folded work surface.
      if(L>.18||R>.18){let n=3+Math.floor(Math.max(L,R)*4),x0=base.x0,x1=base.x1,dx=(x1-x0)/n,y=base.y,dir=-1;for(let j=0;j<n;j++){let nx=x0+dx*(j+1),ny=y+dir*story*(.18+.16*L);addSeg([x0+dx*j,y],[nx,ny]);addSeg([x0+dx*j,y+slab],[nx,ny+slab]);y=ny;if(j%2===1)dir*=-1;}}
      if(P>.4){let c=result.filter(s=>horiz(s)&&len(s)>ft(10));c.slice(0,2).forEach((s,i)=>cutSegment(s,.18+.1*P,.4+.2*rnd(i)));}
      if(I>.65) roomOn(base,.24,0);
    }
  } else if(space==='Lobby'){
    if(T===0){ // VERTICAL VOID: stacked edges around a tall central opening.
      let vw=clamp(Wd*(.18+.18*P+.12*F),ft(12),Wd*.38),vl=cx-vw/2,vr=cx+vw/2;
      if(L>.18){let n=1+Math.floor(L*3);for(let j=1;j<=n;j++){let y=base.y-story*j;slabBox(left,vl,y);slabBox(vr,right,y);}}
      if(K>.55&&levels.length>1){let side=rnd(3)>.5?vl:vr;wallBox(side,base.y,story*(1.1+.6*K));}
      if(P>.25) result.filter(s=>horiz(s)&&len(s)>vw).slice(0,2).forEach(s=>cutSegment(s,Math.min(.5,vw/len(s)),.5));
      if(I>.65) roomOn(base,.2,rnd(8)>.5?1:0);
    } else if(T===1){ // COMPRESSED: low/narrow entry that releases into taller/wider volume.
      if(I>.18){let x0=base.x0,x1=x0+clamp(typicalSpan*(.24+.18*I),ft(8),ft(16)),h=ft(7.8+2*(1-I));wallBox(x0,base.y,h);roofLine(x0,x1,base.y-h);}
      if(F>.38){let x0=base.x0+typicalSpan*.35;roofLine(x0,Math.min(right,x0+typicalSpan*.7),base.y-story*.9);}
      if(P>.5){let vs=result.filter(s=>vert(s)&&len(s)>ft(7));if(vs[0])cutSegment(vs[0],.24,.6);}
      if(R>.45){let n=Math.floor(R*3);for(let j=0;j<n;j++)wallBox(base.x0+ft(10+12*j),base.y,clear*(.75+.1*j));}
    } else if(T===2){ // CONTINUOUS HALL: one long horizontal hall, roof can undulate but floor remains continuous.
      if(L>.65) slabBox(base.x0,base.x1,base.y-story);
      if(R>.3){let n=Math.floor(R*4);for(let j=1;j<=n;j++)wallBox(base.x0+(base.x1-base.x0)*j/(n+1),base.y,clear*.18);}
      if(P>.3) result.filter(s=>vert(s)&&len(s)>ft(7)).slice(0,2).forEach((s,i)=>cutSegment(s,.25,.45+.15*rnd(i)));
      if(I>.68) roomOn(base,.2,0);
    } else if(T===3){ // TOPOGRAPHIC: floor is the primary stepped/sloped continuum.
      if(L>.15||R>.15){let n=3+Math.floor(Math.max(L,R)*4),dx=(base.x1-base.x0)/n,y=base.y;for(let j=0;j<n;j++){let ny=y-story*(.08+.08*L)*(j%2?-.45:1),nx=base.x0+dx*(j+1);addSeg([base.x0+dx*j,y],[nx,ny]);addSeg([base.x0+dx*j,y+slab],[nx,ny+slab]);y=ny;}}
      if(I>.58){let p={...base,y:base.y-story*.18};roomOn(p,.24,1);}
      if(F>.55) roofLine(base.x0+typicalSpan*.2,base.x1-typicalSpan*.2,top+story*.35);
    } else { // LINEAR GALLERY: elongated sequence of repeated bays/thresholds.
      if(R>.18){let n=2+Math.floor(R*5),bay=(base.x1-base.x0)/(n+1);for(let j=1;j<=n;j++)wallBox(base.x0+bay*j,base.y,clear*(.75+.12*(j%2)));}
      if(P>.25){result.filter(s=>vert(s)&&len(s)>ft(6)).slice(0,Math.ceil(P*3)).forEach((s,i)=>cutSegment(s,.2,.55));}
      if(L>.62) slabBox(base.x0,base.x1,base.y-story);
      if(F>.5) roomOn(base,.18,1);
    }
  } else { // GATHERING
    if(T===0){ // STEPPED AMPHITHEATER: occupation is the stepped bowl itself.
      if(R>.12||L>.12){let n=4+Math.floor(Math.max(R,L)*7),stepW=clamp((base.x1-base.x0)/(n+2),ft(2),ft(5)),stepH=ft(.55),x=cx-stepW*n/2,y=base.y;for(let j=0;j<n;j++){let dir=j<n/2?-1:1,idx=j<n/2?j:n-1-j,yy=base.y-stepH*(Math.floor(n/2)-idx);addSeg([x+j*stepW,yy],[x+(j+1)*stepW,yy]);if(j<n-1)addSeg([x+(j+1)*stepW,yy],[x+(j+1)*stepW,base.y-stepH*(Math.floor(n/2)-Math.min(j+1,n-2-j))]);}}
      if(F>.35) roofLine(cx-typicalSpan*.3,cx+typicalSpan*.3,top+story*.35);
      if(P>.65){let hs=result.filter(s=>horiz(s)&&len(s)>ft(12));if(hs[0])cutSegment(hs[0],.25,.5);}
    } else if(T===1){ // VOID FIELD: tall collective void, occupied base, edge plates only.
      let vw=clamp(Wd*(.28+.2*P),ft(14),Wd*.5),vl=cx-vw/2,vr=cx+vw/2;
      if(L>.35){let n=Math.floor(1+L*2);for(let j=1;j<=n;j++){let y=base.y-story*j;slabBox(left,vl,y);slabBox(vr,right,y);}}
      if(I>.72) roomOn(base,.18,0);
      if(F>.45) roofLine(vl,vr,top+story*.3);
    } else if(T===2){ // INSERTED HORIZONTAL PLATE: one strong communal platform in a taller volume.
      if(L>.18){let y=base.y-story*(.75+.35*L),w=clamp(typicalSpan*(.45+.25*L),ft(12),ft(30));slabBox(cx-w/2,cx+w/2,y);}
      if(K>.6&&levels.length>1) steppedConnection(base,levels[levels.length-1]);
      if(I>.65) roomOn(base,.2,1);
      if(P>.4){let vs=result.filter(s=>vert(s)&&len(s)>ft(8));if(vs[0])cutSegment(vs[0],.25,.5);}
    } else if(T===3){ // ROOM WITHIN A VOLUME: nested enclosure remains distinct from outer hall.
      if(I>.12||F>.3){let rw=clamp(typicalSpan*(.32+.18*F),ft(10),ft(24)),x0=cx-rw/2,h=clamp(ft(8.5+2*(1-I)),ft(8),ft(11));wallBox(x0,base.y,h);wallBox(x0+rw-wall,base.y,h);roofLine(x0,x0+rw,base.y-h);}
      if(P>.45){let vs=result.filter(s=>vert(s)&&len(s)>ft(7));if(vs[0])cutSegment(vs[0],.2,.5);}
      if(L>.65) slabBox(base.x0,base.x1,base.y-story*1.1);
    } else { // LINEAR EDGE GALLERY: repeated balcony edges along a void.
      if(L>.15){let n=1+Math.floor(L*3),side=rnd(2)>.5?1:-1;for(let j=1;j<=n;j++){let y=base.y-story*j,w=clamp(typicalSpan*.38,ft(10),ft(22));slabBox(side>0?right-w:left,side>0?right:left+w,y);}}
      if(R>.35){let n=Math.floor(R*4);for(let j=1;j<=n;j++){let y=base.y-story*j;addSeg([left,y],[left+ft(4),y]);}}
      if(K>.65&&levels.length>1) steppedConnection(levels[0],levels[1]);
      if(P>.45){let hs=result.filter(s=>horiz(s)&&len(s)>ft(10));if(hs[0])cutSegment(hs[0],.18,.5);}
    }
  }

  // ART NOUVEAU RULES are a second layer: they modify valid typology moves instead of inventing unrelated lines.
  if(BR>.2){ // branch an EXISTING architectural edge into a second occupiable direction
    let parent=levels[Math.floor(rnd(80)*levels.length)]||base,dir=rnd(81)>.5?1:-1;
    if(space==='Workspace'&&T===1){terraceFrom(parent,dir,story*(.55+.3*BR),.32+.18*BR);}
    else if(space==='Lobby'&&T===3){let anchor=dir>0?parent.x1:parent.x0;let span=clamp(typicalSpan*.32,ft(9),ft(18));slabBox(dir>0?anchor:anchor-span,dir>0?anchor+span:anchor,parent.y-story*.35);}
    else if(BR>.65){let anchor=dir>0?parent.x1:parent.x0;wallBox(anchor-(dir<0?wall:0),parent.y,clear*.75);}
  }
  if(CO>.2){ // extend nearby compatible plate edges until systems become continuous
    let hs=result.concat(added).filter(s=>horiz(s)&&len(s)>ft(6)),made=0,max=ft(4+12*CO);
    for(let i=0;i<hs.length&&made<1+Math.floor(CO*2);i++){let A=hs[i],a=A[1],best=null,bd=1e9;for(let j=0;j<hs.length;j++){if(i===j)continue;for(let q of hs[j]){let d=Math.hypot(a[0]-q[0],a[1]-q[1]);if(d<bd&&d<max&&Math.abs(a[1]-q[1])<story*.9){best=q;bd=d}}}if(best){let elbow=[best[0],a[1]];addSeg(a,elbow);if(Math.abs(best[1]-elbow[1])>ft(.8))addSeg(elbow,best);made++;}}
  }
  if(WH>.2){ // curve only enclosure/transition edges; never primary occupiable horizontal plates
    let candidates=result.filter(s=>!horiz(s)&&len(s)>ft(7));let n=Math.min(candidates.length,1+Math.floor(WH*3));for(let i=0;i<n;i++)curveReplace(candidates[(i*3+S)%candidates.length],WH);
  }

  // Final architectural cleanup: no giant generated walls through several stories; preserve central void typologies.
  let all=result.concat(added);
  all=all.filter(s=>!(vert(s)&&len(s)>story*1.9&&!raw.some(r=>r===s)));
  const voidType=(space==='Lobby'&&T===0)||(space==='Workspace'&&T===3)||(space==='Gathering'&&T===1)||(space==='Gathering'&&T===4);
  if(voidType){let half=clamp(Wd*.08,ft(5),ft(12));all=all.filter(s=>{if(!horiz(s))return true;let x0=Math.min(s[0][0],s[1][0]),x1=Math.max(s[0][0],s[1][0]);return !(x0<cx-half&&x1>cx+half&&len(s)<Wd*.65)});}
  return all;
}
window.transformSegs = transformSegs;

window.getBaseSegments = function(spaceName, typeIdx, w, h) {
  let pts = [];
  if(spaceName === 'Lobby') {
    let ex=[[[90,h-80],[220,h-80],[220,100],[420,100],[420,h-80],[w-90,h-80]],[[80,h-90],[190,h-90],[230,h-145],[330,h-145],[390,h-90],[w-80,h-90]],[[70,h-110],[w-70,h-110]],[[70,h-80],[190,h-110],[320,h-165],[470,h-120],[w-70,h-90]],[[70,h-100],[250,h-100],[390,h-140],[w-70,h-140]]];
    pts = ex[typeIdx] || ex[0];
  } else if(spaceName === 'Workspace') {
    let ex=[[[70,h-100],[w-70,h-100]],[[70,h-80],[190,h-80],[240,h-145],[360,h-145],[420,h-210],[550,h-210],[610,h-270],[w-70,h-270]],[[70,h-120],[w-70,h-120]],[[70,h-100],[260,h-100],[300,h-250],[500,h-250],[540,h-100],[w-70,h-100]],[[70,h-110],[190,h-145],[310,h-105],[430,h-180],[560,h-120],[w-70,h-155]]];
    pts = ex[typeIdx] || ex[0];
  } else {
    let ex=[[[70,h-80],[170,h-80],[220,h-120],[270,h-120],[320,h-160],[370,h-160],[420,h-200],[w-70,h-200]],[[80,h-80],[220,h-80],[220,90],[520,90],[520,h-80],[w-80,h-80]],[[70,h-90],[260,h-90],[260,h-220],[520,h-220],[520,h-90],[w-70,h-90]],[[70,h-80],[200,h-80],[230,h-210],[500,h-210],[530,h-80],[w-70,h-80]],[[70,h-90],[230,h-90],[230,h-200],[w-100,h-200]]];
    pts = ex[typeIdx] || ex[0];
  }
  if(pts.length < 2) return [];
  return pts.slice(1).map((p,i) => [pts[i], p]);
};

window.renderSegmentsToCanvas = function(canvas, segments, isIteration) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  
  // Draw grid
  ctx.strokeStyle = '#151515';
  ctx.lineWidth = 1;
  for(let x=40; x<w; x+=40) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
  for(let y=40; y<h; y+=40) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
  
  // Draw lines
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = isIteration ? '#ffffff' : '#888888';
  ctx.lineWidth = isIteration ? 3 : 2;
  
  segments.forEach(s => {
    ctx.beginPath();
    ctx.moveTo(s[0][0], s[0][1]);
    ctx.lineTo(s[1][0], s[1][1]);
    ctx.stroke();
  });
};
