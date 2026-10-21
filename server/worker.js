import { randomUUID } from 'node:crypto';
import { mkdir,writeFile,unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { query,transaction,migrate } from './db.js';
import { renderPrint } from './printing.js';
import { backup,uploadPending } from './backup.js';
const run=promisify(execFile);
export async function processNext(){
 const job=await transaction(async c=>{
  const all=(await c.query("SELECT * FROM print_jobs WHERE status='queued' ORDER BY created_at,sequence FOR UPDATE SKIP LOCKED")).rows;
  for(const j of all){
   if(j.kind==='label'){const blocking=(await c.query("SELECT id FROM print_jobs WHERE order_id=$1 AND reprint=false AND kind='receipt' AND status <> 'submitted'",[j.order_id])).rows;if(blocking.length)continue;}
   const o=(await c.query('SELECT payment_status FROM orders WHERE id=$1',[j.order_id])).rows[0];if(o?.payment_status!=='paid'){await c.query("UPDATE print_jobs SET status='cancelled' WHERE id=$1",[j.id]);continue;}
   await c.query("UPDATE print_jobs SET status='processing',lease_at=CURRENT_TIMESTAMP,attempts=attempts+1 WHERE id=$1",[j.id]);return j;
  }
 });if(!job)return false;
 try{
  await mkdir('print-output',{recursive:true});const path=resolve('print-output',job.id+'.html');await writeFile(path,renderPrint(job));
  const simulated=(process.env.PRINT_MODE||'simulation')==='simulation';
  if(!simulated){if(process.platform!=='win32')throw new Error('Windows printing is only available on Windows.');
   const printer=job.kind==='receipt'?process.env.RECEIPT_PRINTER:process.env.LABEL_PRINTER;if(!printer)throw new Error('Configure the printer queue name.');
   await run('python',[resolve('scripts/windows_print.py'),path,printer,job.kind,String(job.payload.template.labelWidth),String(job.payload.template.labelHeight)],{timeout:90000});
  }
  await transaction(async c=>{await c.query("UPDATE print_jobs SET status='submitted',simulated=$1,completed_at=CURRENT_TIMESTAMP,error=NULL WHERE id=$2",[simulated,job.id]);const pending=(await c.query("SELECT id FROM print_jobs WHERE order_id=$1 AND reprint=false AND status <> 'submitted'",[job.order_id])).rows;if(!pending.length)await c.query("UPDATE orders SET status='preparing',updated_at=CURRENT_TIMESTAMP,version=version+1 WHERE id=$1 AND status='paid' AND payment_status='paid'",[job.order_id]);});
 }catch(e){await query("UPDATE print_jobs SET status='uncertain',error=$1 WHERE id=$2",['Submission could not be confirmed: '+e.message,job.id]);}
 return true;
}
async function start(){
 await migrate();
 // A crash can occur after submission but before acknowledgement: do not auto-reprint.
 const cutoff=new Date(Date.now()-120000);await query("UPDATE print_jobs SET status='uncertain',error='Worker interrupted. Check physical output before retrying.' WHERE status='processing' AND lease_at < $1",[cutoff]);
 let lastBackup=0,lastUpload=0;
 console.log('Print worker started in '+(process.env.PRINT_MODE||'simulation')+' mode');
 while(true){try{await query("UPDATE settings SET value=$1 WHERE key='worker'",[JSON.stringify({online:true,lastSeen:new Date().toISOString(),mode:process.env.PRINT_MODE||'simulation'})]);await processNext();if(Date.now()-lastBackup>Number(process.env.BACKUP_INTERVAL_HOURS||6)*3600000){lastBackup=Date.now();await backup();}if(Date.now()-lastUpload>60000){lastUpload=Date.now();await uploadPending();}}catch(e){console.error(e.message);}await new Promise(r=>setTimeout(r,1000));}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await start();
