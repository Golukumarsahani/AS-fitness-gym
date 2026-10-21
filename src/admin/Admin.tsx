import { useEffect,useState } from 'react'; import { useLang,LANGS,adminKeys } from '../lib/i18n'; import Logo from '../components/Logo'; import MembersManager from './MembersManager'; import { Link,Navigate,Route,Routes,useNavigate } from 'react-router-dom'; import { supabase,requireSupabase } from '../lib/supabase'; import { LayoutDashboard,Users,WalletCards,MessageSquare,Clock,Images,UserRound,Settings,LogOut,Globe,ChartNoAxesCombined,ClipboardList,LoaderCircle,Plus,Save,Trash2,Search,ShieldCheck } from 'lucide-react';
const nav=[['Dashboard','/admin',LayoutDashboard],['Members','/admin/members',Users],['Membership plans','/admin/plans',ClipboardList],['Payments','/admin/payments',WalletCards],['Enquiries','/admin/enquiries',MessageSquare],['Gym timings','/admin/timings',Clock],['Gallery','/admin/gallery',Images],['Trainers','/admin/trainers',UserRound],['Facilities','/admin/facilities',DumbbellIcon],['Website content','/admin/content',Globe],['Social media','/admin/social',Globe],['Reports','/admin/reports',ChartNoAxesCombined],['Settings','/admin/settings',Settings]] as const;
function DumbbellIcon(){return <ClipboardList size={18}/>}
export default function Admin(){const [session,setSession]=useState<any>(null);const [owner,setOwner]=useState<boolean|null>(null);const [loading,setLoading]=useState(true);useEffect(()=>{let alive=true;supabase.auth.getSession().then(async({data})=>{if(!alive)return;setSession(data.session);if(data.session){const {data:profile}=await supabase.from('owner_profiles').select('user_id').eq('user_id',data.session.user.id).maybeSingle();if(alive)setOwner(!!profile)}else setOwner(false);setLoading(false)});const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>{setSession(s);if(!s){setOwner(false);setLoading(false)}else {setLoading(true);supabase.from('owner_profiles').select('user_id').eq('user_id',s.user.id).maybeSingle().then(({data})=>{setOwner(!!data);setLoading(false)})}});return()=>{alive=false;subscription.unsubscribe()}},[]);if(loading)return <div className="admin-loading"><LoaderCircle className="spin"/> Checking secure owner session…</div>;if(!session)return <Login/>;if(!owner)return <div className="access-denied"><ShieldCheck size={44}/><h1>Owner access required</h1><p>This account is not authorized to manage AS FITNESS GYM.</p><button className="btn btn-red" onClick={()=>supabase.auth.signOut()}>Sign out</button><Link to="/">Return to website</Link></div>;return <AdminShell/>}


function Login(){
    const { t } = useLang();
    const [apk,setApk]=useState('');const [popup,setPopup]=useState(true);const [imsg,setImsg]=useState('');useEffect(()=>{supabase.from('website_content').select('key,value').in('key',['apk_url','install_popup_enabled']).then(({data})=>{(data||[]).forEach((r:any)=>{if(r.key==='apk_url')setApk(String(r.value||''));if(r.key==='install_popup_enabled')setPopup(r.value!==false)})})},[]);const saveInstall=async()=>{if(apk&&!/^https:\/\//i.test(apk)){setImsg('APK link must start with https://');return}const now=new Date().toISOString();const {error}=await supabase.from('website_content').upsert([{key:'apk_url',value:apk,updated_at:now},{key:'install_popup_enabled',value:popup,updated_at:now}],{onConflict:'key'});setImsg(error?error.message:t('saved'))};const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [sent,setSent]=useState(false);const navg=useNavigate();const submit=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);setError('');try{requireSupabase();const {error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;navg('/admin')}catch(e){setError(e instanceof Error?e.message:'Sign in failed.')}finally{setBusy(false)}};const reset=async()=>{if(!email){setError('Enter your account email first.');return}const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:`${window.location.origin}/admin/reset-password`});setError(error?.message||'If the account exists, a password reset email has been sent.');setSent(!error)};return <div className="login-page"><Link to="/" className="brand"><Logo/><span>AS FITNESS <b>GYM</b></span></Link><form className="login-card" onSubmit={submit}><span className="eyebrow">SECURE OWNER ACCESS</span><h1>Welcome back.</h1><p>Sign in with the owner account provisioned in Supabase.</p><label>Email address<input type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required/></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/></label>{error&&<p className={sent?'form-status':'field-error'} role="status">{error}</p>}<button className="btn btn-red btn-full" disabled={busy}>{busy?'Signing in…':'Sign in securely'}</button><button type="button" className="forgot-button" onClick={reset}>Forgot password?</button><small>No public admin registration. Owner provisioning is documented in README.</small></form></div>}
function AdminShell(){const {t}=useLang();const [mobile,setMobile]=useState(false);const navigate=useNavigate();return <div className="admin-app"><aside className={mobile?'admin-sidebar mobile-open':'admin-sidebar'}><Link className="brand" to="/"><Logo/><span>AS FITNESS <b>GYM</b></span></Link><div className="sidebar-caption">GYM MANAGEMENT</div><nav>{nav.map(([label,path,Icon])=><Link key={path} to={path} onClick={()=>setMobile(false)}><Icon size={18}/>{adminKeys[path]?t(adminKeys[path]):label}</Link>)}</nav><button className="sidebar-logout" onClick={async()=>{await supabase.auth.signOut();navigate('/admin')}}><LogOut size={18}/> {t('a_out')}</button></aside><div className="admin-main"><header className="admin-topbar"><button className="mobile-toggle" onClick={()=>setMobile(!mobile)} aria-label="Toggle admin navigation">☰</button><span>{t('a_owner')}</span><span className="owner-pill"><ShieldCheck size={15}/> Owner</span></header><div className="admin-content"><Routes><Route index element={<Dashboard/>}/><Route path="members" element={<MembersManager/>}/><Route path="plans" element={<DataManager table="membership_plans" title="Membership plans" fields={['name','price_inr','duration_days','duration_label','description','benefits','joining_fee_inr','discount_percent','is_featured','is_active']} searchable="name"/>}/><Route path="payments" element={<DataManager table="payments" title="Payments" fields={['member_id','membership_id','amount_inr','currency','status','provider','razorpay_order_id','razorpay_payment_id','paid_at']} searchable="razorpay_order_id,razorpay_payment_id,status" readOnly/>}/><Route path="enquiries" element={<DataManager table="enquiries" title="Enquiries" fields={['full_name','phone','email','interested_plan','message','status','owner_notes']} searchable="full_name,phone,email"/>}/><Route path="timings" element={<Timings/>}/><Route path="gallery" element={<GalleryManager/>}/><Route path="trainers" element={<DataManager table="trainers" title="Trainers" fields={['name','bio','experience','specialization','certifications','photo_url','display_order','is_active']} searchable="name,specialization"/>}/><Route path="facilities" element={<DataManager table="facilities" title="Facilities & services" fields={['name','description','icon','display_order','is_active']} searchable="name"/>}/><Route path="content" element={<ContentManager/>}/><Route path="social" element={<DataManager table="social_links" title="Social media links" fields={['platform','url','is_enabled','display_order']} searchable="platform"/>}/><Route path="reports" element={<Reports/>}/><Route path="settings" element={<SettingsPage/>}/><Route path="reset-password" element={<ResetPassword/>}/><Route path="*" element={<Dashboard/>}/></Routes></div></div></div>}
function Dashboard(){const [metrics,setMetrics]=useState<any>({});const [err,setErr]=useState('');useEffect(()=>{(async()=>{try{const names=['members','memberships','enquiries','payments'];const counts=await Promise.all(names.map(async t=>{const {count,error}=await supabase.from(t).select('*',{count:'exact',head:true});if(error)throw error;return [t,count||0]}));setMetrics(Object.fromEntries(counts));}catch(e){setErr(e instanceof Error?e.message:'Unable to load metrics.')}})()},[]);return <><AdminTitle title="Dashboard" sub="A live overview of your gym business."/><div className="metric-grid">{[['Total members',metrics.members,'users'],['Membership records',metrics.memberships,'membership'],['Enquiries',metrics.enquiries,'enquiries'],['Payment records',metrics.payments,'payments']].map(([label,value])=><div className="metric-card" key={String(label)}><span>{label}</span><b>{value??'—'}</b><small>Live database count</small></div>)}</div>{err&&<div className="notice error-notice">Could not load dashboard counts: {err}</div>}<div className="admin-panel"><h3>Getting started</h3><p>Configure membership plans, gym hours and website content. Public content uses active/published records only. Metrics update from your Supabase database.</p><div className="quick-links"><Link to="/admin/members">Manage members →</Link><Link to="/admin/plans">Edit plans →</Link><Link to="/admin/timings">Set opening hours →</Link><Link to="/admin/content">Edit website content →</Link></div></div><div className="notice">Payment records are not revenue until their status is verified as <code>captured</code> or a separately audited manual payment is recorded.</div></>}
function AdminTitle({title,sub}:{title:string;sub:string}){return <div className="admin-title"><div><h1>{title}</h1><p>{sub}</p></div></div>}
const labels:Record<string,string>={full_name:'Full name',phone:'Phone',email:'Email',address:'Address',status:'Status',notes:'Private notes',name:'Name',price_inr:'Price (INR)',duration_days:'Duration (days)',duration_label:'Duration label',description:'Description',joining_fee_inr:'Joining fee (INR)',discount_percent:'Discount percent',benefits:'Included benefits (comma-separated)',is_featured:'Featured (true/false)',is_active:'Active (true/false)',member_id:'Member ID',membership_id:'Membership ID',amount_inr:'Amount (INR)',currency:'Currency',provider:'Provider',razorpay_order_id:'Razorpay order ID',razorpay_payment_id:'Razorpay payment ID',paid_at:'Paid at',interested_plan:'Interested plan',message:'Message',owner_notes:'Owner notes',bio:'Biography',experience:'Experience',specialization:'Specialization',certifications:'Certifications',photo_url:'Photo URL',display_order:'Display order',icon:'Icon',platform:'Platform',url:'Profile URL',is_enabled:'Enabled (true/false)'};
function DataManager({table,title,fields,searchable,readOnly=false}:{table:string;title:string;fields:string[];searchable:string;readOnly?:boolean}){const [rows,setRows]=useState<any[]>([]);const [query,setQuery]=useState('');const [edit,setEdit]=useState<any>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const load=async()=>{setBusy(true);const {data,error}=await supabase.from(table).select('*').order('created_at',{ascending:false}).limit(200);if(error)setError(error.message);else setRows(data||[]);setBusy(false)};useEffect(()=>{load()},[table]);const save=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);setError('');const payload={...edit};if(typeof payload.benefits==='string')payload.benefits=payload.benefits.split(',').map((v:string)=>v.trim()).filter(Boolean);delete payload.id;delete payload.created_at;delete payload.updated_at;const result=edit.id?await supabase.from(table).update(payload).eq('id',edit.id):await supabase.from(table).insert(payload);if(result.error)setError(result.error.message);else{setEdit(null);await load()}setBusy(false)};const del=async(id:string)=>{if(!confirm('Delete this record? Historical payment and membership records should be retained.'))return;const {error}=await supabase.from(table).delete().eq('id',id);if(error)setError(error.message);else load()};const q=query.toLowerCase();const filtered=rows.filter(r=>searchable.split(',').some(k=>String(r[k]||'').toLowerCase().includes(q)));return <><AdminTitle title={title} sub={`${rows.length} records · Data from Supabase`}/>{error&&<div className="notice error-notice">{error}</div>}<div className="admin-toolbar"><div className="search-box"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={`Search ${title.toLowerCase()}…`}/></div>{!readOnly&&<button className="btn btn-red" onClick={()=>setEdit(Object.fromEntries(fields.map(f=>[f,['is_active','is_featured','is_enabled'].includes(f)?true:['price_inr','duration_days','joining_fee_inr','discount_percent','display_order'].includes(f)?0:''])))}><Plus size={17}/> Add new</button>}<button className="btn btn-light-border" onClick={()=>downloadCsv(title,filtered)}>Export CSV</button></div>{edit&&<form className="admin-panel edit-form" onSubmit={save}><h3>{edit.id?'Edit record':'Create record'}</h3><div className="form-grid">{fields.map(f=><label key={f}>{labels[f]||f.replaceAll('_',' ')}{['description','message','bio','notes','owner_notes','certifications','benefits'].includes(f)?<textarea rows={3} value={Array.isArray(edit[f])?edit[f].join(', '):edit[f]??''} onChange={e=>setEdit({...edit,[f]:e.target.value})}/>:<input value={String(edit[f]??'')} type={['price_inr','duration_days','joining_fee_inr','discount_percent','display_order'].includes(f)?'number':'text'} onChange={e=>setEdit({...edit,[f]:['price_inr','duration_days','joining_fee_inr','discount_percent','display_order'].includes(f)?Number(e.target.value):['is_active','is_featured','is_enabled'].includes(f)?e.target.value==='true':e.target.value})}/>}</label>)}</div><div className="row-actions"><button className="btn btn-red" disabled={busy}><Save size={16}/> Save</button><button type="button" className="btn btn-light-border" onClick={()=>setEdit(null)}>Cancel</button></div><small>For benefit lists, separate items with commas. Only authorized owner sessions can save.</small></form>}<div className="admin-table-wrap">{busy&&!rows.length?<p className="empty-state">Loading records…</p>:<table className="admin-table"><thead><tr><th>Record</th>{fields.slice(0,4).map(f=><th key={f}>{labels[f]||f}</th>)}<th>Actions</th></tr></thead><tbody>{filtered.map(r=><tr key={r.id}><td><b>{r.full_name||r.name||r.platform||r.id?.slice(0,8)}</b><small>{r.created_at?new Date(r.created_at).toLocaleDateString():''}</small></td>{fields.slice(0,4).map(f=><td key={f}>{typeof r[f]==='boolean'?(r[f]?'Yes':'No'):String(r[f]??'—').slice(0,90)}</td>)}<td><div className="row-actions">{!readOnly&&<button className="icon-action" onClick={()=>setEdit({...r})} aria-label="Edit record">Edit</button>}{!readOnly&&<button className="icon-action danger" onClick={()=>del(r.id)} aria-label="Delete record"><Trash2 size={15}/></button>}</div></td></tr>)}</tbody></table>}{!filtered.length&&!busy&&<p className="empty-state">No records found. Add a record or change your search.</p>}</div></>}
function downloadCsv(name:string,rows:any[]){if(!rows.length){alert('There are no rows to export.');return}const keys=Object.keys(rows[0]);const csv=[keys.join(','),...rows.map(r=>keys.map(k=>`"${String(r[k]??'').replaceAll('"','""')}"`).join(','))].join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));a.download=`as-fitness-${name.toLowerCase().replaceAll(' ','-')}.csv`;a.click();URL.revokeObjectURL(a.href)}
function Timings(){const [rows,setRows]=useState<any[]>([]);const [error,setError]=useState('');const [busy,setBusy]=useState(false);useEffect(()=>{supabase.from('gym_hours').select('*').order('day_index').then(({data,error})=>{if(error)setError(error.message);else setRows(data||[])})},[]);const change=(id:string,key:string,value:any)=>setRows(rs=>rs.map(r=>r.id===id?{...r,[key]:value}:r));const save=async()=>{setBusy(true);setError('');for(const r of rows){if(!r.is_closed&&r.open_time>=r.close_time){setError(`Opening time must be earlier than closing time for ${r.day_of_week}.`);setBusy(false);return}}const {error}=await supabase.from('gym_hours').upsert(rows.map(({id,created_at,updated_at,...r})=>({...r,id})));if(error)setError(error.message);else alert('Gym timings saved. Public contact page reads the saved timings.');setBusy(false)};return <><AdminTitle title="Gym timings" sub="Edit opening hours and closed days."/>{error&&<div className="notice error-notice">{error}</div>}<div className="admin-panel hours-editor">{rows.map(r=><div className="hours-row" key={r.id}><b>{r.day_of_week}</b><label className="consent"><input type="checkbox" checked={r.is_closed} onChange={e=>change(r.id,'is_closed',e.target.checked)}/> Closed</label><label>Opens<input type="time" disabled={r.is_closed} value={r.open_time||'06:00'} onChange={e=>change(r.id,'open_time',e.target.value)}/></label><label>Closes<input type="time" disabled={r.is_closed} value={r.close_time||'22:00'} onChange={e=>change(r.id,'close_time',e.target.value)}/></label></div>)}{!rows.length&&<p>No hours rows found. Run the Supabase migrations first.</p>}<button className="btn btn-red" disabled={busy||!rows.length} onClick={save}><Save size={16}/>{busy?'Saving…':'Save changes'}</button></div><p className="fine-print">For split shifts, holidays and temporary closures, see the special_closures table; an extended calendar editor can be added to this section.</p></>}
function GalleryManager(){const [rows,setRows]=useState<any[]>([]);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [caption,setCaption]=useState('');const [alt,setAlt]=useState('');const load=()=>supabase.from('gallery_images').select('*').order('display_order').then(({data,error})=>{if(error)setError(error.message);else setRows(data||[])});useEffect(()=>{load()},[]);const upload=async(e:React.ChangeEvent<HTMLInputElement>)=>{const file=e.target.files?.[0];if(!file)return;if(!['image/jpeg','image/png','image/webp','image/avif'].includes(file.type)||file.size>5*1024*1024){setError('Choose a JPG, PNG, WebP or AVIF image up to 5 MB.');return}setBusy(true);setError('');const path=`${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;const {error:upErr}=await supabase.storage.from('gym-gallery').upload(path,file,{contentType:file.type,upsert:false});if(upErr){setError(upErr.message);setBusy(false);return}const {data:{publicUrl}}=supabase.storage.from('gym-gallery').getPublicUrl(path);const {error:dbErr}=await supabase.from('gallery_images').insert({image_url:publicUrl,storage_path:path,caption,alt_text:alt,category:'gym',display_order:rows.length,is_active:true});if(dbErr)setError(dbErr.message);else{setCaption('');setAlt('');await load()}setBusy(false);e.target.value=''};const remove=async(r:any)=>{if(!confirm('Delete this gallery image?'))return;const {error}=await supabase.storage.from('gym-gallery').remove([r.storage_path]);if(error){setError(error.message);return}const {error:dbErr}=await supabase.from('gallery_images').delete().eq('id',r.id);if(dbErr)setError(dbErr.message);else load()};return <><AdminTitle title="Gallery manager" sub="Upload and manage gym photography (5 MB max per image)."/>{error&&<div className="notice error-notice">{error}</div>}<div className="admin-panel"><div className="form-grid"><label>Caption<input value={caption} onChange={e=>setCaption(e.target.value)}/></label><label>Alternative text<input value={alt} onChange={e=>setAlt(e.target.value)}/></label></div><label className="upload-control">{busy?'Uploading…':'Choose image to upload'}<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={busy} onChange={upload}/></label><small>Files upload to the private owner-managed Supabase Storage bucket. Public images are delivered using public URLs.</small></div><div className="admin-gallery-grid">{rows.map(r=><div key={r.id} className="admin-gallery-item"><img src={r.image_url} alt={r.alt_text||r.caption||''}/><div><b>{r.caption||'Untitled image'}</b><button className="icon-action danger" onClick={()=>remove(r)}><Trash2 size={15}/> Delete</button></div></div>)}</div></>}
function ImageField({k,label,value,onChange}:{k:string;label:string;value:string;onChange:(v:string)=>void}){const [busy,setBusy]=useState(false);const [err,setErr]=useState('');const up=async(e:React.ChangeEvent<HTMLInputElement>)=>{const file=e.target.files?.[0];if(!file)return;if(!['image/jpeg','image/png','image/webp','image/avif'].includes(file.type)||file.size>5*1024*1024){setErr('JPG, PNG, WebP or AVIF, max 5 MB.');return}setBusy(true);setErr('');const path=`site/${k}-${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;const {error}=await supabase.storage.from('gym-gallery').upload(path,file,{contentType:file.type,upsert:false});if(error)setErr(error.message);else{onChange(supabase.storage.from('gym-gallery').getPublicUrl(path).data.publicUrl)}setBusy(false);e.target.value=''};return <div className="image-field span-two"><b>{label}</b>{value?<img src={value} alt={label}/>:<div className="image-empty">Default image in use</div>}<div className="row-actions"><label className="upload-control">{busy?'Uploading…':'Change image'}<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={busy} onChange={up}/></label>{value&&<button type="button" className="icon-action danger" onClick={()=>onChange('')}><Trash2 size={15}/> Use default</button>}</div>{err&&<small className="field-error">{err}</small>}<small>Remember to press “Save website content” below.</small></div>}
function ContentManager(){const [rows,setRows]=useState<Record<string,string>>({});const [error,setError]=useState('');const [busy,setBusy]=useState(false);useEffect(()=>{supabase.from('website_content').select('key,value').then(({data,error})=>{if(error)setError(error.message);else setRows(Object.fromEntries((data||[]).map(r=>[r.key,typeof r.value==='string'?r.value:JSON.stringify(r.value)])))})},[]);const fields=[['hero_heading','Hero heading'],['hero_description','Hero description'],['hero_image','Home banner image'],['home_image','Home page photo'],['about_image','About page photo'],['logo_image','Logo image (optional – replaces default logo)'],['owner_name','Owner name (default: MD SADAM)'],['hero_heading_hi','Hero heading (हिन्दी)'],['hero_heading_hing','Hero heading (Hinglish)'],['hero_description_hi','Hero description (हिन्दी)'],['hero_description_hing','Hero description (Hinglish)'],['hero_primary_label','Primary button label'],['contact_phone','Contact phone'],['contact_email','Contact email'],['contact_address','Gym address'],['contact_whatsapp','WhatsApp number'],['contact_map_url','Google Maps URL'],['footer_text','Footer text'],['seo_title','SEO title'],['seo_description','SEO description']];const save=async()=>{setBusy(true);setError('');const payload=Object.entries(rows).map(([key,value])=>({key,value,updated_at:new Date().toISOString()}));const {error}=await supabase.from('website_content').upsert(payload,{onConflict:'key'});if(error)setError(error.message);else alert('Website content saved.');setBusy(false)};return <><AdminTitle title="Website content" sub="Edit public copy and contact information without a code change."/>{error&&<div className="notice error-notice">{error}</div>}<div className="admin-panel"><div className="form-grid">{fields.map(([key,label])=>['hero_image','home_image','about_image','logo_image'].includes(key)?<ImageField key={key} k={key} label={label} value={rows[key]||''} onChange={v=>setRows(r=>({...r,[key]:v}))}/>:<label key={key}>{label}{/description|heading|footer_text/.test(key)?<textarea rows={3} value={rows[key]||''} onChange={e=>setRows({...rows,[key]:e.target.value})}/>:<input value={rows[key]||''} onChange={e=>setRows({...rows,[key]:e.target.value})} placeholder={label}/>}</label>)}</div><button className="btn btn-red" disabled={busy} onClick={save}><Save size={16}/>{busy?'Saving…':'Save website content'}</button></div></>}
function Reports(){const [payments,setPayments]=useState<any[]>([]);const [members,setMembers]=useState<any[]>([]);const [error,setError]=useState('');useEffect(()=>{Promise.all([supabase.from('payments').select('amount_inr,status,paid_at,created_at'),supabase.from('members').select('status,created_at')]).then(([p,m])=>{if(p.error||m.error)setError(p.error?.message||m.error?.message||'Could not load reports');setPayments(p.data||[]);setMembers(m.data||[])})},[]);const captured=payments.filter(p=>['captured','manual_paid'].includes(p.status));const gross=captured.reduce((s,p)=>s+Number(p.amount_inr||0),0);return <><AdminTitle title="Reports & analytics" sub="Summary based on records available to the owner account."/>{error&&<div className="notice error-notice">{error}</div>}<div className="metric-grid"><div className="metric-card"><span>Total member records</span><b>{members.length}</b><small>All-time</small></div><div className="metric-card"><span>Verified/manual recorded receipts</span><b>₹{gross.toLocaleString('en-IN')}</b><small>Captured online + audited manual_paid only; before refunds</small></div><div className="metric-card"><span>Successful payments</span><b>{captured.length}</b><small>Captured or recorded manual payment</small></div><div className="metric-card"><span>Failed / pending / other</span><b>{payments.length-captured.length}</b><small>Excluded from receipts</small></div></div><div className="admin-panel"><h3>Payment export</h3><p>Gross receipts shown above exclude pending and failed payments; refunds must be deducted separately to calculate net revenue.</p><button className="btn btn-light-border" onClick={()=>downloadCsv('payments-report',payments)}>Export payments CSV</button></div></>}

function SettingsPage() {
  const { lang, setLang, t } = useLang();

  const [lmsg, setLmsg] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');

  const [apk, setApk] = useState('');
  const [popup, setPopup] = useState(true);
  const [imsg, setImsg] = useState('');
  const [installBusy, setInstallBusy] = useState(false);

  useEffect(() => {
    supabase
      .from('website_content')
      .select('key, value')
      .in('key', ['apk_url', 'install_popup_enabled'])
      .then(({ data, error }) => {
        if (error) {
          setImsg(error.message);
          return;
        }

        (data || []).forEach((r: any) => {
          if (r.key === 'apk_url') {
            setApk(String(r.value || ''));
          }

          if (r.key === 'install_popup_enabled') {
            setPopup(r.value !== false);
          }
        });
      });
  }, []);

  const saveLang = async () => {
    const { error } = await supabase
      .from('website_content')
      .upsert(
        {
          key: 'default_language',
          value: lang,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' }
      );

    setLmsg(error ? error.message : t('saved'));
  };

  const update = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');

    if (!email.trim() && !password) {
      setMsg('Enter a new email or password first.');
      return;
    }

    if (password && password.length < 10) {
      setMsg('Password must contain at least 10 characters.');
      return;
    }

    const { error } = await supabase.auth.updateUser({
      ...(email.trim() ? { email: email.trim() } : {}),
      ...(password ? { password } : {}),
    });

    setMsg(
      error?.message ||
        'Account update request completed. Check email if confirmation is required.'
    );

    if (!error) {
      setEmail('');
      setPassword('');
    }
  };

  const saveInstall = async () => {
    if (apk && !/^https:\/\//i.test(apk.trim())) {
      setImsg('APK link must start with https://');
      return;
    }

    setInstallBusy(true);
    setImsg('');

    const now = new Date().toISOString();

    const { error } = await supabase
      .from('website_content')
      .upsert(
        [
          {
            key: 'apk_url',
            value: apk.trim(),
            updated_at: now,
          },
          {
            key: 'install_popup_enabled',
            value: popup,
            updated_at: now,
          },
        ],
        { onConflict: 'key' }
      );

    setImsg(error ? error.message : t('saved'));
    setInstallBusy(false);
  };

  return (
    <>
      <AdminTitle
        title="Account settings"
        sub="Update owner account details and keep credentials secure."
      />

      <form
        className="admin-panel login-settings"
        onSubmit={update}
      >
        <label>
          New email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Leave blank to keep current"
          />
        </label>

        <label>
          New password
          <input
            type="password"
            minLength={10}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 10 characters"
          />
        </label>

        <button className="btn btn-red" type="submit">
          Update account
        </button>

        {msg && <p role="status">{msg}</p>}
      </form>

      <div className="admin-panel login-settings">
        <h3>{t('setLang')}</h3>
        <p>{t('setLangD')}</p>

        <label>
          {t('setLang')}
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as any)}
          >
            {LANGS.map(([k, n]) => (
              <option key={k} value={k}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="btn btn-red"
          onClick={saveLang}
        >
          {t('saveLang')}
        </button>

        {lmsg && <p role="status">{lmsg}</p>}
      </div>

      <div className="admin-panel login-settings">
        <h3>Install app / APK</h3>

        <p>
          Visitors can install the web app on supported devices.
          If you have an APK file, enter its HTTPS download link
          to enable the Download APK option.
        </p>

        <label className="consent">
          <input
            type="checkbox"
            checked={popup}
            onChange={(e) => setPopup(e.target.checked)}
          />
          Show install popup to website visitors
        </label>

        <label>
          APK download link (optional)
          <input
            type="url"
            value={apk}
            onChange={(e) => setApk(e.target.value)}
            placeholder="https://example.com/AS-Fitness.apk"
          />
        </label>

        <button
          type="button"
          className="btn btn-red"
          disabled={installBusy}
          onClick={saveInstall}
        >
          {installBusy ? 'Saving…' : 'Save install settings'}
        </button>

        {imsg && <p role="status">{imsg}</p>}
      </div>

      <div className="notice">
        Never share your password or put Supabase service-role
        or Razorpay secret keys in this panel.
      </div>
    </>
  );
}

function ResetPassword(){const [password,setPassword]=useState('');const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);const submit=async(e:React.FormEvent)=>{e.preventDefault();if(password.length<10){setMessage('Use at least 10 characters.');return}setBusy(true);const {error}=await supabase.auth.updateUser({password});setMessage(error?.message||'Password updated. You can continue using the owner dashboard.');setBusy(false)};return <><AdminTitle title="Set a new password" sub="Choose a strong password for the owner account."/><form className="admin-panel login-settings" onSubmit={submit}><label>New password<input type="password" autoComplete="new-password" minLength={10} value={password} onChange={e=>setPassword(e.target.value)} required/></label><button className="btn btn-red" disabled={busy}>{busy?'Updating…':'Update password'}</button>{message&&<p role="status">{message}</p>}</form></>}
