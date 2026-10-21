import { createInterface } from 'node:readline/promises';
import { migrate,pool } from '../server/db.js';
import { seed,createAdmin } from '../server/seed.js';
const rl=createInterface({input:process.stdin,output:process.stdout});
try { await migrate();await seed();const name=await rl.question('Admin name: ');const username=await rl.question('Username: ');const password=process.env.BOOTSTRAP_PASSWORD||await rl.question('Initial password (visible; at least 10 characters): ');await createAdmin(name,username,password);console.log('Admin created. Start the POS and sign in on this computer.'); }
finally{rl.close();await pool.end();}
