import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import {queryClient} from '@/lib/queryClient';
type Session={id:string;email:string};
const Context=createContext<{loaded:boolean;session:Session|null}>({loaded:false,session:null});
export function MigrationAuthProvider({children}:{children:ReactNode}){
 const [state,setState]=useState<{loaded:boolean;session:Session|null}>({loaded:false,session:null});
 useEffect(()=>{let alive=true;const check=()=>fetch('/api/migration/session',{credentials:'same-origin',cache:'no-store'}).then(async r=>r.ok?await r.json():null).then(s=>{if(alive)setState({loaded:true,session:s?.ownerBound?s.user:null})}).catch(()=>{if(alive)setState({loaded:true,session:null})});void check();const timer=setInterval(check,60000);return()=>{alive=false;clearInterval(timer)}},[]);
 return <Context.Provider value={state}>{children}</Context.Provider>;
}
export function useAuth(){const {loaded,session}=useContext(Context);return {isLoaded:loaded,isSignedIn:!!session,userId:session?.id??null,sessionId:null};}
export function useUser(){const {loaded,session}=useContext(Context);return {isLoaded:loaded,isSignedIn:!!session,user:session?{id:session.id,fullName:null,primaryEmailAddress:{emailAddress:session.email}}:null};}
export function useClerk(){return {signOut:async(_options?:unknown)=>{const r=await fetch('/api/migration/auth/logout',{method:'POST',credentials:'same-origin'});if(!r.ok)throw Error('Não foi possível encerrar sua sessão.');queryClient.clear();window.location.assign('/migration/login')}};}
