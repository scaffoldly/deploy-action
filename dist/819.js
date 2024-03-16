"use strict";exports.id=819,exports.ids=[819],exports.modules={7819:(e,n,o)=>{o.r(n),o.d(n,{fromTokenFile:()=>s,fromWebToken:()=>t});var i=o(8112),r=o(9896);const t=e=>async()=>{e.logger?.debug("@aws-sdk/credential-provider-web-identity","fromWebToken");const{roleArn:n,roleSessionName:i,webIdentityToken:r,providerId:t,policyArns:s,policy:d,durationSeconds:l}=e;let{roleAssumerWithWebIdentity:c}=e;if(!c){const{getDefaultRoleAssumerWithWebIdentity:n}=await o.e(777).then(o.bind(o,1777));c=n({...e.clientConfig,credentialProviderLogger:e.logger,parentClientConfig:e.parentClientConfig},e.clientPlugins)}return c({RoleArn:n,RoleSessionName:i??`aws-sdk-js-session-${Date.now()}`,WebIdentityToken:r,ProviderId:t,PolicyArns:s,Policy:d,DurationSeconds:l})},s=(e={})=>async()=>{e.logger?.debug("@aws-sdk/credential-provider-web-identity","fromTokenFile");const n=e?.webIdentityTokenFile??process.env.AWS_WEB_IDENTITY_TOKEN_FILE,o=e?.roleArn??process.env.AWS_ROLE_ARN,s=e?.roleSessionName??process.env.AWS_ROLE_SESSION_NAME;if(!n||!o)throw new i.C1("Web identity configuration not specified");return t({...e,webIdentityToken:(0,r.readFileSync)(n,{encoding:"ascii"}),roleArn:o,roleSessionName:s})()}}};
//# sourceMappingURL=819.js.map