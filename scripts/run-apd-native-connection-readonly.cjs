const {runNativeConnectionProbe}=require("../mobile/src/native-connection-probe.js");
(async()=>{
 const result=await runNativeConnectionProbe({fetchImpl:fetch,enabled:true});
 for(const check of result.checks)console.log(check.path,check.status,check.ok?"PASS":"FAIL");
 if(!result.ok)process.exitCode=1;
})().catch(()=>{console.error("Connectivity diagnostic unavailable");process.exitCode=1;});
