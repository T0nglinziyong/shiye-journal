// The shared dialog can reopen before a queued native close event is delivered.
// Do not tear down the newly opened editor in response to that previous event.
export function onDialogClosed(dialog,callback){const closed=()=>{if(dialog.open)return;dialog.removeEventListener('close',closed);callback();};dialog.addEventListener('close',closed);return ()=>dialog.removeEventListener('close',closed);}
