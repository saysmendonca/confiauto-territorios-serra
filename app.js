(() => {
  const LAYER_URL = 'https://mapas.serra.es.gov.br/server/rest/services/Hosted/PLA_Bairro/FeatureServer/0/query';
  const STORAGE_KEY = 'confiauto-serra-territorios-v1';
  const CENTER = [-20.1289, -40.3074];
  const DEFAULT_TEAMS = [
    { id: 'team-blue', name: 'Xtreme', color: '#2563eb', reps: [] },
    { id: 'team-green', name: 'Jato', color: '#e11d48', reps: [] },
    { id: 'team-orange', name: 'Bravos', color: '#059669', reps: [] },
    { id: 'team-caveira', name: 'Caveira', color: '#7c3aed', reps: [] },
    { id: 'team-alta-performance', name: 'Alta Performance', color: '#ea580c', reps: [] },
  ];
  const PALETTE = ['#2563eb','#e11d48','#059669','#7c3aed','#ea580c','#0891b2','#a16207','#db2777','#4d7c0f','#475569'];
  let state = readState();
  let map, geoLayer, features = [], featureById = new Map(), currentArea = null, selectedColor = PALETTE[0], filter = 'all', search = '';
  let toastTimer;
  const $ = (id) => document.getElementById(id);

  function readState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && Array.isArray(saved.teams) && saved.assignments) {
        DEFAULT_TEAMS.forEach(defaultTeam => {
          const existing = saved.teams.find(team => team.id === defaultTeam.id);
          if (existing) {
            existing.name = defaultTeam.name;
            existing.color = defaultTeam.color;
            if ((existing.reps || []).every(rep => /^Representante \d+$/.test(rep))) existing.reps = [];
          } else saved.teams.push({...defaultTeam, reps:[]});
        });
        return saved;
      }
    } catch (e) { /* malformed local data is ignored */ }
    return { teams: DEFAULT_TEAMS.map(t => ({...t, reps:[...t.reps]})), assignments: {} };
  }
  function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  function esc(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function colorFor(id) { return state.teams.find(t => t.id === state.assignments[id])?.color || null; }
  function assignedLabel(id) { return state.teams.find(t => t.id === state.assignments[id])?.name || ''; }
  function counts() { const c = {}; state.teams.forEach(t => c[t.id] = 0); Object.values(state.assignments).forEach(id => {if (id in c) c[id]++;}); return c; }
  function toast(message) { const el=$('toast'); el.textContent=message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('show'),2400); }

  function initMap() {
    map = L.map('map', { zoomControl:false, preferCanvas:true }).setView(CENTER, 11.1);
    L.control.zoom({position:'bottomright'}).addTo(map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:19, attribution:'© OpenStreetMap contributors' }).addTo(map);
    map.on('zoomend moveend', refreshLabels);
  }
  function featureId(feature) { return String(feature.properties?.objectid ?? feature.properties?.OBJECTID ?? feature.id); }
  function featureName(feature) { return feature.properties?.tx_bairro || feature.properties?.TX_BAIRRO || feature.properties?.Bairro || 'Bairro'; }
  function layerStyle(feature) {
    const id=featureId(feature), color=colorFor(id), matches=matchesFilter(feature);
    const dimmed = !matches;
    return { color: color ? shade(color,-35) : '#597487', weight:color?2.2:1.55, opacity:dimmed?.20:.96, fillColor:color || '#b9c8d1', fillOpacity:dimmed?.045:(color?.52:.22), className:'area-polygon' };
  }
  function shade(hex, amount) {
    const n=parseInt(hex.slice(1),16), r=Math.max(0,Math.min(255,(n>>16)+amount)),g=Math.max(0,Math.min(255,((n>>8)&255)+amount)),b=Math.max(0,Math.min(255,(n&255)+amount));
    return '#'+(1<<24|r<<16|g<<8|b).toString(16).slice(1);
  }
  function matchesFilter(feature) {
    const name=featureName(feature).toLocaleLowerCase('pt-BR'), assigned=!!colorFor(featureId(feature));
    if(search && !name.includes(search.toLocaleLowerCase('pt-BR'))) return false;
    if(filter==='assigned' && !assigned) return false;
    if(filter==='unassigned' && assigned) return false;
    return true;
  }
  function onEachFeature(feature, layer) {
    const id=featureId(feature);
    layer.on({click:()=>openAssign(feature), mouseover:e=>{e.target.setStyle({weight:2.5,fillOpacity:.68});e.target.bringToFront();}, mouseout:e=>geoLayer?.resetStyle(e.target)});
    featureById.set(id,layer);
  }
  async function loadNeighborhoods() {
    const params = new URLSearchParams({where:'1=1',outFields:'objectid,tx_bairro',returnGeometry:'true',outSR:'4326',f:'geojson',geometryPrecision:'5'});
    try {
      const response=await fetch(`${LAYER_URL}?${params.toString()}`,{headers:{Accept:'application/geo+json, application/json'}});
      if(!response.ok) throw new Error(`HTTP ${response.status}`);
      const data=await response.json();
      if(!data.features?.length) throw new Error(data.error?.message || 'A camada não retornou bairros.');
      features=data.features.filter(f=>f.geometry);
      geoLayer=L.geoJSON({...data,features},{style:layerStyle,onEachFeature}).addTo(map);
      map.fitBounds(geoLayer.getBounds(),{padding:[28,28],maxZoom:12});
      $('mapLoading').classList.add('hidden');
      $('coverageLabel').textContent='Limites oficiais · Lei 4.514/2016';
      $('coverageLabel').title='Camada oficial da Prefeitura da Serra, conforme Lei Municipal 4.514/2016';
      renderAreas(); renderTeams(); renderStats(); refreshLabels();
    } catch(err) {
      $('mapLoading').innerHTML='<span class="error-mark">!</span><span>Não foi possível carregar os bairros. Verifique sua conexão e tente atualizar.</span>';
      $('coverageLabel').textContent='Mapa indisponível';
      $('areaList').innerHTML='<div class="empty-list">A camada oficial da Prefeitura não respondeu. Recarregue a página com conexão à internet.</div>';
      console.error('Erro carregando bairros Serra:',err);
    }
  }
  let labelFrame = 0;
  function refreshLabels() {
    if(!geoLayer) return;
    const zoom=map.getZoom(), show=zoom>=11;
    geoLayer.eachLayer(layer=>{
      if(!show){layer.unbindTooltip();return;}
      if(!layer.getTooltip()) layer.bindTooltip(esc(featureName(layer.feature)),{permanent:true,direction:'center',className:'area-label',opacity:.96});
      layer.openTooltip();
    });
    if(!show)return;
    cancelAnimationFrame(labelFrame);
    labelFrame=requestAnimationFrame(()=>requestAnimationFrame(()=>{
      const mapRect=$('map').getBoundingClientRect(), occupied=[];
      const candidates=[...document.querySelectorAll('.leaflet-tooltip.area-label')];
      candidates.sort((a,b)=>a.textContent.length-b.textContent.length);
      candidates.forEach(element=>{
        const rect=element.getBoundingClientRect();
        const outside=rect.right<mapRect.left || rect.left>mapRect.right || rect.bottom<mapRect.top || rect.top>mapRect.bottom;
        const collision=zoom<13 && occupied.some(r=>rect.left<r.right+3 && rect.right+3>r.left && rect.top<r.bottom+2 && rect.bottom+2>r.top);
        element.style.display=outside || collision?'none':'';
        if(!outside && !collision) occupied.push(rect);
      });
    }));
  }
  function renderStats() {
    const assigned=Object.keys(state.assignments).filter(id=>featureById.has(id)).length;
    $('assignedCount').textContent=assigned;
    $('teamCount').textContent=state.teams.length;
    $('areaTotal').textContent=features.length;
    const pct=features.length?Math.round(assigned/features.length*100):0;
    $('coverageLabel').title=`${pct}% dos bairros já distribuídos`;
  }
  function renderTeams() {
    const countsByTeam=counts();
    $('teamList').innerHTML=state.teams.length?state.teams.map(t=>{
      const reps=(t.reps||[]).filter(Boolean);
      return `<article class="team-card"><div class="team-card-head"><i class="team-color" style="--team-color:${esc(t.color)}"></i><span class="team-name" title="${esc(t.name)}">${esc(t.name)}</span><span class="team-area-count">${countsByTeam[t.id]||0} bairros</span><button class="team-edit" data-edit-team="${esc(t.id)}" title="Editar ${esc(t.name)}" aria-label="Editar equipe">···</button></div><div class="team-reps">${reps.length?esc(reps.join(' · ')):'Adicione os colaboradores desta equipe'}</div></article>`;
    }).join(''):'<div class="empty-teams">Adicione uma equipe para começar a distribuir os bairros.</div>';
    $('teamCount').textContent=state.teams.length;
    $('legendItems').innerHTML=state.teams.map(t=>`<div class="legend-team"><i style="background:${esc(t.color)}"></i><span>${esc(t.name)}</span></div>`).join('') || '<div class="legend-team">Cadastre equipes para ver as cores.</div>';
    document.querySelectorAll('[data-edit-team]').forEach(btn=>btn.addEventListener('click',()=>openTeamDialog(btn.dataset.editTeam)));
  }
  function renderAreas() {
    const sorted=[...features].sort((a,b)=>featureName(a).localeCompare(featureName(b),'pt-BR'));
    const visible=sorted.filter(matchesFilter);
    $('areaList').innerHTML=visible.length?visible.map(f=>{
      const id=featureId(f), color=colorFor(id), assignee=assignedLabel(id);
      return `<button class="area-item ${color?'assigned':''}" data-area-id="${esc(id)}" style="--area-color:${esc(color||'#d7dfe5')}" title="Abrir ${esc(featureName(f))} no mapa"><i class="area-status"></i><span class="area-name">${esc(featureName(f))}</span>${assignee?`<span class="area-assignee">${esc(assignee)}</span>`:''}</button>`;
    }).join(''):'<div class="empty-list">Nenhum bairro encontrado neste filtro.</div>';
    document.querySelectorAll('[data-area-id]').forEach(btn=>btn.addEventListener('click',()=>{
      const f=features.find(x=>featureId(x)===btn.dataset.areaId); if(!f)return;
      const layer=featureById.get(btn.dataset.areaId); if(layer){map.fitBounds(layer.getBounds(),{maxZoom:14}); setTimeout(()=>openAssign(f),220);}
    }));
  }
  function repaint() {
    if(geoLayer) geoLayer.setStyle(layerStyle);
    renderTeams();renderAreas();renderStats();refreshLabels();
  }
  function openAssign(feature) {
    currentArea=feature; const id=featureId(feature), current=state.assignments[id];
    $('dialogArea').textContent=featureName(feature);
    $('teamChoices').innerHTML=state.teams.map(t=>`<button class="team-choice ${current===t.id?'selected':''}" type="button" data-assign-team="${esc(t.id)}"><i style="background:${esc(t.color)}"></i><span>${esc(t.name)}</span><small>${(counts()[t.id]||0)} bairros</small></button>`).join('') || '<div class="empty-list">Cadastre uma equipe antes de atribuir este bairro.</div>';
    document.querySelectorAll('[data-assign-team]').forEach(btn=>btn.addEventListener('click',()=>{
      state.assignments[id]=btn.dataset.assignTeam; save(); $('assignDialog').close(); repaint(); toast(`${featureName(feature)} atribuído a ${state.teams.find(t=>t.id===btn.dataset.assignTeam)?.name}.`);
    }));
    $('unassignBtn').style.visibility=current?'visible':'hidden';
    $('unassignBtn').onclick=()=>{delete state.assignments[id];save();$('assignDialog').close();repaint();toast('Equipe removida do bairro.');};
    $('assignDialog').showModal();
  }
  function openTeamDialog(id=null) {
    const team=state.teams.find(t=>t.id===id); $('teamDialogTitle').textContent=team?'Editar equipe':'Nova equipe';
    $('teamIdInput').value=team?.id||''; $('teamNameInput').value=team?.name||''; $('teamRepInput').value=(team?.reps||[]).join('\n'); selectedColor=team?.color||PALETTE[state.teams.length%PALETTE.length];
    $('deleteTeamBtn').style.visibility=team?'visible':'hidden';
    $('colorChoices').innerHTML=PALETTE.map(c=>`<button type="button" class="color-choice ${c===selectedColor?'active':''}" data-color="${c}" style="background:${c}" aria-label="Selecionar cor ${c}"></button>`).join('');
    document.querySelectorAll('[data-color]').forEach(btn=>btn.addEventListener('click',()=>{selectedColor=btn.dataset.color;document.querySelectorAll('[data-color]').forEach(b=>b.classList.toggle('active',b.dataset.color===selectedColor));}));
    $('deleteTeamBtn').onclick=()=>{
      if(!team)return;
      const count=Object.values(state.assignments).filter(x=>x===team.id).length;
      if(!confirm(`Excluir ${team.name}? ${count?`${count} bairro(s) ficarão sem equipe.`:''}`))return;
      state.teams=state.teams.filter(t=>t.id!==team.id); Object.keys(state.assignments).forEach(a=>{if(state.assignments[a]===team.id)delete state.assignments[a];}); save(); $('teamDialog').close(); repaint(); toast('Equipe excluída.');
    };
    $('teamDialog').showModal();
    setTimeout(()=>$('teamNameInput').focus(),50);
  }
  function exportCsv() {
    if(!features.length){toast('Carregue os bairros antes de exportar.');return;}
    const rows=[['Bairro','Equipe','Cor','Colaboradores'],...features.map(f=>{
      const t=state.teams.find(x=>x.id===state.assignments[featureId(f)]);
      return [featureName(f),t?.name||'',t?.color||'',(t?.reps||[]).join('; ')];
    })];
    const csv='\ufeff'+rows.map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(';')).join('\r\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='confiauto-divisao-serra.csv';a.click();URL.revokeObjectURL(url);toast('Arquivo CSV exportado.');
  }
  function restoreExample() {
    if(!confirm('Restaurar as equipes de exemplo e remover as atribuições atuais?'))return;
    state={teams:DEFAULT_TEAMS.map(t=>({...t,reps:[...t.reps]})),assignments:{}}; save(); repaint(); toast('Exemplo restaurado.');
  }
  function wire() {
    $('addTeamBtn').addEventListener('click',()=>openTeamDialog());
    $('teamForm').addEventListener('submit',e=>{
      e.preventDefault();const name=$('teamNameInput').value.trim();if(!name){$('teamNameInput').focus();return;}
      const id=$('teamIdInput').value || `team-${Date.now()}`, reps=$('teamRepInput').value.split('\n').map(x=>x.trim()).filter(Boolean);
      const existing=state.teams.find(t=>t.id===id),next={id,name,color:selectedColor,reps};
      if(existing)state.teams=state.teams.map(t=>t.id===id?next:t);else state.teams.push(next);
      save();$('teamDialog').close();repaint();toast(existing?'Equipe atualizada.':'Equipe adicionada.');
    });
    $('exportBtn').addEventListener('click',exportCsv); $('printBtn').addEventListener('click',()=>window.print()); $('resetBtn').addEventListener('click',restoreExample);
    $('recenterBtn').addEventListener('click',()=>geoLayer?map.fitBounds(geoLayer.getBounds(),{padding:[28,28],maxZoom:12}):map.setView(CENTER,11.1));
    $('fullscreenBtn').addEventListener('click',()=>{const el=$('.map-panel');if(!document.fullscreenElement)el.requestFullscreen?.();else document.exitFullscreen?.();setTimeout(()=>map.invalidateSize(),250);});
    $('searchInput').addEventListener('input',e=>{search=e.target.value.trim();renderAreas();if(geoLayer)geoLayer.setStyle(layerStyle);});
    document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));renderAreas();if(geoLayer)geoLayer.setStyle(layerStyle);}));
    $('cancelAssign').addEventListener('click',()=>{});
    document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('searchInput').focus();}});
  }
  initMap(); wire(); renderTeams(); renderStats(); loadNeighborhoods();
})();
