'use client';
/* eslint-disable @next/next/no-img-element -- vinext client rendering is incompatible with next/image here. */

import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { changeTitles, copy, fieldMeanings, moduleNames, type Locale } from './i18n';

type Field = { id:string; code:string; tableName:string; columnName:string; dataType:string; businessMeaning:string; firstVersion:string; currentVersion:string; moduleSlug:string; moduleName:string; moduleKind:'core'|'feature'; projectCodes:string|null };
type Module = { id:string; slug:string; name:string; kind:'core'|'feature'; version:string; description:string; fieldCount:number; projectCount:number };
type Project = { id:string; code:string; name:string; coreVersion:string; status:'current'|'upgrade'; manifest:string|null };
type Change = { id:string; changeCode:string; migrationVersion:string; title:string; fromValue:string; toValue:string; status:string; risk:string; createdAt:string; fieldCode:string; fieldPath:string; moduleName:string; projectCodes:string|null };
type RegistryData = { fields:Field[]; modules:Module[]; projects:Project[]; changes:Change[] };
type View = 'overview'|'registry'|'changes'|'projects';

const emptyData: RegistryData = { fields:[], modules:[], projects:[], changes:[] };
const split = (value:string|null, separator=',') => value ? value.split(separator).filter(Boolean) : [];

function FieldTable({ fields, locale, onSelect }:{ fields:Field[]; locale:Locale; onSelect:(field:Field)=>void }) {
  const t = copy[locale];
  return <div className="table-wrap">
    <table>
      <thead><tr><th>{t.object}</th><th>{t.type}</th><th>{t.source}</th><th>{t.projectsColumn}</th></tr></thead>
      <tbody>{fields.map((item) => <tr key={item.code} onClick={() => onSelect(item)} tabIndex={0} onKeyDown={(event) => event.key === 'Enter' && onSelect(item)}>
        <td><span className="field-code">{item.code}</span><strong>{item.tableName}.{item.columnName}</strong><small className="field-meaning">{fieldMeanings[locale][item.code] ?? item.businessMeaning}</small></td>
        <td><code>{item.dataType}</code></td>
        <td><span className={item.moduleKind === 'core' ? 'source core' : 'source'}>{moduleNames[locale][item.moduleSlug] ?? item.moduleName}</span></td>
        <td><div className="project-stack">{split(item.projectCodes).map((project) => <span key={project}>{project}</span>)}</div></td>
      </tr>)}</tbody>
    </table>
    {fields.length === 0 && <p className="empty-state">{t.noMatches}</p>}
  </div>;
}

export default function Home() {
  const [data, setData] = useState<RegistryData>(emptyData);
  const [locale, setLocale] = useState<Locale>('zh');
  const [view, setView] = useState<View>('overview');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all'|'core'|'feature'>('all');
  const [selectedCode, setSelectedCode] = useState('CUS-003');
  const [modal, setModal] = useState<'field'|'change'|null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const t = copy[locale];

  const load = async () => {
    const response = await fetch('/api/registry');
    if (!response.ok) throw new Error('registry_unavailable');
    setData(await response.json() as RegistryData);
  };

  useEffect(() => {
    const saved = window.localStorage.getItem('drifty-locale');
    const next: Locale = saved === 'en' || saved === 'zh' ? saved : navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
    const timer = window.setTimeout(() => {
      setLocale(next);
      document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en';
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/registry').then((response) => {
      if (!response.ok) throw new Error('registry_unavailable');
      return response.json() as Promise<RegistryData>;
    }).then((payload) => { if (active) setData(payload); })
      .catch(() => { if (active) setNotice('fetch'); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const onKey = (event:KeyboardEvent) => {
      if (event.key === '/' && document.activeElement?.tagName !== 'INPUT') { event.preventDefault(); document.getElementById('registry-search')?.focus(); }
      if (event.key === 'Escape') { setModal(null); setNotice(''); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const fields = useMemo(() => data.fields.filter((field) => {
    const translated = `${fieldMeanings[locale][field.code] ?? ''} ${moduleNames[locale][field.moduleSlug] ?? ''}`;
    const text = `${field.code} ${field.tableName}.${field.columnName} ${field.businessMeaning} ${field.moduleName} ${translated}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (filter === 'all' || field.moduleKind === filter);
  }), [data.fields, filter, locale, query]);

  const selected = data.fields.find((field) => field.code === selectedCode) ?? fields[0];
  const selectedChange = data.changes.find((change) => change.fieldCode === selected?.code) ?? data.changes[0];
  const navigate = (next:View) => { setView(next); setNotice(''); if (next !== 'registry') setFilter('all'); };
  const selectField = (field:Field) => { setSelectedCode(field.code); if (view === 'registry') setNotice('selected'); };
  const toggleLocale = () => {
    const next:Locale = locale === 'zh' ? 'en' : 'zh';
    setLocale(next); window.localStorage.setItem('drifty-locale', next); document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en';
  };

  const submit = async (event:FormEvent<HTMLFormElement>, action:'field'|'change') => {
    event.preventDefault();
    setBusy(true);
    setNotice('');
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const response = await fetch('/api/registry', { method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ action, [action]:values }) });
      const result = await response.json() as { error?:string };
      if (!response.ok) { setNotice(result.error ?? t.saveError); return; }
      await load();
      setModal(null);
      setNotice(action === 'field' ? t.fieldAdded : t.changeAdded);
    } catch {
      setNotice(t.saveError);
    } finally {
      setBusy(false);
    }
  };

  const navItems = [
    ['overview','⌘',t.overview,null], ['registry','▦',t.registry,data.fields.length],
    ['changes','↗',t.changes,data.changes.length], ['projects','◇',t.projects,data.projects.length],
  ] as const;

  return <main className="app-shell">
    <header className="topbar">
      <button className="brand-mark" aria-label={t.overview} onClick={() => navigate('overview')}>D</button>
      <div className="brand-copy"><strong>Drifty</strong><span>{t.subtitle}</span></div>
      <label className="search"><span aria-hidden="true">⌕</span><input id="registry-search" aria-label={t.search} placeholder={t.search} value={query} onChange={(event) => setQuery(event.target.value)} /><kbd>/</kbd></label>
      <button className="quiet-button top-docs" type="button" onClick={() => navigate('projects')}>{t.manifests}</button>
      <button className="locale-button" type="button" aria-label={t.languageLabel} onClick={toggleLocale}>{t.language}</button>
      <span className="sync-badge"><i />{t.cloudSync}</span>
      <button className="primary-button" type="button" onClick={() => setModal('change')}>{t.newChange}</button>
    </header>

    <div className="workspace">
      <aside className="sidebar" aria-label={t.workspace}>
        <nav><p className="nav-label">{t.workspace}</p>{navItems.map(([key,icon,label,count]) => <button key={key} className={`nav-item ${view===key?'active':''}`} onClick={() => navigate(key)}><span>{icon}</span>{label}{count !== null && <b>{count}</b>}</button>)}</nav>
        <div className="sidebar-note"><span className="status-dot" /><div><strong>{t.healthy}</strong><small>{t.d1}</small></div></div>
      </aside>

      <section className="content">
        {notice && <div className="notice" role="status">{notice === 'fetch' ? t.fetchError : notice === 'selected' ? `${t.selectHint} ${selectedCode} · ${split(selected?.projectCodes ?? null).length} ${t.affected}` : notice}<button aria-label={t.dismiss} onClick={() => setNotice('')}>×</button></div>}

        {view === 'overview' && <>
          <section className="brand-hero">
            <img src="/drifty-hero.png" alt={t.heroAlt} />
            <div className="brand-hero-shade" />
            <div className="brand-hero-copy"><p className="eyebrow">{t.heroEyebrow}</p><h1>{t.heroTitle}</h1><p>{t.heroCopy}</p><div><button className="hero-primary" onClick={() => navigate('registry')}>{t.browseRegistry}</button><button className="hero-secondary" onClick={() => navigate('projects')}>{t.viewManifests}</button></div></div>
          </section>

          <div className="metric-grid" aria-label={t.overview}>
            <article><span>{t.fields}</span><strong>{data.fields.length}</strong><small>{t.fieldsHelp}</small></article>
            <article><span>{t.modules}</span><strong>{data.modules.length}</strong><small>{data.modules.filter((item)=>item.kind==='core').length} {t.core} · {data.modules.filter((item)=>item.kind==='feature').length} {t.features}</small></article>
            <article><span>{t.projectsMetric}</span><strong>{data.projects.length}</strong><small>{data.projects.filter((item)=>item.status==='upgrade').length} {t.needUpgrade}</small></article>
            <article><span>{t.openChanges}</span><strong>{data.changes.filter((item)=>item.status!=='approved').length}</strong><small><i className="warn">{data.changes.filter((item)=>item.status==='review').length}</i> {t.awaitingReview}</small></article>
          </div>

          <div className="main-grid">
            <section className="panel registry-panel"><div className="panel-header"><div><h2>{t.registryTitle}</h2><p>{t.customer} · {data.fields.length} {t.fields.toLowerCase()}</p></div><button className="icon-button" aria-label={t.registry} onClick={() => navigate('registry')}>•••</button></div><FieldTable fields={fields.slice(0,5)} locale={locale} onSelect={selectField}/><button className="panel-footer" onClick={() => navigate('registry')}>{t.viewAllFields}<span>→</span></button></section>
            <aside className="right-column"><ImpactCard field={selected} change={selectedChange} locale={locale} onOpen={() => navigate('changes')} /><RecentChanges changes={data.changes.slice(0,2)} locale={locale} onOpen={() => navigate('changes')} /></aside>
          </div>
        </>}

        {view === 'registry' && <>
          <PageHeading eyebrow={t.registryEyebrow} title={t.registryHeading} copy={t.registryCopy}><button className="primary-button" onClick={() => setModal('field')}>{t.addField}</button></PageHeading>
          <section className="panel"><div className="panel-header"><div><h2>{t.allFields}</h2><p>{fields.length} / {data.fields.length} {t.records}</p></div></div><div className="filter-row">{(['all','core','feature'] as const).map((item) => <button key={item} className={`filter ${filter===item?'active':''}`} onClick={() => setFilter(item)}>{item === 'all' ? t.all : item === 'core' ? t.core : t.features}</button>)}</div><FieldTable fields={fields} locale={locale} onSelect={selectField}/></section>
        </>}

        {view === 'changes' && <>
          <PageHeading eyebrow={t.changesEyebrow} title={t.changesHeading} copy={t.changesCopy}><button className="primary-button" onClick={() => setModal('change')}>{t.newChange}</button></PageHeading>
          <div className="change-list">{data.changes.map((change) => <article className="panel change-row" key={change.changeCode}><div><span className={`risk-pill ${change.risk}`}>{riskLabel(locale, change.risk)}</span><strong>{change.changeCode}</strong><p>{changeTitles[locale][change.changeCode] ?? change.title}</p></div><div className="change-object"><code>{change.fieldPath}</code><small>{moduleNames[locale][data.fields.find((item)=>item.code===change.fieldCode)?.moduleSlug ?? ''] ?? change.moduleName} · {change.migrationVersion}</small></div><div className="mini-diff"><code>{change.fromValue}</code><span>→</span><code>{change.toValue}</code></div><div className="project-stack">{split(change.projectCodes).map((code) => <span key={code}>{code}</span>)}</div></article>)}</div>
        </>}

        {view === 'projects' && <>
          <PageHeading eyebrow={t.projectsEyebrow} title={t.projectsHeading} copy={t.projectsCopy} />
          <div className="project-grid">{data.projects.map((project) => <article className="panel project-card" key={project.code}><div className="project-title"><span>{project.code}</span><div><h2>{locale === 'zh' ? `项目 ${project.code}` : project.name}</h2><p>Core {project.coreVersion}</p></div><i className={project.status}>{project.status === 'current' ? t.current : t.upgrade}</i></div><div className="manifest-list">{split(project.manifest,'|').map((item) => { const [name,version] = item.split('@'); const capabilityModule = data.modules.find((entry)=>entry.name===name); return <div key={item}><span>{capabilityModule ? moduleNames[locale][capabilityModule.slug] ?? name : name}</span><code>{version}</code></div>; })}</div></article>)}</div>
          <section className="panel module-table"><div className="panel-header"><div><h2>{t.capabilityModules}</h2><p>{t.ownership}</p></div></div><table><thead><tr><th>{t.module}</th><th>{t.kind}</th><th>{t.version}</th><th>{t.fieldsColumn}</th><th>{t.projectsColumn}</th></tr></thead><tbody>{data.modules.map((module) => <tr key={module.slug}><td><strong>{moduleNames[locale][module.slug] ?? module.name}</strong><span className="field-code">{module.slug}</span></td><td><span className={module.kind==='core'?'source core':'source'}>{module.kind==='core'?t.core:t.features}</span></td><td><code>{module.version}</code></td><td>{module.fieldCount}</td><td>{module.projectCount}</td></tr>)}</tbody></table></section>
        </>}

      </section>
    </div>

    {modal === 'field' && <Modal title={t.addFieldTitle} copy={t.addFieldCopy} closeLabel={t.close} onClose={() => setModal(null)}><form onSubmit={(event) => submit(event,'field')}><FormRow label={t.fieldCode}><input name="code" placeholder="CUS-006" required /></FormRow><div className="form-pair"><FormRow label={t.table}><input name="tableName" placeholder="customer" required /></FormRow><FormRow label={t.column}><input name="columnName" placeholder="segment" required /></FormRow></div><FormRow label={t.dataType}><input name="dataType" placeholder="varchar(40)" required /></FormRow><FormRow label={t.businessMeaning}><input name="businessMeaning" placeholder={locale === 'zh' ? '客户市场分组' : 'Customer market segment'} required /></FormRow><div className="form-pair"><FormRow label={t.ownerModule}><select name="moduleSlug" required>{data.modules.map((module) => <option key={module.slug} value={module.slug}>{moduleNames[locale][module.slug] ?? module.name}</option>)}</select></FormRow><FormRow label={t.firstVersion}><input name="version" defaultValue="1.0.0" required /></FormRow></div><FormActions busy={busy} cancel={t.cancel} saving={t.saving} save={t.saveRecord} onCancel={() => setModal(null)} /></form></Modal>}

    {modal === 'change' && <Modal title={t.registerChangeTitle} copy={t.registerChangeCopy} closeLabel={t.close} onClose={() => setModal(null)}><form onSubmit={(event) => submit(event,'change')}><div className="form-pair"><FormRow label={t.changeCode}><input name="changeCode" placeholder="CR-2026-0183" required /></FormRow><FormRow label={t.migration}><input name="migrationVersion" placeholder="V003" required /></FormRow></div><FormRow label={t.schemaField}><select name="fieldCode" defaultValue={selected?.code}>{data.fields.map((field) => <option key={field.code} value={field.code}>{field.code} · {field.tableName}.{field.columnName}</option>)}</select></FormRow><FormRow label={t.summary}><input name="title" placeholder={locale === 'zh' ? '扩展客户等级字段长度' : 'Increase customer level length'} required /></FormRow><div className="form-pair"><FormRow label={t.from}><input name="fromValue" placeholder="varchar(20)" required /></FormRow><FormRow label={t.to}><input name="toValue" placeholder="varchar(50)" required /></FormRow></div><FormRow label={t.risk}><select name="risk" defaultValue="medium"><option value="low">{t.low}</option><option value="medium">{t.medium}</option><option value="high">{t.high}</option></select></FormRow><FormActions busy={busy} cancel={t.cancel} saving={t.saving} save={t.saveRecord} onCancel={() => setModal(null)} /></form></Modal>}
  </main>;
}

function PageHeading({ eyebrow,title,copy:description,children }:{eyebrow:string;title:string;copy:string;children?:React.ReactNode}) { return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{children && <div className="heading-actions">{children}</div>}</div>; }
function ImpactCard({ field,change,locale,onOpen }:{field?:Field;change?:Change;locale:Locale;onOpen:()=>void}) { const t=copy[locale]; if(!field)return <section className="panel impact-card empty-state">{t.noMatches}</section>; const projects=split(field.projectCodes); return <section className="panel impact-card"><div className="panel-header"><div><p className="eyebrow">{t.impactPreview}</p><h2>{field.code}</h2></div><span className="risk-pill">{riskLabel(locale,change?.risk??'low')}</span></div><p className="object-name">{field.tableName}.{field.columnName}</p><div className="diff"><code>- {change?.fromValue??field.dataType}</code><code>+ {change?.toValue??field.dataType}</code></div><dl><div><dt>{t.module}</dt><dd>{moduleNames[locale][field.moduleSlug]??field.moduleName}</dd></div><div><dt>{t.version}</dt><dd>{field.currentVersion}</dd></div></dl><p className="small-label">{t.affectedProjects}</p><div className="affected">{projects.map((project)=><span key={project}>{project}<small>{t.included}</small></span>)}</div><button className="wide-button" onClick={onOpen}>{t.openImpact}<span>→</span></button></section>; }
function RecentChanges({ changes,locale,onOpen }:{changes:Change[];locale:Locale;onOpen:()=>void}) { const t=copy[locale]; return <section className="panel activity-card"><div className="panel-header"><h2>{t.recentChanges}</h2><button className="link-button" onClick={onOpen}>{t.viewAll}</button></div><ol>{changes.map((change)=><li key={change.changeCode}><span className="activity-icon">↗</span><div><strong>{change.changeCode}</strong><p>{changeTitles[locale][change.changeCode]??change.title}</p><small>{split(change.projectCodes).length} {t.projectsColumn.toLowerCase()} · {statusLabel(locale,change.status)}</small></div></li>)}</ol></section>; }
function Modal({title,copy:description,closeLabel,onClose,children}:{title:string;copy:string;closeLabel:string;onClose:()=>void;children:React.ReactNode}) { return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target===event.currentTarget&&onClose()}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-header"><div><h2 id="modal-title">{title}</h2><p>{description}</p></div><button type="button" aria-label={closeLabel} onClick={onClose}>×</button></div>{children}</section></div>; }
function FormRow({label,children}:{label:string;children:React.ReactNode}) { return <label className="form-row"><span>{label}</span>{children}</label>; }
function FormActions({busy,cancel,saving,save,onCancel}:{busy:boolean;cancel:string;saving:string;save:string;onCancel:()=>void}) { return <div className="form-actions"><button type="button" className="quiet-button" onClick={onCancel}>{cancel}</button><button className="primary-button" disabled={busy}>{busy?saving:save}</button></div>; }
function riskLabel(locale:Locale,value:string){const t=copy[locale];return value==='high'?t.high:value==='low'?t.low:t.medium;}
function statusLabel(locale:Locale,value:string){const t=copy[locale];return value==='approved'?t.approved:value==='review'?t.review:t.draft;}
