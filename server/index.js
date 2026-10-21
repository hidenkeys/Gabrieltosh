import { existsSync } from 'node:fs';
import express from 'express';
import { createApp,errorHandler } from './app.js';
import { migrate } from './db.js';
import { seed,createAdmin } from './seed.js';
await migrate();await seed();
if(process.env.MEMORY_DB==='true'&&process.env.DEMO_PASSWORD){await createAdmin('Store administrator','admin',process.env.DEMO_PASSWORD);console.warn('EPHEMERAL DEVELOPMENT DATABASE: records disappear on restart.');}
const app=createApp();
if(existsSync('dist/index.html')){app.use(express.static('dist'));app.get('/{*path}',(req,res)=>res.sendFile('index.html',{root:'dist'}));}
app.use(errorHandler);
const port=Number(process.env.PORT||3001);app.listen(port,process.env.HOST||'0.0.0.0',()=>console.log(`Bing Chun local POS listening on ${port}`));
