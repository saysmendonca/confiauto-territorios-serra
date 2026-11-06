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
  let supabaseClient = null, currentUser = null, currentProfile = null, actionReports = [], selectedAreaIds = new Set(), reportDrafts = new Map(), profileCache = new Map(), reportsChannel = null, reportMarkers = null;
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
  function localDateValue(date=new Date()) { const local=new Date(date.getTime()-date.getTimezoneOffset()*60000);return local.toISOString().slice(0,10); }

  function initMap() {
    map = L.map('map', { zoomControl:false, preferCanvas:true }).setView(CENTER, 11.1);
    L.control.zoom({position:'bottomright'}).addTo(map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:19, attribution:'© OpenStreetMap contributors' }).addTo(map);
    map.on('zoomend moveend', refreshLabels);
  }
  function featureId(feature) { return String(feature.properties?.objectid ?? feature.properties?.OBJECTID ?? feature.id); }
  function featureName(feature) { return feature.properties?.tx_bairro || feature.properties?.TX_BAIRRO || feature.properties?.Bairro || 'Bairro'; }
  function layerStyle(feature) {
    const id=featureId(feature), color=colorFor(id), matches=matchesFilter(feature), hasReports=actionReports.some(report=>report.area_id===id);
    const dimmed = !matches;
    const selected=selectedAreaIds.has(id);
    return { color: selected?'#112b45':(color ? shade(color,-35) : (hasReports?'#168e6b':'#597487')), weight:selected?3.4:(color?2.2:(hasReports?2:1.55)), opacity:dimmed?.20:.96, fillColor:selected?'#16a879':(color || (hasReports?'#4bc59a':'#b9c8d1')), fillOpacity:selected?.66:(dimmed?.045:(color?.52:(hasReports?.46:.22))), className:'area-polygon' };
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
    layer.on({click:()=>currentProfile?.role==='admin'?openAssign(feature):toggleSelectedArea(feature), mouseover:e=>{e.target.setStyle({weight:2.5,fillOpacity:.68});e.target.bringToFront();}, mouseout:e=>geoLayer?.resetStyle(e.target)});
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
      const candidates=[...document.querySelectorAll('.leaflet-tooltip.area-label')].map(element=>({element,name:element.textContent,assigned:!!colorFor([...featureById.entries()].find(([,layer])=>layer.getTooltip()?.getElement()===element)?.[0])}));
      candidates.sort((a,b)=>Number(b.assigned)-Number(a.assigned) || a.name.length-b.name.length);
      candidates.forEach(({element})=>{
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
      return `<article class="team-card"><div class="team-card-head"><i class="team-color" style="--team-color:${esc(t.color)}"></i><span class="team-name" title="${esc(t.name)}">${esc(t.name)}</span><span class="team-area-count">${countsByTeam[t.id]||0} bairros</span>${currentProfile?.role==='admin'?`<button class="team-edit" data-edit-team="${esc(t.id)}" title="Editar ${esc(t.name)}" aria-label="Editar equipe">···</button>`:''}</div><div class="team-reps">${reps.length?esc(reps.join(' · ')):'Adicione os colaboradores desta equipe'}</div></article>`;
    }).join(''):'<div class="empty-teams">Adicione uma equipe para começar a distribuir os bairros.</div>';
    $('teamCount').textContent=state.teams.length;
    $('addTeamBtn').hidden=currentProfile?.role!=='admin';
    $('resetBtn').hidden=currentProfile?.role!=='admin';$('exportBtn').hidden=currentProfile?.role!=='admin';
    $('legendItems').innerHTML=state.teams.map(t=>`<div class="legend-team"><i style="background:${esc(t.color)}"></i><span>${esc(t.name)}</span></div>`).join('') || '<div class="legend-team">Cadastre equipes para ver as cores.</div>';
    document.querySelectorAll('[data-edit-team]').forEach(btn=>btn.addEventListener('click',()=>openTeamDialog(btn.dataset.editTeam)));
  }
  function renderAreas() {
    const sorted=[...features].sort((a,b)=>featureName(a).localeCompare(featureName(b),'pt-BR'));
    const visible=sorted.filter(matchesFilter);
    $('areaList').innerHTML=visible.length?visible.map(f=>{
      const id=featureId(f), color=colorFor(id), assignee=assignedLabel(id);
      const reports=actionReports.filter(report=>report.area_id===id).length, selected=selectedAreaIds.has(id);
      return `<button class="area-item ${color?'assigned':''} ${selected?'area-selected':''} ${reports?'has-report':''}" data-area-id="${esc(id)}" style="--area-color:${esc(color||'#d7dfe5')}" title="Abrir ${esc(featureName(f))} no mapa"><i class="area-status"></i><span class="area-name">${esc(featureName(f))}</span>${reports?`<span class="area-report-count">${reports}</span>`:''}${assignee?`<span class="area-assignee">${esc(assignee)}</span>`:''}</button>`;
    }).join(''):'<div class="empty-list">Nenhum bairro encontrado neste filtro.</div>';
    document.querySelectorAll('[data-area-id]').forEach(btn=>btn.addEventListener('click',()=>{
      const f=features.find(x=>featureId(x)===btn.dataset.areaId); if(!f)return;
      const layer=featureById.get(btn.dataset.areaId); if(layer){map.fitBounds(layer.getBounds(),{maxZoom:14}); setTimeout(()=>currentProfile?.role==='admin'?openAssign(f):toggleSelectedArea(f),220);}
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
    $('deleteTeamBtn').onclick=async()=>{
      if(!team)return;
      const count=Object.values(state.assignments).filter(x=>x===team.id).length;
      if(!confirm(`Excluir ${team.name}? ${count?`${count} bairro(s) ficarão sem equipe.`:''}`))return;
      const {error}=await supabaseClient.from('teams').delete().eq('id',team.id);
      if(error){toast(`Não foi possível excluir a equipe: ${error.message}`);return;}
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
  function backendConfigured() {
    const cfg=window.CONFIAUTO_SUPABASE_CONFIG||{};
    return !!(window.supabase?.createClient && /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(cfg.url||'') && cfg.anonKey && !cfg.anonKey.includes('COLE_'));
  }
  function showAuth(message='Entre com o e-mail convidado pelo administrador.') {
    $('loginMessage').textContent=message; $('loginError').textContent='';
    if(!$('loginDialog').open) $('loginDialog').showModal();
  }
  function initials(name='') { return name.trim().split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toUpperCase()||'C'; }
  function avatarMarkup(profile,size='') {
    const url=profile?.avatar_url;
    return url?`<img class="profile-avatar ${size}" src="${esc(url)}" alt="Foto de ${esc(profile.full_name||'usuário')}">`:`<span class="profile-avatar avatar-fallback ${size}">${esc(initials(profile?.full_name))}</span>`;
  }
  async function resolveAvatar(profile) {
    if(!profile?.avatar_path)return profile;
    if(!profileCache.has(profile.avatar_path)) {
      const {data}=await supabaseClient.storage.from('profile-photos').createSignedUrl(profile.avatar_path,3600);
      profileCache.set(profile.avatar_path,data?.signedUrl||'');
    }
    return {...profile,avatar_url:profileCache.get(profile.avatar_path)};
  }
  async function renderAccount() {
    if(!currentUser||!currentProfile){$('authArea').innerHTML='';return;}
    const profile=await resolveAvatar(currentProfile);
    const roleLabel=profile.role==='admin'?'Administrador':profile.role==='consultant'?'Consultor':'Supervisor';
    $('authArea').innerHTML=`<label class="profile-photo-button" title="Alterar foto de perfil">${avatarMarkup(profile)}<input id="profilePhotoInput" type="file" accept="image/png,image/jpeg,image/webp" aria-label="Alterar foto de perfil"></label><div class="profile-caption"><strong>${esc(profile.full_name)}</strong><span>${roleLabel}${profile.role==='admin'?'':` · ${esc(state.teams.find(t=>t.id===profile.team_id)?.name||'Sem equipe')}`}</span></div><button id="changePasswordBtn" class="button button-quiet logout-button" type="button">Senha</button><button id="logoutBtn" class="button button-quiet logout-button" type="button">Sair</button>`;
    $('logoutBtn').addEventListener('click',async()=>{await supabaseClient.auth.signOut();});
    $('changePasswordBtn').addEventListener('click',()=>$('passwordDialog').showModal());
    $('profilePhotoInput').addEventListener('change',uploadProfilePhoto);
  }
  async function loadProfiles() {
    const {data,error}=await supabaseClient.from('profiles').select('user_id,full_name,role,team_id,avatar_path').order('full_name');
    if(error)throw error;
    return Promise.all((data||[]).map(resolveAvatar));
  }
  async function loadTeamsFromBackend() {
    const {data,error}=await supabaseClient.from('teams').select('id,name,color').order('name');
    if(error)throw error;
    if(data?.length){state.teams=data.map(team=>({...team,reps:[]}));save();}
  }
  function renderSupervisorList(profiles) {
    $('supervisorList').innerHTML=profiles.filter(p=>p.role==='supervisor'||p.role==='consultant').map(profile=>{
      const team=state.teams.find(t=>t.id===profile.team_id);
      return `<article class="supervisor-card">${avatarMarkup(profile,'small')}<div><strong>${esc(profile.full_name)}</strong><span>${profile.role==='consultant'?'Consultor':'Supervisor'} · ${esc(team?.name||'Sem equipe')}</span></div></article>`;
    }).join('')||'<div class="empty-list">Nenhum usuário de equipe cadastrado.</div>';
  }
  async function refreshReports() {
    if(!currentProfile||!supabaseClient)return;
    let query=supabaseClient.from('action_reports').select('*').order('action_date',{ascending:false}).order('created_at',{ascending:false}).limit(500);
    if(currentProfile.role!=='admin')query=query.eq('supervisor_id',currentUser.id);
    const date=$('reportDateFilter')?.value;
    if(date)query=query.eq('action_date',date);
    const [{data,error},profiles]=await Promise.all([query,loadProfiles()]);
    if(error){console.error(error);toast('Não foi possível atualizar os relatos.');return;}
    const profileById=new Map(profiles.map(p=>[p.user_id,p]));
    actionReports=(data||[]).map(report=>({...report,profile:profileById.get(report.supervisor_id)}));
    renderReportFeed(); renderAreas(); renderMapReports();
    if(geoLayer)geoLayer.setStyle(layerStyle);
  }
  function renderReportFeed() {
    const feed=$('reportFeed'); if(!feed)return;
    if(!actionReports.length){feed.innerHTML='<div class="empty-list">Nenhuma ação registrada para este período.</div>';return;}
    feed.innerHTML=actionReports.map(report=>{
      const team=state.teams.find(t=>t.id===report.profile?.team_id);
      const names=(report.consultants||[]).join(', ')||'Sem consultores informados';
      return `<button class="report-card" type="button" data-report-id="${esc(report.id)}"><span class="report-card-top"><strong>${esc(report.area_name)}</strong><time>${esc(new Date(`${report.action_date}T12:00:00`).toLocaleDateString('pt-BR'))}</time></span><span class="report-person">${esc(report.profile?.full_name||'Supervisor')} · ${esc(team?.name||'Sem equipe')}</span><span class="report-consultants">${esc(names)}</span>${report.observation?`<span class="report-observation">${esc(report.observation)}</span>`:''}</button>`;
    }).join('');
    feed.querySelectorAll('[data-report-id]').forEach(btn=>btn.addEventListener('click',()=>openReportDetail(actionReports.find(r=>r.id===btn.dataset.reportId))));
  }
  function renderMapReports() {
    if(!map)return;
    if(!reportMarkers)reportMarkers=L.layerGroup().addTo(map);
    reportMarkers.clearLayers();
    const newestByArea=new Map();
    actionReports.forEach(report=>{
      const previous=newestByArea.get(report.area_id);
      if(!previous||`${report.action_date}-${report.created_at}`>`${previous.action_date}-${previous.created_at}`)newestByArea.set(report.area_id,report);
    });
    newestByArea.forEach(report=>{
      const layer=featureById.get(report.area_id);if(!layer)return;
      const date=new Date(`${report.action_date}T12:00:00`).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});
      const person=report.profile?.full_name||'Atividade';
      const marker=L.marker(layer.getBounds().getCenter(),{keyboard:true,icon:L.divIcon({className:'',iconSize:[112,34],iconAnchor:[56,17],html:`<button class="activity-map-chip" type="button" title="${esc(report.area_name)} · ${esc(date)} · ${esc(person)}"><span>${esc(date)}</span><b>${esc(person.split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase())}</b></button>`})});
      marker.on('click',()=>openReportDetail(report));
      marker.addTo(reportMarkers);
    });
  }
  function openReportDetail(report) {
    if(!report)return;
    const team=state.teams.find(t=>t.id===report.profile?.team_id);
    $('reportDetailArea').textContent=report.area_name;
    $('reportDetailBody').innerHTML=`<div class="detail-line"><span>Data da atividade</span><strong>${esc(new Date(`${report.action_date}T12:00:00`).toLocaleDateString('pt-BR'))}</strong></div><div class="detail-line"><span>Registrado por</span><strong>${esc(report.profile?.full_name||'—')}</strong></div><div class="detail-line"><span>Equipe</span><strong>${esc(team?.name||'Sem equipe')}</strong></div>${(report.consultants||[]).length?`<div class="detail-block"><span>Consultores presentes</span><strong>${esc((report.consultants||[]).join(', '))}</strong></div>`:''}<div class="detail-block"><span>${report.profile?.role==='consultant'?'Programação / observação':'Observação'}</span><p>${esc(report.observation||'Sem observação.')}</p></div>`;
    $('reportDetailDialog').showModal();
  }
  function renderRolePanels(profiles=[]) {
    const supervisor=currentProfile?.role==='supervisor';
    const consultant=currentProfile?.role==='consultant';
    $('inviteSupervisorBtn').hidden=currentProfile?.role!=='admin';
    $('supervisorList').previousElementSibling.hidden=currentProfile?.role!=='admin';
    $('supervisorList').hidden=currentProfile?.role!=='admin';
    $('fieldActions').hidden=!(supervisor||consultant);
    $('managerReports').hidden=currentProfile?.role!=='admin';
    if(currentProfile?.role==='admin'){
      $('managerReports').hidden=false;
      $('fieldHelp').textContent='';
      renderSupervisorList(profiles);
    } else if(supervisor) {
      $('fieldHelp').textContent=`Selecione os bairros visitados pela equipe ${state.teams.find(t=>t.id===currentProfile.team_id)?.name||''}.`;
    } else if(consultant) {
      $('fieldHelp').textContent='Escolha seu bairro de atuação, a data e descreva sua programação. O registro aparecerá no mapa para sua equipe.';
      $('toggleReportMode').textContent='Escolher bairro no mapa';
      $('managerReports').hidden=true;
    }
  }
  function updateSelectionCount() {
    $('selectedAreaCount').textContent=`${selectedAreaIds.size} ${selectedAreaIds.size===1?'bairro selecionado':'bairros selecionados'}`;
    renderSelectedAreaInputs();
    if(geoLayer)geoLayer.setStyle(layerStyle);
    renderAreas();
  }
  function renderSelectedAreaInputs() {
    const wrapper=$('selectedAreaInputs');
    if(!wrapper)return;
    wrapper.innerHTML=[...selectedAreaIds].map(id=>{
      const feature=features.find(item=>featureId(item)===id),name=featureName(feature||{}),draft=reportDrafts.get(id)||{consultants:'',observation:''};
      return `<section class="area-report-draft"><strong>${esc(name)}</strong>${currentProfile?.role==='consultant'?'':`<label class="field-label" for="consultants-${esc(id)}">Consultores presentes <span>um por linha</span></label><textarea class="text-field textarea" id="consultants-${esc(id)}" rows="2" placeholder="Nome do consultor">${esc(draft.consultants)}</textarea>`}<label class="field-label" for="observation-${esc(id)}">${currentProfile?.role==='consultant'?'Programação / observação':'Observação para o gerente'}</label><textarea class="text-field textarea" id="observation-${esc(id)}" rows="3" maxlength="1500" placeholder="${currentProfile?.role==='consultant'?'Descreva sua programação, horários e ponto de atendimento':'Ponto de encontro, resultado ou recado'}">${esc(draft.observation)}</textarea></section>`;
    }).join('');
    selectedAreaIds.forEach(id=>{
      const consultants=$(`consultants-${id}`),observation=$(`observation-${id}`);
      const update=()=>reportDrafts.set(id,{consultants:consultants.value,observation:observation.value});
      consultants?.addEventListener('input',update);observation?.addEventListener('input',update);
    });
  }
  function toggleSelectedArea(feature) {
    const id=featureId(feature);
    if(selectedAreaIds.has(id))selectedAreaIds.delete(id);else selectedAreaIds.add(id);
    $('reportEditor').hidden=false;
    updateSelectionCount();
  }
  async function submitActionReport() {
    if(!selectedAreaIds.size){toast('Selecione pelo menos um bairro no mapa.');return;}
    const date=$('actionDate').value;
    if(!date){$('actionDate').focus();toast('Informe a data da ação.');return;}
    for(const id of selectedAreaIds){
      const consultants=$(`consultants-${id}`)?.value.split(/[\n,;]/).map(x=>x.trim()).filter(Boolean)||[];
      const observation=$(`observation-${id}`)?.value.trim()||'';
      if(currentProfile.role==='supervisor'&&!consultants.length){$(`consultants-${id}`)?.focus();toast(`Informe consultores em ${featureName(features.find(f=>featureId(f)===id)||{})}.`);return;}
      if(currentProfile.role==='consultant'&&!observation){$(`observation-${id}`)?.focus();toast('Descreva sua programação para esta atividade.');return;}
      reportDrafts.set(id,{consultants:consultants.join('\n'),observation});
    }
    const rows=[...selectedAreaIds].map(id=>{const draft=reportDrafts.get(id)||{};return {supervisor_id:currentUser.id,area_id:id,area_name:featureName(features.find(f=>featureId(f)===id)||{}),action_date:date,consultants:(draft.consultants||'').split(/[\n,;]/).map(x=>x.trim()).filter(Boolean),observation:(draft.observation||'').trim()};});
    const {error}=await supabaseClient.from('action_reports').upsert(rows,{onConflict:'supervisor_id,area_id,action_date'});
    if(error){console.error(error);toast(`Não foi possível salvar o relato: ${error.message}`);return;}
    const count=selectedAreaIds.size; selectedAreaIds.clear(); rows.forEach(row=>reportDrafts.delete(row.area_id)); $('reportEditor').hidden=true;
    updateSelectionCount(); await refreshReports(); toast(`Ação registrada em ${count} ${count===1?'bairro':'bairros'}.`);
  }
  async function uploadProfilePhoto(event) {
    const file=event.target.files?.[0]; if(!file)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024){toast('Escolha uma foto JPG, PNG ou WebP de até 5 MB.');event.target.value='';return;}
    const extension=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg',path=`${currentUser.id}/avatar-${Date.now()}.${extension}`;
    const {error:uploadError}=await supabaseClient.storage.from('profile-photos').upload(path,file,{upsert:true,contentType:file.type});
    if(uploadError){toast(`Não foi possível enviar a foto: ${uploadError.message}`);return;}
    const {error}=await supabaseClient.from('profiles').update({avatar_path:path,updated_at:new Date().toISOString()}).eq('user_id',currentUser.id);
    if(error){toast('Foto enviada, mas não foi possível atualizar o perfil.');return;}
    currentProfile={...currentProfile,avatar_path:path}; profileCache.delete(path); await renderAccount();
    if(currentProfile.role==='admin')refreshReports();
    toast('Foto de perfil atualizada.');
  }
  async function handleInvite(event) {
    event.preventDefault();
    const role=$('inviteRole').value,body={fullName:$('inviteName').value.trim(),email:$('inviteEmail').value.trim(),role,teamId:role==='admin' ? null : $('inviteTeam').value};
    const {data,error}=await supabaseClient.functions.invoke('invite-user',{body});
    if(error||data?.error){$('inviteForm').setAttribute('data-error',data?.error||error.message);toast(data?.error||'Não foi possível enviar o convite.');return;}
    $('inviteDialog').close();$('inviteForm').reset();$('inviteRole').dispatchEvent(new Event('change'));await refreshReports();toast(`Convite enviado para ${body.email}.`);
  }
  async function handleLogin(event) {
    event.preventDefault(); $('loginError').textContent=''; $('loginSubmit').disabled=true;
    const {error}=await supabaseClient.auth.signInWithPassword({email:$('loginEmail').value.trim(),password:$('loginPassword').value});
    $('loginSubmit').disabled=false;
    if(error)$('loginError').textContent=error.message==='Invalid login credentials'?'E-mail ou senha incorretos.':error.message;
  }
  async function handlePasswordUpdate(event) {
    event.preventDefault();
    const password=$('newPassword').value;
    if(password.length<8){toast('Use uma senha com pelo menos 8 caracteres.');return;}
    const {error}=await supabaseClient.auth.updateUser({password});
    if(error){toast(`Não foi possível atualizar a senha: ${error.message}`);return;}
    $('passwordDialog').close();$('passwordForm').reset();toast('Senha atualizada.');
  }
  async function applySession(session) {
    if(!session){currentUser=null;currentProfile=null;actionReports=[];selectedAreaIds.clear();if(reportsChannel)supabaseClient.removeChannel(reportsChannel);reportMarkers?.clearLayers();if(geoLayer)geoLayer.setStyle(layerStyle);$('authArea').innerHTML='';$('managerReports').hidden=true;$('fieldActions').hidden=true;showAuth();return;}
    currentUser=session.user;
    const {data,error}=await supabaseClient.from('profiles').select('*').eq('user_id',currentUser.id).maybeSingle();
    if(error||!data){toast('Seu acesso ainda não está associado a um perfil. Fale com o administrador.');await supabaseClient.auth.signOut();return;}
    currentProfile=data;
    try{await loadTeamsFromBackend();}catch(teamError){console.error(teamError);toast('Não foi possível carregar as equipes compartilhadas.');}
    await renderAccount();
    renderTeams();
    if(!$('loginDialog').open){} else $('loginDialog').close();
    const profiles=currentProfile.role==='admin'?await loadProfiles():[];
    renderRolePanels(profiles); await refreshReports();
    $('actionDate').value=localDateValue();
    if(reportsChannel)supabaseClient.removeChannel(reportsChannel);
    reportsChannel=supabaseClient.channel('confiauto-action-reports').on('postgres_changes',{event:'*',schema:'public',table:'action_reports'},()=>refreshReports()).subscribe();
  }
  function initAuth() {
    wire();
    if(!backendConfigured()){
      showAuth('A conexão compartilhada ainda precisa ser configurada com o Project URL e a chave anon/public do Supabase.');
      $('loginSubmit').disabled=true;
      return;
    }
    const cfg=window.CONFIAUTO_SUPABASE_CONFIG;
    supabaseClient=window.supabase.createClient(cfg.url,cfg.anonKey);
    $('loginForm').addEventListener('submit',handleLogin);
    $('passwordForm').addEventListener('submit',handlePasswordUpdate);
    $('cancelPassword').addEventListener('click',()=>$('passwordDialog').close());
    $('forgotPasswordBtn').addEventListener('click',async()=>{
      const email=$('loginEmail').value.trim();
      if(!email){$('loginError').textContent='Informe seu e-mail para receber o link de redefinição.';return;}
      const {error}=await supabaseClient.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin+window.location.pathname});
      $('loginError').textContent=error?`Não foi possível enviar o link: ${error.message}`:'Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.';
    });
    $('inviteForm').addEventListener('submit',handleInvite);
    $('inviteSupervisorBtn').addEventListener('click',()=>{
      $('inviteTeam').innerHTML=state.teams.map(team=>`<option value="${esc(team.id)}">${esc(team.name)}</option>`).join('');
      $('inviteDialog').showModal();
    });
    $('inviteRole').addEventListener('change',()=>{
      const needsTeam=$('inviteRole').value!=='admin';$('inviteTeamWrap').hidden=!needsTeam;$('inviteTeam').required=needsTeam;
    });
    $('cancelInvite').addEventListener('click',()=>$('inviteDialog').close());
    $('saveActionReport').addEventListener('click',submitActionReport);
    $('toggleReportMode').addEventListener('click',()=>{$('reportEditor').hidden=false;$('searchInput').focus();toast('Toque nos bairros do mapa para selecionar a área da ação.');});
    $('clearSelection').addEventListener('click',()=>{selectedAreaIds.clear();updateSelectionCount();});
    $('reportDateFilter').addEventListener('change',refreshReports);
    $('clearReportFilter').addEventListener('click',()=>{$('reportDateFilter').value='';refreshReports();});
    supabaseClient.auth.onAuthStateChange((event,session)=>{if(event!=='INITIAL_SESSION')queueMicrotask(()=>applySession(session));});
    supabaseClient.auth.getSession().then(({data})=>applySession(data.session));
  }
  function wire() {
    $('addTeamBtn').addEventListener('click',()=>openTeamDialog());
    $('teamForm').addEventListener('submit',async e=>{
      e.preventDefault();const name=$('teamNameInput').value.trim();if(!name){$('teamNameInput').focus();return;}
      const id=$('teamIdInput').value || `team-${Date.now()}`, reps=$('teamRepInput').value.split('\n').map(x=>x.trim()).filter(Boolean);
      const existing=state.teams.find(t=>t.id===id),next={id,name,color:selectedColor,reps};
      const {error}=await supabaseClient.from('teams').upsert({id,name,color:selectedColor});
      if(error){toast(`Não foi possível salvar a equipe: ${error.message}`);return;}
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
  initMap(); renderTeams(); renderStats(); loadNeighborhoods(); initAuth();
})();
