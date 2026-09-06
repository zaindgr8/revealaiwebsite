// Run against a production server on localhost:3107 with Playwright installed.
// All account/session traffic is mocked; this does not write to real accounts.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const load = createRequire(process.cwd() + '/package.json');
load('@next/env').loadEnvConfig(process.cwd());
const {chromium} = load(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async()=>{
 const browser = await chromium.launch({channel:'chrome',headless:true});
 try {
  for(const mobile of [false,true]) {
   const context = await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:960}});
   const user={id:'00000000-0000-0000-0000-000000000001',aud:'authenticated',role:'authenticated',email:'navigation-test@example.invalid',app_metadata:{},user_metadata:{full_name:'Navigation Test'},created_at:new Date().toISOString()};
   const exp=Math.floor(Date.now()/1000)+3600;
   const encode=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
   const token=encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:user.id,exp,role:'authenticated'})+'.test';
   const key='sb-'+new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0]+'-auth-token';
   await context.addInitScript(({key,token,user,exp})=>localStorage.setItem(key,JSON.stringify({access_token:token,refresh_token:'test',token_type:'bearer',expires_in:3600,expires_at:exp,user})),{key,token,user,exp});
   let reads=0,documents=0;
   let rows=[{id:'session-1',created_at:new Date().toISOString(),mood_score:80,energy:65,stress:0,positivity:80,confidence:75,pace:'normal',detected_mode:'calm',insight:'Synthetic check-in for navigation.',tips:[],duration_seconds:60}];
   await context.route('**/*', async route=>{
    const url=new URL(route.request().url());
    const json=data=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
    if(url.hostname.endsWith('.supabase.co')) {
     if(url.pathname.includes('/auth/v1/user')) return json(user);
     if(url.pathname.includes('/rest/v1/profiles')) return json({full_name:'Navigation Test',avatar_url:null,trial_ends_at:new Date(Date.now()+86400000).toISOString(),subscription_status:'trial'});
     if(url.pathname.includes('/rest/v1/therapy_sessions')) { if(url.searchParams.get('select')==='*') reads++; return json(rows); }
     if(url.pathname.includes('/rest/v1/voice_enrollments')) return json(null);
     return json([]);
    }
    if(url.pathname==='/api/subscription/status') return json({status:'trial',trialActive:true,trialDaysRemaining:2,minutesRemaining:150,canUseApp:true});
    if(url.pathname==='/api/live-context') return json({systemInstruction:'Synthetic QA context',hasMemory:false});
    if(url.pathname==='/api/update-streak') return json({current_streak:1,longest_streak:1,last_checkin_date:null});
    if(url.hostname==='localhost') return route.continue();
    return route.abort();
   });
   const page=await context.newPage(); const errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   page.on('request',r=>{if(r.isNavigationRequest() && r.frame()===page.mainFrame())documents++;});
   await page.goto('http://localhost:3107/home');
   await page.getByText('Synthetic check-in for navigation.',{exact:true}).waitFor();
   await page.evaluate(()=>{window.__sidebar=document.querySelector('aside');window.__document=document;});
   for(const [name,path] of [['Reflect','/therapy'],['Journey','/trends'],['Sessions','/history'],['Settings','/settings'],['Dashboard','/home'],['Sessions','/history']]) {
    if(mobile) await page.getByRole('button',{name:'Open menu',exact:true}).click();
    await page.locator('aside').getByRole('link',{name,exact:true}).click();
    await page.waitForURL('**'+path);
    await page.locator('aside').getByRole('link',{name,exact:true}).getAttribute('aria-current').then(v=>assert.equal(v,'page'));
    assert.equal(await page.evaluate(()=>window.__sidebar===document.querySelector('aside') && window.__document===document),true);
    assert.equal(await page.locator('main').count(),1);
   }
   assert.equal(reads,1,'sidebar navigation must share the session fetch');
   assert.equal(documents,1,'sidebar navigation must not reload the document');
   // Mutation invalidation refreshes visible data without recreating navigation.
   rows=[];
   await page.evaluate(()=>window.dispatchEvent(new Event('therapy-sessions-changed')));
   await page.getByText('No sessions yet',{exact:true}).waitFor();
   assert.equal(reads,1,'an inactive check-in cache should wait until it is needed');
   for(const [name,path] of [['AI Chat','/chat'],['Live Call','/live'],['Intent','/intent'],['Dashboard','/home']]) {
    if(mobile) await page.getByRole('button',{name:'Open menu',exact:true}).click();
    await page.locator('aside').getByRole('link',{name,exact:true}).click();
    await page.waitForURL('**'+path);
    assert.equal(await page.evaluate(()=>window.__sidebar===document.querySelector('aside') && window.__document===document),true);
   }
   await page.waitForFunction(()=>document.querySelector('main')?.textContent?.includes('Welcome back'));
   assert.equal(documents,1);
   assert.deepEqual(errors,[]);
   if(mobile) await page.waitForFunction(()=>document.querySelector('aside').getBoundingClientRect().right<=0);
   await page.evaluate(()=>document.fonts.ready);

   console.log(JSON.stringify({mobile,documents,sessionReadsBeforeRefresh:1,refreshVisible:true,persistentSidebar:true,errors}));
   await context.close();
  }
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
