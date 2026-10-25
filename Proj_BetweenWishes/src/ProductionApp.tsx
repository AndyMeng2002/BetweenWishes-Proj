import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { SupabaseClient, User as AuthUser } from "@supabase/supabase-js";
import {
  Bell, ChevronRight, Gift as GiftIcon, Heart, Home,
  ImagePlus, LogOut, Package, Plus, RefreshCw, ShieldCheck,
  Sparkles, Trash2, UserRound, X,
} from "lucide-react";
import { supabase } from "./supabase";
import type { Profile, PartnerPreview, Wish, Couple, PartnerInvitation, Gift, Notice, DrawResult } from "./types";

type Tab = "home" | "wishes" | "draw" | "gifts" | "profile";
type WishInput = {
  title: string; product_url: string | null; price: number | null;
  quantity: number; specs: string | null; category: string;
  priority: "high" | "medium" | "low"; note: string | null;
};
const priorityNames: Record<Wish["priority"], string> = {
  high: "很想要", medium: "想要", low: "随缘",
};
const giftStatusNames: Record<Gift["status"], string> = {
  drawn: "准备中", purchased: "已购买", sent: "已送出", cancelled: "已取消",
};

function friendlyError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (/Invalid login credentials/i.test(raw)) return "邮箱或密码不正确";
  if (/Email not confirmed/i.test(raw)) return "请先打开邮箱中的确认邮件";
  if (/User already registered/i.test(raw)) return "这个邮箱已经注册，请直接登录";
  if (/rate limit/i.test(raw)) return "操作太频繁，请稍后再试";
  if (/Failed to fetch|NetworkError/i.test(raw)) return "网络连接失败，请检查网络";
  return raw || "操作失败，请稍后重试";
}

function check(result: { error?: { message: string } | null }): void {
  if (result.error) throw new Error(result.error.message);
}

function formatDate(d?: string | null) {
  if (!d) return "—";
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? d : date.toLocaleDateString("zh-CN");
}

function safeExternalUrl(value: string | null): string | undefined {
  if (!value) return;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : undefined;
  } catch { return; }
}

function Logo() {
  return (
    <div className="bw-brand">
      <span className="bw-logo"><Heart size={22} fill="currentColor" /></span>
      <div><b>心愿之间</b><small>BETWEEN WISHES</small></div>
    </div>
  );
}

function Setup() {
  return (
    <div className="bw-app bw-center">
      <div className="bw-panel bw-setup">
        <Logo />
        <h1>只差数据库连接配置</h1>
        <p>这个版本已经关闭不安全的模拟账号模式。请先建立 Supabase 项目，并在 Vercel 配置下面两个环境变量：</p>
        <code>VITE_SUPABASE_URL</code>
        <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>
        <p className="bw-muted">注意：不要填写 secret/service_role 密钥。完成后重新部署网站。</p>
      </div>
    </div>
  );
}

function AuthScreen({ client }: {client: SupabaseClient}) {
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setWorking(true); setError(""); setMessage("");
    try {
      const cleanEmail = email.trim().toLowerCase();
      if (mode === "register") {
        if (password.length < 8) throw new Error("密码至少需要 8 个字符");
        const result = await client.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: { nickname: nickname.trim().slice(0, 40) || "新用户" },
            emailRedirectTo: window.location.origin,
          },
        });
        check(result);
        setMessage(result.data.session
          ? "注册成功，正在进入心愿之间…"
          : "注册请求已提交，请打开邮件中的验证链接，再回来登录。");
      } else if (mode === "login") {
        check(await client.auth.signInWithPassword({ email: cleanEmail, password }));
      } else {
        check(await client.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: window.location.origin,
        }));
        setMessage("如果该邮箱存在账号，你将收到密码重置邮件，请检查收件箱。");
      }
    } catch (e) { setError(friendlyError(e)); }
    finally { setWorking(false); }
  }

  return (
    <div className="bw-app bw-auth-layout">
      <div className="bw-auth-illustration">
        <Logo />
        <div className="bw-auth-gift"><Heart size={76} strokeWidth={1.2} fill="#f7bbc6" /></div>
        <h1>把小小的心愿<br />交给一份刚刚好的惊喜。</h1>
        <p>A little wish, a lovely surprise.</p>
        <div className="bw-tiny-stars">✦　♡　✧　♡　✦</div>
      </div>
      <div className="bw-panel bw-auth-card">
        <div className="bw-mobile-brand"><Logo /></div>
        <h2>{mode === "login" ? "欢迎回来" : mode === "register" ? "创建你的心愿账号" : "找回密码"}</h2>
        <p className="bw-muted">{mode === "login" ? "登录后，你们的心愿将安全保存在云端。"
          : mode === "register" ? "从一个小小心愿开始，一起收藏生活里的爱。"
          : "我们会向邮箱发送重置密码的链接。"}</p>
        <form onSubmit={submit} className="bw-form">
          {mode === "register" && <label>昵称<input maxLength={40} value={nickname} onChange={e => setNickname(e.target.value)} required placeholder="TA 会怎样称呼你？" /></label>}
          <label>邮箱<input autoComplete="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" /></label>
          {mode !== "forgot" && <label>密码<input autoComplete={mode === "register" ? "new-password" : "current-password"} type="password" minLength={mode === "register" ? 8 : undefined} value={password} onChange={e => setPassword(e.target.value)} required placeholder="至少 8 个字符" /></label>}
          {error && <p role="alert" className="bw-alert bw-error">{error}</p>}
          {message && <p role="status" className="bw-alert bw-success">{message}</p>}
          <button className="bw-primary bw-full" disabled={working} type="submit">{working ? "处理中…" : mode === "login" ? "登录" : mode === "register" ? "注册" : "发送重置邮件"} <ChevronRight size={16} /></button>
        </form>
        {mode === "register" && (
  <button
    type="button"
    className="bw-secondary bw-full"
    disabled={working || !email.trim()}
    onClick={async () => {
      setWorking(true);
      setError("");
      setMessage("");

      try {
        const { error } = await client.auth.resend({
          type: "signup",
          email: email.trim().toLowerCase(),
          options: {
            emailRedirectTo: window.location.origin,
          },
        });

        if (error) throw error;

        setMessage("重发请求已提交，请检查邮箱。");
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "重发失败"
        );
      } finally {
        setWorking(false);
      }
    }}
  >
    重新发送验证邮件
  </button>
)}
        <div className="bw-auth-actions">
          {mode === "login" ? <>
            <button onClick={() => {setMode("register");setError("");setMessage("");}}>还没有账号？注册</button>
            <button onClick={() => {setMode("forgot");setError("");setMessage("");}}>忘记密码</button>
          </> : <button onClick={() => {setMode("login");setError("");setMessage("");}}>返回登录</button>}
        </div>
        <p className="bw-auth-note"><ShieldCheck size={15} /> 不再使用模拟身份登录。每个人只能访问获授权的数据。</p>
        <p className="bw-legal-links"><a href="/privacy.html" target="_blank" rel="noopener noreferrer">隐私说明</a> · <a href="/terms.html" target="_blank" rel="noopener noreferrer">使用条款</a></p>
      </div>
    </div>
  );
}

function Recovery({client, onDone}: {client: SupabaseClient; onDone: () => void}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setMessage("");
    try {
      if (password.length < 8) throw new Error("新密码至少需要 8 个字符");
      check(await client.auth.updateUser({password}));
      setMessage("修改成功，请重新登录。");
      await client.auth.signOut();
      onDone();
    } catch (e) { setMessage(friendlyError(e)); }
    finally {setBusy(false);}
  };
  return <div className="bw-app bw-center"><form className="bw-panel bw-setup bw-form" onSubmit={submit}>
    <Logo /><h2>设置新密码</h2>
    <label>新密码<input type="password" minLength={8} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} required /></label>
    {message && <p role="status">{message}</p>}
    <button disabled={busy} className="bw-primary" type="submit">保存新密码</button>
  </form></div>;
}

function PrivatePhoto({client,path,alt}:{client:SupabaseClient;path?:string;alt:string}) {
  const [src,setSrc] = useState<string>("");
  useEffect(() => {
    let alive=true;
    setSrc("");
    if (!path) return;
    client.storage.from("wish-images").createSignedUrl(path,60*60)
      .then(({data,error}) => {
        if (alive && !error && data?.signedUrl) setSrc(data.signedUrl);
      });
    return () => {alive=false;};
  }, [client,path]);
  return <div className="bw-photo">{src ? <img src={src} alt={alt} loading="lazy" /> : <GiftIcon size={30} strokeWidth={1.4}/>}</div>;
}

function WishEditor({
  initial, busy, onSubmit, onCancel,
}: {
  initial?: Wish;
  busy: boolean;
  onSubmit: (data: WishInput, image?: File) => Promise<void>;
  onCancel: () => void;
}) {
  const [title,setTitle] = useState(initial?.title || "");
  const [price,setPrice] = useState(initial?.price == null ? "" : String(initial.price));
  const [productUrl,setProductUrl] = useState(initial?.product_url || "");
  const [quantity,setQuantity] = useState(initial?.quantity || 1);
  const [specs,setSpecs] = useState(initial?.specs || "");
  const [note,setNote] = useState(initial?.note || "");
  const [category,setCategory] = useState(initial?.category || "其他");
  const [priority,setPriority] = useState<Wish["priority"]>(initial?.priority || "medium");
  const [file,setFile] = useState<File | undefined>();
  const [localError,setLocalError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault(); setLocalError("");
    try {
      if (!title.trim()) throw new Error("请填写心愿名称");
      const n = price.trim() ? Number(price) : null;
      if (n !== null && (!Number.isFinite(n) || n < 0)) throw new Error("价格必须是非负数");
      if (productUrl && !safeExternalUrl(productUrl)) throw new Error("商品网址需要以 https:// 或 http:// 开头");
      if (file && (!["image/png","image/jpeg","image/webp"].includes(file.type) || file.size > 5*1024*1024))
        throw new Error("图片仅支持 JPG/PNG/WebP，且不得超过 5MB");
      await onSubmit({
        title: title.trim(), price: n, product_url: productUrl.trim() || null,
        quantity, specs: specs.trim() || null, note: note.trim() || null,
        priority, category: category.trim() || "其他",
      }, file);
    } catch (e) {setLocalError(friendlyError(e));}
  }

  return <form className="bw-form bw-editor" onSubmit={submit}>
    <div className="bw-section-heading"><h3>{initial ? "编辑心愿" : "添加一个新心愿"}</h3><button type="button" className="bw-iconbutton" onClick={onCancel}><X size={18}/></button></div>
    <label>心愿名称 *<input maxLength={120} required value={title} onChange={e=>setTitle(e.target.value)} placeholder="比如：一台拍立得" /></label>
    <div className="bw-two">
      <label>参考价格（元）<input type="number" min="0" step="0.01" value={price} onChange={e=>setPrice(e.target.value)} placeholder="可不填" /></label>
      <label>数量<input type="number" min={1} max={999} value={quantity} onChange={e=>setQuantity(Math.max(1,Math.min(999,Number(e.target.value)||1)))} /></label>
    </div>
    <label>商品链接（选填）<input type="url" value={productUrl} onChange={e=>setProductUrl(e.target.value)} placeholder="https://..." /></label>
    <div className="bw-two">
      <label>分类<input maxLength={40} value={category} onChange={e=>setCategory(e.target.value)} /></label>
      <label>心动程度<select value={priority} onChange={e=>setPriority(e.target.value as Wish["priority"])}>
        <option value="high">很想要</option><option value="medium">想要</option><option value="low">随缘</option>
      </select></label>
    </div>
    <label>规格 / 颜色<input value={specs} onChange={e=>setSpecs(e.target.value)} placeholder="比如：奶油白、M 码" /></label>
    <label>我的小备注<textarea rows={2} value={note} onChange={e=>setNote(e.target.value)} placeholder="为什么想要它？" /></label>
    <label className="bw-fileinput"><ImagePlus size={18}/> {file ? `已选 ${file.name}` : "选择心愿图片（选填，不超过 5MB）"}
      <input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>setFile(e.target.files?.[0])}/>
    </label>
    {localError && <p className="bw-alert bw-error" role="alert">{localError}</p>}
    <div className="bw-actions">
      <button type="button" className="bw-secondary" onClick={onCancel}>取消</button>
      <button className="bw-primary" type="submit" disabled={busy}>{busy ? "保存中…" : "保存心愿"}</button>
    </div>
  </form>;
}

export default function ProductionApp() {
  const client = supabase;
  const [user,setUser] = useState<AuthUser | null>(null);
  const [loading,setLoading] = useState(true);
  const [recovery,setRecovery] = useState(false);

  useEffect(() => {
    if (!client) {setLoading(false);return;}
    let alive=true;
    client.auth.getUser().then(({data})=>{
      if (alive) {setUser(data.user);setLoading(false);}
    }).catch(()=>{if(alive) setLoading(false);});
    const {data:{subscription}}=client.auth.onAuthStateChange((event,session)=>{
      if(!alive) return;
      setUser(session?.user || null);
      if(event==="PASSWORD_RECOVERY") setRecovery(true);
      if(event==="SIGNED_OUT") setRecovery(false);
      setLoading(false);
    });
    return ()=>{alive=false;subscription.unsubscribe();};
  },[client]);

  if(!client) return <Setup/>;
  if(loading) return <div className="bw-app bw-center"><div className="bw-spinner"/><p>正在打开心愿之间…</p></div>;
  if(recovery) return <Recovery client={client} onDone={()=>setRecovery(false)}/>;
  if(!user) return <AuthScreen client={client}/>;
  return <AuthenticatedApp key={user.id} client={client} user={user}/>;
}

function AuthenticatedApp({client,user}:{client:SupabaseClient;user:AuthUser}) {
  const [tab,setTab]=useState<Tab>("home");
  const [profile,setProfile]=useState<Profile|null>(null);
  const [couple,setCouple]=useState<Couple|null>(null);
  const [partner,setPartner]=useState<PartnerPreview|null>(null);
  const [wishes,setWishes]=useState<Wish[]>([]);
  const [gifts,setGifts]=useState<Gift[]>([]);
  const [invites,setInvites]=useState<PartnerInvitation[]>([]);
  const [notices,setNotices]=useState<Notice[]>([]);
  const [busy,setBusy]=useState(false);
  const [initialLoading,setInitialLoading]=useState(true);
  const [message,setMessage]=useState("");
  const [problem,setProblem]=useState("");
  const [editor,setEditor]=useState<Wish | "new" | null>(null);
  const [inviteName,setInviteName]=useState("");
  const [budget,setBudget]=useState("");
  const [drawn,setDrawn]=useState<DrawResult | null>(null);
  const [profileName,setProfileName]=useState("");
  const [profileHandle,setProfileHandle]=useState("");
  const [deleteMode,setDeleteMode]=useState(false);
  const [deleteConfirm,setDeleteConfirm]=useState("");
  const [deletePassword,setDeletePassword]=useState("");

  const refresh=useCallback(async()=>{
    try {
      const [pr,wi,co,gi,iv,no]=await Promise.all([
        client.from("profiles").select("*").eq("id",user.id).single(),
        client.from("wishes").select("*").eq("owner_id",user.id).eq("archived",false).order("position",{ascending:true}).order("created_at",{ascending:false}),
        client.from("couples").select("*").is("ended_at",null).or(`member_a.eq.${user.id},member_b.eq.${user.id}`).limit(1),
        client.from("gift_records").select("*").order("drawn_at",{ascending:false}),
        client.rpc("list_my_invites"),
        client.from("notifications").select("*").order("created_at",{ascending:false}).limit(50),
      ]);
      [pr,wi,co,gi,iv,no].forEach(check);
      const p = pr.data as Profile | null;
      if (!p) throw new Error("账号资料没有正确创建，请检查 Supabase 数据库初始化");
      setProfile(p); setProfileName(p.nickname); setProfileHandle(p.username);
      setWishes((wi.data || []) as Wish[]);
      setGifts((gi.data || []) as Gift[]);
      setInvites((iv.data || []) as PartnerInvitation[]);
      setNotices((no.data || []) as Notice[]);
      const c=(co.data?.[0] as Couple | undefined)||null;
      setCouple(c);
      if(c){
        const otherResult=await client.rpc("my_partner_preview").single();
        check(otherResult);
        if (!otherResult.data) throw new Error("未查询到已绑定伴侣的资料");
        setPartner(otherResult.data as PartnerPreview);
      }else{setPartner(null);}
      setProblem("");
    }catch(e){setProblem("同步数据失败："+friendlyError(e));}
    finally{setInitialLoading(false);}
  },[client,user.id]);

  useEffect(()=>{void refresh();},[refresh]);

  async function act(action:()=>Promise<void>,done="操作成功") {
    setBusy(true);setProblem("");setMessage("");
    try{await action();await refresh();setMessage(done);}
    catch(e){setProblem(friendlyError(e));}
    finally{setBusy(false);}
  }

  async function saveWish(data:WishInput,file?:File) {
    // Inserts/updates are checked against RLS. No data is kept in localStorage.
    await act(async()=>{
      let id:string;
      let existingImages:string[]=[];
      if(editor && editor !== "new"){
        id=editor.id;existingImages=editor.image_urls||[];
        const r=await client.from("wishes").update(data).eq("id",id).select("id").single();
        check(r);
      }else{
        const r=await client.from("wishes").insert({...data,owner_id:user.id}).select("id").single();
        check(r);
        if (!r.data?.id) throw new Error("心愿保存后没有返回编号");
        id = r.data.id as string;
      }
      if(file){
        const ext=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg";
        const filename=`${user.id}/${id}/${crypto.randomUUID()}.${ext}`;
        const upload=await client.storage.from("wish-images").upload(filename,file,{contentType:file.type,upsert:false});
        check(upload);
        const update=await client.from("wishes").update({image_urls:[filename,...existingImages]}).eq("id",id);
        check(update);
      }
      setEditor(null);
    },"心愿已保存到云端");
  }

  async function changeGift(id:string,action:"purchased"|"sent"|"cancelled"){
    await act(async()=>{
      check(await client.rpc("change_gift_status",{
        p_record_id:id,p_action:action,p_note:null
      }));
    },action==="sent"?"已经送出啦！对方现在可以看到这份心意。":"礼物状态已更新");
  }

  async function saveProfile() {
    await act(async()=>{
      const username=profileHandle.trim().toLowerCase();
      if(!/^[a-z0-9_]{3,24}$/.test(username)) throw new Error("用户名只能使用 3–24 位小写字母、数字或下划线");
      if(!profileName.trim()) throw new Error("请填写昵称");
      check(await client.from("profiles").update({
        username,nickname:profileName.trim().slice(0,40),
      }).eq("id",user.id));
    },"个人资料已保存");
  }

  async function deleteAccount() {
    if (deleteConfirm !== "删除我的账号") {
      setProblem("请输入完整的确认文字");
      return;
    }
    if (!deletePassword) {
      setProblem("请输入当前账号的登录密码");
      return;
    }

    setBusy(true);
    setProblem("");
    setMessage("");
    try {
      const { data: { session }, error: sessionError } =
        await client.auth.getSession();
      if (sessionError || !session) {
        throw new Error("登录已过期，请重新登录");
      }
      const { error } = await client.functions.invoke("delete-account", {
        body: {
          confirm: "DELETE_MY_ACCOUNT",
          password: deletePassword,
        },
      });
      if (error) {
        let detail = error.message;
        try {
          const response = (error as { context?: Response }).context;
          if (response) {
            const payload = await response.json();
            if (typeof payload?.error === "string") detail = payload.error;
          }
        } catch { /* Keep the original error text. */ }
        throw new Error(detail);
      }

      await client.auth.signOut();
      setDeletePassword("");
      setDeleteConfirm("");
      setDeleteMode(false);
    } catch (error) {
      setProblem(friendlyError(error));
    } finally {
      setBusy(false);
    }
  }

  async function exportMyData() {
    await act(async () => {
      // Paginate: Supabase REST defaults can cap each result set.
      async function allVisibleRows(table: string): Promise<unknown[]> {
        const rows: unknown[] = [];
        const pageSize = 500;
        for (let offset=0; ; offset+=pageSize) {
          const response=await client.from(table).select("*").range(offset,offset+pageSize-1);
          check(response);
          const page=response.data || [];
          rows.push(...page);
          if(page.length<pageSize) break;
        }
        return rows;
      }
      const [allProfiles,allWishes,allGifts,allCouples,allInvites,allNotices]
        = await Promise.all([
          allVisibleRows("profiles"),
          allVisibleRows("wishes"),
          allVisibleRows("gift_records"),
          allVisibleRows("couples"),
          allVisibleRows("binding_requests"),
          allVisibleRows("notifications"),
        ]);
      const payload = {
        exported_at: new Date().toISOString(),
        profiles:allProfiles, wishes:allWishes, gifts:allGifts,
        couples:allCouples, invitations:allInvites, notifications:allNotices,
        note:"仅导出该账号通过数据库行级权限能够读取的数据。私有图片本体需另外逐一下载。",
      };
      const blob = new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
      const url=URL.createObjectURL(blob);
      const link=document.createElement("a");
      link.href=url;link.download="between-wishes-my-data.json";link.click();
      window.setTimeout(()=>URL.revokeObjectURL(url),1000);
    },"已导出当前账号可读取的云端数据");
  }

  const ownGifts=gifts.filter(g=>g.giver_id===user.id);
  const receivedGifts=gifts.filter(g=>g.receiver_id===user.id && g.status==="sent");
  const unread=notices.filter(n=>!n.read_at).length;

  return <div className="bw-app">
    <header className="bw-header">
      <Logo/>
      <div className="bw-header-right">
        <span className="bw-header-user">你好，{profile?.nickname||"心愿家"} ♡</span>
        <button className="bw-iconbutton bw-bell" aria-label="查看通知" onClick={()=>setTab("gifts")}><Bell size={19}/>{unread>0&&<em>{unread}</em>}</button>
        <button className="bw-iconbutton" aria-label="刷新数据" onClick={()=>void refresh()}><RefreshCw size={19}/></button>
      </div>
    </header>
    <div className="bw-layout">
      <aside className="bw-side">
        <p className="bw-side-label">YOUR LITTLE CORNER</p>
        {([{id:"home",label:"首页",icon:Home},{id:"wishes",label:"我的心愿",icon:Heart},
           {id:"draw",label:"为 TA 送礼",icon:Sparkles},{id:"gifts",label:"送礼记录",icon:Package},
           {id:"profile",label:"个人设置",icon:UserRound}] as const).map(item=><button key={item.id}
           className={`bw-side-link ${tab===item.id?"active":""}`} onClick={()=>{setTab(item.id);setMessage("");}}>
           <item.icon size={18}/>{item.label}</button>)}
        <div className="bw-side-card"><Heart size={20}/><p>让每个小小心愿<br/>都有被认真对待的一天。</p><small>WITH LOVE · BW</small></div>
      </aside>
      <main className="bw-main">
        {(message||problem)&&<div className={`bw-alert ${problem?"bw-error":"bw-success"}`} role="status">{problem||message}<button onClick={()=>{setMessage("");setProblem("");}} aria-label="关闭"><X size={15}/></button></div>}
        {initialLoading?<div className="bw-panel bw-center"><div className="bw-spinner"/>同步你的心愿中…</div>:!profile?
          <div className="bw-panel"><h2>尚未加载到个人资料</h2><p>确认数据库迁移已执行成功，然后点击刷新。</p></div>:<>
          {tab==="home"&&<div className="bw-page">
            <div className="bw-hero"><p className="bw-overline">BETWEEN WISHES · 心愿之间</p><h1>把喜欢的事物<br/>悄悄收藏成惊喜 ✨</h1>
              <p>两个人，各自许愿；一份礼物，一次心动。</p>
              <button className="bw-hero-button" onClick={()=>{setTab("wishes");setEditor("new");}}>写下新心愿 <ChevronRight size={17}/></button>
            </div>
            <div className="bw-stats">
              <div><Heart size={21}/><strong>{wishes.length}</strong><small>我的心愿</small></div>
              <div><GiftIcon size={21}/><strong>{ownGifts.filter(g=>g.status==="sent").length}</strong><small>送出的礼物</small></div>
              <div><Sparkles size={21}/><strong>{receivedGifts.length}</strong><small>收到的心意</small></div>
            </div>
            <div className="bw-panel">
              <div className="bw-section-heading"><h2>我们的关系</h2><button className="bw-text-link" onClick={()=>setTab("profile")}>管理绑定 <ChevronRight size={15}/></button></div>
              {partner?<p>💗 你已和 <b>{partner.nickname}</b>（@{partner.username}）绑定成功，可以开始为 TA 准备惊喜。</p>:
                <p>还没有绑定伴侣。进入个人设置，输入对方的用户名发送邀请。</p>}
            </div>
            <div className="bw-panel">
              <div className="bw-section-heading"><h2>最近的心愿</h2><button className="bw-text-link" onClick={()=>setTab("wishes")}>查看全部 <ChevronRight size={15}/></button></div>
              {wishes.length===0?<p className="bw-muted">还没有心愿。先写下你喜欢的第一件小物吧。</p>:
                <div className="bw-list">{wishes.slice(0,3).map(w=><div className="bw-simple-line" key={w.id}><Heart size={16}/><b>{w.title}</b><span>¥{w.price??"待定"}</span></div>)}</div>}
            </div>
          </div>}

          {tab==="wishes"&&<div className="bw-page">
            <div className="bw-page-head"><div><p className="bw-overline">MY WISHLIST</p><h1>我的心愿清单</h1><p>只属于你的收藏，一份份交给未来的惊喜。</p></div>
              <button className="bw-primary" onClick={()=>setEditor("new")}><Plus size={17}/> 新增心愿</button></div>
            {editor&&<div className="bw-panel"><WishEditor key={editor==="new"?"new":editor.id}
              initial={editor==="new"?undefined:editor} busy={busy} onSubmit={saveWish} onCancel={()=>setEditor(null)}/></div>}
            {wishes.length===0&&!editor?<div className="bw-panel bw-empty"><Heart size={40}/><h3>心愿从这里开始</h3><p>写下第一件你喜欢的小物品吧。</p><button className="bw-primary" onClick={()=>setEditor("new")}>添加心愿</button></div>:
              <div className="bw-wish-grid">{wishes.map(w=><article className="bw-wish-card" key={w.id}>
                <PrivatePhoto client={client} path={w.image_urls?.[0]} alt={w.title}/>
                <div className="bw-wish-details"><span className="bw-pill">{priorityNames[w.priority]}</span>
                  <h3>{w.title}</h3><p className="bw-price">{w.price==null?"价格待定":`¥ ${w.price}`}</p>
                  {w.specs&&<p className="bw-muted">规格：{w.specs}</p>}
                  {w.note&&<p className="bw-wish-note">{w.note}</p>}
                  <div className="bw-card-actions">
                    <button className="bw-secondary" onClick={()=>setEditor(w)}>编辑</button>
                    <button className="bw-danger-link" disabled={busy} onClick={()=>{if(window.confirm("确定归档这条心愿吗？")) void act(async()=>{
                      check(await client.rpc("archive_my_wish",{p_wish_id:w.id}));
                    },"心愿已归档");}}>归档</button>
                  </div>
                </div></article>)}</div>}
            <p className="bw-small-note">🔒 为保护惊喜，即使这件心愿已经被抽中，这里也不会显示任何特殊标志。</p>
          </div>}

          {tab==="draw"&&<div className="bw-page">
            <div className="bw-page-head"><div><p className="bw-overline">SURPRISE GIFT</p><h1>为 TA 准备一份惊喜</h1><p>心愿会在云端随机抽选，不会提前公开整张清单。</p></div></div>
            {!partner?<div className="bw-panel bw-empty"><Heart size={38}/><h3>先绑定彼此吧</h3><p>完成情侣绑定之后，就能替对方抽取心愿。</p><button className="bw-primary" onClick={()=>setTab("profile")}>去绑定伴侣</button></div>:
              <div className="bw-panel bw-draw-panel">
                <div className="bw-draw-decoration"><Sparkles size={30}/></div>
                <h2>给 {partner.nickname} 的惊喜礼物</h2>
                <p className="bw-muted">可以设置一个预算上限；不填写则不限制。</p>
                <label className="bw-budget">预算上限（元）<input type="number" min="0" step="0.01" value={budget} onChange={e=>setBudget(e.target.value)} placeholder="不限预算"/></label>
                <button disabled={busy||partner.wishlist_paused} className="bw-primary" onClick={()=>void act(async()=>{
                  const max=budget.trim()?Number(budget):null;
                  if(max!==null&&(!Number.isFinite(max)||max<0))throw new Error("预算不能为负数");
                  const r=await client.rpc("draw_partner_wish",{p_receiver_id:partner.id,p_max_budget:max});
                  check(r);
                  if (!r.data) throw new Error("抽选结果为空");
                  setDrawn(r.data as DrawResult);
                },"抽选完成！这份秘密只有你能看到。")}><GiftIcon size={18}/>{partner.wishlist_paused?"对方暂时关闭抽选":busy?"抽选中…":"抽取一个秘密心愿"}</button>
              </div>}
            {drawn&&<div className="bw-panel bw-reveal"><p className="bw-overline">A LITTLE SECRET</p><h2>你抽中了：{drawn.wish.title} 🎁</h2>
              <PrivatePhoto client={client} path={drawn.wish.image_urls?.[0]} alt={drawn.wish.title}/>
              <p>{drawn.wish.price==null?"参考价格待定":`参考价格：¥ ${drawn.wish.price}`}</p>
              {drawn.wish.specs&&<p>规格：{drawn.wish.specs}</p>}
              {drawn.wish.note&&<p>对方备注：{drawn.wish.note}</p>}
              {safeExternalUrl(drawn.wish.product_url)&&<a target="_blank" rel="noopener noreferrer" href={safeExternalUrl(drawn.wish.product_url)}>打开商品链接</a>}
              <button className="bw-primary" onClick={()=>{setTab("gifts");setDrawn(null);}}>查看送礼任务</button>
            </div>}
          </div>}

          {tab==="gifts"&&<div className="bw-page">
            <div className="bw-page-head"><div><p className="bw-overline">OUR GIFT MOMENTS</p><h1>送礼记录</h1><p>准备中的礼物只有送礼人能看到，送出后才会公开。</p></div></div>
            <div className="bw-panel">
              <h2>我准备的礼物</h2>
              {ownGifts.length===0?<p className="bw-muted">暂无记录。抽一份心愿，开始准备吧。</p>:ownGifts.map(g=><div className="bw-gift-row" key={g.id}>
                <PrivatePhoto client={client} path={g.wish_snapshot?.image_urls?.[0]} alt={g.wish_snapshot?.title||"礼物"}/>
                <div className="bw-gift-info"><b>{g.wish_snapshot?.title||"心愿礼物"}</b>
                  <span className="bw-pill">{giftStatusNames[g.status]}</span>
                  <small>抽中于 {formatDate(g.drawn_at)}</small></div>
                <div className="bw-gift-buttons">
                  {g.status==="drawn"&&<button className="bw-secondary" disabled={busy} onClick={()=>void changeGift(g.id,"purchased")}>标记已购买</button>}
                  {(g.status==="drawn"||g.status==="purchased")&&<>
                    <button className="bw-primary" disabled={busy} onClick={()=>{if(window.confirm("确认已经把礼物送给对方了吗？")) void changeGift(g.id,"sent");}}>确认送出</button>
                    <button className="bw-danger-link" disabled={busy} onClick={()=>{if(window.confirm("确定取消这次送礼吗？")) void changeGift(g.id,"cancelled");}}>取消</button>
                  </>}
                </div></div>)}
            </div>
            <div className="bw-panel"><h2>我收到的礼物</h2>
              {receivedGifts.length===0?<p className="bw-muted">等一份温柔的惊喜吧 💌</p>:receivedGifts.map(g=>
                <div className="bw-gift-row" key={g.id}><PrivatePhoto client={client} path={g.wish_snapshot?.image_urls?.[0]} alt={g.wish_snapshot?.title||"礼物"}/>
                  <div className="bw-gift-info"><b>{g.wish_snapshot?.title||"礼物"}</b><small>收到于 {formatDate(g.sent_at)}</small></div></div>)}
            </div>
            <div className="bw-panel"><div className="bw-section-heading"><h2>我的通知</h2><span className="bw-pill">{unread} 条未读</span></div>
              {notices.length===0?<p className="bw-muted">暂时没有通知。</p>:notices.map(n=><div className="bw-notice" key={n.id}>
                <div><b>{n.title}</b><p>{n.content}</p><small>{formatDate(n.created_at)}</small></div>
                {!n.read_at&&<button className="bw-secondary" disabled={busy} onClick={()=>void act(async()=>{
                  check(await client.from("notifications").update({read_at:new Date().toISOString()}).eq("id",n.id));
                },"已标记为已读")}>标记已读</button>}
              </div>)}
            </div>
          </div>}

          {tab==="profile"&&<div className="bw-page">
            <div className="bw-page-head"><div><p className="bw-overline">MY LITTLE WORLD</p><h1>个人与情侣设置</h1><p>把账号、心愿和隐私都好好照顾起来。</p></div></div>
            <div className="bw-panel bw-form">
              <h2>我的账号</h2>
              <label>登录邮箱<input value={user.email||""} disabled/></label>
              <label>昵称<input maxLength={40} value={profileName} onChange={e=>setProfileName(e.target.value)}/></label>
              <label>用户名（给伴侣发送邀请时使用）<input maxLength={24} value={profileHandle} onChange={e=>setProfileHandle(e.target.value)}/></label>
              <button disabled={busy} className="bw-primary bw-fit" onClick={()=>void saveProfile()}>保存资料</button>
            </div>
            <div className="bw-panel bw-form">
              <h2>情侣绑定</h2>
              {partner&&couple?<><p>💗 已与 <b>{partner.nickname}</b>（@{partner.username}）绑定。</p>
                <button className="bw-secondary bw-fit" disabled={busy} onClick={()=>{if(window.confirm("解除绑定后将无法继续抽取对方的新心愿，确定吗？")) void act(async()=>{
                  check(await client.rpc("unbind_partner",{p_couple_id:couple.id}));
                },"情侣关系已解除");}}>解除情侣绑定</button></>:
                <div className="bw-form"><p className="bw-muted">先让 TA 注册账号，再输入对方的用户名（不是昵称）。</p>
                  <label>对方用户名<input placeholder="例如：xiaotao_01" value={inviteName} onChange={e=>setInviteName(e.target.value)}/></label>
                  <button className="bw-primary bw-fit" disabled={busy||!inviteName.trim()} onClick={()=>void act(async()=>{
                    check(await client.rpc("invite_partner",{p_username:inviteName.trim().toLowerCase()}));
                    setInviteName("");
                  },"邀请已发出，等待对方确认")}>发送绑定邀请</button>
                </div>}
              <div className="bw-divider"/>
              <h3>最近的绑定邀请</h3>
              {invites.length===0?<p className="bw-muted">暂无邀请。</p>:invites.map(inv=>
                <div key={inv.id} className="bw-invite">
                  <div><b>{inv.other_nickname}</b> <span>@{inv.other_username}</span>
                    <small>{inv.direction==="received"?"TA 邀请了你":"你发出的邀请"} · {formatDate(inv.created_at)} · {inv.status==="pending"?"待处理":inv.status==="accepted"?"已接受":inv.status==="rejected"?"已拒绝":"已过期"}</small></div>
                  {inv.direction==="received"&&inv.status==="pending"&&new Date(inv.expires_at).getTime() > Date.now()&&<div className="bw-actions">
                    <button disabled={busy} className="bw-primary" onClick={()=>void act(async()=>{
                      check(await client.rpc("respond_partner_invite",{p_invite_id:inv.id,p_accept:true}));
                    },"绑定成功！")}>接受</button>
                    <button disabled={busy} className="bw-secondary" onClick={()=>void act(async()=>{
                      check(await client.rpc("respond_partner_invite",{p_invite_id:inv.id,p_accept:false}));
                    },"已拒绝邀请")}>拒绝</button>
                  </div>}
                </div>)}
            </div>
            <div className="bw-panel">
              <h2>隐私与安全</h2>
              <div className="bw-setting-row"><div><b>允许别人通过用户名找到我</b><p className="bw-muted">关闭之后，无法收到新的绑定邀请。</p></div>
                <input aria-label="允许别人搜索账号" type="checkbox" checked={profile.search_enabled} onChange={e=>{
                  const enabled=e.target.checked;
                  void act(async()=>{
                    check(await client.from("profiles").update({search_enabled:enabled}).eq("id",user.id));
                  },"隐私设置已保存");
                }}/></div>
              <div className="bw-setting-row"><div><b>暂停情侣抽选</b><p className="bw-muted">暂停时，对方不能继续抽取新心愿。</p></div>
                <input aria-label="暂停抽选" type="checkbox" checked={profile.wishlist_paused} onChange={e=>{
                  const paused=e.target.checked;
                  void act(async()=>{
                    check(await client.from("profiles").update({wishlist_paused:paused}).eq("id",user.id));
                  },"抽选设置已保存");
                }}/></div>
              <p className="bw-small-note">数据保存在 Supabase 云数据库。数据库使用行级权限控制；收礼人在礼物送出之前无法读取抽选结果。旧版的模拟账号数据不会自动迁入。</p>
              <div className="bw-actions bw-start"><button className="bw-secondary" disabled={busy} onClick={()=>void exportMyData()}>导出我的数据</button>              <button className="bw-secondary" onClick={()=>void client.auth.signOut()}><LogOut size={17}/> 退出登录</button></div>
            </div>
            <div className="bw-panel bw-danger-zone">
              <h2>删除账号</h2><p>删除后将清理自己的图片和账号资料，操作不可恢复。请先备份需要保留的资料。</p>
              {!deleteMode?<button className="bw-danger-link" onClick={()=>setDeleteMode(true)}>我要删除账号</button>:
                <div className="bw-form">
                  <label>输入「删除我的账号」确认<input value={deleteConfirm} onChange={e=>setDeleteConfirm(e.target.value)}/></label>
                  <label>再次输入登录密码<input type="password" autoComplete="current-password" value={deletePassword} onChange={e=>setDeletePassword(e.target.value)}/></label>
                  <div className="bw-actions">
                    <button className="bw-secondary" onClick={()=>setDeleteMode(false)}>取消</button>
                    <button className="bw-danger" disabled={busy||deleteConfirm!=="删除我的账号"||!deletePassword} onClick={()=>void deleteAccount()}><Trash2 size={16}/> 永久删除</button>
                  </div>
                  <p className="bw-muted">这项功能需要按部署说明发布 Supabase 的 delete-account 函数。</p>
                </div>}
            </div>
          </div>}
        </>}
      </main>
    </div>
    <nav className="bw-bottom-nav">
      {([{id:"home",label:"首页",icon:Home},{id:"wishes",label:"心愿",icon:Heart},
         {id:"draw",label:"送礼",icon:Sparkles},{id:"gifts",label:"记录",icon:Package},
         {id:"profile",label:"我的",icon:UserRound}] as const).map(x=><button key={x.id} className={tab===x.id?"active":""} onClick={()=>setTab(x.id)}><x.icon size={19}/><span>{x.label}</span></button>)}
    </nav>
    <footer className="bw-footer">BETWEEN WISHES · A little wish, a lovely surprise. <Heart size={12}/> <a href="/privacy.html" target="_blank" rel="noopener noreferrer">隐私说明</a> · <a href="/terms.html" target="_blank" rel="noopener noreferrer">使用条款</a></footer>
  </div>;
}
