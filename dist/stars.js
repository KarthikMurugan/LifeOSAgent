// Perspective-projected stars with bounded pointer parallax and reduced-motion support.
const canvas=document.querySelector('#starfield');
const ctx=canvas.getContext('2d');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let width=0,height=0,frame=0,last=0,time=0,px=0,py=0,tx=0,ty=0;
let seed=4173;const random=()=>{seed=(seed*16807)%2147483647;return (seed-1)/2147483646};
const stars=Array.from({length:440},()=>({x:random()*2-1,y:random()*2-1,z:.3+random()*1.7,size:.35+random()*1.1,phase:random()*6.28,tint:random()}));
function resize(){width=innerWidth;height=innerHeight;const ratio=Math.min(devicePixelRatio||1,2);canvas.width=width*ratio;canvas.height=height*ratio;ctx.setTransform(ratio,0,0,ratio,0,0);draw(0)}
function draw(dt){time+=dt;px+=(tx-px)*.035;py+=(ty-py)*.035;ctx.clearRect(0,0,width,height);
 for(const s of stars){const depth=1/s.z;const x=width/2+s.x*width*.68*depth+px*24*depth;const y=height/2+s.y*height*.7*depth+py*18*depth;
 if(x<0||x>width||y<0||y>height)continue;const radius=Math.min(2.4,s.size*depth);const pulse=reduced.matches?1:.86+.14*Math.sin(time*.55+s.phase);const alpha=Math.min(.93,(.35+depth*.26)*pulse);
 const color=s.tint<.16?'174,194,255':s.tint>.92?'210,182,255':'235,243,255';
 if(radius>1.3){const glow=ctx.createRadialGradient(x,y,0,x,y,radius*5);glow.addColorStop(0,`rgba(${color},${alpha*.4})`);glow.addColorStop(1,`rgba(${color},0)`);ctx.fillStyle=glow;ctx.fillRect(x-radius*5,y-radius*5,radius*10,radius*10)}
 ctx.fillStyle=`rgba(${color},${alpha})`;ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();
 }}
function tick(now){const dt=last?Math.min((now-last)/1000,.1):0;last=now;draw(dt);frame=requestAnimationFrame(tick)}
function start(){cancelAnimationFrame(frame);last=0;if(!reduced.matches&&!document.hidden)frame=requestAnimationFrame(tick);else draw(0)}
addEventListener('pointermove',e=>{if(!reduced.matches){tx=(e.clientX/width-.5)*2;ty=(e.clientY/height-.5)*2}},{passive:true});
addEventListener('resize',resize);document.addEventListener('visibilitychange',start);reduced.addEventListener('change',()=>{px=py=tx=ty=0;start()});resize();start();
