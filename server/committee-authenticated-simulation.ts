import express, {type Express, type RequestHandler} from "express";
import {createLocalFixture} from "./committee-local-fixture";
import {registerHermesRoutes} from "./hermes-routes";

export function simulationUsers(env: NodeJS.ProcessEnv = process.env) {
  if(env.NODE_ENV !== "development" || env.COMMITTEE_AUTH_SIMULATION !== "offline-only") return [];
  const users=(env.COMMITTEE_SIMULATION_USERS || "").split(",").map(s=>s.trim()).filter(Boolean);
  return users.length > 0 && users.length <= 10 && users.every(u=>/^user_[A-Za-z0-9]+$/.test(u)) ? [...new Set(users)] : [];
}

// Development-only routes with the existing authentication middleware.
// Each allowlisted Clerk identity receives its own disposable offline fixture.
export function registerAuthenticatedSimulation(app: Express, auth: RequestHandler, env: NodeJS.ProcessEnv = process.env) {
  const users=simulationUsers(env);
  const sessions=new Map<string,{fixture:ReturnType<typeof createLocalFixture>; routes:Express}>();
  const prefix="/api/investments/simulation";
  app.get(prefix+"/status",auth,(req,res)=>res.json({available:users.includes(req.userId || ""),simulation:true}));
  app.use(prefix,auth,(req,res,next)=>{
    const owner=req.userId;
    if(!owner || !users.includes(owner)) return res.status(403).json({error:"Simulação indisponível para esta conta."});
    let session=sessions.get(owner);
    if(!session) {
      const fixture=createLocalFixture();
      // The adapter retains a synthetic internal owner. The outer auth-selected session
      // prevents accepting identity, wallet or remote identifiers from the client.
      const routes=express();
      registerHermesRoutes(routes,(_req,_res,go)=>{_req.userId=fixture.config.users[0];go();},{config:()=>fixture.config,store:fixture.store,client:fixture.client});
      routes.get("/diagnostics",(_req,_res)=>_res.json(fixture.diagnostics()));
      session={fixture,routes};sessions.set(owner,session);
    }
    // Mounted paths must be one of the existing analysis endpoints or diagnostics.
    if(!/^\/(?:api\/investments\/(?:analysis-options|credits|analyses(?:\/[a-f0-9-]+)?)|diagnostics)$/.test(req.path)) return res.status(404).json({error:"Rota de simulação inexistente."});
    session.routes(req,res,next);
  });
}
