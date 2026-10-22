import {fetchPublicNousCatalogue} from '../server/portfolio-pilot-models';
export async function budgetCatalogue(){
 const models=await fetchPublicNousCatalogue();
 return {models:models.map(m=>({key:m.key,name:m.name,modelId:m.modelId,source:m.source,priceVersion:m.priceVersion,inputUsdMicrosPerMillion:m.inputUsdMicrosPerMillion,outputUsdMicrosPerMillion:m.outputUsdMicrosPerMillion,verifiedAt:m.verifiedAt,validUntil:m.validUntil})),accountPricingVerified:false,creditPolicyConfigured:false,realAnalysisEnabled:false};
}
