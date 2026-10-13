// Validate private export before any write. No discovery, generated grants or cost approval.
export function validateOwnerArchive(data, expectedOwner) {
 const fail=()=>{throw new Error('OWNER_ARCHIVE_INVALID');};
 if(!expectedOwner || data?.format!=='invest-owner-transfer-v1')fail();
 const b=data.binding,a=data.account,events=data.audit;
 if(!b||!a||!Array.isArray(events)||b.clerk_user_id!==expectedOwner||a.user_id!==expectedOwner||b.singleton!==true||b.clerk_environment!=='production'||b.revoked_at!==null||b.verification_method!=='official_clerk_owner_attestation'||!/^[a-f0-9]{64}$/.test(b.evidence_digest)||!Number.isFinite(Date.parse(b.verified_at))||Date.parse(b.verified_at)>Date.now())fail();
 if(!Number.isInteger(a.revision)||a.revision<0||!Array.isArray(a.state?.events)||!Array.isArray(a.state?.budgets)||!Array.isArray(a.state?.runs))fail();
 if(events.length!==a.state.events.length)fail();
 for(let i=0;i<events.length;i++){
  const e=events[i];if(e.user_id!==expectedOwner||e.event_index!==i||!Number.isFinite(Date.parse(e.recorded_at))||JSON.stringify(e.event)!==JSON.stringify(a.state.events[i])){
   // PostgreSQL jsonb may reorder object keys; compare canonical structure.
   if(e.user_id!==expectedOwner||e.event_index!==i||!Number.isFinite(Date.parse(e.recorded_at))||canonical(e.event)!==canonical(a.state.events[i]))fail();
  }
 }
 if(!events.some(e=>e.event?.type==='identity_verified:production'&&e.event.fingerprint===b.evidence_digest)||!events.some(e=>e.event?.type==='owner_binding_confirmed:production'&&/^[a-f0-9]{64}$/.test(e.event.fingerprint)))fail();
 return {binding:b,account:a,audit:events,realAnalysisEnabled:false};
}
function canonical(value){if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value);}
