import express from "express";
import {clerkMiddleware} from "@clerk/express";
import {createServer} from "node:http";
import path from "node:path";
import {createServer as createViteServer} from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import {requireAuth} from "./require-auth";
import {registerAuthenticatedSimulation} from "./committee-authenticated-simulation";

// Explicit development entry. It never imports main/routes/storage/delivery workers.
if(process.env.NODE_ENV!=="development" || !process.argv.includes("--offline-fixture"))
  throw Error("Use only the explicit development offline harness command.");
const publishableKey=process.env.CLERK_PUBLISHABLE_KEY || process.env.VITE_CLERK_PUBLISHABLE_KEY;
if(!publishableKey?.startsWith("pk_test_") || !process.env.CLERK_SECRET_KEY?.startsWith("sk_test_"))
  throw Error("An isolated Clerk development instance is required; production keys are not accepted.");
const remoteDomain=process.env.REPLIT_DEV_DOMAIN;
const port=remoteDomain ? 5001 : 19624;
// Only the existing Replit development host may be exposed by the remote harness.
if(remoteDomain && !/^[a-zA-Z0-9-]+\.replit\.dev$/.test(remoteDomain))
  throw Error("Unrecognized Replit development host.");
const origin=remoteDomain ? `https://${remoteDomain}` : `http://127.0.0.1:${port}`;

const app=express();
app.disable("x-powered-by");
app.use((_req,res,next)=>{res.setHeader("Cache-Control","no-store");res.setHeader("Content-Security-Policy","frame-ancestors 'self'");next();});
app.use(express.json({limit:"16kb"}));
app.use(clerkMiddleware({publishableKey,authorizedParties:[origin]}));
app.use("/api",(req,res,next)=>{
  if(req.method!=="GET" && req.get("origin")!==origin) return res.status(403).json({error:"Origem de teste inválida."});
  next();
});
app.get("/api/auth/session",requireAuth,(req,res)=>res.json({authenticated:true,userId:req.userId}));
registerAuthenticatedSimulation(app,requireAuth);
app.use("/api",(_req,res)=>res.status(404).json({error:"Rota indisponível no teste isolado."}));
app.get("/",(_req,res)=>res.redirect("/committee-auth-demo.html"));
const vite=await createViteServer({
  configFile:false,
  root:path.resolve("client"),plugins:[react(),tailwindcss()],
  resolve:{alias:{"@":path.resolve("client/src")}},
  define:{"import.meta.env.VITE_CLERK_PUBLISHABLE_KEY":JSON.stringify(publishableKey)},
  server:{middlewareMode:true,fs:{strict:true,deny:["**/.*"]}},
  appType:"mpa",
});
app.use(vite.middlewares);
const server=createServer(app);
server.listen(port,remoteDomain?"0.0.0.0":"127.0.0.1",()=>console.log(`Clerk offline harness: ${origin}/committee-auth-demo.html`));
