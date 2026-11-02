/* Local graph viewer: no libraries, telemetry, or remote resources. */
(()=>{'use strict';
const $=id=>document.getElementById(id),canvas=$('graph'),ctx=canvas.getContext('2d');
const kinds={Organization:['기관','#d9c5f8'],Department:['부서','#b5a0e5'],Policy:['정책','#9291d4'],UnitProgram:['단위사업','#6fabc2'],Project:['세부사업','#72bcba'],BudgetAllocation:['연도별 예산','#d5b983'],ExpenseAllocation:['과목별 배정','#a0a8b5'],LineItem:['산출내역','#7b8899'],Document:['출처 문서','#c58e9d']};
const relNames={HAS_DEPARTMENT:'하위 부서',HAS_POLICY:'소관 정책',HAS_UNIT:'하위 단위사업',HAS_PROJECT:'하위 세부사업',RESPONSIBLE_FOR:'소관 사업',HAS_BUDGET:'연도별 예산',HAS_EXPENSE:'과목별 배정',HAS_LINE_ITEM:'산출내역',EVIDENCED_BY:'원문 근거'};
let nodes=[],edges=[],index=new Map(),visible=[],visibleEdges=[],W=0,H=0,dpr=1;
let scale=1,tx=0,ty=0,selection=null,hover=null,local=false,selectedTypes=new Set(Object.keys(kinds)),query=null,step=0,simulation=0,alpha=1,dirty=true,drag=null,viewReady=false;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>n.toLocaleString('ko-KR');
const r=n=>n.label==='Project'?6.5:n.label==='Department'?8:n.label==='Organization'?10:n.label==='Policy'?7:n.label==='UnitProgram'?6:n.label==='Document'?7:3.5;
function resize(){const rect=canvas.getBoundingClientRect();W=rect.width;H=rect.height;dpr=Math.min(devicePixelRatio||1,2);canvas.width=W*dpr;canvas.height=H*dpr;dirty=true;}
new ResizeObserver(resize).observe($('graph-area'));
const out=(id,type)=>edges.filter(e=>e.source.id===id&&e.type===type).map(e=>e.target);
const parent=(id,type)=>edges.find(e=>e.target.id===id&&e.type===type)?.source;
const budget=(p,y)=>out(p.id,'HAS_BUDGET').find(n=>n.year===y);
function neighbors(n){const set=new Set([n.id]);for(const e of edges){if(e.source===n)set.add(e.target.id);if(e.target===n)set.add(e.source.id)}return set;}
function filter(){
 const around=selection&&local?neighbors(selection):null;
 visible=nodes.filter(n=>selectedTypes.has(n.label)&&(!around||around.has(n.id)));
 const ids=new Set(visible.map(n=>n.id));visibleEdges=edges.filter(e=>ids.has(e.source.id)&&ids.has(e.target.id));
 $('counts').textContent=`${visible.length} / ${nodes.length} 노드 · ${visibleEdges.length} / ${edges.length} 관계`;
 document.querySelectorAll('[data-type]').forEach(c=>c.checked=selectedTypes.has(c.dataset.type));dirty=true;listNodes();
}
function fit(){if(!visible.length)return;let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;for(const n of visible){left=Math.min(left,n.x);right=Math.max(right,n.x);top=Math.min(top,n.y);bottom=Math.max(bottom,n.y)}scale=Math.min((W-100)/Math.max(right-left,150),(H-150)/Math.max(bottom-top,150),1.3);scale=Math.max(.08,scale);tx=W/2-(left+right)/2*scale;ty=H/2-(top+bottom)/2*scale;zoomText();dirty=true;}
function zoomText(){$('zoom-value').textContent=Math.round(scale*100)+'%';}
function zoomAt(f,x=W/2,y=H/2){const next=Math.max(.08,Math.min(8,scale*f));tx=x-(x-tx)*next/scale;ty=y-(y-ty)*next/scale;scale=next;zoomText();dirty=true;}
function focus(n){tx=W/2-n.x*scale;ty=H/2-n.y*scale;dirty=true;}
function listNodes(){const host=$('accessible-nodes');if(!host)return;$('list-count').textContent=`(${visible.length})`;if(!$('node-list').open)return;host.replaceChildren();for(const n of visible){const b=document.createElement('button');b.className='neighbor';b.textContent=`${kinds[n.label][0]} · ${n.name}`;b.onclick=()=>select(n,true);host.append(b)}}
function listMarkup(){return '<details id="node-list"><summary>현재 표시 노드 목록 <span id="list-count"></span></summary><div id="accessible-nodes"></div></details>';}
function select(n,center=false){selection=n;hover=null;$('hover').hidden=true;$('detail').classList.add('selected');if(center)focus(n);details();filter();dirty=true;}
function details(){
 const n=selection;if(!n)return;
 const connected=edges.filter(e=>e.source===n||e.target===n);
 let props=[['유형',kinds[n.label][0]],['식별자',n.id]];
 if(n.year)props.push(['연도',n.year]);if(n.amount!==undefined)props.push(['금액',fmt(n.amount)+'천원']);if(n.account)props.push(['회계',n.account]);if(n.code)props.push(['과목 코드',n.code]);if(n.pdf_page)props.push(['원문 위치',`PDF ${n.pdf_page}쪽 / 인쇄 ${n.printed_page}쪽`]);
 $('detail').innerHTML=`<div class="detail-kind">${esc(kinds[n.label][0])}</div><h2>${esc(n.name)}</h2><dl class="properties">${props.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl><div class="detail-actions"><button id="local" aria-pressed="${local}">${local?'전체로 돌아가기':'주변 연결만 보기'}</button><button id="close-detail">선택 해제</button></div><h2>직접 연결 ${connected.length}개</h2><div id="neighbors"></div>${n.raw_text?`<p class="note">${esc(n.raw_text)}</p>`:''}${listMarkup()}`;
 const host=$('neighbors');for(const e of connected){const target=e.source===n?e.target:e.source,b=document.createElement('button');b.className='neighbor';b.innerHTML=`${esc(target.name)}<span>${e.source===n?'→':'←'} ${esc(relNames[e.type]||e.type)} · ${esc(kinds[target.label][0])}</span>`;b.onclick=()=>select(target,true);host.append(b)}
 $('local').onclick=()=>{local=!local;details();filter();fit()};$('close-detail').onclick=clearSelection;bindList();
}
function bindList(){$('node-list')?.addEventListener('toggle',listNodes);listNodes()}
function clearSelection(){selection=null;local=false;$('detail').classList.remove('selected');$('detail').innerHTML='<h2>연결을 따라 탐색하세요</h2><p>점을 누르면 해당 노드와 직접 연결된 노드가 강조됩니다.</p>'+listMarkup();bindList();filter()}
function search(){const s=$('search').value.trim().toLocaleLowerCase(),host=$('search-results');host.replaceChildren();if(!s){dirty=true;return}const found=nodes.filter(n=>(n.name+' '+(n.year||'')+' '+(n.code||'')).toLocaleLowerCase().includes(s));if(!found.length){host.innerHTML='<div class="empty">일치하는 노드가 없습니다.</div>';return}for(const n of found.slice(0,30)){const b=document.createElement('button');b.className='result';b.textContent=`${kinds[n.label][0]} · ${n.name}`;b.onclick=()=>{selectedTypes.add(n.label);local=false;filter();scale=Math.max(scale,1.1);select(n,true);zoomText();$('controls').classList.remove('open');$('panel-toggle').setAttribute('aria-expanded','false')};host.append(b)}if(found.length>30){const note=document.createElement('div');note.className='empty';note.textContent=`${found.length}개 중 30개 표시 · 검색어를 더 입력하세요`;host.append(note)}dirty=true;}
function edgeIndex(a,b,type){return edges.findIndex(e=>e.source===a&&e.target===b&&(!type||e.type===type))}
function buildQuestion(key){
 const p=nodes.find(n=>n.label==='Project'&&n.name===(key==='change'?'청년 마음건강 지원':'서울 청년수당')),b=budget(p,2026),src=out(b.id,'EVIDENCED_BY')[0];
 const group=(text,ns,es)=>({text,ns:ns.map(n=>n.id),es});
 if(key==='amount')return {steps:[group('서울 청년수당 사업을 찾습니다.',[p],[]),group('2026년 예산 기록을 조회합니다.',[b],[edgeIndex(p,b)]),group('원문 근거를 확인하고 금액·단위를 읽습니다.',[src],[edgeIndex(b,src)])],answer:`2026년 서울 청년수당 예산은 ${fmt(b.amount)}천원 (${fmt(b.amount/100000)}억원)입니다. PDF ${b.pdf_page}쪽 / 인쇄 ${b.printed_page}쪽.`};
 if(key==='change'){const a=budget(p,2025),diff=a.amount-b.amount;return {steps:[group('청년 마음건강 지원 사업을 찾습니다.',[p],[]),group('2025년과 2026년 예산을 비교합니다.',[a,b],[edgeIndex(p,a),edgeIndex(p,b)]),group('차액·감소율을 계산하고 출처를 확인합니다.',[src],[edgeIndex(b,src)])],answer:`${fmt(a.amount)} → ${fmt(b.amount)}천원. ${fmt(diff)}천원, ${(diff/a.amount*100).toFixed(2)}% 감소. PDF ${b.pdf_page}쪽. 감소 원인은 이 문서의 금액만으로 판단하지 않습니다.`}}
 if(key==='owner'){const u=parent(p.id,'HAS_PROJECT'),pol=parent(u.id,'HAS_UNIT'),d=parent(pol.id,'HAS_POLICY'),o=parent(d.id,'HAS_DEPARTMENT');return {steps:[group('서울 청년수당 사업을 찾습니다.',[p],[]),group('단위사업·정책을 역방향으로 조회합니다.',[u,pol],[edgeIndex(u,p),edgeIndex(pol,u)]),group('정책의 소관 부서와 기관을 확인합니다.',[d,o],[edgeIndex(d,pol),edgeIndex(o,d)])],answer:`${o.name} ${d.name} 소관. 정책: ${pol.name}. 단위사업: ${u.name}. 소관은 직접 운영을 뜻하지 않습니다.`}}
 const expenses=out(b.id,'HAS_EXPENSE'),items=expenses.flatMap(e=>out(e.id,'HAS_LINE_ITEM'));
 return {steps:[group('사업의 2026년 예산 총액을 조회합니다.',[p,b],[edgeIndex(p,b)]),group('과목별 배정액을 조회합니다.',expenses,expenses.map(e=>edgeIndex(b,e))),group('산출내역을 펼치고 과목별 합계를 검산합니다.',items,expenses.flatMap(e=>out(e.id,'HAS_LINE_ITEM').map(i=>edgeIndex(e,i))))],answer:`총 ${fmt(b.amount)}천원 = ${expenses.map(e=>e.name+' '+fmt(e.amount)+'천원').join(' + ')}. 산출내역 합계 일치. PDF ${b.pdf_page}쪽.`};
}
function questionUpdate(){
 const active=!!query;$('previous').disabled=!active||step===0;$('next').disabled=!active||step===query.steps.length-1;$('all-path').disabled=!active;
 $('answer').hidden=!active;
 if(active){$('question-step').textContent=`${step+1} / ${query.steps.length} · ${query.steps[step].text}`;$('answer').textContent=step===query.steps.length-1?query.answer:query.steps[step].text}
 else{$('question-step').textContent='질문을 고르면 전체 그래프 안에서 조회 경로가 강조됩니다.'}
 dirty=true;
}
function activePath(){return {ns:new Set(query?query.steps.slice(0,step+1).flatMap(s=>s.ns):[]),es:new Set(query?query.steps.slice(0,step+1).flatMap(s=>s.es):[])}}
function draw(){
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);
 const path=activePath(),near=selection?neighbors(selection):null,hasFocus=!!query||!!selection;
 ctx.save();ctx.translate(tx,ty);ctx.scale(scale,scale);
 for(const e of visibleEdges){const active=query?path.es.has(e.i):selection&&(e.source===selection||e.target===selection);ctx.strokeStyle=active?'#dcc586':hasFocus?'#35353f':'#484852';ctx.globalAlpha=active?.95:hasFocus?.3:.52;ctx.lineWidth=(active?1.9:.65)/scale;ctx.beginPath();ctx.moveTo(e.source.x,e.source.y);ctx.lineTo(e.target.x,e.target.y);ctx.stroke();
  if(active&&scale>.5){const dx=e.target.x-e.source.x,dy=e.target.y-e.source.y,len=Math.hypot(dx,dy)||1,px=e.target.x-dx/len*(r(e.target)+3)/Math.sqrt(scale),py=e.target.y-dy/len*(r(e.target)+3)/Math.sqrt(scale);ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px-dx/len*7/scale-dy/len*3/scale,py-dy/len*7/scale+dx/len*3/scale);ctx.lineTo(px-dx/len*7/scale+dy/len*3/scale,py-dy/len*7/scale-dx/len*3/scale);ctx.closePath();ctx.fillStyle='#dcc586';ctx.fill();}}
 const occupied=[];
 for(const n of visible){const active=path.ns.has(n.id)||near?.has(n.id),isSearch=$('search').value.trim()&&n.name.toLocaleLowerCase().includes($('search').value.trim().toLocaleLowerCase());ctx.globalAlpha=hasFocus&&!active?.2:1;ctx.fillStyle=active&&query?'#dcc586':kinds[n.label][1];const radius=r(n)/Math.sqrt(scale);ctx.beginPath();ctx.arc(n.x,n.y,radius,0,Math.PI*2);ctx.fill();if(n===selection||n===hover||isSearch){ctx.strokeStyle=n===selection?'#fff':'#c9b1ff';ctx.lineWidth=1.5/scale;ctx.beginPath();ctx.arc(n.x,n.y,radius+4/scale,0,Math.PI*2);ctx.stroke()}
 const primary=['Organization','Department','Policy','UnitProgram','Project'].includes(n.label),show=$('labels').checked||active||n===hover||isSearch||primary||scale>1.6;
 if(show){const size=(n===selection?13:11)/scale;ctx.font=`${n===selection?'600':'400'} ${size}px "Segoe UI","Malgun Gothic",sans-serif`;let title=n.label==='BudgetAllocation'?`${n.year} · ${fmt(n.amount)}천원`:n.name;const full=$('labels').checked||n===hover||n===selection||scale>1.6;if(!full&&title.length>19)title=title.slice(0,18)+'…';const tw=ctx.measureText(title).width,x=n.x+radius+5/scale,y=n.y,box={x:x*scale+tx,y:y*scale+ty-7,w:tw*scale,h:14};const collision=occupied.some(o=>o.x<box.x+box.w&&o.x+o.w>box.x&&o.y<box.y+box.h&&o.y+o.h>box.y);if(!collision||active||n===hover||$('labels').checked){ctx.globalAlpha=hasFocus&&!active?.22:.94;ctx.lineWidth=3/scale;ctx.strokeStyle='#1e1e23';ctx.strokeText(title,x,y+4/scale);ctx.fillStyle=active?'#f3dfae':'#c8c8d5';ctx.fillText(title,x,y+4/scale);occupied.push(box)}}}
 ctx.restore();ctx.globalAlpha=1;dirty=false;
}
function simulate(){
 if(simulation>=260||alpha<.012)return false;
 const a=alpha;for(let i=0;i<nodes.length;i++){const n=nodes[i];for(let j=i+1;j<nodes.length;j++){const m=nodes[j];let dx=n.x-m.x,dy=n.y-m.y,d2=dx*dx+dy*dy+.1;if(d2<1){dx=.4;dy=.7;d2=1}const force=Math.min(2,900/d2)*a;n.vx+=dx*force/Math.sqrt(d2);n.vy+=dy*force/Math.sqrt(d2);m.vx-=dx*force/Math.sqrt(d2);m.vy-=dy*force/Math.sqrt(d2)}}
 for(const e of edges){const n=e.source,m=e.target,dx=m.x-n.x,dy=m.y-n.y,len=Math.hypot(dx,dy)||1;const evidence=e.type==='EVIDENCED_BY',shortcut=e.type==='RESPONSIBLE_FOR',target=evidence?230:e.type==='HAS_PROJECT'?125:e.type==='HAS_LINE_ITEM'?48:75;const f=(len-target)/len*a*(evidence?.001:shortcut?.006:.045);n.vx+=dx*f;n.vy+=dy*f;m.vx-=dx*f;m.vy-=dy*f}
 for(const n of nodes){n.vx+=-n.x*.0007*a;n.vy+=-n.y*.0007*a;n.vx*=.75;n.vy*=.75;if(n.fx!==undefined){n.x=n.fx;n.y=n.fy;n.vx=n.vy=0}else{n.x+=n.vx;n.y+=n.vy}}
 alpha*=.984;simulation++;return true;
}
function frame(){const running=simulate();if(running)dirty=true;if(simulation===220&&!viewReady){fit();viewReady=true}if(simulation>=260||alpha<.012)$('layout-state').textContent='';if(dirty)draw();requestAnimationFrame(frame)}
function hit(x,y){let chosen=null,best=Infinity;for(const n of visible){const dist=Math.hypot(n.x*scale+tx-x,n.y*scale+ty-y);if(dist<Math.max(10,r(n)*Math.sqrt(scale)+5)&&dist<best){chosen=n;best=dist}}return chosen}
canvas.addEventListener('pointerdown',e=>{const rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top,n=hit(x,y);drag={id:e.pointerId,x,y,tx,ty,node:n,moved:false};if(n){n.fx=n.x;n.fy=n.y}canvas.setPointerCapture(e.pointerId);canvas.classList.add('dragging')});
canvas.addEventListener('pointermove',e=>{const rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;if(drag){if(Math.hypot(x-drag.x,y-drag.y)>3)drag.moved=true;if(drag.node){drag.node.fx=drag.node.x=(x-tx)/scale;drag.node.fy=drag.node.y=(y-ty)/scale}else{tx=drag.tx+x-drag.x;ty=drag.ty+y-drag.y}dirty=true;return}const n=hit(x,y);if(n!==hover){hover=n;dirty=true}canvas.style.cursor=n?'pointer':'grab';$('hover').hidden=!n;if(n){$('hover').textContent=kinds[n.label][0]+' · '+n.name;$('hover').style.left=Math.min(x+14,Math.max(8,W-245))+'px';$('hover').style.top=Math.min(y+14,H-75)+'px'}});
function pointerEnd(e){if(!drag)return;const current=drag;drag=null;canvas.classList.remove('dragging');if(!current.moved){if(current.node)select(current.node);else clearSelection()}try{canvas.releasePointerCapture(e.pointerId)}catch{}dirty=true}
canvas.addEventListener('pointerup',pointerEnd);canvas.addEventListener('pointercancel',()=>{drag=null;canvas.classList.remove('dragging')});canvas.addEventListener('pointerleave',()=>{hover=null;$('hover').hidden=true;dirty=true});
canvas.addEventListener('wheel',e=>{e.preventDefault();const b=canvas.getBoundingClientRect();zoomAt(Math.exp(-e.deltaY*.0015),e.clientX-b.left,e.clientY-b.top)},{passive:false});
$('fit').onclick=fit;$('zoom-in').onclick=()=>zoomAt(1.3);$('zoom-out').onclick=()=>zoomAt(1/1.3);$('labels').onchange=()=>dirty=true;$('search').oninput=search;
$('show-all').onclick=()=>{selectedTypes=new Set(Object.keys(kinds));local=false;if(selection)details();filter();fit()};
$('panel-toggle').onclick=()=>{const open=$('controls').classList.toggle('open');$('panel-toggle').setAttribute('aria-expanded',String(open))};
$('question').onchange=()=>{const key=$('question').value;query=key?buildQuestion(key):null;step=0;if(query){selectedTypes=new Set(Object.keys(kinds));local=false;selection=null;filter();fit();$('detail').classList.remove('selected')}questionUpdate()};
$('previous').onclick=()=>{step--;questionUpdate()};$('next').onclick=()=>{step++;questionUpdate()};$('all-path').onclick=()=>{step=query.steps.length-1;questionUpdate()};
document.addEventListener('keydown',e=>{if(e.key==='Escape'){clearSelection();$('controls').classList.remove('open');$('panel-toggle').setAttribute('aria-expanded','false')}});
fetch('knowledge-graph.json').then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json()}).then(data=>{
 nodes=data.nodes.map((n,i)=>({...n,x:Math.cos(i*2.39996)*Math.sqrt(i+1)*40,y:Math.sin(i*2.39996)*Math.sqrt(i+1)*40,vx:0,vy:0}));index=new Map(nodes.map(n=>[n.id,n]));edges=data.relationships.map((e,i)=>({...e,i,source:index.get(e.source),target:index.get(e.target)}));
 if(edges.some(e=>!e.source||!e.target))throw Error('관계의 노드 참조를 확인할 수 없습니다.');
 // Start each project as a local cluster; force relaxation then separates its branches.
 const ps=nodes.filter(n=>n.label==='Project');ps.forEach((p,i)=>{const angle=i/ps.length*Math.PI*2,cx=Math.cos(angle)*550,cy=Math.sin(angle)*550;p.x=cx;p.y=cy;const descendants=[...out(p.id,'HAS_BUDGET')];for(let k=0;k<descendants.length;k++){const n=descendants[k];if(k>200)break;const theta=k*2.39996;n.x=cx+Math.cos(theta)*Math.sqrt(k+1)*20;n.y=cy+Math.sin(theta)*Math.sqrt(k+1)*20;descendants.push(...out(n.id,'HAS_EXPENSE'),...out(n.id,'HAS_LINE_ITEM'))}});
 const types=$('types');for(const [type,[name,color]] of Object.entries(kinds)){const label=document.createElement('label');label.className='type-row';label.innerHTML=`<input type="checkbox" checked data-type="${type}"><span class="swatch" style="background:${color}"></span><span>${name}</span><span class="count">${nodes.filter(n=>n.label===type).length}</span>`;label.querySelector('input').onchange=e=>{e.target.checked?selectedTypes.add(type):selectedTypes.delete(type);filter()};types.append(label)}
 resize();filter();fit();bindList();requestAnimationFrame(frame);
 // Read-only inspection seam for smoke checks and reproducible counts.
 window.graphSnapshot=()=>({nodes:nodes.length,edges:edges.length,visible:visible.length,visibleEdges:visibleEdges.length,highlightedNodes:activePath().ns.size,highlightedEdges:activePath().es.size,selected:selection?.name,scale,simulation});
}).catch(err=>{$('error').hidden=false;$('error').textContent='그래프를 불러오지 못했습니다. 로컬 서버 주소로 접속한 뒤 새로고침하세요. '+err.message;$('counts').textContent='데이터 로드 실패';$('layout-state').textContent=''});
})();
