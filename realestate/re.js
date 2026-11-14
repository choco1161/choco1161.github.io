/* 부동산 두 화면이 함께 쓰는 스크립트.
   <script>window.RE_VIEW='index'</script>  → 광역권 지수 (KB 수급 온도계 + 실거래 매매 지수 + 시군구)
   <script>window.RE_VIEW='bunyang'</script> → 분양 (청약홈 공고 + 분양권 전매 + 분양가 vs 주변 시세)
   화면에 없는 요소는 그리지 않는다. ?g=수도권&c=11680 으로 광역권·시군구를 지정할 수 있다. */
(function(){
'use strict';
var DATA='../../data/';
var VIEW=window.RE_VIEW||'index';
var $=function(id){return document.getElementById(id)};
// 광역권 → KB 지역명 (첫 번째가 대표). 광주·전남은 2026.7 개편 뒤에도 KB가 이어서 내는 (구) 계열을 쓴다
var KBMAP={'전국':['전국','수도권','6개광역시','기타지방'],'수도권':['수도권','서울','경기','인천'],'부울경':['부산','울산','경남'],
  '대경권':['대구','경북'],'충청권':['대전','세종','충북','충남'],'호남권':['(구)광주광역시','전북','(구)전라남도'],'강원':['강원'],'제주':['제주']};
var COL=['#c23b25','#2563b0','#a87500','#1f7a6a','#6d4aa8','#c2571a','#5b6b7a'];
var st={g:'전국',mi:-1,code:null,sortK:VIEW==='bunyang'?'sn':'n',sortD:-1,stat:'open'};
(function(){var q=new URLSearchParams(location.search);if(q.get('g'))st.g=q.get('g');if(q.get('c'))st.code=q.get('c')})();
var API_BY_VIEW={index:['kb','apt'],bunyang:['apply','silv']};
var I,AP,S,KB;
function sync(){ // 지금 고른 광역권·시군구를 주소에 남기고, 다른 화면 링크에도 넘긴다
  var q=new URLSearchParams();if(st.g!=='전국')q.set('g',st.g);if(st.code)q.set('c',st.code);
  var s=q.toString();try{history.replaceState(null,'',location.pathname+(s?'?'+s:''))}catch(e){}
  document.querySelectorAll('a[data-carry]').forEach(function(a){a.href=a.getAttribute('data-carry')+(s?'?'+s:'')});
}

function ml(m){return m.slice(0,4)+'.'+m.slice(4)}
function f1(v){return v==null||isNaN(v)?'–':(Math.round(v*10)/10).toFixed(1)}
function n0(v){return v==null?'–':Math.round(v).toLocaleString()}
function pct(v){return v==null||!isFinite(v)?'–':(v>0?'+':'')+v.toFixed(1)+'%'}
function cls(v){return v==null?'':v>0.05?'up':v<-0.05?'down':''}
function safeUrl(u){return typeof u==='string'&&/^https?:\/\/[^\s"'<>]+$/i.test(u)?u:null}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function med(a){a=a.filter(function(x){return x!=null}).sort(function(x,y){return x-y});if(!a.length)return null;var h=a.length>>1;return a.length%2?a[h]:(a[h-1]+a[h])/2}
function get(u){return fetch(DATA+u,{cache:'no-cache'}).then(function(r){if(!r.ok)throw new Error(u+' '+r.status);return r.json()})}

// KB: 매일 받은 kb.json, 없으면 2026.09 스냅샷 (둘 다 2000.01부터 월별 배열)
function kbLoad(){
  return get('realestate/kb.json').then(function(k){k.live=true;return k}).catch(function(){
    return get('seed/kb_snapshot.json').then(function(s){var r={};Object.keys(s.BBL).forEach(function(n){r[n]=s.BBL[n]});
      return {live:false,m0:'200001',m:s.BS['전국'].length,bs:s.BS,px:s.PX,ratio:r,ratio_m:'202609',updated:'스냅샷'}}).catch(function(){return null})});
}
Promise.all([get('realestate/index.json'),get('realestate/status.json'),
  VIEW==='bunyang'?get('realestate/apply.json').catch(function(){return {rows:[]}}):Promise.resolve({rows:[]}),
  VIEW==='index'?kbLoad():Promise.resolve(null)])
.then(function(r){I=r[0];S=r[1];AP=r[2];KB=r[3];init()})
.catch(function(e){$('status').textContent='데이터를 불러오지 못했어요: '+e.message});

/* ───── 준비 ───── */
function members(){return I.regions.filter(function(r){return st.g==='전국'||r.g===st.g})}
function aggPpm(list,api,i){ // 거래량 가중 대신 시군구 중위가의 가중 평균 (가중치 = 평소 거래량)
  var num=0,den=0,n=0;
  list.forEach(function(r){var v=r[api][i];if(!v)return;n+=v[0]||0;if(v[1]!=null&&v[0]>=3){num+=v[1]*r.w;den+=r.w}});
  return {ppm:den?num/den:null,n:n};
}
function defaultMonth(){ // 거래가 평소의 60% 이상 모인 마지막 달
  var n=I.idx['전국'].n, ref=med(n.slice(0,-3));
  for(var i=I.m.length-1;i>=0;i--){if(n[i]!=null&&(!ref||n[i]>=ref*0.6))return i}
  return I.m.length-1;
}
function init(){
  if($('baseLbl'))$('baseLbl').textContent=ml(I.base);
  if($('thBase'))$('thBase').textContent=ml(I.base)+'=100';
  // 상태 표시: 이 화면이 쓰는 소스만
  var a={};(API_BY_VIEW[VIEW]||[]).forEach(function(k){if(S.apis&&S.apis[k])a[k]=S.apis[k]});
  $('status').innerHTML=Object.keys(a).map(function(k){var x=a[k];
    return '<span title="'+esc(x.msg)+'"><span class="dot" style="background:'+(x.ok?'var(--ok)':'var(--bad)')+'"></span>'+esc(x.name)+' '+(x.ok?'연결됨':'<b style="color:var(--bad)">연결 안 됨</b>')+'</span>'}).join('')+
    '<span>마지막 확인 '+esc(S.checked||'–')+'</span>';
  var bad=Object.keys(a).filter(function(k){return !a[k].ok});
  if(bad.length)$('status').insertAdjacentHTML('beforeend','<span style="flex-basis:100%">'+bad.map(function(k){return esc(a[k].name)+': '+esc(a[k].msg)}).join(' · ')+'</span>');
  var gs=['전국'].concat(I.gwang);
  $('chips').innerHTML=gs.map(function(g){return '<button class="chip" type="button" data-g="'+g+'" aria-pressed="'+(g===st.g)+'">'+g+'</button>'}).join('');
  $('chips').addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;st.g=b.dataset.g;st.code=null;kbFirst=null;render()});
  if($('kbBody'))$('kbBody').addEventListener('click',function(e){var tr=e.target.closest('tr[data-kb]');if(!tr)return;kbFirst=tr.dataset.kb;drawKb();renderKbBoard()});
  st.mi=defaultMonth();
  $('month').innerHTML=I.m.map(function(m,i){return '<option value="'+i+'">'+ml(m)+(I.recent.indexOf(m)>=0?' (집계 중)':'')+'</option>'}).reverse().join('');
  $('month').value=String(st.mi);
  $('month').addEventListener('change',function(e){st.mi=+e.target.value;render()});
  if($('smoothSeg')){
    $('smoothSeg').addEventListener('click',function(e){var b=e.target.closest('button');if(b)setSmooth(b.dataset.v==='3')});
    setSmooth(smooth,true);
  }
  if($('stat')){$('stat').value=st.stat;$('stat').addEventListener('change',function(e){st.stat=e.target.value;renderApply()})}
  if($('tbl')){
    document.querySelector('#tbl thead').addEventListener('click',function(e){var th=e.target.closest('th[data-k]');if(!th)return;var k=th.dataset.k;
      if(st.sortK===k)st.sortD=-st.sortD;else{st.sortK=k;st.sortD=k==='nm'?1:-1}renderTable()});
    $('tbody').addEventListener('click',pickRow);
    $('tbody').addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();pickRow(e)}});
  }
  AP.rows.forEach(prepApply);
  var ro,chart=$('chIdx')||$('chKb');
  if(chart)new ResizeObserver(function(){clearTimeout(ro);ro=setTimeout(function(){if($('chIdx'))drawIdx();if($('chKb'))drawKb()},80)}).observe(chart);
  var src=VIEW==='bunyang'
    ?'출처: 한국부동산원 청약홈 APT 분양정보, 국토교통부 아파트 분양권전매·매매 실거래가(공공데이터포털). GitHub Actions가 매일 수집해요. 분양가는 공고문 최고가 기준이고, 주변 매매 대비는 분양가 전용 ㎡당을 같은 시군구 매매 ㎡당 중위가와 비교한 값이에요. 분양권·매매 ㎡당은 해제(취소) 거래를 뺀 중위가예요. '
    :'출처: KB부동산 데이터허브 주택가격동향조사(월간 아파트 매수우위·매매가격지수), 국토교통부 아파트 매매 실거래가(공공데이터포털). GitHub Actions가 매일 수집해요. 매매 지수는 시군구별 ㎡당 중위가를 '+ml(I.base)+' 대비 비율로 바꾼 뒤 평소 거래량으로 가중 평균한 값이며 거래 5건 미만 시군구는 그 달 계산에서 빼요. 해제(취소) 거래는 제외했어요. 한국부동산원·KB 공식 지수와는 산출 방식이 달라요. 매수우위지수 = 100 + 매수자 많음% − 매도자 많음%. ';
  $('foot').innerHTML=src+'데이터 수집 '+esc(I.asof)+'. 정보 제공용이며 투자 권유가 아닙니다.';
  render();
}
function pickRow(e){var tr=e.target.closest('tr[data-c]');if(!tr||VIEW!=='bunyang')return;var c=tr.dataset.c;st.code=st.code===c?null:c;sync();renderTable();renderApply()}

/* ───── 분양 ───── */
var TODAY=new Date();TODAY.setHours(0,0,0,0);
function D(s){return s?new Date(String(s).slice(0,10)+'T00:00:00'):null}
function prepApply(c){
  var s=D(c.a0),e=D(c.a1||c.a0);
  c.st=!s?'done':TODAY<s?'soon':TODAY<=e?'live':'done';
  c.dd=s?Math.round((s-TODAY)/864e5):null;
  var t=(c.types||[]).map(function(x){return {ex:parseFloat(x[0]),pr:x[4]}}).filter(function(x){return x.ex>0&&x.pr>0});
  var t84=t.filter(function(x){return x.ex>=80&&x.ex<90});
  c.p84=t84.length?Math.max.apply(null,t84.map(function(x){return x.pr})):null;
  var pool=t84.length?t84:t;
  c.ppm=pool.length?med(pool.map(function(x){return x.pr/x.ex})):null;
}
function applyRows(){
  return AP.rows.filter(function(c){return (st.g==='전국'||c.g===st.g)&&(!st.code||c.code===st.code)});
}

/* ───── 렌더 ───── */
function render(){
  document.querySelectorAll('#chips button').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.g===st.g))});
  sync();renderKpis();
  if($('chIdx'))drawIdx();
  if($('chKb'))drawKb();
  if($('kbBody'))renderKbBoard();
  if($('tbody'))renderTable();
  if($('apBody'))renderApply();
}
function renderKpis(){
  var i=st.mi,L=members(),x=I.idx[st.g]||{i:[],n:[]};
  var v=x.i[i],pv=x.i[i-1],y=x.i[i-12];
  var a=aggPpm(L,'apt',i),s=aggPpm(L,'silv',i),sp=aggPpm(L,'silv',i-1);
  var prem=a.ppm&&s.ppm?(s.ppm/a.ppm-1)*100:null;
  var ap=applyRows(),open=ap.filter(function(c){return c.st!=='done'}).length;
  var part=I.recent.indexOf(I.m[i])>=0?' · 집계 중':'';
  function t(l,val,sub){return '<div class="tile"><div class="l">'+l+'</div><div class="v">'+val+'</div><div class="s">'+sub+'</div></div>'}
  var where=st.g==='전국'?'전국':st.g;
  if(VIEW==='index'){
    var kn=KB?kbNames():[],ks=kn.length?kbStats(kn[0]):null;
    $('kpis').innerHTML=
      t(where+' 매매 지수',f1(v),ml(I.m[i])+part+' · 전월 '+(v!=null&&pv!=null?'<span class="'+cls(v-pv)+'">'+(v-pv>0?'+':'')+(v-pv).toFixed(2)+'p</span>':'–')+(y!=null?' · 전년 '+pct((v/y-1)*100):''))+
      t('매매 ㎡당 중위가',n0(a.ppm)+'<small>만원</small>','84㎡ 환산 '+(a.ppm?(a.ppm*84/1e4).toFixed(2)+'억':'–')+' · 거래 '+n0(a.n)+'건')+
      t('KB 매수우위'+(ks?' · '+esc(ks.n):''),ks?f1(ks.v):'–',ks?kbLab(ks.L)+' · 12개월 평균 '+f1(ks.ma)+(ks.dir?' · '+ks.dir:''):'KB 데이터 없음')+
      t('KB 가격 전년비'+(ks?' · '+esc(ks.n):''),ks?'<span class="'+cls(ks.yoy)+'">'+pct(ks.yoy)+'</span>':'–',ks?'3개월 '+pct(ks.m3):'');
  }else{
    var w=ap.filter(function(c){return c.ppm}),bp=w.length?med(w.map(function(c){return c.ppm})):null;
    $('kpis').innerHTML=
      t(where+' 분양 공고',ap.length+'<small>건</small>','청약 예정·진행 '+open+'건'+(AP.since?' · '+esc(AP.since)+' 이후':''))+
      t('분양가 ㎡당 중위',n0(bp)+'<small>만원</small>','전용 기준 · 84㎡ 환산 '+(bp?(bp*84/1e4).toFixed(2)+'억':'–'))+
      t('분양권 전매 ㎡당',n0(s.ppm)+'<small>만원</small>',ml(I.m[i])+part+' · 거래 '+n0(s.n)+'건'+(sp.n?' (전월 '+n0(sp.n)+')':''))+
      t('분양권 / 기존 매매',prem==null?'–':'<span class="'+cls(prem)+'">'+pct(prem)+'</span>','같은 지역 기존 아파트 매매 ㎡당 '+n0(a.ppm)+'만원 대비');
  }
  if($('hIdx'))$('hIdx').textContent=(st.g==='전국'?'광역권':st.g+' · 시도')+' 매매 지수';
  if($('hTbl'))$('hTbl').textContent=where+' 시군구 · '+ml(I.m[i]);
}

/* 지수 차트: 전국이면 광역권 7개, 광역권이면 그 안의 시도 */
var smooth=false;   // true면 3개월 평균 (그 달 포함 직전 3개월 값이 모두 있을 때만)
try{smooth=localStorage.getItem('re-smooth')==='3'}catch(e){}
function ser(key){
  var a=(I.idx[key]||{i:[]}).i;
  if(!smooth)return a;
  return a.map(function(v,i){if(i<2||v==null||a[i-1]==null||a[i-2]==null)return null;return Math.round((v+a[i-1]+a[i-2])/3*100)/100});
}
function setSmooth(on,noDraw){
  smooth=on;if(!noDraw)try{localStorage.setItem('re-smooth',on?'3':'1')}catch(e){}
  document.querySelectorAll('#smoothSeg button').forEach(function(b){b.setAttribute('aria-pressed',String((b.dataset.v==='3')===on))});
  if($('smoothNote'))$('smoothNote').textContent=on?'3개월 평균: 그 달과 직전 두 달의 평균이라 단지 구성에 따른 출렁임이 줄어요. 처음 두 달은 비어 있어요.':'월별 값: 그 달 거래된 단지에 따라 크게 출렁일 수 있어요.';
  if(!noDraw)drawIdx();
}
function seriesKeys(){
  if(st.g==='전국')return [['전국','전국']].concat(I.gwang.map(function(g){return [g,g]}));
  var sidos=[];I.regions.forEach(function(r){if(r.g===st.g&&sidos.indexOf(r.s)<0)sidos.push(r.s)});
  return [[st.g,st.g]].concat(sidos.length>1?sidos.map(function(s){return ['시도:'+s,s]}):[]);
}
function drawIdx(){
  var box=$('chIdx'),W=box.clientWidth||600,H=Math.max(220,Math.min(320,W*0.55)),pl=40,pr=64,pt=12,pb=26;
  var keys=seriesKeys(),M=I.m,N=M.length,rec=I.recent;
  var all=[];keys.forEach(function(k){ser(k[0]).forEach(function(v){if(v!=null)all.push(v)})});
  if(!all.length){box.innerHTML='<div class="empty">아직 지수를 계산할 데이터가 없어요. API 연결 후 다음 갱신 때 채워져요.</div>';return}
  var lo=Math.min.apply(null,all.concat([100])),hi=Math.max.apply(null,all.concat([100])),pad=(hi-lo)*0.08||2;lo-=pad;hi+=pad;
  var X=function(i){return pl+(W-pl-pr)*(N<2?0:i/(N-1))},Y=function(v){return pt+(H-pt-pb)*(1-(v-lo)/(hi-lo))};
  var s='',step=(hi-lo)>20?5:(hi-lo)>8?2:1;
  for(var g=Math.ceil(lo/step)*step;g<=hi;g+=step){s+='<line x1="'+pl+'" x2="'+(W-pr)+'" y1="'+Y(g)+'" y2="'+Y(g)+'" stroke="var(--grid)"/><text class="ax" x="'+(pl-6)+'" y="'+(Y(g)+4)+'" text-anchor="end">'+g+'</text>'}
  s+='<line x1="'+pl+'" x2="'+(W-pr)+'" y1="'+Y(100)+'" y2="'+Y(100)+'" stroke="var(--muted)" stroke-dasharray="2 3" opacity=".6"/>';
  var ev=Math.max(1,Math.ceil(N/(W<480?4:7)));
  M.forEach(function(m,i){if(i%ev===0||i===N-1)s+='<text class="ax" x="'+X(i)+'" y="'+(H-6)+'" text-anchor="middle">'+m.slice(2,4)+'.'+m.slice(4)+'</text>'});
  s+='<line id="cur" x1="'+X(st.mi)+'" x2="'+X(st.mi)+'" y1="'+pt+'" y2="'+(H-pb)+'" stroke="var(--accent)" opacity=".35"/>';
  var labels=[];
  keys.forEach(function(k,ki){
    var a=ser(k[0]),c=ki===0?'var(--ink)':COL[(ki-1)%COL.length],wd=ki===0?2.6:1.7;
    var solid='',dash='',last=null;
    a.forEach(function(v,i){if(v==null){last=null;return}var p=X(i).toFixed(1)+' '+Y(v).toFixed(1);var inRec=rec.indexOf(M[i])>=0;
      if(last){if(inRec)dash+='M'+last+'L'+p;else solid+='L'+p}else if(!inRec)solid+='M'+p;last=p});
    s+='<path d="'+solid+'" fill="none" stroke="'+c+'" stroke-width="'+wd+'" stroke-linejoin="round"/>';
    if(dash)s+='<path d="'+dash+'" fill="none" stroke="'+c+'" stroke-width="'+wd+'" stroke-dasharray="4 3"/>';
    for(var j=st.mi;j>=0;j--)if(a[j]!=null){labels.push({y:Y(a[j]),t:k[1]+' '+f1(a[j]),c:c});break}
  });
  labels.sort(function(a,b){return a.y-b.y});for(var q=1;q<labels.length;q++)if(labels[q].y-labels[q-1].y<13)labels[q].y=labels[q-1].y+13;
  labels.forEach(function(l){s+='<text class="lb" x="'+(W-pr+6)+'" y="'+(l.y+4)+'" fill="'+l.c+'">'+esc(l.t)+'</text>'});
  box.innerHTML='<svg viewBox="0 0 '+W+' '+H+'" height="'+H+'" role="img" aria-label="광역권 매매 지수 추이">'+s+'<rect id="hit" x="'+pl+'" y="'+pt+'" width="'+(W-pl-pr)+'" height="'+(H-pt-pb)+'" fill="transparent"/></svg><div class="tip" id="tipI"></div>';
  var tip=$('tipI'),svg=box.querySelector('svg');
  function show(ev){var r=svg.getBoundingClientRect(),x=(ev.clientX-r.left)*(W/r.width),i=Math.round((x-pl)/((W-pl-pr)/(N-1)));i=Math.max(0,Math.min(N-1,i));
    tip.innerHTML='<b>'+ml(M[i])+(rec.indexOf(M[i])>=0?' (집계 중)':'')+(smooth?' · 3개월 평균':'')+'</b>'+keys.map(function(k,ki){var v=ser(k[0])[i];var c=ki===0?'var(--ink)':COL[(ki-1)%COL.length];
      return '<div class="r"><span><span class="sw" style="background:'+c+'"></span>'+esc(k[1])+'</span><b>'+f1(v)+'</b></div>'}).join('');
    tip.style.display='block';var px=X(i)*(r.width/W);tip.style.left=Math.min(px+12,r.width-tip.offsetWidth)+'px';tip.style.top='8px'}
  svg.addEventListener('pointermove',show);svg.addEventListener('pointerleave',function(){tip.style.display='none'});
  svg.addEventListener('click',function(ev){var r=svg.getBoundingClientRect(),x=(ev.clientX-r.left)*(W/r.width),i=Math.round((x-pl)/((W-pl-pr)/(N-1)));st.mi=Math.max(0,Math.min(N-1,i));$('month').value=String(st.mi);render()});
}

/* KB 매수우위 (최근 5년) + 첫 지역 12개월 평균 */
var kbFirst=null;
function kbNames(){var n=(KBMAP[st.g]||[]).filter(function(x){return KB&&KB.bs[x]});if(kbFirst&&n.indexOf(kbFirst)>0){n.splice(n.indexOf(kbFirst),1);n.unshift(kbFirst)}return n}
function kbLab(i){var y=+KB.m0.slice(0,4)+Math.floor((+KB.m0.slice(4)-1+i)/12),m=(+KB.m0.slice(4)-1+i)%12+1;return y+'.'+String(m).padStart(2,'0')}
function ma12(a,i){var s=0;for(var k=i-11;k<=i;k++){if(k<0||!a[k])return null;s+=a[k]}return s/12}
function kbStats(n){
  var a=KB.bs[n],p=KB.px[n]||[],L=a.length-1;while(L>0&&!a[L])L--;
  var m0=ma12(a,L),m1=ma12(a,L-12),dma=m0!=null&&m1!=null?m0-m1:null;
  var pl=p.length-1;while(pl>0&&!p[pl])pl--;
  return {n:n,v:a[L],dv:a[L]&&a[L-1]?a[L]-a[L-1]:null,ma:m0,dma:dma,dir:dma==null?null:dma>3?'개선':dma<-3?'악화':'횡보',
    lvl:a[L]==null?null:a[L]>=100?'매수자 우위 구간':a[L]>=80?'균형에 가까운 구간':'매도자 우위 구간',
    yoy:p[pl]&&p[pl-12]?(p[pl]/p[pl-12]-1)*100:null,m3:p[pl]&&p[pl-3]?(p[pl]/p[pl-3]-1)*100:null,L:L};
}
function drawKb(){
  var box=$('chKb');
  $('kbPill').textContent=KB?(KB.live?'KB 데이터허브 · 매일 확인 · KB 업데이트 '+(KB.updated||'–'):'스냅샷 2026.09 · KB 연결 전'):'';
  if(!KB){box.innerHTML='<div class="empty">KB 데이터 없음</div>';return}
  var names=kbNames();
  if(!names.length){box.innerHTML='<div class="empty">이 권역은 KB 매수우위가 없어요.</div>';return}
  $('hKb').textContent='KB 매수우위지수 · '+names.join('·');
  var r=KB.ratio[names[0]];$('kbRatio').textContent=r?names[0]+' '+kbLab(kbStats(names[0]).L)+' 응답: 매수자 많음 '+f1(r[0])+'% · 비슷함 '+f1(r[1])+'% · 매도자 많음 '+f1(r[2])+'%':'';
  var len=KB.bs[names[0]].length;while(len>1&&!KB.bs[names[0]][len-1])len--;
  var W=box.clientWidth||400,H=Math.max(200,Math.min(260,W*0.6)),pl=34,pr=84,pt=10,pb=24,from=len-60;
  var X=function(i){return pl+(W-pl-pr)*(i-from)/(len-1-from)},Y=function(v){return pt+(H-pt-pb)*(1-v/160)};
  var s='';[0,50,100,150].forEach(function(g){s+='<line x1="'+pl+'" x2="'+(W-pr)+'" y1="'+Y(g)+'" y2="'+Y(g)+'" stroke="'+(g===100?'var(--muted)':'var(--grid)')+'"'+(g===100?' stroke-dasharray="2 3"':'')+'/><text class="ax" x="'+(pl-6)+'" y="'+(Y(g)+4)+'" text-anchor="end">'+g+'</text>'});
  for(var yr=0;yr<6;yr++){var i=len-1-12*(5-yr);if(i>=from)s+='<text class="ax" x="'+X(i)+'" y="'+(H-6)+'" text-anchor="middle">'+kbLab(i).slice(2)+'</text>'}
  var labels=[],a0=KB.bs[names[0]],md='';
  for(var j=from;j<len;j++){var mv=ma12(a0,j);if(mv!=null)md+=(md?'L':'M')+X(j).toFixed(1)+' '+Y(mv).toFixed(1)}
  s+='<path d="'+md+'" fill="none" stroke="'+COL[0]+'" stroke-width="1.4" stroke-dasharray="4 3" opacity=".8"/>';
  names.forEach(function(n,k){var a=KB.bs[n];var c=COL[k%COL.length],d='';
    for(var i=from;i<len;i++){if(!a[i])continue;d+=(d?'L':'M')+X(i).toFixed(1)+' '+Y(a[i]).toFixed(1)}
    s+='<path d="'+d+'" fill="none" stroke="'+c+'" stroke-width="'+(k?1.5:2.4)+'"/>';labels.push({y:Y(a[len-1]||0),t:n+' '+f1(a[len-1]),c:c})});
  labels.sort(function(a,b){return a.y-b.y});for(var q=1;q<labels.length;q++)if(labels[q].y-labels[q-1].y<13)labels[q].y=labels[q-1].y+13;
  labels.forEach(function(l){s+='<text class="lb" x="'+(W-pr+6)+'" y="'+(l.y+4)+'" fill="'+l.c+'">'+esc(l.t)+'</text>'});
  box.innerHTML='<svg viewBox="0 0 '+W+' '+H+'" height="'+H+'" role="img" aria-label="KB 매수우위지수 최근 5년">'+s+'</svg>';
}
function renderKbBoard(){
  var body=$('kbBody');
  if(!KB){body.innerHTML='<tr><td colspan="9" class="empty">KB 데이터 없음</td></tr>';return}
  var names=kbNames();
  $('hBoard').textContent='KB 수급 온도계 · '+(st.g==='전국'?'전국':st.g)+(names.length?' · '+kbLab(kbStats(names[0]).L):'');
  body.innerHTML=names.length?names.map(function(n){var x=kbStats(n);
    var b=x.dir==null?'–':'<span class="tag '+(x.dir==='개선'?'live':x.dir==='악화'?'soon':'')+'">'+x.dir+'</span>';
    return '<tr class="click" tabindex="0" data-kb="'+esc(n)+'" aria-selected="'+(names[0]===n)+'"><td>'+esc(n)+'</td><td>'+f1(x.v)+'</td>'+
      '<td class="'+cls(x.dv)+'">'+(x.dv==null?'–':(x.dv>0?'+':'')+f1(x.dv))+'</td><td>'+f1(x.ma)+'</td>'+
      '<td class="'+cls(x.dma)+'">'+(x.dma==null?'–':(x.dma>0?'+':'')+f1(x.dma)+'p')+'</td><td>'+b+'</td><td style="color:var(--muted)">'+(x.lvl||'–')+'</td>'+
      '<td class="'+cls(x.yoy)+'">'+pct(x.yoy)+'</td><td class="'+cls(x.m3)+'">'+pct(x.m3)+'</td></tr>'}).join('')
    :'<tr><td colspan="9" class="empty">이 권역은 KB 매수우위가 없어요</td></tr>';
}

/* 시군구 표 */
var apCount={};
function renderTable(){
  var i=st.mi,L=members();
  apCount={};AP.rows.forEach(function(c){if(c.code)apCount[c.code]=(apCount[c.code]||0)+1});
  var rows=L.map(function(r){
    var v=r.apt[i],p=r.apt[i-1],b=r.apt[I.m.indexOf(I.base)],s=r.silv[i];
    var ppm=v&&v[1],n=v?v[0]:0,sppm=s&&s[1];
    return {r:r,nm:r.nm,ppm:ppm,p84:ppm?ppm*84/1e4:null,mom:ppm&&p&&p[1]?(ppm/p[1]-1)*100:null,
      idx:ppm&&b&&b[1]?ppm/b[1]*100:null,n:n,sppm:sppm,sn:s?s[0]:0,prem:ppm&&sppm&&s[0]>=3?(sppm/ppm-1)*100:null,ap:apCount[r.c]||0};
  });
  var k=st.sortK,d=st.sortD;
  rows.sort(function(a,b){if(k==='nm')return d*a.nm.localeCompare(b.nm,'ko');var x=a[k],y=b[k];if(x==null&&y==null)return 0;if(x==null)return 1;if(y==null)return -1;return d*(x-y)});
  document.querySelectorAll('#tbl thead th').forEach(function(th){if(th.dataset.k===k)th.setAttribute('aria-sort',d>0?'ascending':'descending');else th.removeAttribute('aria-sort')});
  var multi=['강원','제주'].indexOf(st.g)<0;
  function name(x){return esc(x.nm)+(multi?' <span style="color:var(--muted);font-size:11.5px">'+esc(x.r.s)+'</span>':'')}
  if(VIEW==='bunyang'){   // 분양권 화면: 분양권 거래가 있거나 분양 공고가 있는 시군구만
    rows=rows.filter(function(x){return x.sn||x.ap});
    $('tbody').innerHTML=rows.length?rows.map(function(x){
      return '<tr class="click" tabindex="0" data-c="'+x.r.c+'" aria-selected="'+(st.code===x.r.c)+'"><td>'+name(x)+'</td>'+
        '<td class="'+(x.sn<5?'thin':'')+'">'+n0(x.sppm)+'</td><td>'+(x.sn?n0(x.sn):'–')+'</td>'+
        '<td>'+n0(x.ppm)+'</td><td class="'+cls(x.prem)+'">'+pct(x.prem)+'</td><td>'+(x.ap||'–')+'</td></tr>'}).join('')
      :'<tr><td colspan="6" class="empty">'+(I.regions.some(function(r){return r.silv.some(function(v){return v})})?'이 달에 분양권 거래나 분양 공고가 있는 시군구가 없어요':'분양권 전매 데이터를 모으는 중이에요. 첫 수집이 끝나면 채워져요.')+'</td></tr>';
    return;
  }
  $('tbody').innerHTML=rows.length?rows.map(function(x){
    return '<tr><td>'+name(x)+'</td>'+
      '<td class="'+(x.n<10?'thin':'')+'">'+n0(x.ppm)+'</td><td class="'+(x.n<10?'thin':'')+'">'+(x.p84==null?'–':x.p84.toFixed(2))+'</td>'+
      '<td class="'+cls(x.mom)+(x.n<10?' thin':'')+'">'+pct(x.mom)+'</td><td class="'+(x.n<10?'thin':'')+'">'+f1(x.idx)+'</td><td>'+n0(x.n)+'</td></tr>'}).join('')
    :'<tr><td colspan="6" class="empty">데이터가 없어요</td></tr>';
}

/* 분양 목록 */
function renderApply(){
  var i=st.mi,L=applyRows();
  if(st.stat==='open')L=L.filter(function(c){return c.st!=='done'});else if(st.stat==='done')L=L.filter(function(c){return c.st==='done'});
  L.sort(function(a,b){var o={live:0,soon:1,done:2};return (o[a.st]-o[b.st])||(a.st==='done'?String(b.a0).localeCompare(a.a0):String(a.a0).localeCompare(b.a0))});
  var byCode={};I.regions.forEach(function(r){byCode[r.c]=r});
  var nmSel=st.code&&byCode[st.code]?byCode[st.code].nm:null;
  $('hApply').textContent='분양 공고 · '+(nmSel||(st.g==='전국'?'전국':st.g))+' '+L.length+'건';
  if(!AP.rows.length){$('apBody').innerHTML='<tr><td colspan="8" class="empty">청약홈 API가 연결되면 다음 갱신 때 채워져요.</td></tr>';return}
  $('apBody').innerHTML=L.length?L.map(function(c){
    var tag=c.st==='soon'?'<span class="tag soon">예정 D-'+c.dd+'</span>':c.st==='live'?'<span class="tag live">청약 중</span>':'<span class="tag">종료</span>';
    var ref=null,refNm='';
    if(c.code&&byCode[c.code]){var v=byCode[c.code].apt[i];if(v&&v[1]&&v[0]>=5){ref=v[1];refNm=byCode[c.code].nm}}
    if(!ref){var sl=I.regions.filter(function(r){return r.s===c.sido});var a=aggPpm(sl,'apt',i);ref=a.ppm;refNm=c.sido+' 평균'}
    var vs=c.ppm&&ref?(c.ppm/ref-1)*100:null;
    var where=(c.addr||'').split(' ').slice(1,3).join(' ');
    // 링크: 단지명 → 분양 홈페이지(없으면 청약홈 상세), 아래 줄에 공고문·청약홈
    var ah=c.no?'https://www.applyhome.co.kr/ai/aia/selectAPTLttotPblancDetail.do?houseManageNo='+encodeURIComponent(c.no)+'&pblancNo='+encodeURIComponent(c.no):null;
    var home=safeUrl(c.home),doc=safeUrl(c.doc),main=home||ah;
    function A(u,t,cls){return '<a href="'+esc(u)+'" target="_blank" rel="noopener nofollow"'+(cls?' class="'+cls+'"':'')+'>'+t+'</a>'}
    var homeLbl=home&&/^https?:\/\/apply\.lh\.or\.kr\//.test(home)?'LH 청약플러스':'분양 홈페이지';
    var links=[home?A(home,homeLbl,'lk'):'',doc?A(doc,'공고문','lk'):'',ah?A(ah,'청약홈','lk'):''].filter(Boolean).join(' · ');
    return '<tr'+(c.st==='done'?' style="opacity:.6"':'')+'><td>'+tag+'</td><td class="nm"><b>'+(main?A(main,esc(c.name)):esc(c.name))+'</b><span>'+esc(where)+' · '+esc(c.kind)+'</span>'+(links?'<span class="links">'+links+'</span>':'')+'</td>'+
      '<td>'+n0(c.tot)+'</td><td>'+(c.a0?String(c.a0).slice(5).replace('-','.')+'~'+String(c.a1||c.a0).slice(5).replace('-','.'):'–')+'</td>'+
      '<td>'+(c.p84?(c.p84/1e4).toFixed(2):'–')+'</td><td>'+n0(c.ppm)+'</td>'+
      '<td class="'+cls(vs)+'" title="'+esc(refNm)+' 매매 ㎡당 '+n0(ref)+'만원">'+pct(vs)+'</td><td>'+(c.move?String(c.move).slice(0,4)+'.'+String(c.move).slice(4,6):'–')+'</td></tr>'}).join('')
    :'<tr><td colspan="8" class="empty">'+(st.stat==='open'&&applyRows().length?'지금 청약 예정·진행 중인 공고는 없어요. 상태를 "전체"로 바꾸면 '+applyRows().length+'건이 보여요.':'조건에 맞는 공고가 없어요')+'</td></tr>';
}
})();
