"use strict";exports.id=904,exports.ids=[904],exports.modules={904:(e,s,E)=>{E.r(s),E.d(s,{ENV_CREDENTIAL_SCOPE:()=>_,ENV_EXPIRATION:()=>c,ENV_KEY:()=>n,ENV_SECRET:()=>o,ENV_SESSION:()=>S,fromEnv:()=>t});var r=E(8112);const n="AWS_ACCESS_KEY_ID",o="AWS_SECRET_ACCESS_KEY",S="AWS_SESSION_TOKEN",c="AWS_CREDENTIAL_EXPIRATION",_="AWS_CREDENTIAL_SCOPE",t=e=>async()=>{e?.logger?.debug("@aws-sdk/credential-provider-env","fromEnv");const s=process.env[n],E=process.env[o],t=process.env[S],i=process.env[c],A=process.env[_];if(s&&E)return{accessKeyId:s,secretAccessKey:E,...t&&{sessionToken:t},...i&&{expiration:new Date(i)},...A&&{credentialScope:A}};throw new r.C1("Unable to find environment variable credentials.")}}};
//# sourceMappingURL=904.js.map