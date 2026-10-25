export function createDemo(config) {
  return {
    async snapshot() {
      const now=Date.now();
      const names=['Sales_Order_to_S4','Employee_Replication','Invoice_to_Ariba','Inventory_Sync'];
      const artifacts=names.map((id,i)=>({id,name:id.replaceAll('_',' '),type:'INTEGRATION_FLOW',version:`1.${i}.0`,status:'STARTED',deployedAt:new Date(now-(i+1)*86400000).toISOString()}));
      const messages=Array.from({length:48},(_,i)=>({id:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`,flow:names[i%4],status:i%7===0?'FAILED':i%11===0?'RETRY':i===1?'PROCESSING':'COMPLETED',start:new Date(now-i*900000).toISOString(),end:i===1?null:new Date(now-i*900000+450+i*93).toISOString(),durationMs:i===1?null:450+i*93,correlationId:`demo-${i}`})).filter(m=>Date.parse(m.start)>=now-config.hours*3600000);
      return {artifacts,messages:messages.slice(0,config.maxMessages),artifactsTruncated:false,messagesTruncated:messages.length>config.maxMessages,from:new Date(now-config.hours*3600000).toISOString(),to:new Date(now).toISOString()};
    },
    async error() { return 'DEMO: HTTP receiver returned 503 Service Unavailable. Receiver: example ERP. The downstream service was temporarily unavailable; verify receiver availability and retry policy. This is synthetic data.'; }
  };
}
