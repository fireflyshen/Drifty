'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

type Field = { id:string; code:string; tableName:string; columnName:string; dataType:string; businessMeaning:string; firstVersion:string; currentVersion:string; moduleSlug:string; moduleName:string; moduleKind:'core'|'feature'; projectCodes:string|null };
type Module = { id:string; slug:string; name:string; kind:'core'|'feature'; version:string; description:string; fieldCount:number; projectCount:number };
type Project = { id:string; code:string; name:string; coreVersion:string; status:'current'|'upgrade'; manifest:string|null };
type Change = { id:string; changeCode:string; migrationVersion:string; title:string; fromValue:string; toValue:string; status:string; risk:string; createdAt:string; fieldCode:string; fieldPath:string; moduleName:string; projectCodes:string|null };
type RegistryData = { fields:Field[]; modules:Module[]; projects:Project[]; changes:Change[] };
type View = 'overview'|'registry'|'changes'|'projects';

const emptyData: RegistryData = { fields:[], modules:[], projects:[], changes:[] };
const split = (value:string|null, separator=',') => value ? value.split(separator).filter(Boolean) : [];

function FieldTable({ fields, onSelect }:{ fields:Field[]; onSelect:(field:Field)=>void }) {
  return <div className="table-wrap"><table><thead><tr><th>Object</th><th>Type</th><th>Source</th><th>Projects</th></tr></thead><tbody>{fields.map((item) => <tr key={item.code} onClick={() => onSelect(item)} tabIndex={0} onKeyDown={(event) => event.key === 'Enter' && onSelect(item)}><td><span className="field-code">{item.code}</span><strong>{item.tableName}.{item.columnName}</strong></td><td><code>{item.dataType}</code></td><td><span className={item.moduleKind === 'core' ? 'source core' : 'source'}>{item.moduleName}</span></td><td><div className="project-stack">{split(item.projectCodes).map((project) => <span key={project}>{project}</span>)}</div></td></tr>)}</tbody></table>{fields.length === 0 && <p className="empty-state">No fields match this view.</p>}</div>;
}

export default function Home() {
  const [data, setData] = useState<RegistryData>(emptyData);
  const [view, setView] = useState<View>('overview');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all'|'core'|'feature'>('all');
  const [selectedCode, setSelectedCode] = useState('CUS-003');
  const [modal, setModal] = useState<'field'|'change'|null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const response = await fetch('/api/registry');
    if (!response.ok) throw new Error('Could not load the registry.');
    setData(await response.json() as RegistryData);
  };

  useEffect(() => {
    let active = true;
    fetch('/api/registry').then((response) => {
      if (!response.ok) throw new Error('Could not load the registry.');
      return response.json() as Promise<RegistryData>;
    }).then((payload) => { if (active) setData(payload); })
      .catch(() => { if (active) setNotice('D1 is temporarily unavailable.'); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const onKey = (event:KeyboardEvent) => {
      if (event.key === '/' && document.activeElement?.tagName !== 'INPUT') { event.preventDefault(); document.getElementById('registry-search')?.focus(); }
      if (event.key === 'Escape') setModal(null);
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, []);

  const fields = useMemo(() => data.fields.filter((field) => {
    const text = `${field.code} ${field.tableName}.${field.columnName} ${field.businessMeaning} ${field.moduleName}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (filter === 'all' || field.moduleKind === filter);
  }), [data.fields, query, filter]);
  const selected = data.fields.find((field) => field.code === selectedCode) ?? fields[0];
  const selectedChange = data.changes.find((change) => change.fieldCode === selected?.code) ?? data.changes[0];

  const navigate = (next:View) => { setView(next); if (next !== 'registry') setFilter('all'); };
  const selectField = (field:Field) => { setSelectedCode(field.code); if (view === 'registry') setNotice(`${field.code} selected · ${split(field.projectCodes).length} affected projects`); };

  const submit = async (event:FormEvent<HTMLFormElement>, action:'field'|'change') => {
    event.preventDefault(); setBusy(true); setNotice('');
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    const response = await fetch('/api/registry', { method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ action, [action]:values }) });
    const result = await response.json() as { error?:string };
    if (!response.ok) { setNotice(result.error ?? 'Could not save this record.'); setBusy(false); return; }
    await load(); setModal(null); setBusy(false); setNotice(action === 'field' ? 'Field added to the registry.' : 'Change registered as a draft.');
  };

  return <main className="app-shell">
    <header className="topbar">
      <button className="brand-mark" aria-label="Open overview" onClick={() => navigate('overview')}>D</button>
      <div className="brand-copy"><strong>Drifty</strong><span>Schema registry</span></div>
      <label className="search"><span aria-hidden="true">⌕</span><input id="registry-search" aria-label="Search schemas" placeholder="Search schemas, fields, projects…" value={query} onChange={(e) => setQuery(e.target.value)} /><kbd>/</kbd></label>
      <button className="quiet-button top-docs" type="button" onClick={() => navigate('projects')}>Manifests</button>
      <button className="primary-button" type="button" onClick={() => setModal('change')}>New change</button>
    </header>

    <div className="workspace">
      <aside className="sidebar" aria-label="Primary navigation"><nav><p className="nav-label">Workspace</p>
        {([['overview','⌘','Overview',null],['registry','▦','Schema registry',data.fields.length],['changes','↗','Changes',data.changes.length],['projects','◇','Projects',data.projects.length]] as const).map(([key,icon,label,count]) => <button key={key} className={`nav-item ${view===key?'active':''}`} onClick={() => navigate(key)}><span>{icon}</span>{label}{count !== null && <b>{count}</b>}</button>)}
      </nav><div className="sidebar-note"><span className="status-dot" /><div><strong>Registry healthy</strong><small>Cloudflare D1</small></div></div></aside>

      <section className="content">
        {notice && <div className="notice" role="status">{notice}<button aria-label="Dismiss" onClick={() => setNotice('')}>×</button></div>}

        {view === 'overview' && <>
          <PageHeading eyebrow="DATABASE PRODUCT LINE" title="Schema overview" copy="One source of truth for reusable database capabilities and project differences."><button className="quiet-button" onClick={() => navigate('projects')}>View manifests</button><button className="primary-button" onClick={() => setModal('field')}>Add field</button></PageHeading>
          <div className="metric-grid" aria-label="Registry summary">
            <article><span>Fields</span><strong>{data.fields.length}</strong><small>Registered schema objects</small></article><article><span>Modules</span><strong>{data.modules.length}</strong><small>{data.modules.filter(m=>m.kind==='core').length} core · {data.modules.filter(m=>m.kind==='feature').length} features</small></article><article><span>Projects</span><strong>{data.projects.length}</strong><small>{data.projects.filter(p=>p.status==='upgrade').length} need updates</small></article><article><span>Open changes</span><strong>{data.changes.filter(c=>c.status!=='approved').length}</strong><small><i className="warn">{data.changes.filter(c=>c.status==='review').length}</i> awaiting review</small></article>
          </div>
          <div className="main-grid"><section className="panel registry-panel"><div className="panel-header"><div><h2>Schema registry</h2><p>Customer · {data.fields.length} fields</p></div><button className="icon-button" aria-label="Open registry" onClick={() => navigate('registry')}>•••</button></div><FieldTable fields={fields.slice(0,5)} onSelect={selectField}/><button className="panel-footer" onClick={() => navigate('registry')}>View all fields <span>→</span></button></section>
            <aside className="right-column"><ImpactCard field={selected} change={selectedChange} onOpen={() => navigate('changes')} /><RecentChanges changes={data.changes.slice(0,2)} onOpen={() => navigate('changes')} /></aside></div>
        </>}

        {view === 'registry' && <>
          <PageHeading eyebrow="SCHEMA REGISTRY" title="Database objects" copy="Every logical field has one identity, owner module and project impact map."><button className="primary-button" onClick={() => setModal('field')}>Add field</button></PageHeading>
          <section className="panel"><div className="panel-header"><div><h2>All fields</h2><p>{fields.length} of {data.fields.length} records</p></div></div><div className="filter-row">{(['all','core','feature'] as const).map((item)=><button key={item} className={`filter ${filter===item?'active':''}`} onClick={()=>setFilter(item)}>{item === 'all' ? 'All fields' : item === 'core' ? 'Core' : 'Features'}</button>)}</div><FieldTable fields={fields} onSelect={selectField}/></section>
        </>}

        {view === 'changes' && <>
          <PageHeading eyebrow="MIGRATION REGISTRY" title="Changes" copy="Register intent, migration identity and exact project impact before release."><button className="primary-button" onClick={() => setModal('change')}>New change</button></PageHeading>
          <div className="change-list">{data.changes.map((change)=><article className="panel change-row" key={change.changeCode}><div><span className={`risk-pill ${change.risk}`}>{change.risk}</span><strong>{change.changeCode}</strong><p>{change.title}</p></div><div className="change-object"><code>{change.fieldPath}</code><small>{change.moduleName} · {change.migrationVersion}</small></div><div className="mini-diff"><code>{change.fromValue}</code><span>→</span><code>{change.toValue}</code></div><div className="project-stack">{split(change.projectCodes).map(code=><span key={code}>{code}</span>)}</div></article>)}</div>
        </>}

        {view === 'projects' && <>
          <PageHeading eyebrow="PROJECT COMPOSITION" title="Project manifests" copy="Projects are compositions of Core and reusable Features—not long-lived Git branches." />
          <div className="project-grid">{data.projects.map((project)=><article className="panel project-card" key={project.code}><div className="project-title"><span>{project.code}</span><div><h2>{project.name}</h2><p>Core {project.coreVersion}</p></div><i className={project.status}>{project.status === 'current' ? 'Current' : 'Upgrade'}</i></div><div className="manifest-list">{split(project.manifest,'|').map((item)=>{const [name,version]=item.split('@');return <div key={item}><span>{name}</span><code>{version}</code></div>})}</div></article>)}</div>
          <section className="panel module-table"><div className="panel-header"><div><h2>Capability modules</h2><p>Shared ownership boundaries</p></div></div><table><thead><tr><th>Module</th><th>Kind</th><th>Version</th><th>Fields</th><th>Projects</th></tr></thead><tbody>{data.modules.map(module=><tr key={module.slug}><td><strong>{module.name}</strong><span className="field-code">{module.slug}</span></td><td><span className={module.kind==='core'?'source core':'source'}>{module.kind}</span></td><td><code>{module.version}</code></td><td>{module.fieldCount}</td><td>{module.projectCount}</td></tr>)}</tbody></table></section>
        </>}
      </section>
    </div>

    {modal === 'field' && <Modal title="Add registry field" copy="Create one logical field identity and assign its owning module." onClose={() => setModal(null)}><form onSubmit={(e)=>submit(e,'field')}><FormRow label="Field code"><input name="code" placeholder="CUS-006" required /></FormRow><div className="form-pair"><FormRow label="Table"><input name="tableName" placeholder="customer" required /></FormRow><FormRow label="Column"><input name="columnName" placeholder="segment" required /></FormRow></div><FormRow label="Data type"><input name="dataType" placeholder="varchar(40)" required /></FormRow><FormRow label="Business meaning"><input name="businessMeaning" placeholder="Customer market segment" required /></FormRow><div className="form-pair"><FormRow label="Owning module"><select name="moduleSlug" required>{data.modules.map(m=><option key={m.slug} value={m.slug}>{m.name}</option>)}</select></FormRow><FormRow label="First version"><input name="version" defaultValue="1.0.0" required /></FormRow></div><FormActions busy={busy} onCancel={()=>setModal(null)} /></form></Modal>}

    {modal === 'change' && <Modal title="Register schema change" copy="Record migration intent. Drifty does not execute SQL in this phase." onClose={() => setModal(null)}><form onSubmit={(e)=>submit(e,'change')}><div className="form-pair"><FormRow label="Change code"><input name="changeCode" placeholder="CR-2026-0183" required /></FormRow><FormRow label="Migration"><input name="migrationVersion" placeholder="V003" required /></FormRow></div><FormRow label="Schema field"><select name="fieldCode" defaultValue={selected?.code}>{data.fields.map(f=><option key={f.code} value={f.code}>{f.code} · {f.tableName}.{f.columnName}</option>)}</select></FormRow><FormRow label="Summary"><input name="title" placeholder="Increase customer level length" required /></FormRow><div className="form-pair"><FormRow label="From"><input name="fromValue" placeholder="varchar(20)" required /></FormRow><FormRow label="To"><input name="toValue" placeholder="varchar(50)" required /></FormRow></div><FormRow label="Risk"><select name="risk" defaultValue="medium"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></FormRow><FormActions busy={busy} onCancel={()=>setModal(null)} /></form></Modal>}
  </main>;
}

function PageHeading({ eyebrow,title,copy,children }:{eyebrow:string;title:string;copy:string;children?:React.ReactNode}) { return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{copy}</p></div>{children && <div className="heading-actions">{children}</div>}</div>; }
function ImpactCard({ field,change,onOpen }:{field?:Field;change?:Change;onOpen:()=>void}) { if(!field)return <section className="panel impact-card empty-state">Select a field to preview impact.</section>; const projects=split(field.projectCodes); return <section className="panel impact-card"><div className="panel-header"><div><p className="eyebrow">IMPACT PREVIEW</p><h2>{field.code}</h2></div><span className="risk-pill">{change?.risk ?? 'low'}</span></div><p className="object-name">{field.tableName}.{field.columnName}</p><div className="diff"><code>- {change?.fromValue ?? field.dataType}</code><code>+ {change?.toValue ?? field.dataType}</code></div><dl><div><dt>Module</dt><dd>{field.moduleName}</dd></div><div><dt>Version</dt><dd>{field.currentVersion}</dd></div></dl><p className="small-label">Affected projects</p><div className="affected">{projects.map(p=><span key={p}>{p}<small>included</small></span>)}</div><button className="wide-button" onClick={onOpen}>Open impact analysis <span>→</span></button></section>; }
function RecentChanges({ changes,onOpen }:{changes:Change[];onOpen:()=>void}) { return <section className="panel activity-card"><div className="panel-header"><h2>Recent changes</h2><button className="link-button" onClick={onOpen}>View all</button></div><ol>{changes.map(change=><li key={change.changeCode}><span className="activity-icon">↗</span><div><strong>{change.changeCode}</strong><p>{change.title}</p><small>{split(change.projectCodes).length} projects · {change.status}</small></div></li>)}</ol></section>; }
function Modal({title,copy,onClose,children}:{title:string;copy:string;onClose:()=>void;children:React.ReactNode}) { return <div className="modal-backdrop" role="presentation" onMouseDown={(e)=>e.target===e.currentTarget&&onClose()}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-header"><div><h2 id="modal-title">{title}</h2><p>{copy}</p></div><button aria-label="Close" onClick={onClose}>×</button></div>{children}</section></div>; }
function FormRow({label,children}:{label:string;children:React.ReactNode}) { return <label className="form-row"><span>{label}</span>{children}</label>; }
function FormActions({busy,onCancel}:{busy:boolean;onCancel:()=>void}) { return <div className="form-actions"><button type="button" className="quiet-button" onClick={onCancel}>Cancel</button><button className="primary-button" disabled={busy}>{busy?'Saving…':'Save record'}</button></div>; }
