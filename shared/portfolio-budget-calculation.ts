import {PORTFOLIO_AGENTS} from './portfolio-simulation';
export function preliminaryBudget(model:{inputUsdMicrosPerMillion:number;outputUsdMicrosPerMillion:number},positions:number){
 if([model.inputUsdMicrosPerMillion,model.outputUsdMicrosPerMillion].some(v=>!Number.isSafeInteger(v)||v<0||v>1e12))throw Error('INVALID_PRICE');
 if(!Number.isInteger(positions)||positions<1||positions>2000)throw Error('INVALID_POSITION_COUNT');
 const agents=PORTFOLIO_AGENTS.map((a,i)=>{const inputTokens=i===5?24000:8000,outputTokens=i===5?3000:2000;
  const costUsdMicros=Math.ceil((inputTokens*model.inputUsdMicrosPerMillion+outputTokens*model.outputUsdMicrosPerMillion)/1e6);
  return {id:a.id,name:a.name,role:a.role,inputTokens,outputTokens,costUsdMicros};});
 const providerUsdMicros=agents.reduce((s,a)=>s+a.costUsdMicros,0);
 return {agents,positions,providerUsdMicros,reservePercent:30,referenceUsdMicros:Math.ceil(providerUsdMicros*1.3),credits:null,creditPolicyConfigured:false,accountPricingVerified:false,tokenizerVerified:false,approvalAvailable:false,approved:false,executable:false,realAnalysisEnabled:false,creditsDebited:0,tokensUsed:0};
}
