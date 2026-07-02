let MIRYOCHI = [];

let FACILITIES = [];

let WARDS_GEOJSON = null; // 大阪市24区の境界ポリゴン（loadAndInitで取得）

// ── ダークモード ──
const TILE_LIGHT = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
const TILE_DARK  = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
let baseTileLayer = null; // 地図の背景タイル（テーマ切替時に差し替えるため保持）

function currentTheme(){
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}
function updateThemeBtn(){
  const b = document.getElementById('themeBtn');
  if (b) b.textContent = currentTheme() === 'dark' ? '☀️' : '🌙';
}
function toggleTheme(){
  const t = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('theme', t); // 次回以降も同じテーマで開く
  updateThemeBtn();
  if (baseTileLayer) baseTileLayer.setUrl(t === 'dark' ? TILE_DARK : TILE_LIGHT);
}

const UC={
  '教育・文化・スポーツ':'#1a6fb5','社会福祉・保健':'#1e8c5a',
  '庁舎・事務所':'#0f8080','インフラ':'#d4670a',
  'その他':'#888','もと施設':'#6b3fa0','流通産業':'#b5841a'
};
const UB={
  '教育・文化・スポーツ':'#deeaff','社会福祉・保健':'#e2f5ec',
  '庁舎・事務所':'#daf0f0','インフラ':'#fff0dd',
  'その他':'#eee','もと施設':'#f0e8ff','流通産業':'#fff5dd'
};

const BASE='https://www.city.osaka.lg.jp/shiseikaikakushitsu/cmsfiles/contents/0000619/619708/';
const BASE_KARTE=BASE; // カルテも同じベースURL

function karteUrl(f){
  if(!f.karteFile||!f.kartePage) return null;
  return BASE_KARTE+f.karteFile+'#page='+f.kartePage;
}

// useDetailの表記ゆれを正規化（同じ文字列が繰り返されているケースを除去）
function normalizeUseDetail(s){
  for(let n=2;n<=4;n++){
    if(s.length%n===0){
      const unit=s.slice(0,s.length/n);
      if(unit.repeat(n)===s) return unit;
    }
  }
  return s;
}


// 同一住所インデックス（正規化住所 → 施設数）
function normAddr(addr){return addr.replace(/\s|　/g,'').replace(/[−ー―]/g,'-');}
const addrCount={};





let state={q:'',wards:new Set(),uses:new Set(),useDetails:new Set(),bureaus:new Set(),karte:'',rental:'',sort:'name',view:'grid',sel:null,listFilter:''};
const selected=new Set();
let dashOpen=false;

function init(){
  const WARD_ORDER=['東淀川区','旭区','淀川区','西淀川区','北区','鶴見区','城東区','都島区','福島区','此花区','中央区','西区','東成区','港区','浪速区','天王寺区','生野区','大正区','阿倍野区','西成区','東住吉区','平野区','住之江区','住吉区'];
  const allWards=[...new Set(FACILITIES.map(f=>f.ward))];
  const wardList=[...WARD_ORDER.filter(w=>allWards.includes(w)),...allWards.filter(w=>!WARD_ORDER.includes(w)).sort()];
  buildWsItems(wardList);
  // 用途区分ドロップダウン初期化
  const allUses=[...new Set(FACILITIES.map(f=>f.use))].sort();
  buildUsItems(allUses);
  // 用途詳細ドロップダウン初期化（施設数の多い順）
  const udCount={};FACILITIES.forEach(f=>{udCount[f.useDetail]=(udCount[f.useDetail]||0)+1;});
  buildUdsItems([...new Set(FACILITIES.map(f=>f.useDetail))].sort((a,b)=>udCount[b]-udCount[a]));
  // 所管局ドロップダウン初期化
  const allBureaus=new Set(FACILITIES.map(f=>extractBureau(f.manager)));
  const WARD_BUREAUS=['東淀川区役所','旭区役所','淀川区役所','西淀川区役所','北区役所','鶴見区役所','城東区役所','都島区役所','福島区役所','此花区役所','中央区役所','西区役所','東成区役所','港区役所','浪速区役所','天王寺区役所','生野区役所','大正区役所','阿倍野区役所','西成区役所','東住吉区役所','平野区役所','住之江区役所','住吉区役所'];
  const nonWardBureaus=[...allBureaus].filter(b=>!WARD_BUREAUS.includes(b)).sort((a,b)=>a.localeCompare(b,'ja'));
  const bureauList=[...nonWardBureaus,...WARD_BUREAUS.filter(b=>allBureaus.has(b))];
  buildBsItems(bureauList);
  document.getElementById('qi').addEventListener('input',e=>{state.q=e.target.value;render()});
  document.addEventListener('click',e=>{
    if(!document.getElementById('wsWrap').contains(e.target)) document.getElementById('wsMenu').style.display='none';
    if(!document.getElementById('usWrap').contains(e.target)) document.getElementById('usMenu').style.display='none';
    if(!document.getElementById('bsWrap').contains(e.target)) document.getElementById('bsMenu').style.display='none';
    if(!document.getElementById('udsWrap').contains(e.target)) document.getElementById('udsMenu').style.display='none';
  });
  document.getElementById('ks').addEventListener('change',e=>{state.karte=e.target.value;render()});
  document.getElementById('rs').addEventListener('change',e=>{state.rental=e.target.value;render()});
  render();
}

function resetF(){
  state={q:'',wards:new Set(),uses:new Set(),useDetails:new Set(),bureaus:new Set(),karte:'',rental:'',sort:state.sort,view:state.view,sel:null,listFilter:''};
  document.getElementById('ks').value='';
  document.getElementById('rs').value='';
  document.getElementById('qi').value='';
  document.getElementById('listFilterSel').value='';
  updateWsBtn(); updateUsBtn(); updateBsBtn();
  const udCount={};FACILITIES.forEach(f=>{udCount[f.useDetail]=(udCount[f.useDetail]||0)+1;});
  buildUdsItems([...new Set(FACILITIES.map(f=>f.useDetail))].sort((a,b)=>udCount[b]-udCount[a]));
  render();
}

function setSort(btn,s){
  document.querySelectorAll('.sbtn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');state.sort=s;render();
}
// ── 用途別カラー（地図ピン用）──
const USE_COLOR_MAP = {
  '教育・文化・スポーツ施設':'#1a6fb5',
  '社会福祉・保健施設':'#1e8c5a',
  '庁舎・事務所':'#0f8080',
  'インフラ関係施設':'#d4670a',
  '一般会計その他施設':'#888',
  'もと施設':'#6b3fa0',
  '流通産業施設':'#b5841a'
};

let leafletMap = null;
let markerLayer = null;
let miryochiLayer = null;
let miryochiVisible = false;

function setView(btn, v){
  document.querySelectorAll('.vbtn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  state.view=v;
  document.getElementById('cg').className = v==='grid'?'cards-grid':'cards-list';
  document.getElementById('cg').classList.toggle('hidden', v==='map');
  document.getElementById('mapWrap').classList.toggle('hidden', v!=='map');
  if(v==='map'){
    initMap();
    renderMap(getFiltered());
    setTimeout(()=>{ if(leafletMap) leafletMap.invalidateSize(); }, 250);
  } else {
    render();
  }
}

function initMap(){
  if(leafletMap) return;
  leafletMap = L.map('mapView').setView([34.693, 135.502], 12);
  baseTileLayer = L.tileLayer(currentTheme()==='dark' ? TILE_DARK : TILE_LIGHT,{
    attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
    subdomains:'abcd',
    maxZoom:19
  }).addTo(leafletMap);
  markerLayer = L.layerGroup().addTo(leafletMap);
      miryochiLayer = L.layerGroup(); miryochiVisible = false;

  // 大阪市24区の境界線（loadAndInitで取得済みのデータを利用）
  const drawWards = geojson => {
    L.geoJSON(geojson, {
      style:{color:'#2255cc',weight:3,opacity:0.6,fillOpacity:0}
    }).addTo(leafletMap);
  };
  if (WARDS_GEOJSON) {
    drawWards(WARDS_GEOJSON);
  } else {
    fetch('osaka_wards.geojson')
      .then(r=>{if(!r.ok)throw new Error('GeoJSON not found');return r.json();})
      .then(geojson=>{WARDS_GEOJSON=geojson;drawWards(geojson);})
      .catch(()=>{}); // 取得失敗時は無視
  }
}

let circleLayer = null;
let circleDragMarker = null;
let circleActive = false;
let circleRadiusM = 2000;
let labelsForceOff = false;

function toggleLabels(){
  labelsForceOff = !labelsForceOff;
  const btn = document.getElementById('labelToggleBtn');
  btn.textContent = labelsForceOff ? 'ラベル OFF' : 'ラベル ON';
  btn.style.color = labelsForceOff ? 'var(--muted)' : 'var(--ink)';
  if(leafletMap) leafletMap._zoomLabelHandler && leafletMap._zoomLabelHandler();
}
let circleCenterWard = '';
let circleFilterActive = false;
let circleLat = null, circleLng = null;

function openCirclePanel(){
  document.getElementById('circlePanelBtn').style.display = 'none';
  document.getElementById('circlePanel').style.display = 'block';
  if(!circleActive) enableCircle();
}

function enableCircle(){
  circleActive = true;
  document.getElementById('circleToggleBtn').textContent = 'OFF';
  document.getElementById('circleToggleBtn').style.background = 'var(--mid)';
  document.getElementById('circleToggleBtn').style.borderColor = 'var(--mid)';
  const center = leafletMap.getCenter();
  const ward = nearestWardOffice(center.lat, center.lng);
  circleCenterWard = ward ? ward.ward : '';
  drawCircle(ward ? ward.lat : center.lat, ward ? ward.lng : center.lng);
}

function nearestWardOffice(lat, lng){
  const candidates = FACILITIES.filter(f=>f.name.endsWith('区役所')&&f.lat&&f.lng);
  if(!candidates.length) return null;
  let best=null, bestDist=Infinity;
  candidates.forEach(f=>{
    const d=(f.lat-lat)**2+(f.lng-lng)**2;
    if(d<bestDist){bestDist=d;best=f;}
  });
  return best;
}

function toggleCircle(){
  if(circleActive){
    circleActive = false;
    document.getElementById('circleToggleBtn').textContent = 'ON';
    document.getElementById('circleToggleBtn').style.background = 'var(--blue)';
    document.getElementById('circleToggleBtn').style.borderColor = 'var(--blue)';
    if(circleLayer){ circleLayer.remove(); circleLayer=null; }
    if(circleDragMarker){ circleDragMarker.remove(); circleDragMarker=null; }
    circleLat=null; circleLng=null; circleCenterWard='';
    circleFilterActive=false;
    document.getElementById('circleFilterChk').checked=false;
    document.getElementById('circleCenterLat').textContent = '—';
    document.getElementById('circleCenterLng').textContent = '—';
    document.getElementById('circleCenterWardLabel').textContent = '';
    document.getElementById('circlePanelBtn').style.display = 'block';
    document.getElementById('circlePanel').style.display = 'none';
    renderMap(getFiltered());
  } else {
    enableCircle();
  }
}

function drawCircle(lat, lng, ward){
  if(circleLayer){ circleLayer.remove(); }
  if(circleDragMarker){ circleDragMarker.remove(); }
  circleLat = lat; circleLng = lng;
  if(ward !== undefined) circleCenterWard = ward || '';
  circleLayer = L.circle([lat, lng], {
    radius: circleRadiusM,
    color: '#c0392b',
    weight: 2,
    opacity: 0.8,
    fillColor: '#c0392b',
    fillOpacity: 0.08
  }).addTo(leafletMap);

  const dragIcon = L.divIcon({
    className: '',
    html: `<div style="width:18px;height:18px;border-radius:50%;background:#c0392b;border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.4);cursor:grab"></div>`,
    iconSize: [18,18],
    iconAnchor: [9,9]
  });
  circleDragMarker = L.marker([lat, lng], { icon: dragIcon, draggable: true, zIndexOffset: 500 }).addTo(leafletMap);
  circleDragMarker.on('drag', e=>{
    const {lat:la, lng:ln} = e.latlng;
    circleLat=la; circleLng=ln;
    circleLayer.setLatLng([la, ln]);
    updateCenterDisplay(la, ln);
    if(circleFilterActive) renderMap(getFiltered(), true);
  });
  updateCenterDisplay(lat, lng);
}

function onRadiusChange(val){
  circleRadiusM = parseInt(val);
  document.getElementById('circleRadiusVal').textContent = val >= 1000 ? (val/1000).toFixed(1).replace(/\.0$/,'') + 'km' : val + 'm';
  if(circleLayer) circleLayer.setRadius(circleRadiusM);
  if(circleFilterActive) renderMap(getFiltered(), true);
}

function onCircleFilterChange(checked){
  circleFilterActive = checked;
  renderMap(getFiltered(), true);
}

function setCircleCenter(lat, lng, ward){
  leafletMap.closePopup();
  circleCenterWard = ward || '';
  // 地図ビューが開いていて円パネルが表示されていない場合は開く
  if(document.getElementById('circlePanel').style.display === 'none'){
    document.getElementById('circlePanelBtn').style.display = 'none';
    document.getElementById('circlePanel').style.display = 'block';
  }
  circleActive = true;
  document.getElementById('circleToggleBtn').textContent = 'OFF';
  document.getElementById('circleToggleBtn').style.background = 'var(--mid)';
  document.getElementById('circleToggleBtn').style.borderColor = 'var(--mid)';
  drawCircle(lat, lng);
  if(circleFilterActive) renderMap(getFiltered());
}

function updateCenterDisplay(lat, lng){
  document.getElementById('circleCenterLat').textContent = lat.toFixed(5);
  document.getElementById('circleCenterLng').textContent = lng.toFixed(5);
  document.getElementById('circleCenterWardLabel').textContent = circleCenterWard ? '区: ' + circleCenterWard : '';
}

function applyCircleFilter(data){
  if(!circleActive || !circleFilterActive || circleLat===null) return data;
  return data.filter(f=>{
    if(f.ward && circleCenterWard && f.ward===circleCenterWard) return true;
    if(f.lat && f.lng){
      const d=L.latLng(circleLat, circleLng).distanceTo(L.latLng(f.lat, f.lng));
      if(d<=circleRadiusM) return true;
    }
    return false;
  });
}

function renderMap(data, skipFit=false){
  if(!leafletMap) return;
  markerLayer.clearLayers();
  const filtered = applyCircleFilter(data);
  document.getElementById('rn').textContent = filtered.length.toLocaleString();
  const plotted = filtered.filter(f=>f.lat&&f.lng);

  // 同一座標をグループ化
  const groups = new Map();
  plotted.forEach(f=>{
    const key = `${f.lat.toFixed(5)},${f.lng.toFixed(5)}`;
    if(!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  });
  const LABEL_ZOOM = 14;

  function makeIcon(f, showLabel, offsetX, offsetY){
    const color = USE_COLOR_MAP[f.use] || '#888';
    if(showLabel){
      const ox = offsetX || 13;
      const oy = offsetY || -3;
      return L.divIcon({
        className:'',
        html:`<div style="position:relative">
          <div style="width:10px;height:10px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>
          <div style="position:absolute;left:${ox}px;top:${oy}px;white-space:nowrap;font-size:11px;font-weight:700;color:#121a2e;background:rgba(255,255,255,0.88);padding:1px 5px;border-radius:3px;box-shadow:0 1px 3px rgba(0,0,0,.2);pointer-events:none;font-family:'Hiragino Kaku Gothic ProN',sans-serif">${f.name}</div>
        </div>`,
        iconSize:[10,10],
        iconAnchor:[5,5]
      });
    } else {
      return L.divIcon({
        className:'',
        html:`<div style="width:10px;height:10px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
        iconSize:[10,10],
        iconAnchor:[5,5]
      });
    }
  }

  // ピクセル座標を使ってラベルオフセットを計算
  function calcLabelOffsets(markerList){
    const offsets = new Map();
    const pxPositions = markerList.map(m=>{
      const pt = leafletMap.latLngToContainerPoint(m.getLatLng());
      return {x: pt.x, y: pt.y, m};
    });
    // オフセット候補（右・左・上右・下右・上左・下左）
    const candidates = [
      [13,-3],[-(120),-3],[13,-18],[13,12],[-120,-18],[-120,12]
    ];
    pxPositions.forEach((p, i)=>{
      // 近傍マーカー（50px以内）を探す
      const neighbors = pxPositions.filter((q,j)=>j!==i&&Math.abs(q.x-p.x)<120&&Math.abs(q.y-p.y)<20);
      if(neighbors.length===0){
        offsets.set(p.m, {ox:13, oy:-3});
        return;
      }
      // 被らないオフセット候補を選ぶ
      for(const [ox,oy] of candidates){
        const lx = p.x + ox, ly = p.y + oy;
        const conflict = neighbors.some(q=>{
          const qOff = offsets.get(q.m) || {ox:13,oy:-3};
          const qlx = q.x + qOff.ox, qly = q.y + qOff.oy;
          return Math.abs(lx-qlx)<100 && Math.abs(ly-qly)<14;
        });
        if(!conflict){
          offsets.set(p.m, {ox,oy});
          return;
        }
      }
      // 全候補がだめなら縦にずらす
      offsets.set(p.m, {ox:13, oy:-3 - neighbors.length*14});
    });
    return offsets;
  }

  const markers = [];
  groups.forEach((group)=>{
    const f = group[0];
    const color = USE_COLOR_MAP[f.use] || '#888';
    const multi = group.length > 1;
    const showLabel = !labelsForceOff && leafletMap.getZoom() >= LABEL_ZOOM;

    function makeGroupIcon(show, ox, oy){
      const hasWardOffice = group.some(g=>g.name.endsWith('区役所'));
      const isWardOffice = !multi && hasWardOffice;
      const dot = multi && hasWardOffice
        ? `<div style="width:18px;height:18px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;font-size:9px;color:#fff;font-weight:900;line-height:1">★${group.length}</div>`
        : multi
          ? `<div style="width:13px;height:13px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;font-size:8px;color:#fff;font-weight:900">${group.length}</div>`
          : isWardOffice
            ? `<div style="width:18px;height:18px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;line-height:1">★</div>`
            : `<div style="width:10px;height:10px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`;
      const sz = (isWardOffice || (multi && hasWardOffice)) ? [18,18] : [13,13];
      const anc = (isWardOffice || (multi && hasWardOffice)) ? [9,9] : [6,6];
      if(show){
        const lx=ox||((isWardOffice||(multi&&hasWardOffice))?20:13), ly=oy||-3;
        const label = multi ? `${f.name} 他${group.length-1}件` : f.name;
        return L.divIcon({className:'',
          html:`<div style="position:relative">${dot}<div style="position:absolute;left:${lx}px;top:${ly}px;white-space:nowrap;font-size:11px;font-weight:700;color:#121a2e;background:rgba(255,255,255,0.88);padding:1px 5px;border-radius:3px;box-shadow:0 1px 3px rgba(0,0,0,.2);pointer-events:none;font-family:'Hiragino Kaku Gothic ProN',sans-serif">${label}</div></div>`,
          iconSize:sz, iconAnchor:anc});
      }
      return L.divIcon({className:'', html:`<div style="position:relative">${dot}</div>`, iconSize:sz, iconAnchor:anc});
    }

    const marker = L.marker([f.lat, f.lng], {icon: makeGroupIcon(showLabel)});
    marker._makeGroupIcon = makeGroupIcon;

    function buildPopup(){
      if(group.length === 1){
        const g = group[0];
        return `<div style="font-family:'Hiragino Kaku Gothic ProN',sans-serif;min-width:200px">
          <div style="font-size:10px;color:#888;margin-bottom:2px">${g.use}</div>
          <div style="font-size:14px;font-weight:700;margin-bottom:4px">${g.name}</div>
          <div style="font-size:11px;color:#666;margin-bottom:6px">📍 ${g.addr}</div>
          <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px">
            ${g.area>0?`<span style="font-size:11px;background:#f0f0f0;padding:2px 6px;border-radius:4px">${g.area.toLocaleString()}㎡</span>`:''}
            ${g.year?`<span style="font-size:11px;background:#f0f0f0;padding:2px 6px;border-radius:4px">${g.year}年築</span>`:''}
          </div>
          <div style="display:flex;gap:4px;flex-wrap:wrap">
            <a href="${BASE}${g.source}" target="_blank" style="font-size:11px;color:#c0392b;font-weight:700;text-decoration:none;padding:3px 7px;border:1px solid #c0392b;border-radius:4px">📄PDF</a>
            ${karteUrl(g)?`<a href="${karteUrl(g)}" target="_blank" style="font-size:11px;color:#6b3fa0;font-weight:700;text-decoration:none;padding:3px 7px;border:1px solid #6b3fa0;border-radius:4px">📋カルテ</a>`:''}
            <button onclick="selF(${g.id})" style="font-size:11px;color:#1a6fb5;font-weight:700;padding:3px 7px;border:1px solid #1a6fb5;border-radius:4px;background:transparent;cursor:pointer">詳細</button>
            <button onclick="setCircleCenter(${g.lat},${g.lng},'${g.ward}')" style="font-size:11px;color:#0f8080;font-weight:700;padding:3px 7px;border:1px solid #0f8080;border-radius:4px;background:transparent;cursor:pointer">⊙ ここを中心に</button>
          </div>
        </div>`;
      }
      const items = group.map(g=>`
        <div style="padding:6px 0;border-bottom:1px solid #eee;cursor:pointer" onclick="selF(${g.id})">
          <div style="font-size:12px;font-weight:700;color:#1a6fb5">${g.name}</div>
          <div style="font-size:10px;color:#888">${g.use}${g.area>0?' · '+g.area.toLocaleString()+'㎡':''}</div>
        </div>`).join('');
      return `<div style="font-family:'Hiragino Kaku Gothic ProN',sans-serif;min-width:220px;max-height:300px;overflow-y:auto">
        <div style="font-size:11px;font-weight:700;color:#555;margin-bottom:6px;padding-bottom:4px;border-bottom:2px solid #ddd">📍 ${f.addr}（${group.length}施設）</div>
        ${items}
        <div style="margin-top:6px;padding-top:6px;border-top:1px solid #eee">
          <button onclick="setCircleCenter(${f.lat},${f.lng},'${f.ward}')" style="font-size:11px;color:#0f8080;font-weight:700;padding:3px 7px;border:1px solid #0f8080;border-radius:4px;background:transparent;cursor:pointer;width:100%">⊙ ここを中心に円を作成</button>
        </div>
      </div>`;
    }

    marker.bindPopup(buildPopup, {maxWidth:300});
    markerLayer.addLayer(marker);
    markers.push(marker);
  });

  // ズームに応じてラベル切り替え
  if(leafletMap._zoomLabelHandler){
    leafletMap.off('zoomend', leafletMap._zoomLabelHandler);
  }
  leafletMap._zoomLabelHandler = ()=>{
    const show = !labelsForceOff && leafletMap.getZoom() >= LABEL_ZOOM;
    if(show){
      const pxPos = markers.map(m=>({m, ...leafletMap.latLngToContainerPoint(m.getLatLng())}));
      const candidates = [[13,-3],[-120,-3],[13,-18],[13,12],[-120,-18],[-120,12]];
      const offsets = new Map();
      pxPos.forEach((p,i)=>{
        const nbrs = pxPos.filter((_,j)=>j!==i&&Math.abs(pxPos[j].x-p.x)<120&&Math.abs(pxPos[j].y-p.y)<20);
        for(const [ox,oy] of candidates){
          const conflict = nbrs.some(q=>{const qo=offsets.get(q.m)||{ox:13,oy:-3};return Math.abs(p.x+ox-(q.x+qo.ox))<100&&Math.abs(p.y+oy-(q.y+qo.oy))<14;});
          if(!conflict){offsets.set(p.m,{ox,oy});break;}
        }
        if(!offsets.has(p.m)) offsets.set(p.m,{ox:13,oy:-3-nbrs.length*14});
      });
      markers.forEach(m=>{const {ox,oy}=offsets.get(m)||{ox:13,oy:-3};m.setIcon(m._makeGroupIcon(true,ox,oy));});
    } else {
      markers.forEach(m=>m.setIcon(m._makeGroupIcon(false)));
    }
  };
  leafletMap.on('zoomend', leafletMap._zoomLabelHandler);

  if(!skipFit && plotted.length>0){
    if(data.length===FACILITIES.length){
      leafletMap.setView([34.6937,135.5023],12);
    } else {
      const bounds = L.latLngBounds(plotted.filter(f=>f.lat&&f.lng).map(f=>[f.lat,f.lng]));
      leafletMap.fitBounds(bounds, {padding:[30,30], maxZoom:15});
    }
  }
  setTimeout(()=>leafletMap.invalidateSize(), 100);
}

// ── 用途区分 カスタムドロップダウン ──
function buildUsItems(uses){
  const container=document.getElementById('usItems');
  container.innerHTML=uses.map(u=>`
    <label style="display:flex;align-items:center;gap:7px;padding:5px 12px;cursor:pointer;font-size:13px" onmouseover="this.style.background='#f5f7ff'" onmouseout="this.style.background=''">
      <input type="checkbox" value="${u}" ${state.uses.has(u)?'checked':''} onchange="onUsChange(this)" style="accent-color:var(--blue);width:14px;height:14px;cursor:pointer">
      <span>${u}</span>
    </label>`).join('');
  updateUsBtn();
}
function onUsChange(el){
  if(el.checked) state.uses.add(el.value);
  else state.uses.delete(el.value);
  state.useDetails=new Set();
  const filtered0=FACILITIES.filter(f=>state.uses.size===0||state.uses.has(f.use));
  const udCnt={};filtered0.forEach(f=>{udCnt[f.useDetail]=(udCnt[f.useDetail]||0)+1;});
  const details=[...new Set(filtered0.map(f=>f.useDetail))].sort((a,b)=>udCnt[b]-udCnt[a]);
  buildUdsItems(details);
  updateUsBtn();render();
}
function updateUsBtn(){
  const el=document.getElementById('usBtnLabel');
  if(!el)return;
  if(state.uses.size===0) el.textContent='すべての用途';
  else if(state.uses.size===1) el.textContent=[...state.uses][0];
  else el.textContent=`${state.uses.size}種選択中`;
  el.style.color=state.uses.size>0?'var(--blue)':'var(--ink)';
}
function toggleUsMenu(){
  const m=document.getElementById('usMenu');
  m.style.display=m.style.display==='none'?'block':'none';
}
function usSelectAll(){
  document.querySelectorAll('#usItems input[type=checkbox]').forEach(cb=>{cb.checked=true;state.uses.add(cb.value);});
  onUsChange({checked:true,value:''});
}
function usSelectNone(){
  document.querySelectorAll('#usItems input[type=checkbox]').forEach(cb=>{cb.checked=false;state.uses.delete(cb.value);});
  state.useDetails=new Set();
  const udCount={};FACILITIES.forEach(f=>{udCount[f.useDetail]=(udCount[f.useDetail]||0)+1;});
  buildUdsItems([...new Set(FACILITIES.map(f=>f.useDetail))].sort((a,b)=>udCount[b]-udCount[a]));
  updateUsBtn();render();
}

// ── 所管局 カスタムドロップダウン ──
function buildBsItems(bureaus){
  const container=document.getElementById('bsItems');
  container.innerHTML=bureaus.map(b=>`
    <label style="display:flex;align-items:center;gap:7px;padding:5px 12px;cursor:pointer;font-size:13px" onmouseover="this.style.background='#f5f7ff'" onmouseout="this.style.background=''">
      <input type="checkbox" value="${b}" ${state.bureaus.has(b)?'checked':''} onchange="onBsChange(this)" style="accent-color:var(--blue);width:14px;height:14px;cursor:pointer">
      <span>${b}</span>
    </label>`).join('');
  updateBsBtn();
}
function onBsChange(el){
  if(el.checked) state.bureaus.add(el.value);
  else state.bureaus.delete(el.value);
  updateBsBtn();render();
}
function updateBsBtn(){
  const el=document.getElementById('bsBtnLabel');
  if(!el)return;
  if(state.bureaus.size===0) el.textContent='すべての局';
  else if(state.bureaus.size===1) el.textContent=[...state.bureaus][0];
  else el.textContent=`${state.bureaus.size}局選択中`;
  el.style.color=state.bureaus.size>0?'var(--blue)':'var(--ink)';
}
function toggleBsMenu(){
  const m=document.getElementById('bsMenu');
  m.style.display=m.style.display==='none'?'block':'none';
}
function bsSelectAll(){
  document.querySelectorAll('#bsItems input[type=checkbox]').forEach(cb=>{cb.checked=true;state.bureaus.add(cb.value);});
  updateBsBtn();render();
}
function bsSelectNone(){
  document.querySelectorAll('#bsItems input[type=checkbox]').forEach(cb=>{cb.checked=false;state.bureaus.delete(cb.value);});
  updateBsBtn();render();
}

// 管理者文字列から局名を抽出（最初の「局」「室」「委員会」を含む単語）
// ── 行政区 カスタムドロップダウン ──
function buildWsItems(wards){
  const container=document.getElementById('wsItems');
  container.innerHTML=wards.map(w=>`
    <label style="display:flex;align-items:center;gap:7px;padding:5px 12px;cursor:pointer;font-size:13px" onmouseover="this.style.background='#f5f7ff'" onmouseout="this.style.background=''">
      <input type="checkbox" value="${w}" ${state.wards.has(w)?'checked':''} onchange="onWsChange(this)" style="accent-color:var(--blue);width:14px;height:14px;cursor:pointer">
      <span>${w}</span>
    </label>`).join('');
  updateWsBtn();
}
function onWsChange(el){
  if(el.checked) state.wards.add(el.value);
  else state.wards.delete(el.value);
  updateWsBtn();render();
}
function updateWsBtn(){
  const el=document.getElementById('wsBtnLabel');
  if(!el)return;
  if(state.wards.size===0) el.textContent='すべての区';
  else if(state.wards.size===1) el.textContent=[...state.wards][0];
  else el.textContent=`${state.wards.size}区選択中`;
  el.style.color=state.wards.size>0?'var(--blue)':'var(--ink)';
}
function toggleWsMenu(){
  const m=document.getElementById('wsMenu');
  m.style.display=m.style.display==='none'?'block':'none';
}
function wsSelectAll(){
  document.querySelectorAll('#wsItems input[type=checkbox]').forEach(cb=>{cb.checked=true;state.wards.add(cb.value);});
  updateWsBtn();render();
}
function wsSelectNone(){
  document.querySelectorAll('#wsItems input[type=checkbox]').forEach(cb=>{cb.checked=false;state.wards.delete(cb.value);});
  updateWsBtn();render();
}

function buildUdsItems(details){
  const NORMALIZE={'地域図書館':'図書館','中央図書館':'図書館'};
  const displayMap=new Map();
  details.forEach(d=>{
    const label=NORMALIZE[d]||d;
    if(!displayMap.has(label)) displayMap.set(label,[]);
    displayMap.get(label).push(d);
  });
  const container=document.getElementById('udsItems');
  container.innerHTML=[...displayMap.entries()].map(([label,rawVals])=>`
    <label style="display:flex;align-items:center;gap:7px;padding:5px 12px;cursor:pointer;font-size:13px" onmouseover="this.style.background='#f5f7ff'" onmouseout="this.style.background=''">
      <input type="checkbox" value="${rawVals.join('|')}" ${rawVals.some(v=>state.useDetails.has(v))?'checked':''} onchange="onUdsChange(this)" style="accent-color:var(--blue);width:14px;height:14px;cursor:pointer">
      <span>${label}</span>
    </label>`).join('');
  updateUdsBtn();
}
function onUdsChange(el){
  const vals=el.value.split('|');
  if(el.checked) vals.forEach(v=>state.useDetails.add(v));
  else vals.forEach(v=>state.useDetails.delete(v));
  render();
  updateUdsBtn();
}
function updateUdsBtn(){
  const el=document.getElementById('udsBtnLabel');
  if(!el)return;
  const n=state.useDetails.size;
  el.textContent=n===0?'すべての詳細':`${n}種類選択中`;
  el.style.color=n>0?'var(--blue)':'var(--ink)';
  el.style.borderColor=n>0?'var(--blue)':'var(--line)';
}
function toggleUdsMenu(){
  const m=document.getElementById('udsMenu');
  m.style.display=m.style.display==='none'?'block':'none';
}
function udsSelectAll(){
  document.querySelectorAll('#udsItems input[type=checkbox]').forEach(el=>{
    el.checked=true;state.useDetails.add(el.value);
  });
  updateUdsBtn();render();
}
function udsSelectNone(){
  document.querySelectorAll('#udsItems input[type=checkbox]').forEach(el=>{
    el.checked=false;
  });
  state.useDetails.clear();
  updateUdsBtn();render();
}
// メニュー外クリックで閉じる
document.addEventListener('click',e=>{
  const wrap=document.getElementById('udsWrap');
  const menu=document.getElementById('udsMenu');
  if(!wrap||!menu)return;
  if(!wrap.contains(e.target)) menu.style.display='none';
});

function extractBureau(manager){
  const ward=manager.match(/^([^\s　]+区役所)/);
  if(ward) return ward[1];
  const m=manager.match(/([^\s　]+(?:局|室|委員会事務局|委員会))/);
  return m?m[1]:'その他';
}

function getFiltered(){
  return FACILITIES.filter(f=>{
    if(state.q){const q=state.q;if(!f.name.includes(q)&&!f.addr.includes(q)&&!f.ward.includes(q)&&!f.useDetail.includes(q))return false;}
    if(state.wards.size>0&&!state.wards.has(f.ward))return false;
    if(state.uses.size>0&&!state.uses.has(f.use))return false;
    if(state.useDetails.size>0&&!state.useDetails.has(f.useDetail))return false;
    if(state.bureaus.size>0&&!state.bureaus.has(extractBureau(f.manager)))return false;
    if(state.karte==='1'&&!f.kartePage)return false;
    if(state.karte==='0'&&f.kartePage)return false;
    if(state.rental==='1'&&!f.isRental)return false;
    if(state.rental==='0'&&f.isRental)return false;
    if(state.listFilter&&!(lists[state.listFilter]?.items||[]).includes(f.id))return false;
    return true;
  }).sort((a,b)=>{
    if(state.sort==='name')return a.name.localeCompare(b.name,'ja');
    if(state.sort==='ad')return b.area-a.area;
    if(state.sort==='aa')return a.area-b.area;
    if(state.sort==='yd')return (b.year||0)-(a.year||0);
    if(state.sort==='ya')return (a.year||9999)-(b.year||9999);
    if(state.sort==='bureau'){
      const ba=extractBureau(a.manager),bb=extractBureau(b.manager);
      return ba.localeCompare(bb,'ja')||a.name.localeCompare(b.name,'ja');
    }
    return 0;
  });
}

function render(){
  const data=getFiltered();
  document.getElementById('rn').textContent=data.length.toLocaleString();
  if(state.view==='map'){
    renderMap(data);
    return;
  }
  const cg=document.getElementById('cg');
  const ce=document.getElementById('ce');
  ce.classList.toggle('hidden',data.length>0);
  cg.classList.toggle('hidden',data.length===0);
  cg.innerHTML=data.map(f=>renderCard(f)).join('');
  if(state.sel){
    const el=cg.querySelector('[data-id="'+state.sel.id+'"]');
    if(el)el.classList.add('selected');
  }
  if(dashOpen) updateDash(data);
}

function renderCard(f){
  const age=f.year?2026-f.year:null;
  const c=UC[f.use]||'#888';
  const b=UB[f.use]||'#eee';
  const chk=selected.has(f.id);
  const chkHtml=`<input type="checkbox" data-chk="${f.id}" ${chk?'checked':''} onclick="event.stopPropagation();toggleSel(${f.id},this.checked)" style="width:15px;height:15px;cursor:pointer;accent-color:var(--blue);flex-shrink:0">`;
  const listAddBtn=`<button class="cbtn" style="color:var(--purple);border-color:var(--purple);padding:2px 6px;font-size:10px;flex-shrink:0" onclick="event.stopPropagation();showAddToListMenu(${f.id},this)" title="リストに追加">📋+</button>`;
  const isComplex=addrCount[normAddr(f.addr)]>1;
  const privateFiltered0=(f.privateFacilities||[]).filter(p=>p.name!==f.name);
  const hasPrivate=privateFiltered0.length>0;
  const complexBadge=isComplex?`<span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;background:#fff3e0;color:#e65100;border:1px solid #ffcc80;white-space:nowrap">🏢 複合</span>`:'';
  const privateBadge=hasPrivate?`<span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;background:#fff8f0;color:#d4670a;border:1px solid #ffd0a0;white-space:nowrap">🏪 民間複合</span>`:'';
  const rentalBadge=f.isRental?`<span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;background:#f0f4ff;color:#2255cc;border:1px solid #aabcee;white-space:nowrap">🔑 賃借</span>`:'';
  if(state.view==='list'){
    return `<div class="card${chk?' sel-active':''}" data-id="${f.id}" onclick="selF(${f.id})" style="padding:10px 14px;--uc:${c}">
      <div class="cli">
        <div onclick="event.stopPropagation()" style="display:flex;align-items:center;padding-right:8px">${chkHtml}</div>
        <div style="width:4px;height:36px;background:${c};border-radius:2px;flex-shrink:0"></div>
        <div class="cln">${f.name}<br><span style="font-size:10px;font-weight:400;color:var(--muted)">${f.addr}</span></div>
        <div class="clm">
          ${complexBadge}${privateBadge}${rentalBadge}
          <div class="cls"><strong>${f.area>0?f.area.toLocaleString():'—'}</strong>㎡</div>
          <div class="cls"><strong>${f.year||'—'}</strong>年</div>
          <span class="tag tw" style="align-self:center">${f.ward}</span>
          <div onclick="event.stopPropagation()">${listAddBtn}</div>
        </div>
      </div>
    </div>`;
  }
  const bureau=extractBureau(f.manager);
  return `<div class="card${chk?' sel-active':''}" data-id="${f.id}" onclick="selF(${f.id})" style="--uc:${c}">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;margin-bottom:2px">
      <div style="display:flex;align-items:flex-start;gap:6px;flex:1;min-width:0">
        <div onclick="event.stopPropagation()" style="display:flex;align-items:center;padding-top:1px;flex-shrink:0">${chkHtml}</div>
        <div class="cn">${f.name}</div>
      </div>
      <span class="tag tw" style="flex-shrink:0">${f.ward}</span>
      <div onclick="event.stopPropagation()">${listAddBtn}</div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:6px;padding-left:21px">
      <div style="font-size:10px;color:var(--muted)">${bureau}</div>
      <div class="ct" style="background:${b};color:${c};flex-shrink:0">${f.use}</div>
    </div>
    <div class="ca" style="margin-bottom:6px"><span>📍</span>${f.addr}</div>
    <div class="cs" style="margin-bottom:${complexBadge||privateBadge||rentalBadge?'6px':'0'}">
      <div><div class="sv">${f.area>0?f.area.toLocaleString():'—'}</div><div class="su">延床面積（㎡）</div></div>
      <div><div class="sv">${age!==null?`築${age}年`:'—'}</div><div class="su">${f.year?`${f.year}年度築`:''}</div></div>
    </div>
    ${complexBadge||privateBadge||rentalBadge?`<div style="display:flex;gap:4px;flex-wrap:wrap">${complexBadge}${privateBadge}${rentalBadge}</div>`:''}
  </div>`;
}

function updateSelUI(){
  const n=selected.size;
  const btn=document.getElementById('csvBtn');
  btn.style.display=n>0?'inline-flex':'none';
  document.getElementById('selCount').textContent=`(${n}件)`;
}

function toggleSel(id,chk){
  if(chk) selected.add(id); else selected.delete(id);
  // カードの見た目だけ更新（再レンダリングなし）
  const card=document.querySelector(`.card[data-id="${id}"]`);
  if(card) card.classList.toggle('sel-active',chk);
  updateSelUI();
}

function selectAll(){
  const data = state.view==='map' ? applyCircleFilter(getFiltered()) : getFiltered();
  data.forEach(f=>selected.add(f.id));
  render();updateSelUI();
}

function clearSel(){
  selected.clear();
  render();updateSelUI();
}

function exportCSV(){
  if(selected.size===0)return;
  const rows=FACILITIES.filter(f=>selected.has(f.id));
  const BASE_URL='https://www.city.osaka.lg.jp/shiseikaikakushitsu/cmsfiles/contents/0000619/619708/';
  const header=['施設名','行政区','用途区分','用途詳細','住所','延床面積(㎡)','建築年度','所管局','管理者','一覧PDF_URL'];
  const escape=v=>{
    const s=String(v??'');
    return s.includes(',')||s.includes('"')||s.includes('\n')?`"${s.replace(/"/g,'""')}"`:s;
  };
  const csv=[header.join(','),...rows.map(f=>[
    f.name,f.ward,f.use,f.useDetail,f.addr,
    f.area>0?f.area:'',f.year||'',
    extractBureau(f.manager),f.manager,
    BASE_URL+f.source
  ].map(escape).join(','))].join('\n');
  const bom='\uFEFF';
  const blob=new Blob([bom+csv],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=`大阪市公共施設_選択${rows.length}件.csv`;
  a.click();
}

function selF(id){
  const f=FACILITIES.find(x=>x.id===id);if(!f)return;
  state.sel=f;
  document.querySelectorAll('.card').forEach(c=>c.classList.remove('selected'));
  const el=document.querySelector('[data-id="'+id+'"]');if(el)el.classList.add('selected');
  openP(f);
}
function selAndSearch(id){selF(id);setTimeout(runAI,100)}

const CITY_NURSERIES_35=new Set(['大淀保育所','御幸保育所','海老江保育所','高見町保育所','南大江保育所','梅本保育所','磯路保育所','大正保育所','味原保育所','浪速第1保育所','姫島保育所','加島第1保育所','三国保育所','日之出保育所','西大道保育所','東小橋保育所','生野保育所','中川保育所','生江保育所','大宮第1保育所','鯰江保育所','鴫野保育所','茨田第1保育所','阪南保育所','北加賀屋保育所','御崎保育所','住吉保育所','住吉乳児保育所','苅田南保育所','矢田教育の森保育所','鷹合保育所','加美第2保育所','長吉第1保育所','瓜破保育所','千本保育所','松之宮保育所']);

function openP(f){
  const dp=document.getElementById('dp');dp.classList.add('open');
  document.getElementById('dpt').textContent=f.useDetail;
  document.getElementById('dpn').textContent=f.name;
  document.getElementById('dpCityBadge').style.display=CITY_NURSERIES_35.has(f.name)?'':'none';
  document.getElementById('dpa').textContent='📍 '+f.addr;
  const age=f.year?2026-f.year:null;
  const bureau=extractBureau(f.manager);
  document.getElementById('dpg').innerHTML=`
    <div><div class="dpi-l">延床面積</div><div class="dpi-v">${f.area>0?f.area.toLocaleString():'—'}<span class="dpi-u"> ㎡</span></div></div>
    <div><div class="dpi-l">建築年度</div><div class="dpi-v">${f.year||'不明'}<span class="dpi-u"> 年</span></div></div>
    <div><div class="dpi-l">築年数</div><div class="dpi-v">${age!==null?age+'年':'不明'}</div></div>
    <div><div class="dpi-l">行政区</div><div class="dpi-v">${f.ward}</div></div>
    <div><div class="dpi-l">所管局</div><div class="dpi-v" style="font-size:12px">${bureau}</div></div>
    <div><div class="dpi-l">管理者詳細</div><div class="dpi-v" style="font-size:11px;line-height:1.4">${f.manager}</div></div>
  `;
  const a=encodeURIComponent(f.addr),n=encodeURIComponent(f.name);
  const webUrl=f.url||`https://www.google.com/search?q=${n}+%E5%85%AC%E5%BC%8F%E3%82%B5%E3%82%A4%E3%83%88`;
  const webLabel=f.url?'🌐 公式サイト':'🌐 公式サイトを検索';
  document.getElementById('dpls').innerHTML=`
    <a class="dpl bp" href="${BASE}${f.source}" target="_blank" rel="noopener">📄 一覧PDF</a>
    ${karteUrl(f)?`<a class="dpl" href="${karteUrl(f)}" target="_blank" rel="noopener" style="color:var(--purple);border-color:var(--purple)">📋 資産カルテ（${f.kartePage}ページ）</a>`:''}
    <a class="dpl bm" href="${webUrl}" target="_blank" rel="noopener">${webLabel}</a>
    <a class="dpl bm" href="https://maps.google.com/maps?q=${a}" target="_blank" rel="noopener">🗺 Googleマップ</a>
    ${f.lat&&f.lng?`<a class="dpl" style="color:var(--teal);border-color:var(--teal)" href="https://www.mapnavi.city.osaka.lg.jp/osakacity/Map?mid=51&ShowFidOnly=1&mps=10000&mtp=dm28&mpx=${f.lng}&mpy=${f.lat}&gprj=3" target="_blank" rel="noopener">🏗 用途地域・容積率</a>`:''}
    ${f.lat&&f.lng?`<a class="dpl" style="color:var(--teal);border-color:var(--teal)" href="https://www.mapnavi.city.osaka.lg.jp/osakacity/Map?mid=53&ShowFidOnly=1&mps=10000&mtp=dm28&mpx=${f.lng}&mpy=${f.lat}&gprj=3" target="_blank" rel="noopener">🏘 その他地域地区</a>`:''}
  `;

  // ── 民間複合施設（自施設・同一住所の市有施設と同名のものを除外） ──
  const privateSec = document.getElementById('privateSec');
  const privateList = document.getElementById('privateList');
  // 同一住所の市有施設名セット（複合施設セクションに表示されるもの）
  const naCheck = normAddr(f.addr);
  const colocNames = new Set(FACILITIES.filter(x=>x.id!==f.id&&normAddr(x.addr)===naCheck).map(x=>x.name));
  const privateFiltered = (f.privateFacilities||[]).filter(p=>p.name!==f.name&&!colocNames.has(p.name));
  if(privateFiltered.length > 0){
    privateSec.style.display = '';
    privateList.innerHTML = privateFiltered.map(p=>`
      <div style="padding:5px 8px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:baseline;gap:8px">
        <div style="flex:1">
          <div style="font-size:12px;font-weight:600;color:#d4670a">${p.name}</div>
          <div style="font-size:10px;color:var(--muted);margin-top:1px">${p.category}　${p.type}</div>
        </div>
        <div style="display:flex;gap:4px;flex-shrink:0;align-items:center">
          ${p.tel?`<span style="font-size:10px;color:var(--mid)">${p.tel}</span>`:''}
          ${p.url?`<a href="${p.url}" target="_blank" rel="noopener" style="font-size:10px;color:var(--blue)">🔗</a>`:''}
        </div>
      </div>`).join('');
  } else {
    privateSec.style.display = 'none';
  }
  // 住所正規化：全角スペース・丁目番地の揺れを吸収
  function normAddr(addr){return addr.replace(/\s|　/g,'').replace(/[−ー―]/g,'-');}
  const na=normAddr(f.addr);
  // 丁目まで（「1-2-3」の最初の区切りまで）を近隣判定に使う
  const naPrefix=na.replace(/-\d+$/,''); // 末尾の号を除いた番地まで

  const coloc=[], near=[];
  FACILITIES.forEach(x=>{
    if(x.id===f.id)return;
    const nx=normAddr(x.addr);
    if(nx===na){coloc.push(x);}
    else if(nx.startsWith(naPrefix)&&naPrefix.length>6){near.push(x);}
  });

  // 複合施設表示
  const colocSec=document.getElementById('colocSec');
  const colocList=document.getElementById('colocList');
  if(coloc.length>0){
    colocSec.style.display='';
    colocList.innerHTML=coloc.map(x=>`
      <div onclick="selF(${x.id})" style="padding:5px 8px;cursor:pointer;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:baseline;gap:8px" onmouseover="this.style.background='#f5f7ff'" onmouseout="this.style.background=''">
        <span style="font-size:12px;font-weight:600;color:var(--blue);flex:1">${x.name}</span>
        <span style="font-size:10px;color:var(--muted);white-space:nowrap">${x.area>0?x.area.toLocaleString()+'㎡':''}</span>
      </div>`).join('');
  }else{colocSec.style.display='none';}

  // 近隣施設表示（最大10件）
  const nearSec=document.getElementById('nearSec');
  const nearList=document.getElementById('nearList');
  const nearShow=near.slice(0,10);
  if(nearShow.length>0){
    nearSec.style.display='';
    nearList.innerHTML=nearShow.map(x=>`
      <div onclick="selF(${x.id})" style="padding:5px 8px;cursor:pointer;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:baseline;gap:8px" onmouseover="this.style.background='#f5f7ff'" onmouseout="this.style.background=''">
        <span style="font-size:12px;font-weight:600;color:var(--green);flex:1">${x.name}</span>
        <span style="font-size:10px;color:var(--muted);white-space:nowrap">${x.area>0?x.area.toLocaleString()+'㎡':''}</span>
      </div>`).join('');
    if(near.length>10){
      nearList.innerHTML+=`<div style="font-size:11px;color:var(--muted);text-align:center;padding:4px">他 ${near.length-10} 件</div>`;
    }
  }else{nearSec.style.display='none';}

}
function closeP(){
  document.getElementById('dp').classList.remove('open');
  document.querySelectorAll('.card').forEach(c=>c.classList.remove('selected'));
  state.sel=null;
}

async function runAI(){
  const f=state.sel;if(!f)return;
  const btn=document.getElementById('aib');
  const res=document.getElementById('air');
  btn.disabled=true;btn.innerHTML='<div class="sp"></div> 検索中…';
  res.className='air show';
  res.innerHTML='<div class="spin"><div class="sp"></div> AIがWeb検索中です…</div>';
  const prompt=`大阪市の公共施設「${f.name}」（住所：${f.addr}、用途：${f.useDetail}、管理者：${f.manager}）について以下をWeb検索で調べてください。
1. この住所または同一建物に入居している他の施設・テナント・機関
2. この施設の現在の活用状況・最新ニュース（廃止・転用・PFI・民間活用の検討など）
3. 周辺500m以内にある主要な公共施設・複合施設

HTML形式（h4で見出し、ulで箇条書き）で回答し、不明な情報は「情報なし」と記載してください。`;
  try{
    const r=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        model:'claude-sonnet-4-6',max_tokens:1000,
        tools:[{type:'web_search_20250305',name:'web_search'}],
        messages:[{role:'user',content:prompt}]
      })
    });
    const d=await r.json();
    const txt=d.content.filter(b=>b.type==='text').map(b=>b.text).join('');
    res.innerHTML=txt||'<p style="color:var(--muted)">検索結果を取得できませんでした。</p>';
  }catch(e){
    res.innerHTML='<p style="color:var(--red)">⚠️ 検索に失敗しました。</p>';
  }
  btn.disabled=false;btn.innerHTML='🔄 再検索する';
}





// ── タブ切り替え ──
let currentTab = 'facilities';
let mSort = 'name';

// ── 点がどの区の中にあるかをポリゴンで正確に判定 ──
// レイキャスティング法：点から水平に線を伸ばし、ポリゴンの辺と交差した回数が
// 奇数なら「中」、偶数なら「外」と判定する定番アルゴリズム
function pointInRing(lat, lng, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    // GeoJSONの座標は [経度, 緯度] の順なので注意
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
function wardOfPoint(lat, lng) {
  if (!WARDS_GEOJSON) return null;
  for (const ft of WARDS_GEOJSON.features) {
    const g = ft.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    // 偶奇規則：区を構成する全リングのうち、点を含むリングが奇数個なら「区内」。
    // （外周＋穴の正しい構造でも、複数陸地がリングとして並ぶ変則構造でも正しく判定できる）
    let count = 0;
    for (const poly of polys) {
      for (const ring of poly) {
        if (pointInRing(lat, lng, ring)) count++;
      }
    }
    if (count % 2 === 1) return ft.properties.name;
  }
  return null; // 大阪市域の外、または境界データ未取得
}

function computeMiryochiWards() {
  const wardOffices = FACILITIES.filter(f => f.name && f.name.endsWith('区役所') && f.lat && f.lng);
  MIRYOCHI.forEach(m => {
    if (!m.lat || !m.lng) { m.ward = ''; return; }
    // ① 区境界ポリゴンで正確に判定
    const w = wardOfPoint(m.lat, m.lng);
    if (w) { m.ward = w; return; }
    // ② 境界データが使えない場合のみ、従来の最寄り区役所方式で近似
    let best = null, bestDist = Infinity;
    wardOffices.forEach(wo => {
      const d = (wo.lat - m.lat) ** 2 + (wo.lng - m.lng) ** 2;
      if (d < bestDist) { bestDist = d; best = wo; }
    });
    m.ward = best ? best.ward : '';
  });
}

function buildMiryochiDropdowns() {
  const WARD_ORDER=['東淀川区','旭区','淀川区','西淀川区','北区','鶴見区','城東区','都島区','福島区','此花区','中央区','西区','東成区','港区','浪速区','天王寺区','生野区','大正区','阿倍野区','西成区','東住吉区','平野区','住之江区','住吉区'];
  const allWards = new Set(MIRYOCHI.map(m=>m.ward).filter(Boolean));
  const wards = [...WARD_ORDER.filter(w=>allWards.has(w)), ...[...allWards].filter(w=>!WARD_ORDER.includes(w)).sort()];
  const bureaus = [...new Set(MIRYOCHI.map(m=>m.bureau).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ja'));
  const policies = [...new Set(MIRYOCHI.map(m=>m.policy).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ja'));
  const criterias = [...new Set(MIRYOCHI.map(m=>m.criteria).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ja'));

  document.getElementById('mWard').innerHTML = '<option value="">すべての区</option>' +
    wards.map(v=>`<option value="${v}">${v}</option>`).join('');
  document.getElementById('mBureau').innerHTML = '<option value="">すべての局</option>' +
    bureaus.map(v=>`<option value="${v}">${v}</option>`).join('');
  document.getElementById('mPolicy').innerHTML = '<option value="">すべての方針</option>' +
    policies.map(v=>`<option value="${v}">${v}</option>`).join('');
  document.getElementById('mCriteria').innerHTML = '<option value="">すべての分類</option>' +
    criterias.map(v=>`<option value="${v}">${v}</option>`).join('');
}

function switchTab(tab) {
  currentTab = tab;
  document.getElementById('tabFacilities').classList.toggle('active', tab==='facilities');
  document.getElementById('tabMiryochi').classList.toggle('active', tab==='miryochi');

  const filterBar = document.querySelector('.filter-bar');
  const sbar = document.querySelector('.sbar');
  const miryochiBar = document.getElementById('miryochiBar');
  const miryochiSbar = document.getElementById('miryochiSbar');
  const cg = document.getElementById('cg');
  const mapWrap = document.getElementById('mapWrap');
  const ce = document.getElementById('ce');
  const mcg = document.getElementById('mcg');
  const mce = document.getElementById('mce');
  const ca = document.querySelector('.cards-area');

  if (tab === 'facilities') {
    filterBar.style.display = '';
    sbar.style.display = '';
    miryochiBar.style.display = 'none';
    miryochiSbar.style.display = 'none';
    mcg.classList.add('hidden');
    mce.classList.add('hidden');
    ca.style.display=''; ca.style.gap=''; ca.style.padding=''; ca.style.alignItems='';
    mapWrap.style.flex=''; mapWrap.style.height='';
    cg.classList.remove('hidden');
    render();
  } else if (tab === 'miryochi') {
    filterBar.style.display = 'none';
    sbar.style.display = 'none';
    miryochiBar.style.display = 'flex';
    miryochiSbar.style.display = 'flex';
    cg.classList.add('hidden');
    mapWrap.classList.add('hidden');
    ce.classList.add('hidden');
    ca.style.display=''; ca.style.gap=''; ca.style.padding=''; ca.style.alignItems='';
    mapWrap.style.flex=''; mapWrap.style.height='';
    mcg.classList.remove('hidden');
    renderMiryochiCards();
  }
}

function setMSort(btn, s) {
  mSort = s;
  document.querySelectorAll('#miryochiSbar .sbtn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderMiryochiCards();
}

function resetMiryochiF() {
  document.getElementById('mq').value = '';
  document.getElementById('mWard').value = '';
  document.getElementById('mBureau').value = '';
  document.getElementById('mPolicy').value = '';
  document.getElementById('mCriteria').value = '';
  renderMiryochiCards();
}

const mSelected = new Set();

function updateMSelUI() {
  const n = mSelected.size;
  const btn = document.getElementById('mCsvBtn');
  if (!btn) return;
  btn.style.display = n > 0 ? 'inline-flex' : 'none';
  document.getElementById('mSelCount').textContent = `(${n}件)`;
}

function toggleMSel(idx, chk) {
  if (chk) mSelected.add(idx); else mSelected.delete(idx);
  const card = document.querySelector(`.mcard[data-idx="${idx}"]`);
  if (card) card.classList.toggle('sel-active', chk);
  updateMSelUI();
}

function mSelectAll() {
  getMiryochiFiltered().forEach((m, i) => {
    const idx = MIRYOCHI.indexOf(m);
    mSelected.add(idx);
  });
  renderMiryochiCards();
  updateMSelUI();
}

function mClearSel() {
  mSelected.clear();
  renderMiryochiCards();
  updateMSelUI();
}

function exportMiryochiCSV() {
  if (mSelected.size === 0) return;
  const rows = [...mSelected].map(i => MIRYOCHI[i]).filter(Boolean);
  const header = ['名称','所在区','所管局','面積(㎡)','現状','活用方針','分類','貸付等','まっぷなびURL'];
  const escape = v => { const s = String(v??''); return s.includes(',')||s.includes('"')||s.includes('\n') ? `"${s.replace(/"/g,'""')}"` : s; };
  const csv = [header.join(','), ...rows.map(m => [
    m.name, m.ward||'', m.bureau, m.area||'', m.status||'', m.policy||'', m.criteria||'', m.rental||'', m.link||''
  ].map(escape).join(','))].join('\n');
  const blob = new Blob(['﻿' + csv], {type: 'text/csv;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `大阪市未利用地_選択${rows.length}件.csv`;
  a.click();
}

// ── 未利用地カード描画 ──
const POLICY_COLOR = {
  '売却予定地': '#c0392b',
  '事業予定地': '#1a6fb5',
  '継続保有地': '#1e8c5a',
  '貸付等活用地': '#6b3fa0',
  '検討中': '#d4670a'
};

function getMiryochiFiltered() {
  const q = (document.getElementById('mq')||{value:''}).value.trim();
  const ward = (document.getElementById('mWard')||{value:''}).value;
  const bureau = (document.getElementById('mBureau')||{value:''}).value;
  const policy = (document.getElementById('mPolicy')||{value:''}).value;
  const criteria = (document.getElementById('mCriteria')||{value:''}).value;
  return MIRYOCHI.filter(m => {
    if (q && !m.name.includes(q)) return false;
    if (ward && m.ward !== ward) return false;
    if (bureau && m.bureau !== bureau) return false;
    if (policy && m.policy !== policy) return false;
    if (criteria && m.criteria !== criteria) return false;
    return true;
  }).sort((a,b) => {
    if (mSort === 'ad') return (parseInt(b.area)||0) - (parseInt(a.area)||0);
    if (mSort === 'aa') return (parseInt(a.area)||0) - (parseInt(b.area)||0);
    if (mSort === 'bureau') return a.bureau.localeCompare(b.bureau,'ja') || a.name.localeCompare(b.name,'ja');
    return a.name.localeCompare(b.name, 'ja');
  });
}

function renderMiryochiCards() {
  const data = getMiryochiFiltered();
  const mcg = document.getElementById('mcg');
  const mce = document.getElementById('mce');
  document.getElementById('mrn').textContent = data.length.toLocaleString();
  mcg.classList.toggle('hidden', data.length === 0);
  mce.classList.toggle('hidden', data.length > 0);
  mcg.innerHTML = data.map(m => renderMiryochiCard(m)).join('');
  updateMSelUI();
}

function renderMiryochiCard(m) {
  const idx = MIRYOCHI.indexOf(m);
  const pc = POLICY_COLOR[m.policy] || '#888';
  const rental = m.rental || '－';
  const area = m.area ? parseInt(m.area).toLocaleString() : '—';
  const chk = mSelected.has(idx);
  const linkBtn = m.link
    ? `<a href="${m.link}" target="_blank" rel="noopener" class="mcard-link">🗺 まっぷなびおおさか</a>`
    : '';
  const policyTag = `<span class="mcard-tag" style="background:${pc}22;color:${pc};border:1px solid ${pc}88">${m.policy}</span>`;
  const statusTag = `<span class="mcard-tag" style="background:#f5f5f5;color:#555;border:1px solid #ddd">${m.status||'—'}</span>`;
  const wardTag = m.ward ? `<span class="tag tw" style="flex-shrink:0">${m.ward}</span>` : '';
  return `<div class="mcard${chk?' sel-active':''}" data-idx="${idx}">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;margin-bottom:4px">
      <div style="display:flex;align-items:flex-start;gap:6px;flex:1;min-width:0">
        <input type="checkbox" ${chk?'checked':''} onclick="event.stopPropagation();toggleMSel(${idx},this.checked)" style="width:15px;height:15px;cursor:pointer;accent-color:var(--blue);flex-shrink:0;margin-top:1px">
        <div class="mcard-name">${m.name}</div>
      </div>
      ${wardTag}
    </div>
    <div class="mcard-row" style="padding-left:21px">
      <span style="font-size:11px;color:var(--muted)">${m.bureau}</span>
      ${policyTag}${statusTag}
    </div>
    <div class="mcard-stats" style="padding-left:21px">
      <div><div class="mcard-stat-v">${area}</div><div class="mcard-stat-u">面積（㎡）</div></div>
      <div><div class="mcard-stat-v" style="font-size:12px">${m.criteria||'—'}</div><div class="mcard-stat-u">基準</div></div>
      <div><div class="mcard-stat-v" style="font-size:12px">${rental}</div><div class="mcard-stat-u">貸付等</div></div>
    </div>
    ${linkBtn ? `<div style="padding-top:8px;border-top:1px solid var(--line);padding-left:21px">${linkBtn}</div>` : ''}
  </div>`;
}

function buildMiryochiPopup(m) {
  const rental = m.rental || '－';
  const linkBtn = m.link
    ? `<a href="${m.link}" target="_blank" rel="noopener" style="display:block;margin-top:8px;padding:5px 10px;background:#1a6fb5;color:#fff;text-align:center;border-radius:4px;text-decoration:none;font-size:12px">🗺 まっぷなびおおさかで見る</a>`
    : '';
  return `<div style="font-size:13px;line-height:1.6">
    <b style="font-size:14px">${m.name}</b><br>
    <table style="width:100%;border-collapse:collapse;margin-top:6px">
      <tr><td style="color:#888;white-space:nowrap;padding-right:8px">所管局</td><td>${m.bureau}</td></tr>
      <tr><td style="color:#888;white-space:nowrap;padding-right:8px">面積</td><td>${m.area} ㎡</td></tr>
      <tr><td style="color:#888;white-space:nowrap;padding-right:8px">現状</td><td>${m.status}</td></tr>
      <tr><td style="color:#888;white-space:nowrap;padding-right:8px">活用方針</td><td>${m.policy}（${m.criteria}）</td></tr>
      <tr><td style="color:#888;white-space:nowrap;padding-right:8px">貸付等</td><td>${rental}</td></tr>
    </table>
    ${linkBtn}
  </div>`;
}

function buildMiryochiGroupPopup(group) {
  return group.map((m, i) => {
    const rental = m.rental || '－';
    const linkBtn = m.link
      ? `<a href="${m.link}" target="_blank" rel="noopener" style="display:inline-block;margin-top:4px;padding:3px 8px;background:#1a6fb5;color:#fff;border-radius:4px;text-decoration:none;font-size:11px">🗺 まっぷなびおおさか</a>`
      : '';
    const sep = i < group.length - 1 ? '<hr style="border:none;border-top:1px solid #ddd;margin:10px 0">' : '';
    return `<div>
      <b style="font-size:13px">${m.name}</b>
      <table style="width:100%;border-collapse:collapse;margin-top:4px;font-size:12px">
        <tr><td style="color:#888;white-space:nowrap;padding-right:8px">所管局</td><td>${m.bureau}</td></tr>
        <tr><td style="color:#888;white-space:nowrap;padding-right:8px">面積</td><td>${m.area} ㎡</td></tr>
        <tr><td style="color:#888;white-space:nowrap;padding-right:8px">現状</td><td>${m.status}</td></tr>
        <tr><td style="color:#888;white-space:nowrap;padding-right:8px">活用方針</td><td>${m.policy}（${m.criteria}）</td></tr>
        <tr><td style="color:#888;white-space:nowrap;padding-right:8px">貸付等</td><td>${rental}</td></tr>
      </table>
      ${linkBtn}
    </div>${sep}`;
  }).join('');
}

function renderMiryochi() {
  miryochiLayer.clearLayers();
  // 同一座標でグループ化
  const groups = new Map();
  MIRYOCHI.forEach(m => {
    if (!m.lat || !m.lng) return;
    const key = `${m.lat.toFixed(5)},${m.lng.toFixed(5)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
  });

  groups.forEach(group => {
    const { lat, lng } = group[0];
    const isMulti = group.length > 1;
    const iconHtml = isMulti
      ? `<div style="width:14px;height:14px;background:#e67e22;border:2px solid #333;box-shadow:0 1px 3px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;font-size:8px;color:#fff;font-weight:900">${group.length}</div>`
      : '<div style="width:10px;height:10px;background:#e67e22;border:2px solid #333;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>';
    const icon = L.divIcon({
      className: '',
      html: iconHtml,
      iconSize: isMulti ? [14, 14] : [10, 10],
      iconAnchor: isMulti ? [7, 7] : [5, 5]
    });
    const marker = L.marker([lat, lng], { icon });
    const popupContent = isMulti
      ? `<div style="font-size:13px;line-height:1.6"><b style="font-size:13px;color:#e67e22">${group.length}件の未利用地</b>${'<hr style="border:none;border-top:1px solid #ddd;margin:8px 0">'}${buildMiryochiGroupPopup(group)}</div>`
      : buildMiryochiPopup(group[0]);
    marker.bindPopup(popupContent, { maxWidth: 340, maxHeight: 400 });
    miryochiLayer.addLayer(marker);
  });
}

function toggleMiryochi() {
  miryochiVisible = !miryochiVisible;
  const btn = document.getElementById('miryochiToggleBtn');
  if (miryochiVisible) {
    if (!leafletMap) { miryochiVisible = false; return; }
    renderMiryochi();
    miryochiLayer.addTo(leafletMap);
    btn.textContent = '未利用地 ON';
    btn.style.background = '#e67e22';
    btn.style.color = '#fff';
    btn.style.borderColor = '#e67e22';
  } else {
    miryochiLayer.remove();
    btn.textContent = '未利用地 OFF';
    btn.style.background = '';
    btn.style.color = '';
    btn.style.borderColor = '';
  }
}

// ══════════════════════════════════════════
// 1. URLコピー
// ══════════════════════════════════════════
function copyShareUrl(){
  const p=new URLSearchParams();
  if(state.q) p.set('q',state.q);
  if(state.wards.size) p.set('wards',[...state.wards].join(','));
  if(state.uses.size) p.set('uses',[...state.uses].join(','));
  if(state.useDetails.size) p.set('uds',[...state.useDetails].join(','));
  if(state.bureaus.size) p.set('bureaus',[...state.bureaus].join(','));
  if(state.karte) p.set('karte',state.karte);
  if(state.rental) p.set('rental',state.rental);
  if(state.sort!=='name') p.set('sort',state.sort);
  if(state.listFilter&&lists[state.listFilter]){
    const ids=lists[state.listFilter].items;
    if(ids.length) p.set('listids',ids.join(','));
  }
  if(state.view==='map') p.set('view','map');
  if(circleActive&&circleLat!=null){
    p.set('clat',circleLat.toFixed(6));
    p.set('clng',circleLng.toFixed(6));
    p.set('crad',circleRadiusM);
    if(circleCenterWard) p.set('cward',circleCenterWard);
    if(circleFilterActive) p.set('cfilter','1');
  }
  const url=location.href.split('?')[0]+(p.toString()?'?'+p.toString():'');
  navigator.clipboard.writeText(url).then(()=>{
    const btn=document.getElementById('shareBtn');
    const orig=btn.textContent;
    btn.textContent='✓ コピー済み';
    btn.style.color='var(--green)';
    btn.style.borderColor='var(--green)';
    setTimeout(()=>{btn.textContent=orig;btn.style.color='';btn.style.borderColor='';},2000);
  });
}

function loadStateFromUrl(){
  const p=new URLSearchParams(location.search);
  if(p.get('q')){state.q=p.get('q');document.getElementById('qi').value=state.q;}
  if(p.get('wards')) p.get('wards').split(',').forEach(w=>state.wards.add(w));
  if(p.get('uses')) p.get('uses').split(',').forEach(u=>state.uses.add(u));
  if(p.get('uds')) p.get('uds').split(',').forEach(d=>state.useDetails.add(d));
  if(p.get('bureaus')) p.get('bureaus').split(',').forEach(b=>state.bureaus.add(b));
  if(p.get('karte')){state.karte=p.get('karte');document.getElementById('ks').value=state.karte;}
  if(p.get('rental')){state.rental=p.get('rental');document.getElementById('rs').value=state.rental;}
  if(p.get('sort')){state.sort=p.get('sort');}
  if(p.get('listids')){
    const ids=p.get('listids').split(',').map(Number).filter(Boolean);
    const tmpId='__shared__';
    lists[tmpId]={name:'共有リスト',items:ids};
    state.listFilter=tmpId;
  }
  if(state.wards.size||state.uses.size||state.useDetails.size||state.bureaus.size){
    buildWsItems([...new Set(FACILITIES.map(f=>f.ward))].sort((a,b)=>a.localeCompare(b,'ja')));
    const uCnt={};FACILITIES.forEach(f=>{uCnt[f.use]=(uCnt[f.use]||0)+1;});
    buildUsItems([...new Set(FACILITIES.map(f=>f.use))].sort((a,b)=>uCnt[b]-uCnt[a]));
    const udCnt={};FACILITIES.forEach(f=>{udCnt[f.useDetail]=(udCnt[f.useDetail]||0)+1;});
    buildUdsItems([...new Set(FACILITIES.map(f=>f.useDetail))].sort((a,b)=>udCnt[b]-udCnt[a]));
    const bureauList=[...new Set(FACILITIES.map(f=>extractBureau(f.manager)))].sort((a,b)=>a.localeCompare(b,'ja'));
    buildBsItems(bureauList);
  }
  if(p.get('view')==='map'){
    state.view='map';
    document.getElementById('cg').classList.add('hidden');
    document.getElementById('mapWrap').classList.remove('hidden');
    document.querySelectorAll('.vbtn').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.vbtn').forEach(b=>{if(b.onclick&&b.onclick.toString().includes("'map'"))b.classList.add('active');});
  }
  if(p.get('clat')&&p.get('clng')){
    circleLat=parseFloat(p.get('clat'));
    circleLng=parseFloat(p.get('clng'));
    circleRadiusM=parseInt(p.get('crad'))||2000;
    if(p.get('cward')) circleCenterWard=p.get('cward');
    circleActive=true;
    if(p.get('cfilter')==='1') circleFilterActive=true;
    if(state.view==='map'){
      setTimeout(()=>{
        initMap();
        // 円パネルUIを表示
        document.getElementById('circlePanelBtn').style.display='none';
        document.getElementById('circlePanel').style.display='block';
        document.getElementById('circleToggleBtn').textContent='OFF';
        document.getElementById('circleToggleBtn').style.background='var(--mid)';
        // 半径スライダーを同期
        const rs=document.getElementById('circleRadiusSlider');
        if(rs){rs.value=circleRadiusM;rs.dispatchEvent(new Event('input'));}
        drawCircle(circleLat,circleLng);
        if(circleFilterActive){
          const fb=document.getElementById('circleFilterBtn');
          if(fb){fb.style.background='var(--blue)';fb.style.color='#fff';}
        }
        renderMap(getFiltered());
      },300);
    }
  }
  render();
}

// ══════════════════════════════════════════
// 2. 統計ダッシュボード
// ══════════════════════════════════════════
function openDash(){
  dashOpen=true;
  document.getElementById('dashPanel').classList.add('open');
  document.getElementById('stickyTop').style.marginRight='360px';
  document.querySelector('.page-body').style.marginRight='360px';
  updateDash(getFiltered());
}

function closeDash(){
  dashOpen=false;
  document.getElementById('dashPanel').classList.remove('open');
  document.getElementById('stickyTop').style.marginRight='';
  document.querySelector('.page-body').style.marginRight='';
}

function updateDash(data){
  if(!data) data=getFiltered();
  // KPI
  const total=data.length;
  const areaSum=data.reduce((s,f)=>s+(f.area>0?f.area:0),0);
  const withYear=data.filter(f=>f.year);
  const avgAge=withYear.length?Math.round(withYear.reduce((s,f)=>s+(2026-f.year),0)/withYear.length):null;
  document.getElementById('dashKpi').innerHTML=`
    <div class="dash-kpi-item"><div class="dash-kpi-v">${total.toLocaleString()}</div><div class="dash-kpi-l">施設数</div></div>
    <div class="dash-kpi-item"><div class="dash-kpi-v">${areaSum>0?(areaSum/10000).toFixed(1)+'万':'—'}</div><div class="dash-kpi-l">延床面積合計㎡</div></div>
    <div class="dash-kpi-item"><div class="dash-kpi-v">${avgAge!==null?avgAge+'年':'—'}</div><div class="dash-kpi-l">平均築年数</div></div>
  `;
  // 行政区別グラフ
  const wardCnt={};data.forEach(f=>{wardCnt[f.ward]=(wardCnt[f.ward]||0)+1;});
  const wardEntries=Object.entries(wardCnt).sort((a,b)=>b[1]-a[1]);
  const wardMax=wardEntries[0]?wardEntries[0][1]:1;
  document.getElementById('dashWardChart').innerHTML=wardEntries.map(([w,n])=>`
    <div class="dash-bar-row">
      <div class="dash-bar-label" title="${w}">${w}</div>
      <div class="dash-bar-track"><div class="dash-bar-fill" style="width:${Math.round(n/wardMax*100)}%;background:var(--blue)"></div></div>
      <div class="dash-bar-val">${n}</div>
    </div>`).join('');
  // 用途大分類別グラフ
  const useCnt={};data.forEach(f=>{useCnt[f.use]=(useCnt[f.use]||0)+1;});
  const useEntries=Object.entries(useCnt).sort((a,b)=>b[1]-a[1]);
  const useMax=useEntries[0]?useEntries[0][1]:1;
  const useColors=['var(--blue)','var(--green)','var(--orange)','var(--purple)','var(--teal)','var(--red)'];
  document.getElementById('dashUseChart').innerHTML=useEntries.map(([u,n],i)=>`
    <div class="dash-bar-row">
      <div class="dash-bar-label" title="${u}">${u}</div>
      <div class="dash-bar-track"><div class="dash-bar-fill" style="width:${Math.round(n/useMax*100)}%;background:${useColors[i%useColors.length]}"></div></div>
      <div class="dash-bar-val">${n}</div>
    </div>`).join('');
  // 築年代別分布（縦棒グラフをSVGで）
  const decadeCnt={};
  data.filter(f=>f.year).forEach(f=>{
    const d=Math.floor(f.year/10)*10;
    decadeCnt[d]=(decadeCnt[d]||0)+1;
  });
  const decades=Object.keys(decadeCnt).map(Number).sort((a,b)=>a-b);
  if(decades.length){
    const maxV=Math.max(...Object.values(decadeCnt));
    const bw=24,gap=4,ph=80,pw=(bw+gap)*decades.length+gap;
    const bars=decades.map((d,i)=>{
      const v=decadeCnt[d];
      const bh=Math.round(v/maxV*(ph-16));
      const x=gap+i*(bw+gap);
      const y=ph-bh-2;
      return `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" fill="var(--blue)" rx="2"/>
        <text x="${x+bw/2}" y="${ph-1}" text-anchor="middle" font-size="8" fill="var(--muted)">${String(d).slice(2)}s</text>
        <text x="${x+bw/2}" y="${y-2}" text-anchor="middle" font-size="8" fill="var(--ink)">${v}</text>`;
    }).join('');
    document.getElementById('dashYearChart').innerHTML=`<svg width="${pw}" height="${ph+4}" style="overflow:visible">${bars}</svg>`;
  } else {
    document.getElementById('dashYearChart').innerHTML='<div style="font-size:12px;color:var(--muted)">データなし</div>';
  }
}

// ── 更新情報 ──
const UPDATE_HISTORY=[
  {date:'2026-06-29',text:'用途地域・容積率リンク、その他地域地区リンクを詳細パネルに追加'},
  {date:'2026-06-29',text:'図書館フィルターを「地域図書館」「中央図書館」に統合'},
  {date:'2026-06-29',text:'地図全件表示時の初期ズーム調整（大阪市役所中心）'},
  {date:'2026-06-29',text:'複合化シミュレーターを別ページ（simulator.html）に移動'},
];
const UPD_VERSION=UPDATE_HISTORY[0].date;
function renderUpdateList(){
  document.getElementById('updateList').innerHTML=UPDATE_HISTORY.map(u=>`<div class="upd-row"><div class="upd-date">${u.date}</div><div class="upd-text">${u.text}</div></div>`).join('');
}
function toggleUpdatePopup(){
  const p=document.getElementById('updatePopup');
  const isOpen=p.classList.toggle('open');
  if(isOpen){
    renderUpdateList();
    localStorage.setItem('lastSeenUpdate',UPD_VERSION);
    document.getElementById('bellDot').style.display='none';
  }
  document.addEventListener('click',function handler(e){
    if(!p.contains(e.target)&&!e.target.closest('#bellBtn')){
      p.classList.remove('open');
      document.removeEventListener('click',handler);
    }
  });
}
function checkUpdateBadge(){
  renderUpdateList();
  if(localStorage.getItem('lastSeenUpdate')!==UPD_VERSION){
    document.getElementById('bellDot').style.display='block';
    setTimeout(()=>toggleUpdatePopup(),800);
  }
}

// ── 施設リスト管理 ──
let lists={};
let activeListId=null;
function loadLists(){lists=JSON.parse(localStorage.getItem('facilityLists')||'{}');}
function saveLists(){localStorage.setItem('facilityLists',JSON.stringify(lists));}

// ── リストの書き出し（JSONファイルとしてダウンロード） ──
function exportLists(){
  loadLists();
  if(!Object.keys(lists).length){alert('書き出せるリストがありません。先にリストを作成してください。');return;}
  const data={type:'facilityLists',app:'osaka-facilities',exported:new Date().toISOString(),lists};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  const d=new Date(),pad=n=>String(n).padStart(2,'0');
  a.download=`施設リスト_${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── リストの読み込み（書き出したJSONファイルを取り込む） ──
// 同じ名前のリストが既にあれば施設を統合（重複は除外）、なければ新しいリストとして追加
function importLists(input){
  const file=input.files && input.files[0];
  if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{
    try{
      const data=JSON.parse(e.target.result);
      // 書き出し形式（{lists:{...}}）と、素のリストオブジェクトの両方を受け付ける
      const src=(data && data.lists && typeof data.lists==='object') ? data.lists
              : (data && typeof data==='object') ? data : null;
      loadLists();
      let added=0, merged=0;
      for(const l of Object.values(src||{})){
        if(!l || typeof l.name!=='string' || !Array.isArray(l.items)) continue; // 形式が違う項目は飛ばす
        const items=l.items.filter(x=>typeof x==='number');
        const existing=Object.values(lists).find(v=>v.name===l.name);
        if(existing){
          items.forEach(fid=>{ if(!existing.items.includes(fid)) existing.items.push(fid); });
          merged++;
        } else {
          lists['l'+Date.now()+'_'+added]={name:l.name,items};
          added++;
        }
      }
      if(!added && !merged){
        alert('読み込めるリストが見つかりませんでした。「書き出し」で保存したJSONファイルを選んでください。');
        return;
      }
      saveLists();
      renderListPanel();
      rebuildListFilterSelect();
      const msg=[];
      if(added)msg.push('新規 '+added+'件');
      if(merged)msg.push('既存リストに統合 '+merged+'件');
      alert('リストを読み込みました（'+msg.join('、')+'）');
    }catch(err){
      alert('ファイルの読み込みに失敗しました。「書き出し」で保存したJSONファイルか確認してください。');
    }finally{
      input.value=''; // 同じファイルをもう一度選べるようにリセット
    }
  };
  reader.readAsText(file);
}
function rebuildListFilterSelect(){
  const sel=document.getElementById('listFilterSel');
  if(!sel)return;
  const cur=state.listFilter||sel.value;
  sel.innerHTML='<option value="">すべて</option>'+Object.entries(lists).map(([id,l])=>`<option value="${id}">${l.name}（${l.items.length}件）</option>`).join('');
  if(lists[cur]) sel.value=cur;
}
function onListFilterChange(val){
  if(val){
    // リスト選択時は他フィルターをすべてリセット
    state={...state,q:'',wards:new Set(),uses:new Set(),useDetails:new Set(),bureaus:new Set(),karte:'',rental:'',listFilter:val};
    document.getElementById('qi').value='';
    document.getElementById('ks').value='';
    document.getElementById('rs').value='';
    updateWsBtn();updateUsBtn();updateBsBtn();
    const udCount={};FACILITIES.forEach(f=>{udCount[f.useDetail]=(udCount[f.useDetail]||0)+1;});
    buildUdsItems([...new Set(FACILITIES.map(f=>f.useDetail))].sort((a,b)=>udCount[b]-udCount[a]));
  } else {
    state.listFilter='';
  }
  render();
}
function createList(){
  const name=document.getElementById('newListName').value.trim();
  if(!name)return;
  const id='l'+Date.now();
  lists[id]={name,items:[]};
  saveLists();
  activeListId=id;
  document.getElementById('newListName').value='';
  renderListPanel();
}
function deleteList(id){
  const target=id||activeListId;
  if(!target||!confirm('リスト「'+lists[target]?.name+'」を削除しますか？'))return;
  delete lists[target];
  if(activeListId===target) activeListId=null;
  saveLists();
  renderListPanel();
}
function addToList(facilityId,listId){
  if(!lists[listId])return;
  if(!lists[listId].items.includes(facilityId)) lists[listId].items.push(facilityId);
  saveLists();
  renderListPanel();
}
function removeFromList(facilityId){
  if(!activeListId)return;
  lists[activeListId].items=lists[activeListId].items.filter(id=>id!==facilityId);
  saveLists();
  renderListPanel();
}
function toggleListOpen(id){
  activeListId = (activeListId===id) ? null : id;
  renderListPanel();
}
function renderListPanel(){
  const namesEl=document.getElementById('listNames');
  const entries=Object.entries(lists);
  if(!entries.length){
    namesEl.innerHTML='<div style="padding:20px;text-align:center;color:var(--muted);font-size:12px">まだリストがありません</div>';
    rebuildListFilterSelect();
    return;
  }
  namesEl.innerHTML=entries.map(([id,l])=>{
    const open=id===activeListId;
    const facs=open?l.items.map(fid=>FACILITIES.find(f=>f.id===fid)).filter(Boolean):[];
    const itemsHtml=open?`
      <div style="background:var(--bg);border-top:1px solid var(--line)">
        ${facs.length?facs.map(f=>`
          <div style="padding:8px 12px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:8px;background:#fff">
            <div style="flex:1;cursor:pointer" onclick="selF(${f.id})">
              <div style="font-weight:700;font-size:13px">${f.name}</div>
              <div style="font-size:11px;color:var(--muted)">${f.ward} · ${f.useDetail||f.use}</div>
            </div>
            <button onclick="removeFromList(${f.id})" style="background:none;border:1px solid var(--line);border-radius:4px;padding:2px 6px;font-size:11px;cursor:pointer;color:var(--muted);flex-shrink:0">✕</button>
          </div>`).join(''):'<div style="padding:16px;text-align:center;color:var(--muted);font-size:12px">施設を追加してください</div>'}
        <div style="padding:8px 10px;display:flex;gap:6px;border-top:1px solid var(--line)">
          <button onclick="exportListCsv()" style="flex:1;padding:6px;background:var(--green);color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">⬇ CSV出力</button>
          <button onclick="deleteList('${id}')" style="padding:6px 10px;background:var(--red);color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">削除</button>
        </div>
      </div>`:''
    ;
    return `
      <div>
        <div class="lp-list${open?' active':''}" onclick="toggleListOpen('${id}')">
          <span style="font-weight:700">${l.name}</span>
          <span style="display:flex;align-items:center;gap:6px">
            <span style="font-size:11px;color:var(--muted)">${l.items.length}件</span>
            <span style="font-size:10px;color:var(--muted)">${open?'▲':'▼'}</span>
          </span>
        </div>
        ${itemsHtml}
      </div>`;
  }).join('');
  rebuildListFilterSelect();
}
function exportListCsv(){
  if(!activeListId||!lists[activeListId])return;
  const facs=lists[activeListId].items.map(id=>FACILITIES.find(f=>f.id===id)).filter(Boolean);
  const rows=[['施設名','住所','区','用途','用途詳細','延床面積','建築年度'],...facs.map(f=>[f.name,f.addr,f.ward,f.use,f.useDetail||'',f.area||'',f.year||''])];
  const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=lists[activeListId].name+'.csv';a.click();
}
function toggleListPanel(){
  loadLists();
  const p=document.getElementById('listPanel');
  p.classList.toggle('open');
  if(p.classList.contains('open')) renderListPanel();
}
function showAddToListMenu(fid, btn){
  loadLists();
  const listKeys=Object.keys(lists);
  if(!listKeys.length){
    toggleListPanel();
    return;
  }
  let menu=document.getElementById('addToListMenu');
  if(menu) menu.remove();
  menu=document.createElement('div');
  menu.id='addToListMenu';
  menu.style.cssText='position:fixed;z-index:9999;background:#fff;border:1.5px solid var(--line);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.15);min-width:160px;padding:4px 0';
  menu.innerHTML=listKeys.map(id=>`<div onclick="addToList(${fid},'${id}');document.getElementById('addToListMenu')?.remove()" style="padding:8px 14px;cursor:pointer;font-size:13px" onmouseover="this.style.background='#f5f7ff'" onmouseout="this.style.background=''">${lists[id].name}</div>`).join('');
  const rect=btn.getBoundingClientRect();
  menu.style.left=rect.left+'px';
  menu.style.top=(rect.bottom+4)+'px';
  document.body.appendChild(menu);
  setTimeout(()=>document.addEventListener('click',function h(){menu.remove();document.removeEventListener('click',h);},{once:true}),0);
}

// ── 初期化フック ──
async function loadAndInit() {
  const ov = document.getElementById('loadingOverlay');
  try {
    const [f, m, w] = await Promise.all([
      fetch('facilities.json').then(r => { if (!r.ok) throw new Error('facilities.json の取得に失敗'); return r.json(); }),
      fetch('miryochi.json').then(r => { if (!r.ok) throw new Error('miryochi.json の取得に失敗'); return r.json(); }),
      fetch('osaka_wards.geojson').then(r => r.ok ? r.json() : null).catch(() => null) // 区境界（取得失敗でも動作継続）
    ]);
    FACILITIES = f; MIRYOCHI = m; WARDS_GEOJSON = w;
    FACILITIES.forEach(fac=>{ fac.useDetail=normalizeUseDetail(fac.useDetail); });
    FACILITIES.forEach(fac=>{ const k=normAddr(fac.addr); addrCount[k]=(addrCount[k]||0)+1; });
    init(); computeMiryochiWards(); buildMiryochiDropdowns();
    // 読み込み完了 → オーバーレイをフェードアウトして削除
    if (ov) { ov.classList.add('lo-done'); setTimeout(() => ov.remove(), 400); }
  } catch (e) {
    // 読み込み失敗 → エラーメッセージと再読み込みボタンを表示
    if (ov) {
      ov.innerHTML = '<div class="lo-box"><div class="lo-error">⚠️ データの読み込みに失敗しました<br>通信環境をご確認ください</div>' +
        '<button class="lo-retry" onclick="location.reload()">再読み込み</button></div>';
    }
    console.error('データ読み込みエラー:', e);
  }
}

document.addEventListener('DOMContentLoaded',()=>{
  updateThemeBtn();
  loadLists();
  loadStateFromUrl();
  rebuildListFilterSelect();
  checkUpdateBadge();
  loadAndInit();
});
