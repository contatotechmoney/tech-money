/** Preparation only: no transport, investor identifier, certificate or provider endpoint. */
export function b3ConnectionStatus(){
 return {provider:'B3',state:'awaiting_business_access',automaticImportEnabled:false,connected:false,
  consentGranted:false,lastSyncAt:null,reviewRequiredBeforeSaving:true,realAnalysisEnabled:false,
  requiredSteps:['business_license','certification_access','reviewed_api_contract','investor_consent','position_preview_acceptance']};
}
